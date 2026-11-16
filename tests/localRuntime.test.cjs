const {test} = require('node:test')
const assert = require('node:assert/strict')
const {resolve, join} = require('node:path')
const {readFileSync, readdirSync} = require('node:fs')
const server = resolve(__dirname, '../../../server/darkenlight_server')
require(join(server, 'node_modules/ts-node')).register({project: join(server, 'tsconfig.json'), transpileOnly: true})
const {ObjectId, EJSON} = require(join(server, 'node_modules/bson'))
const {LocalGameStorage, parseSave, restoreCharacterSave} = require(join(server, 'src/db/localStorage.ts'))
const {decodeMapPng, browserPlatform} = require('../src/local/browserPlatform.ts')
const {nodePlatform} = require(join(server, 'src/runtime/nodePlatform.ts'))

test('local repositories preserve BSON identities, dates, projections and conditional writes', async () => {
    let saved
    const store = new LocalGameStorage('world-v1', {}, async value => { saved = value })
    const call = (method, ...args) => store.execute({collection: 'characters', method, args})
    const created = new Date('2026-01-01T00:00:00Z')
    const id = await call('insert', {name: 'Hero.*', created, bank: {items: []}})
    assert(id instanceof ObjectId)
    assert.equal((await call('findByAtt', 'name', 'hero.*')).length, 1)
    assert.equal((await call('findByAtt', 'name', 'hero')).length, 0)
    const player = new ObjectId()
    assert.equal(await call('update', id, {player}, {$or: [{player: {$exists: false}}, {player: null}]}), true)
    assert.equal(await call('update', id, {player: new ObjectId()}, {$or: [{player: {$exists: false}}, {player: null}]}), false)
    const projected = await call('findByOid', id, {bank: 1})
    assert.deepEqual(Object.keys(projected).sort(), ['_id', 'bank'])
    const record = await call('findByOid', id)
    record.name = 'external mutation'
    assert.equal((await call('findByOid', id)).name, 'Hero.*')
    assert.equal(await call('nextId', 'darkenlight.items'), 1)
    assert.equal(await call('nextId', 'darkenlight.items'), 2)
    await store.flush()
    const restored = new LocalGameStorage('world-v1', parseSave(saved, 'world-v1'), async () => {})
    const restoredRecord = await restored.execute({collection: 'characters', method: 'findByOid', args: [id]})
    assert(restoredRecord.player.equals(player))
    assert.equal(restoredRecord.created.toISOString(), created.toISOString())
    assert.throws(() => parseSave(saved, 'other-world'), /different world version/)
})

test('local saves serialize writes, retain failed writes for retry, and preserve changes made during a write', async () => {
    let rejectFirst = true
    const snapshots = []
    const store = new LocalGameStorage('world', {}, async value => {
        if (rejectFirst) { rejectFirst = false; throw new Error('disk full') }
        snapshots.push(EJSON.parse(value))
        if (snapshots.length === 1) await store.execute({collection: 'characters', method: 'insert', args: [{id: 2}]})
    })
    await store.execute({collection: 'characters', method: 'insert', args: [{id: 1}]})
    await assert.rejects(store.flush(), /disk full/)
    await store.flush()
    await store.flush()
    assert.equal(snapshots[0].collections.characters.length, 1)
    assert.equal(snapshots[1].collections.characters.length, 2)
})

test('character saves exclude world definitions and reload the unchanged base world', async () => {
    let serialized
    const base = {worlds: [{id: 1, name: 'Authored world', trees: ['base']}], bots: [{id: 1}], containers: [{id: 1}], counters: [{_id: 'items', seq: 50}]}
    const store = new LocalGameStorage('world', base, async value => { serialized = value })
    await store.execute({collection: 'worlds', method: 'update', args: [undefined, {name: 'Session-only change'}]})
    await store.execute({collection: 'characters', method: 'insert', args: [{name: 'Hero', inventory: {items: [{id: 51}]}}]})
    await store.flush()
    const save = EJSON.parse(serialized)
    assert.deepEqual(Object.keys(save.collections).sort(), ['characters', 'counters'])
    assert.equal(serialized.includes('Authored world'), false)
    const restored = restoreCharacterSave(base, serialized, 'world')
    assert.deepEqual(restored.worlds, base.worlds)
    assert.equal(restored.characters[0].name, 'Hero')
    assert.equal(restored.counters[0].seq, 50)
    assert.throws(() => parseSave(EJSON.stringify({...save, collections: {...save.collections, worlds: base.worlds}}), 'world'), /unsupported/)
})

test('browser PNG decoding preserves every authored map pixel from the Node decoder', async () => {
    const directory = join(server, 'assets/maps')
    for (const file of readdirSync(directory).filter(name => /_map_(height|terrain|gathering|surface)\.png$/.test(name))) {
        const bytes = readFileSync(join(directory, file))
        const expected = await nodePlatform.decodePng(bytes)
        const actual = decodeMapPng(bytes)
        assert.equal(actual.width, expected.width, file)
        assert.equal(actual.height, expected.height, file)
        assert.deepEqual(actual.data, new Uint8Array(expected.data), file)
        const platform = browserPlatform({readFile: async () => bytes, writeFile: async () => {}})
        const encoded = await platform.encodePng(actual)
        assert.deepEqual((await nodePlatform.decodePng(encoded)).data, Buffer.from(expected.data), file)
    }
})

test('browser and Node password providers accept one another\'s bcrypt hashes', async () => {
    const browser = browserPlatform({readFile: async () => new Uint8Array(), writeFile: async () => {}})
    assert(await browser.checkPassword('runtime-test', await nodePlatform.hashPassword('runtime-test')))
    assert(await nodePlatform.checkPassword('runtime-test', await browser.hashPassword('runtime-test')))
    assert.equal(await browser.checkPassword('wrong', await nodePlatform.hashPassword('runtime-test')), false)
})
