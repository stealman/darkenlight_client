const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join, resolve} = require('node:path')
const ts = require('typescript')

function loadConnector(processResponse = async () => {}, clock = Date, player = {}) {
    const transports = []
    class Transport {
        ready = Promise.resolve()
        open = true
        frames = []
        constructor(_mode, saveSlot) { this.saveSlot = saveSlot; transports.push(this) }
        send(frame) { this.frames.push(structuredClone(frame)) }
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
        '@/data/myPlayer': {MyPlayer: player},
        '@/network/messages': {LoginMsg},
        '@/data/monsterCatalog': {MonsterCatalog: {reset() {}}},
        '@/network/messageProcessor': {MessageProcessor: {processResponse}},
        './transport': {WebSocketTransport: Transport},
        '@/local/workerTransport': {WorkerTransport: Transport},
    }
    new Function('exports', 'require', 'Date', ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(exports, name => dependencies[name] || {}, clock)
    return {connector: exports.Connector, transports}
}

test('local hotkeys stay with their save and character even when game IDs are reused', async t => {
    const savedWindow = globalThis.window
    const savedStorage = globalThis.localStorage
    const settings = new Map([['DARKENLIGHT_CHARACTER_1_ACTION_BUTTONS_BINDINGS', '[[1,{"name":"CAMPING","data":{}}]]']])
    globalThis.window = {location: {search: '', hostname: 'localhost'}}
    globalThis.localStorage = {getItem: key => settings.get(key), setItem: (key, value) => settings.set(key, value)}
    t.after(() => { globalThis.window = savedWindow; globalThis.localStorage = savedStorage })

    const {connector} = loadConnector()
    function load(path, dependencies = {}) {
        const exports = {}
        const source = readFileSync(join(__dirname, '../src', path), 'utf8')
        const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}})
        new Function('exports', 'require', outputText)(exports, name => dependencies[name] ?? {})
        return exports
    }
    const classes = load('data/gameClass.ts')
    const inventory = []
    const inventoryModule = {InventoryManager: {inventory,
        getTotalResourceItemCountByType: cbId => inventory.filter(item => item.cbId === cbId).length}}
    const consumables = load('data/items/consumableHelper.ts', {
        './consumablesCodebook': load('data/items/consumablesCodebook.ts'),
        '@/data/inventoryManager': inventoryModule,
    })
    const {ActionButtonsManager: manager} = load('gui/actionButtonsManager.ts', {
        '@/data/actions/characterActions': load('data/actions/characterActions.ts'),
        '@/data/gameClass': classes,
        '@/data/inventoryManager': inventoryModule,
        '@/data/items/consumableHelper': consumables,
        '@/data/items/item': {WeaponCategories: {SWORD: 'SWORD', AXE: 'AXE', POLEARM: 'POLEARM', MACE: 'MACE', WAND: 'WAND'}},
        '@/data/myPlayer': {MyPlayer: {myChar: {gameClass: classes.GameClasses.MYSTIC}}},
        '@/network/connector': {Connector: connector},
    })
    manager.renderActionButtons = () => {}
    manager.notifyBindingsChanged = () => {}
    const profile = {id: 'char-first', name: 'První Mystic'}
    await connector.initialize('play', profile)
    manager.loadBindingsForCharacter(1, profile.name)
    assert.equal(manager.bindings.get(1).name, 'MAGIC_ARROW')
    assert.equal(manager.bindings.get(8).name, 'CONSUMABLE_ITEM')
    assert.equal(manager.getManaPotionImage(), '/images/items/resources/potions/mana.png')
    const small = {cbType: 'R', cbId: 1011, imgUrl: 'images/items/resources/potions/mana_small.png'}
    const great = {cbType: 'R', cbId: 1013, imgUrl: 'images/items/resources/potions/mana_great.png'}
    inventory.push(small, great)
    assert.equal(manager.getManaPotionImage(), `/${great.imgUrl}`)
    inventory.pop()
    assert.equal(manager.getManaPotionImage(), `/${small.imgUrl}`)

    assert.ok(manager.actionBindingKey.includes(encodeURIComponent(profile.name)))
    manager.bindings.get(1).name = 'AUTO_ATTACK'
    manager.bindings.set(8, {name: 'EQUIP_STORED_WEAPONS', data: {}})
    manager.storeBindings()

    await connector.initialize('play', {id: 'char-second', name: 'Druhý Mystic'})
    manager.loadBindingsForCharacter(1, 'Druhý Mystic')
    assert.equal(manager.bindings.get(1).name, 'MAGIC_ARROW')
    manager.loadBindingsForCharacter(1, profile.name)
    assert.equal(manager.bindings.get(1).name, 'MAGIC_ARROW')
    manager.bindings.set(9, manager.bindings.get(8))
    manager.bindings.set(8, {name: 'EQUIP_STORED_WEAPONS', data: {}})
    manager.storeBindings()
    manager.loadBindingsForCharacter(1, profile.name)
    assert.equal(manager.bindings.has(8), false)
    assert.equal(manager.bindings.get(9).name, 'CONSUMABLE_ITEM')

    await connector.initialize('play', profile)
    manager.loadBindingsForCharacter(1, profile.name)
    assert.equal(manager.bindings.get(1).name, 'AUTO_ATTACK')
    assert.equal(manager.bindings.get(8).name, 'EQUIP_STORED_WEAPONS')
    await connector.closeConnection()
    assert.equal(connector.localSaveSlot, undefined)
})

test('movement stays blocked throughout world loading, including deferred packets', () => {
    const player = {worldTransitionPending: false}
    const {connector} = loadConnector(undefined, Date, player)
    const frames = []
    connector.transport = {send: message => frames.push(message)}
    connector.sendMoveMessage({t: 5, d: [96, 82, 0, 'W', 2]})
    connector.sendMoveMessage({t: 5, d: [96.1, 82, 0, 'W', 2]})
    player.worldTransitionPending = true
    connector.cancelPendingMoveMessage()
    connector.sendMoveMessage({t: 5, d: [96.2, 82, 0, 'W', 1]})
    connector.processMessages(Date.now() + 1000)
    assert.equal(frames.length, 1)
    player.worldTransitionPending = false
    connector.sendMoveMessage({t: 5, d: [966, 1004, 0, 'W', 1]})
    connector.processMessages(Date.now() + 1000)
    assert.equal(frames.length, 2)
    assert.equal(frames[1].d[0], 966)
})

test('local transport retains outgoing limits and deferred movement behavior', async () => {
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
        assert.deepEqual(transport.frames.map(frame => frame.d.index), Array.from({length: 12}, (_, index) => index))
        connector.resetSession()
        connector.sendMoveMessage({t: 5, d: {index: 1}})
        connector.sendMoveMessage({t: 5, d: {index: 2}})
        const beforeMovement = transport.frames.length
        connector.processMessages(time + 51)
        assert.equal(transport.frames.length, beforeMovement + 1)
        assert.equal(transport.frames.at(-1).d.index, 2)
        connector.processMessages(time + 52)
        assert.equal(transport.frames.length, beforeMovement + 1)
        const original = {t: 9, d: {value: 1}}
        connector.doSend(original, time)
        original.d.value = 2
        assert.equal(transport.frames.at(-1).d.value, 1)
        assert.equal(transport.frames.at(-1).sentTime, undefined)
        connector.sendLoginRequest('user', 'password', null)
        assert.deepEqual({...transport.frames.at(-1)}, {t: 1, login: 'user', password: 'password', guestName: null})
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
        transports[0].onFrame([{"t":1,"d":{}}])
        transports[0].onFrame([{"t":2,"d":{}}])
        await new Promise(resolve => setImmediate(resolve))
        assert.deepEqual(received, [1])
        release()
        await connector.responseQueue
        assert.deepEqual(received, [1, 2])
        const staleCallback = transports[0].onFrame
        await connector.initialize()
        staleCallback([{"t":99,"d":{}}])
        transports[1].onFrame([{"t":3,"d":{}}])
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
        receive([{"t":1}])
        receive([{"t":2}])
        await new Promise(resolve => setImmediate(resolve))
        let closed = false
        const closing = connector.closeConnection().then(() => { closed = true; worldAvailable = false })
        receive([{"t":3}])
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
    const connections = frames.map(target => Connector.createConnection({open: true, sendMessages: frame => target.push(structuredClone(frame)), close() {}}))
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
    const local = Connector.createConnection({open: true, sendMessages: frame => localFrames.push(structuredClone(frame)), close() {}})
    const remote = new WebSocket(`ws://127.0.0.1:${host.address().port}`)
    try {
        await new Promise((resolve, reject) => { remote.once('open', resolve); remote.once('error', reject) })
        const frame = JSON.stringify({t: 34, d: {name: 'ProtocolCompatibility'}})
        Connector.receiveMessage(local, JSON.parse(frame))
        await Connector.waitForIdle()
        const response = new Promise(resolve => remote.once('message', data => resolve(data.toString())))
        remote.send(frame)
        assert.deepEqual(JSON.parse(await response), localFrames[0])
    } finally {
        await new Promise(resolve => { remote.once('close', resolve); remote.close() })
        await Connector.closeConnection(local)
        await new Promise(resolve => host.close(resolve))
    }
})


test('player movement skips static neighborhoods while gathering queries nearby world tiles', () => {
    const server = resolve(__dirname, '../../../server/darkenlight_server')
    require(join(server, 'node_modules/ts-node')).register({project: join(server, 'tsconfig.json'), transpileOnly: true})
    const {CharacterVisibility} = require(join(server, 'src/character/characterVisibility.ts'))
    const {LumberJackingAction} = require(join(server, 'src/game/actions/lumberJackingAction.ts'))
    const {CampingAction} = require(join(server, 'src/game/actions/campingAction.ts'))
    const tree = {x: 10, z: 11}
    const player = {
        isBot: false, nearbyDistance: 3, getPos: () => ({x: 10, z: 10}),
        monstersNearby: new Set(), npcsNearby: new Set(), charactersNearby: new Set(),
        monstersAround: new Set(), npcsAround: new Set(), charactersAround: new Set(),
        // Accessing chunks would reproduce the old broad static scan.
        get chunksAround() { throw new Error('Player movement scanned static chunks') },
        world: {trees: []}, treesNearby: new Set(),
    }
    CharacterVisibility.actualizeNearbyObjects.call(player)
    player.world.trees[10] = []
    player.world.trees[10][11] = tree
    assert.equal(LumberJackingAction.getJackableTree(player), tree)
    const action = new LumberJackingAction(player, tree)
    assert.equal(action.isJackedTreeInRange(), true)
    player.world.mapData = {blockMap: []}
    player.world.mapData.blockMap[10] = []
    player.world.mapData.blockMap[10][11] = {isCampable: () => true}
    player.chunk = {hasStaticObjectOnBlock: () => false}
    assert.equal(CampingAction.isBlockCampable(player, 10, 11), false)
    delete player.world.trees[10][11]
    assert.equal(action.isJackedTreeInRange(), false)
    assert.equal(CampingAction.isBlockCampable(player, 10, 11), true)
    player.world.trees[13] = []
    player.world.trees[13][10] = {x: 13, z: 10}
    assert.equal(LumberJackingAction.getJackableTree(player), null)
    const bot = Object.create(player)
    bot.isBot = true
    bot.blockingStaticObjectsNearby = new Set()
    Object.defineProperty(bot, 'chunksAround', {value: [{trees: [tree], blockingStaticObjects: []}]})
    CharacterVisibility.actualizeNearbyObjects.call(bot)
    assert.equal(bot.treesNearby.has(tree), true)
})
