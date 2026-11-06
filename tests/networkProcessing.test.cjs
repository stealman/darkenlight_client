const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

function loadModule(path, dependencies) {
    const source = readFileSync(join(__dirname, '../src', path), 'utf8')
    const exports = {}
    new Function('exports', 'require', ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText)(exports, name => dependencies[name] || {})
    return exports
}

test('monster aggro message routes to the private overlay alert', async () => {
    const calls = []
    const {MessageProcessor: processor} = loadModule('network/messageProcessor.ts', {
        '@/gui/overlay/overlayManager': {OverlayManager: {addMonsterAggroAlert(data) {calls.push(data)}}},
    })
    const data = {id: 42, worldId: 7}
    await processor.processResponse([{t: 97, d: data}])
    assert.deepEqual(calls, [data])
})

test('danger skull counts arrive with spawns and update only in the current world', async () => {
    const monster = {}
    const {MessageProcessor: processor} = loadModule('network/messageProcessor.ts', {
        '@/babylon/monsters/monsterManager': {MonsterManager: {addMonster() {}, monsters: new Map([[42, monster]])}},
        '@/data/myPlayer': {MyPlayer: {worldId: 7}},
    })
    processor.addMonster({id: 42, skulls: 2})
    assert.equal(monster.skulls, 2)
    await processor.processResponse([{t: 98, d: {worldId: 8, monsters: [{id: 42, skulls: 3}]}}])
    assert.equal(monster.skulls, 2)
    await processor.processResponse([{t: 98, d: {worldId: 7, monsters: [{id: 42, skulls: 0}]}}])
    assert.equal(monster.skulls, 0)
})

test('world mutation messages render once through the complete world renderer', async () => {
    const calls = []
    const TreeManager = {addTree() {calls.push('addTree')}, removeTreeAt() {calls.push('removeTree')},
        renderTrees() {calls.push('trees')}}
    const StaticsManager = {addObject() {calls.push('addStatic')}, removeObjects() {calls.push('removeStatics')},
        removeObjectAt() {calls.push('removeStatic')}, renderObjects() {calls.push('statics')}}
    const {MessageProcessor: processor} = loadModule('network/messageProcessor.ts', {
        '@/babylon/world/treeManager': {TreeManager},
        '@/babylon/world/statics/staticsManager': {StaticsManager},
        '@/babylon/world/worldRenderer': {WorldRenderer: {renderWorld() {
            calls.push('world'); TreeManager.renderTrees(); StaticsManager.renderObjects()
        }}},
    })
    for (const [type, expected, data] of [[13, 'addTree', {}], [14, 'removeTree', {}],
        [15, 'addStatic', {}], [16, 'removeStatic', {}], [16, 'removeStatics', {objects: []}]]) {
        calls.length = 0
        await processor.processResponse([{t: type, d: data}])
        assert.deepEqual(calls, [expected, 'world', 'trees', 'statics'])
    }
})

test('map-before-login ordering and the asynchronous login barrier remain intact', async () => {
    const {MessageProcessor: processor} = loadModule('network/messageProcessor.ts', {})
    const calls = []
    let resolveLogin
    processor.processWorldData = () => calls.push('map')
    processor.loginResponse = () => new Promise(resolve => {calls.push('login'); resolveLogin = resolve})
    processor.charMove = () => calls.push('move')
    const processing = processor.processResponse([{t: 7}, {t: 2}, {t: 6}])
    assert.deepEqual(calls, ['map', 'login'])
    resolveLogin()
    await processing
    assert.deepEqual(calls, ['map', 'login', 'move'])
})

test('a character removed before its asynchronous model assignment does not leave a model behind', async () => {
    let releaseModel, disposals = 0, initializations = 0
    class Character {
        constructor(data) {this.id = data.id; this.model = null}
        async createModel() {
            await new Promise(resolve => {releaseModel = resolve})
            this.model = {removeFromScene() {disposals++}, async initAsync() {initializations++}}
        }
        clearTimedAction() {}
    }
    const {CharacterManager: manager} = loadModule('babylon/character/characterManager.ts', {
        '@/babylon/character/character': {default: Character},
        '@/data/myPlayer': {MyPlayer: {myChar: {autoAttackTarget: null}}},
        '@/gui/targettingManager': {TargetingManager: {selectedTarget: null}},
    })
    manager.isCharInViewport = () => true
    const adding = manager.addCharacter({id: 1})
    manager.removeCharacter(1)
    releaseModel()
    await adding
    assert.equal(disposals, 1)
    assert.equal(initializations, 0)
    assert.equal(manager.characters.size, 0)
})

test('movement confirmations retain pending waypoints without reallocating the queue', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {default: Character} = loadModule('babylon/character/character.ts', {'@babylonjs/core': core})
    const char = Object.create(Character.prototype)
    char.pos = core.Vector3.Zero()
    char.setMoveAngle = () => {}
    const point = x => new core.Vector3(x, 0, 0)
    const queue = [point(1), point(2), point(3)]
    char.serverMoveTargets = queue
    char.syncServerMovement(1, 0, 2, 0, 3, 0)
    assert.equal(char.serverMoveTargets, queue)
    assert.deepEqual(queue.map(p => p.x), [1, 2])
    char.syncServerMovement(2, 0, 3, 0, 4, 0)
    assert.deepEqual(queue.map(p => p.x), [1, 2, 3])
    assert.equal(char.finishServerMovement(2, 0), true)
    assert.deepEqual(queue.map(p => p.x), [1, 2])
    char.clearServerMovementTargets()
    assert.equal(queue.length, 0)
    char.syncServerMovement(20, 0, 21, 0)
    assert.equal(char.pos.x, 20)
    assert.deepEqual(queue.map(p => p.x), [21])
})

test('interrupted bow attacks keep one animation-end observer and cannot restart an inactive clip', async () => {
    const core = await import('@babylonjs/core/index.js')
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const {CharacterModel} = loadModule('babylon/character/characterModel.ts', {
        '@babylonjs/core': core,
        '@/babylon/materials': {Materials: {getPBRMaterial: () => new core.PBRMaterial('human', scene)}},
        '@/data/items/item': {EquipItemSlots: {}, WeaponTypes: {BOW: 'bow'}, WeaponCategories: {AXE: 'axe'},
            EquipSlotModelsCb: {WAR_SPEAR: {modelId: 42}}},
        '@/utils/utils': {Utils: {rollDice: () => 0}},
        '@/babylon/animations/animation': {AnimTransition: class {
            constructor(_duration, _from, to) {to.start(false)}
            forceEnd() {}
        }},
        '@/babylon/scene/activeMeshFreezer': {ActiveMeshFreezer: {setSkeletonActive() {}}},
    })
    try {
        const entries = new core.InstantiatedEntries()
        const root = new core.Mesh('human', scene)
        const skeleton = new core.Skeleton('humanSkeleton', 'humanSkeleton', scene)
        new core.Bone('Bone.012', skeleton, null, core.Matrix.Identity())
        new core.Bone('Bone.009', skeleton, null, core.Matrix.Identity())
        const source = new core.AnimationGroup('source', scene)
        const animation = new core.Animation('position', 'position.x', 30, core.Animation.ANIMATIONTYPE_FLOAT)
        animation.setKeys([{frame: 0, value: 0}, {frame: 1800, value: 1}])
        source.addTargetedAnimation(animation, root)
        entries.rootNodes.push(root); entries.skeletons.push(skeleton); entries.animationGroups.push(source)
        CharacterModel.instantiate = async () => entries
        const model = new CharacterModel({id: 1, pos: core.Vector3.Zero(), insideView: true, equipSet: new Map(),
            getModelHeight: () => 2, isMyChar: () => false, attackAnimationTime: 1000,
            getWeapon: () => ({modelId: 99, slotInfo: {weaponType: 'bow'}})})
        model.snapToParentPosition = () => {}
        await model.initAsync()
        const bow = model.bowAimAnim
        for (let i = 0; i < 200; i++) {
            model.doAttackAnimation()
            assert.equal(bow.onAnimationEndObservable.observers.length, 1)
        }
        model.actualAnim = model.idleAnim
        bow.stop()
        bow.onAnimationEndObservable.notifyObservers(bow)
        assert.equal(bow.isPlaying, false)
        model.removeFromScene()
        assert.equal(bow.onAnimationEndObservable.observers.length, 0)
    } finally {
        scene.dispose(); engine.dispose()
    }
})

test('NPC and guard spawn continuations release models removed before assignment', async () => {
    for (const guard of [false, true]) {
        let releaseModel, disposals = 0
        class Npc {
            constructor(data) {this.id = data.id}
            async createModel() {
                await new Promise(resolve => {releaseModel = resolve})
                this.model = {removeFromScene() {disposals++}}
            }
        }
        const {NpcManager: manager} = loadModule('babylon/npc/npcManager.ts', {
            '@/babylon/npc/npc': {Npc, Guard: Npc},
            '@/gui/targettingManager': {TargetingManager: {selectedTarget: null}},
        })
        manager.applyNpcData = () => {}
        manager.setNpcPosition = () => {}
        const adding = guard ? manager.addGuard({id: 1}) : manager.addNpc({id: 1})
        if (guard) manager.removeGuard(1, false)
        else manager.removeNpc(1)
        releaseModel()
        await adding
        assert.equal(disposals, 1)
        assert.equal(manager.npcs.size + manager.guards.size, 0)
    }
})
