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
            const originalLog = console.log;
            console.log = (...args) => {
                if (String(args[0]).startsWith('[POI world=')) throw new Error('Packaged game rebuilt navigation instead of loading it');
                originalLog(...args);
            };
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
        current.send({kind: 'frame', connectionId: 'one', frame: {t: 34, d: {name: 'LocalOne'}}})
        await current.wait(event => event.kind === 'frame' && event.frame.some(message => message.t === 67))
        assert(current.events.filter(event => event.kind === 'frame').every(event => event.connectionId === 'one'), 'Private replies leaked into a second connection')
        current.send({kind: 'frame', connectionId: 'one', frame: {t: 35, d: {name: 'LocalOne', classKey: 'FIGHTER'}}})
        const login = await current.wait(event => event.kind === 'frame' && event.frame.some(message => message.t === 2))
        const messages = current.events.filter(event => event.kind === 'frame' && event.connectionId === 'one').flatMap(event => event.frame)
        const character = login.frame.find(message => message.t === 2).d.char
        assert(character, 'Actual game runtime did not create a character')
        const initialClock = messages.find(message => message.t === 7).d.dayNightCycle
        assert.equal(initialClock.day, 1)
        assert.equal(initialClock.paused, false)
        assert.ok(initialClock.phase < 0.01, 'New character did not start at midnight')
        assert(messages.findIndex(message => message.t === 7) < messages.findIndex(message => message.t === 2), 'Login preceded map data')
        assert(messages.filter(message => message.t === 7).every(message => message.d.mapChunk === null), 'Local simulation sent static terrain chunks')
        current.send({kind: 'frame', connectionId: 'one', frame: {t: 43, d: {targetId: -1}}})
        await current.wait(event => event.kind === 'frame' && event.frame.some(message => message.t === 92 && message.d?.members.some(member => member.id === -1)))
        assert(current.events.filter(event => event.kind === 'frame').every(event => event.frame.every(message => message.t !== 93)), 'Adding a companion sent an obsolete invitation dialog')
        current.send({kind: 'stop', requestId: 1})
        const stopped = await current.wait(event => event.kind === 'done' && event.requestId === 1)
        assert.equal(stopped.error, undefined)
        assert(save, 'No local save was written')
        const savedDocument = JSON.parse(save)
        assert.ok(savedDocument.collections.characters[0].gameTimeMs > 0, 'Running game time was not saved')
        const spawnStates = savedDocument.collections.characters[0].spawnStates
        assert.ok(spawnStates?.length > 0, 'No spawn progress was saved')
        const firstWorld = spawnStates.find(world => world.spawns.length >= 2)
        assert(firstWorld, 'Integration fixture needs two spawns')
        const exhaustedSpawn = firstWorld.spawns[0], partialSpawn = firstWorld.spawns[1]
        exhaustedSpawn.alive = 0
        exhaustedSpawn.respawnAt = []
        partialSpawn.alive = 1
        partialSpawn.respawnAt = []
        const resourceStates = savedDocument.collections.characters[0].resourceStates
        assert.ok(resourceStates?.length > 0, 'No resource progress was saved')
        const worldDefinition = JSON.parse(readFileSync(join(files, 'world/world.json'), 'utf8')).worlds.find(world => world.id === firstWorld.worldId)
        const [treeX, treeZ] = worldDefinition.trees[0].split(';').map(Number)
        const resourceState = resourceStates.find(world => world.worldId === firstWorld.worldId)
        resourceState.trees = [{x: treeX, z: treeZ, capacity: 0}]
        // Exercise loading a later day without waiting for several complete cycles.
        savedDocument.collections.characters[0].gameTimeMs = (6 + 750 / 1440) * initialClock.cycleDurationMs
        save = JSON.stringify(savedDocument)
        await current.worker.terminate()
        current = await boot()
        current.send({kind: 'connect', connectionId: 'restored'})
        current.send({kind: 'frame', connectionId: 'restored', frame: {t: 1, login: '', password: '', guestName: 'LocalOne'}})
        const restored = await current.wait(event => event.kind === 'frame' && event.frame.some(message => message.t === 2))
        assert.equal(restored.frame.find(message => message.t === 2).d.char?.id, character.id)
        const restoredMap = current.events.filter(event => event.kind === 'frame').flatMap(event => event.frame).find(message => message.t === 7)
        assert.equal(restoredMap.d.dayNightCycle.day, 7)
        assert.equal(restoredMap.d.dayNightCycle.paused, false)
        assert.ok(Math.abs(restoredMap.d.dayNightCycle.phase - 750 / 1440) < 0.001, 'Saved game time was not restored')
        await current.wait(event => event.kind === 'frame' && event.frame.some(message => message.t === 92 && message.d?.members.some(member => member.id === -1)))
        current.send({kind: 'stop', requestId: 2})
        assert.equal((await current.wait(event => event.kind === 'done' && event.requestId === 2)).error, undefined)
        assert.ok(JSON.parse(save).collections.characters[0].gameTimeMs >= savedDocument.collections.characters[0].gameTimeMs, 'Restored clock did not continue into the next save')
        const restoredSpawns = JSON.parse(save).collections.characters[0].spawnStates.find(world => world.worldId === firstWorld.worldId).spawns
        assert.equal(restoredSpawns.find(spawn => spawn.id === exhaustedSpawn.id).alive, 0, 'Exhausted one-time spawn was repopulated')
        assert.equal(restoredSpawns.find(spawn => spawn.id === partialSpawn.id).alive, 1, 'Surviving population was not preserved')
        const restoredResources = JSON.parse(save).collections.characters[0].resourceStates.find(world => world.worldId === firstWorld.worldId)
        assert.equal(restoredResources.trees.find(tree => tree.x === treeX && tree.z === treeZ).capacity, 0, 'Exhausted tree was restored after loading')
        console.log('PASS: bundled game worker, two connection isolation, real character creation, map/login ordering, party, game clock, spawn and resource progress save/restore')
    } finally {
        if (current) await current.worker.terminate()
        await new Promise(resolve => server.close(resolve))
    }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
