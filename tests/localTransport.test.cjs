const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join, resolve} = require('node:path')
const ts = require('typescript')

function loadConnector(processResponse = async () => {}, clock = Date) {
    const transports = []
    class Transport {
        ready = Promise.resolve()
        open = true
        frames = []
        constructor() { transports.push(this) }
        send(frame) { this.frames.push(frame) }
        async close() { this.open = false }
        async save() {}
    }
    class LoginMsg {
        t = 1
        constructor(login, password, guestName) { Object.assign(this, {login, password, guestName}) }
    }
    const source = readFileSync(join(__dirname, '../src/network/connector.ts'), 'utf8').replaceAll('import.meta.env', '({DEV: false})')
    const exports = {}
    const dependencies = {
        '@/network/messages': {LoginMsg},
        '@/data/monsterCatalog': {MonsterCatalog: {reset() {}}},
        '@/network/messageProcessor': {MessageProcessor: {processResponse}},
        './transport': {WebSocketTransport: Transport},
        '@/local/workerTransport': {WorkerTransport: Transport},
    }
    new Function('exports', 'require', 'Date', ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(exports, name => dependencies[name] || {}, clock)
    return {connector: exports.Connector, transports}
}

test('local transport retains outgoing limits, speech pacing and deferred movement behavior', async () => {
    const savedWindow = globalThis.window
    let time = 10000
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [time])) }
        static now() { return time }
    }
    globalThis.window = {location: {search: '', hostname: 'localhost'}, dispatchEvent() {}}
    try {
        const {connector, transports} = loadConnector(undefined, Clock)
        await connector.initialize()
        const transport = transports[0]
        for (let index = 0; index < 12; index++) connector.sendMessage({t: 9, d: {index}})
        assert.equal(transport.frames.length, 10)
        assert.equal(connector.queuedMessages.length, 2)
        connector.processMessages(time + 999)
        assert.equal(transport.frames.length, 10)
        time += 1000
        connector.processMessages(time)
        assert.equal(transport.frames.length, 12)
        assert.deepEqual(transport.frames.map(frame => JSON.parse(frame).d.index), Array.from({length: 12}, (_, index) => index))
        connector.resetSession()
        connector.sendMessage({t: 46, d: {text: 'one'}})
        connector.sendMessage({t: 46, d: {text: 'two'}})
        connector.processMessages(time)
        connector.processMessages(time + 999)
        assert.equal(connector.speechQueue.length, 1)
        time += 1000
        connector.processMessages(time)
        assert.equal(connector.speechQueue.length, 0)
        connector.resetSession()
        connector.sendMoveMessage({t: 5, d: {index: 1}})
        connector.sendMoveMessage({t: 5, d: {index: 2}})
        const beforeMovement = transport.frames.length
        connector.processMessages(time + 51)
        assert.equal(transport.frames.length, beforeMovement + 1)
        assert.equal(JSON.parse(transport.frames.at(-1)).d.index, 2)
        connector.processMessages(time + 52)
        assert.equal(transport.frames.length, beforeMovement + 1)
        const original = {t: 9, d: {value: 1}}
        connector.doSend(original, time)
        original.d.value = 2
        assert.equal(JSON.parse(transport.frames.at(-1)).d.value, 1)
        assert.equal(JSON.parse(transport.frames.at(-1)).sentTime, undefined)
        connector.sendLoginRequest('user', 'password', null)
        assert.deepEqual(JSON.parse(transport.frames.at(-1)), {t: 1, login: 'user', password: 'password', guestName: null})
    } finally { globalThis.window = savedWindow }
})

test('response processing keeps the async barrier and ignores frames from a previous runtime', async () => {
    const savedWindow = globalThis.window
    globalThis.window = {location: {search: '', hostname: 'localhost'}, dispatchEvent() {}}
    try {
        let release
        const barrier = new Promise(resolve => { release = resolve })
        const received = []
        const {connector, transports} = loadConnector(async response => {
            received.push(response[0].t)
            if (response[0].t === 1) await barrier
        })
        await connector.initialize()
        transports[0].onFrame('[{"t":1,"d":{}}]')
        transports[0].onFrame('[{"t":2,"d":{}}]')
        await new Promise(resolve => setImmediate(resolve))
        assert.deepEqual(received, [1])
        release()
        await connector.responseQueue
        assert.deepEqual(received, [1, 2])
        const staleCallback = transports[0].onFrame
        await connector.initialize()
        staleCallback('[{"t":99,"d":{}}]')
        transports[1].onFrame('[{"t":3,"d":{}}]')
        await connector.responseQueue
        assert.deepEqual(received, [1, 2, 3])
    } finally { globalThis.window = savedWindow }
})

test('closing waits for the active response and discards queued and late frames before world teardown', async () => {
    const savedWindow = globalThis.window
    globalThis.window = {location: {search: '', hostname: 'localhost'}, dispatchEvent() {}}
    let release
    const barrier = new Promise(resolve => { release = resolve })
    try {
        let worldAvailable = true
        const received = []
        const {connector, transports} = loadConnector(async response => {
            received.push(response[0].t)
            await barrier
            assert.equal(worldAvailable, true, 'World was cleared during an active response')
        })
        await connector.initialize()
        const receive = transports[0].onFrame
        receive('[{"t":1}]')
        receive('[{"t":2}]')
        await new Promise(resolve => setImmediate(resolve))
        let closed = false
        const closing = connector.closeConnection().then(() => { closed = true; worldAvailable = false })
        receive('[{"t":3}]')
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(closed, false, 'Connection close must drain its active response')
        release()
        await closing
        assert.deepEqual(received, [1])
        assert.equal(connector.transport, null)
    } finally { release(); globalThis.window = savedWindow }
})

test('game shutdown closes the runtime before clearing the world or rebuilding the renderer', async () => {
    let release
    const barrier = new Promise(resolve => { release = resolve })
    const calls = []
    const dependencies = {
        '@/network/connector': {Connector: {
            resetSession() { calls.push('reset queues') },
            async closeConnection() { calls.push('close'); await barrier; calls.push('closed') },
        }},
        '@/data/partyManager': {PartyManager: {reset() { calls.push('reset party') }}},
        '@/data/myPlayer': {MyPlayer: {reset() { calls.push('reset player') }}},
        '@/data/worldDataManager': {WorldDataManager: {reset() { calls.push('reset world') }}},
        '@/babylon/scene/renderer': {Renderer: {engine: {stopRenderLoop() { calls.push('stop rendering') }}, async gameStopped() { calls.push('reset renderer') }}},
    }
    const exports = {}
    const source = readFileSync(join(__dirname, '../src/GameManager.ts'), 'utf8')
    new Function('exports', 'require', ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(exports, name => dependencies[name] || {})
    const stopping = exports.GameManager.stopGame(false)
    try {
        await new Promise(resolve => setImmediate(resolve))
        assert.deepEqual(calls, ['stop rendering', 'close'])
    } finally { release(); await stopping }
    assert.deepEqual(calls, ['stop rendering', 'close', 'closed', 'reset party', 'reset player', 'reset world', 'reset renderer'])
})

test('authoritative broadcasts preserve recipient isolation and snapshot a batch before clearing its queue', async () => {
    const server = resolve(__dirname, '../../../server/darkenlight_server')
    require(join(server, 'node_modules/ts-node')).register({project: join(server, 'tsconfig.json'), transpileOnly: true})
    const {Connector} = require(join(server, 'src/network/connector.ts'))
    const {GameManager} = require(join(server, 'src/game/game.ts'))
    const frames = [[], []]
    const connections = frames.map(target => Connector.createConnection({open: true, send: frame => target.push(JSON.parse(frame)), close() {}}))
    const recipients = connections.map(conn => ({conn}))
    const batch = [{t: 41, d: {text: 'private'}}]
    GameManager.messageQueue.set(recipients[0], batch)
    GameManager.processBroadcast()
    assert.deepEqual(frames, [[[ {t: 41, d: {text: 'private'}} ]], []])
    assert.equal(batch.length, 0)
    GameManager.messageQueue.delete(recipients[0])
    await Promise.all(connections.map(conn => Connector.closeConnection(conn)))
})

test('WebSocket and local peers deliver identical setup frames to the same authoritative dispatcher', async () => {
    const serverRoot = resolve(__dirname, '../../../server/darkenlight_server')
    require(join(serverRoot, 'node_modules/ts-node')).register({project: join(serverRoot, 'tsconfig.json'), transpileOnly: true})
    const {Repository} = require(join(serverRoot, 'src/db/repo.ts'))
    const {LocalGameStorage} = require(join(serverRoot, 'src/db/localStorage.ts'))
    const {Connector} = require(join(serverRoot, 'src/network/connector.ts'))
    const {startWebSocketHost} = require(join(serverRoot, 'src/network/webSocketHost.ts'))
    const WebSocket = require(join(serverRoot, 'node_modules/ws'))
    await Repository.initialize(new LocalGameStorage('test', {}, async () => {}))
    const host = startWebSocketHost(0)
    await new Promise(resolve => host.once('listening', resolve))
    const localFrames = []
    const local = Connector.createConnection({open: true, send: frame => localFrames.push(frame), close() {}})
    const remote = new WebSocket(`ws://127.0.0.1:${host.address().port}`)
    try {
        await new Promise((resolve, reject) => { remote.once('open', resolve); remote.once('error', reject) })
        const frame = JSON.stringify({t: 34, d: {name: 'ProtocolCompatibility'}})
        Connector.receive(local, frame)
        await Connector.waitForIdle()
        const response = new Promise(resolve => remote.once('message', data => resolve(data.toString())))
        remote.send(frame)
        assert.equal(await response, localFrames[0])
    } finally {
        await new Promise(resolve => { remote.once('close', resolve); remote.close() })
        await Connector.closeConnection(local)
        await new Promise(resolve => host.close(resolve))
    }
})
