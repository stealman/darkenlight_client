const {Worker} = require('node:worker_threads')
const {createServer} = require('node:http')
const {resolve, join} = require('node:path')
const {pathToFileURL} = require('node:url')
const {readFileSync, readdirSync} = require('node:fs')
const assert = require('node:assert/strict')

async function main() {
    const root = resolve(__dirname, '..')
    const workerFile = readdirSync(join(root, 'dist/assets')).find(name => /^game\.worker-.*\.js$/.test(name))
    assert(workerFile, 'Build the desktop frontend before running the worker integration test')
    const files = join(root, 'public')
    const server = createServer((request, response) => {
        const path = resolve(files, '.' + new URL(request.url, 'http://localhost').pathname)
        if (!path.startsWith(files + require('node:path').sep)) { response.writeHead(403); response.end(); return }
        try { response.end(readFileSync(path)) } catch { response.writeHead(404); response.end() }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const baseUrl = `http://127.0.0.1:${server.address().port}/`
    let save = null
    const boot = async () => {
        const worker = new Worker(`
            const {parentPort} = require('node:worker_threads');
            globalThis.setImmediate = undefined;
            globalThis.postMessage = message => parentPort.postMessage(message);
            globalThis.addEventListener = (type, fn) => { if (type === 'unhandledrejection') process.on('unhandledRejection', reason => fn({reason, preventDefault(){}})); };
            parentPort.on('message', data => globalThis.onmessage({data}));
            import(${JSON.stringify(pathToFileURL(join(root, 'dist/assets', workerFile)).href)}).then(() => parentPort.postMessage({kind:'loaded'})).catch(error => parentPort.postMessage({kind:'error',error:error.stack}));
        `, {eval: true})
        const events = []
        let error
        worker.on('error', value => { error = value })
        worker.on('message', message => {
            if (message.kind === 'io') {
                if (message.operation === 'write-save') save = message.value
                worker.postMessage({kind: 'io-result', requestId: message.requestId, value: message.operation === 'load-save' ? save : null})
            } else if (message.kind === 'error') error = new Error(message.error)
            else events.push(message)
        })
        const wait = async predicate => {
            const until = Date.now() + 120000
            while (Date.now() < until) {
                if (error) throw error
                const event = events.find(predicate)
                if (event) return event
                await new Promise(resolve => setTimeout(resolve, 10))
            }
            throw new Error('Worker integration timed out')
        }
        await wait(event => event.kind === 'loaded')
        worker.postMessage({kind: 'start', mode: 'play', slot: 'test', authoringToken: '', baseUrl})
        await wait(event => event.kind === 'ready')
        return {worker, events, wait, send: message => worker.postMessage(message)}
    }
    let current
    try {
        current = await boot()
        for (const connectionId of ['one', 'two']) current.send({kind: 'connect', connectionId})
        current.send({kind: 'frame', connectionId: 'one', frame: JSON.stringify({t: 34, d: {name: 'LocalOne'}})})
        await current.wait(event => event.kind === 'frame' && JSON.parse(event.frame).some(message => message.t === 67))
        assert(current.events.filter(event => event.kind === 'frame').every(event => event.connectionId === 'one'), 'Private replies leaked into a second connection')
        current.send({kind: 'frame', connectionId: 'one', frame: JSON.stringify({t: 35, d: {name: 'LocalOne', classKey: 'FIGHTER'}})})
        const login = await current.wait(event => event.kind === 'frame' && JSON.parse(event.frame).some(message => message.t === 2))
        const messages = current.events.filter(event => event.kind === 'frame' && event.connectionId === 'one').flatMap(event => JSON.parse(event.frame))
        const character = JSON.parse(login.frame).find(message => message.t === 2).d.char
        assert(character, 'Actual game runtime did not create a character')
        assert(messages.findIndex(message => message.t === 7) < messages.findIndex(message => message.t === 2), 'Login preceded map data')
        assert(messages.filter(message => message.t === 7).every(message => message.d.mapChunk === null), 'Local simulation sent static terrain chunks')
        current.send({kind: 'stop', requestId: 1})
        const stopped = await current.wait(event => event.kind === 'done' && event.requestId === 1)
        assert.equal(stopped.error, undefined)
        assert(save, 'No local save was written')
        await current.worker.terminate()
        current = await boot()
        current.send({kind: 'connect', connectionId: 'restored'})
        current.send({kind: 'frame', connectionId: 'restored', frame: JSON.stringify({t: 1, login: '', password: '', guestName: 'LocalOne'})})
        const restored = await current.wait(event => event.kind === 'frame' && JSON.parse(event.frame).some(message => message.t === 2))
        assert.equal(JSON.parse(restored.frame).find(message => message.t === 2).d.char?.id, character.id)
        current.send({kind: 'stop', requestId: 2})
        assert.equal((await current.wait(event => event.kind === 'done' && event.requestId === 2)).error, undefined)
        console.log('PASS: bundled game worker, two connection isolation, real character creation, map/login ordering, save and restore')
    } finally {
        if (current) await current.worker.terminate()
        await new Promise(resolve => server.close(resolve))
    }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
