const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const load = (file, requireModule) => {
    const mod = {exports: {}}
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText
    new Function('exports', 'require', code)(mod.exports, requireModule)
    return mod.exports
}
const geometry = load('src/data/worldAreas.ts', require)
const {WorldAreaManager: manager} = load('src/data/worldAreaManager.ts', id => id === 'vue' ? require('vue') : geometry)
const areas = [
    {id: 1, name: 'Island', points: [0,0,20,0,20,20,0,20]},
    {id: 2, name: 'Town', parentId: 1, points: [5,5,10,5,10,10,5,10]},
]
const start = () => {manager.resetLocation(); manager.setWorld(1, areas, 0, 'Continent')}
test('boundary hopping displays only the current area after five seconds, including while stationary', () => {
    start()
    manager.updateLocation(1, 1, 1, 0)
    const first = manager.announcement.value.sequence
    manager.updateLocation(1, 6, 6, 1000)
    manager.updateLocation(1, 1, 1, 2000)
    manager.updateLocation(1, 6, 6, 3000)
    manager.updateLocation(1, 6, 6, 4999)
    assert.equal(manager.announcement.value.sequence, first)
    manager.updateLocation(1, 6, 6, 5000)
    assert.equal(manager.announcement.value.name, 'Town')
    assert.equal(manager.announcement.value.sequence, first + 1)
    manager.updateLocation(1, 6, 6, 10000)
    assert.equal(manager.announcement.value.sequence, first + 1)
})
test('leaving all areas queues the world name and respects cooldown', () => {
    start(); manager.updateLocation(1, 1, 1, 0)
    const first = manager.announcement.value.sequence
    manager.updateLocation(1, 6, 6, 1000)
    manager.updateLocation(1, 30, 30, 4000)
    manager.updateLocation(1, 30, 30, 5000)
    assert.equal(manager.announcement.value.name, 'Continent')
    assert.equal(manager.announcement.value.sequence, first + 1)
    manager.updateLocation(1, 6, 6, 6000)
    assert.equal(manager.announcement.value.name, 'Continent')
    manager.updateLocation(1, 6, 6, 10000)
    assert.equal(manager.announcement.value.name, 'Town')
    assert.equal(manager.announcement.value.sequence, first + 2)
})
test('cooldown survives world changes and resets for a new session', () => {
    start(); manager.updateLocation(1, 1, 1, 0)
    const first = manager.announcement.value.sequence
    manager.setWorld(2, areas)
    manager.updateLocation(2, 6, 6, 1000)
    assert.equal(manager.announcement.value, null)
    manager.updateLocation(2, 6, 6, 5000)
    assert.equal(manager.announcement.value.sequence, first + 1)
    manager.resetLocation()
    manager.updateLocation(2, 1, 1, 5100)
    assert.equal(manager.announcement.value.name, 'Island')
})

test('initial position outside defined areas shows the world name once', () => {
    start()
    manager.updateLocation(1, 30, 30, 0)
    assert.equal(manager.announcement.value.name, 'Continent')
    const first = manager.announcement.value.sequence
    manager.updateLocation(1, 40, 40, 6000)
    assert.equal(manager.announcement.value.sequence, first)
})
