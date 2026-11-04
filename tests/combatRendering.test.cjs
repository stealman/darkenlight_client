const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadModule(path, dependencies, clock = Date) {
    const source = readFileSync(join(__dirname, '../src', path), 'utf8')
    const compiled = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText
    const exports = {}
    vm.runInNewContext(compiled, {exports, Date: clock, require: name => dependencies[name] || {}})
    return exports
}

test('combat detail rules include incoming attacks and exclude unrelated fights on medium', () => {
    const {Settings} = loadModule('settings/settings.ts', {})
    const MyPlayer = {myChar: {}}
    const dependencies = {'@/settings/settings': {Settings}, '@/data/myPlayer': {MyPlayer}}
    const {CharacterModel} = loadModule('babylon/character/characterModel.ts', dependencies)
    const {MonsterModel} = loadModule('babylon/monsters/monsterModel.ts', dependencies)
    for (const level of ['LOW', 'MEDIUM', 'HIGH']) {
        Settings.setDetailLevel(level)
        for (const involved of [false, true]) {
            const expected = level === 'HIGH' || (level === 'MEDIUM' && involved)
            assert.equal(Settings.isCombatEffectEnabled(involved), expected)
            for (const Model of [CharacterModel, MonsterModel]) {
                const model = Object.create(Model.prototype)
                model.parent = {autoAttackTarget: involved ? MyPlayer.myChar : {}}
                const calls = []
                model.weaponEquipItem = {setWeaponTrailEnabled: enabled => calls.push(enabled)}
                model.setWeaponTrailEnabled(true)
                assert.equal(calls.length, expected ? 1 : 0, `${level}: ${Model.name}`)
                model.setWeaponTrailEnabled(false)
                assert.equal(calls.at(-1), false, 'ending an existing effect is always allowed')
            }
        }
    }
})

test('weapon trail stays stopped during delay and an interrupted swing cannot start it later', async () => {
    const core = await import('@babylonjs/core/index.js')
    let now = 1000
    const {Settings} = loadModule('settings/settings.ts', {})
    const {EquipItem} = loadModule('babylon/item/equipManager.ts', {
        '@babylonjs/core': core,
        '@/settings/settings': {Settings},
        '@/babylon/materials': {Materials: {}},
        '@/babylon/scene/activeMeshFreezer': {ActiveMeshFreezer: {invalidate() {}}},
    }, {now: () => now})
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    try {
        const tip = new core.TransformNode('tip', scene)
        const trail = new core.TrailMesh('weapon', tip, scene, .3, 60, false)
        trail.setEnabled(false)
        const item = Object.create(EquipItem.prototype)
        Object.assign(item, {weaponTrail: trail, powerStrikeTrailParticles: null})
        let updates = 0
        const update = trail.update.bind(trail)
        trail.update = () => { updates++; update() }
        item.setWeaponTrailEnabled(true)
        for (now = 1000; now < 1150; now += 10) {
            item.updateWeaponTrailFade()
            scene.onBeforeRenderObservable.notifyObservers(scene)
        }
        assert.equal(updates, 0)
        item.updateWeaponTrailFade()
        scene.onBeforeRenderObservable.notifyObservers(scene)
        assert.equal(updates, 1)
        assert.equal(trail.isEnabled(), true)
        item.stopWeaponTrailImmediately()
        item.setWeaponTrailEnabled(true)
        item.setWeaponTrailEnabled(false)
        now += 500
        item.updateWeaponTrailFade()
        scene.onBeforeRenderObservable.notifyObservers(scene)
        assert.equal(updates, 1)
        assert.equal(trail.isEnabled(), false)
    } finally {
        scene.dispose()
        engine.dispose()
    }
})

test('arrow instances share their source, preserve launch transform and release trail observers', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {Settings} = loadModule('settings/settings.ts', {})
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const {ArrowsManager, Arrow} = loadModule('babylon/world/arrowsManager.ts', {
        '@babylonjs/core': core,
        '@/settings/settings': {Settings},
        '@/babylon/scene/renderer': {Renderer: {scene}},
        '@/babylon/materials': {Materials: {}},
    })
    try {
        ArrowsManager.initialize()
        const hand = new core.TransformNode('hand', scene)
        hand.position.set(2, 3, 4)
        hand.rotationQuaternion = core.Quaternion.RotationYawPitchRoll(.4, .2, .1)
        const attacker = {pos: core.Vector3.Zero()}
        const target = {pos: new core.Vector3(7, 0, 7), getModelHeight: () => 2}
        const observerCount = () => scene.onBeforeRenderObservable.observers.filter(observer => !observer._willBeUnregistered).length
        const initialObservers = observerCount()
        for (const level of ['LOW', 'MEDIUM', 'HIGH']) {
            Settings.setDetailLevel(level)
            for (let i = 0; i < 5; i++) {
                const arrow = new Arrow(attacker, target, Date.now(), null, false)
                assert.ok(arrow.meshInstance instanceof core.InstancedMesh)
                assert.equal(arrow.meshInstance.sourceMesh, ArrowsManager.mesh)
                assert.equal(ArrowsManager.mesh.isVisible, false)
                assert.equal(arrow.meshInstance.isVisible, true)
                arrow.assignHandNode(hand, .25)
                const before = arrow.meshInstance.computeWorldMatrix(true).clone()
                arrow.startFlying()
                const after = arrow.meshInstance.computeWorldMatrix(true)
                before.asArray().forEach((value, index) => assert.ok(Math.abs(value - after.asArray()[index]) < 1e-5))
                assert.equal(arrow.trail.getTotalVertices(), 76 * 5)
                arrow.onFrame(Date.now(), arrow.flightDuration / 2)
                assert.ok(Number.isFinite(arrow.meshInstance.position.y))
                arrow.dispose()
                arrow.dispose()
                assert.equal(ArrowsManager.mesh.instances.length, 0)
                assert.equal(observerCount(), initialObservers)
            }
        }
    } finally {
        scene.dispose()
        engine.dispose()
    }
})
