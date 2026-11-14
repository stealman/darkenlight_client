const assert = require('node:assert/strict')
const {test} = require('node:test')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function load(path, dependencies = {}) {
    const exports = {}
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText, {exports, require: name => dependencies[name] || {}})
    return exports
}
test('remote pickup animates visible stationary characters and logs the actor, item and quantity', () => {
    const entries = [], animations = []
    const player = {worldId: 7, myChar: {id: 1}}
    const {CharacterManager: manager} = load('src/babylon/character/characterManager.ts', {
        '@/data/myPlayer': {MyPlayer: player},
        '@/data/activityLogManager': {ActivityLogManager: {add: (...args) => entries.push(args)}},
        '@/data/items/item': {Item: {fromData: data => data}},
        '@/i18n': {t: (_, {name, item, quantity}) => `${name} picked up: ${item} x${quantity}`},
    })
    let angle = null, speed = 1
    manager.characters.set(2, {getName: () => 'Alice', getMoveAngle: () => angle, getActualSpeed: () => speed,
        model: {playPickupAnimation: () => animations.push(true)}})
    manager.visibleCharacters.add(2)
    const data = {id: 2, worldId: 7, item: {name: 'Herb'}, quantity: 3, time: 123}
    manager.receivePickup(data)
    assert.equal(animations.length, 1)
    assert.equal(entries[0][0], 'Alice picked up: Herb x3')
    assert.equal(entries[0][2], 123)
    assert.equal(entries[0][3].item.name, 'Herb')
    angle = 0
    manager.receivePickup(data)
    assert.equal(animations.length, 1, 'moving character keeps its current animation')
    assert.equal(entries.length, 2, 'successful pickup still appears in the log')
    speed = 0
    manager.receivePickup(data)
    assert.equal(animations.length, 2, 'stopped movement follows the local pickup rule')
    for (const ignored of [{...data, worldId: 8}, {...data, id: 1}, {...data, id: 3}]) manager.receivePickup(ignored)
    manager.visibleCharacters.clear()
    manager.receivePickup(data)
    assert.equal(entries.length, 3, 'self, unknown, other world and offscreen events are ignored')
})
test('shared pickup animation keeps combat, healing, death and inactive models intact', () => {
    const {CharacterModel} = load('src/babylon/character/characterModel.ts')
    for (const blocked of ['inactive', 'dead', 'healing', 'combat', 'missing']) {
        let transitions = 0
        const idle = {}, pickup = {}
        const model = {isActive: () => blocked !== 'inactive', pickupAnim: blocked === 'missing' ? undefined : pickup,
            parent: {dead: blocked === 'dead', healingActive: blocked === 'healing'}, idleAnim: idle,
            actualAnim: blocked === 'combat' ? {isPlaying: true} : idle,
            transitionToAnimation: () => transitions++}
        CharacterModel.prototype.playPickupAnimation.call(model)
        assert.equal(transitions, 0, blocked)
    }
})

test('pickup network packet dispatches to the character manager', async () => {
    const received = []
    const {MessageProcessor} = load('src/network/messageProcessor.ts', {
        '@/babylon/character/characterManager': {CharacterManager: {receivePickup: data => received.push(data)}},
    })
    const data = {id: 2, worldId: 7, item: {}, quantity: 1, time: 123}
    await MessageProcessor.processResponse([{t: 103, d: data}])
    assert.equal(received[0], data)
})
