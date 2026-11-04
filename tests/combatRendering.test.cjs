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

test('cancelling an arrow before its particles start releases both systems and the emitter', async () => {
    const core = await import('@babylonjs/core/index.js')
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const {ArrowsManager, Arrow} = loadModule('babylon/world/arrowsManager.ts', {
        '@babylonjs/core': core,
        '@/babylon/scene/renderer': {Renderer: {scene}},
    })
    try {
        ArrowsManager.initialize()
        for (let i = 0; i < 30; i++) {
            const arrow = new Arrow({pos: core.Vector3.Zero()}, {pos: core.Vector3.One(), getModelHeight: () => 2}, 0, null, false)
            arrow.effectTip = new core.TransformNode('effect', scene)
            arrow.effectTip.parent = arrow.meshInstance
            arrow.fireParticles = new core.ParticleSystem('fire', 8, scene)
            arrow.smokeParticles = new core.ParticleSystem('smoke', 8, scene)
            arrow.fireParticles.emitter = arrow.effectTip
            arrow.smokeParticles.emitter = arrow.effectTip
            const emitter = arrow.effectTip
            const emitterStatesAtDisposal = []
            for (const system of [arrow.fireParticles, arrow.smokeParticles]) {
                system.onDisposeObservable.addOnce(() => {
                    emitterStatesAtDisposal.push(emitter.isDisposed())
                })
            }
            ArrowsManager.arrows.push(arrow)
            arrow.dispose()
            assert.deepEqual(emitterStatesAtDisposal, [false, false], 'keep emitter until every system is disposed')
            ArrowsManager.clear()
            assert.equal(scene.particleSystems.length, 0)
            assert.equal(scene.transformNodes.length, 0)
            assert.equal(ArrowsManager.mesh.instances.length, 0)
            assert.equal(emitter.isDisposed(), true)
            assert.equal(ArrowsManager.arrows.length, 0)
        }
    } finally {
        scene.dispose()
        engine.dispose()
    }
})

test('removing human models releases all animation clips, skeletons and footstep sounds', async () => {
    const core = await import('@babylonjs/core/index.js')
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const material = new core.PBRMaterial('shared', scene)
    const {CharacterModel} = loadModule('babylon/character/characterModel.ts', {
        '@babylonjs/core': core,
        '@/babylon/materials': {Materials: {getPBRMaterial: () => material}},
        '@/data/items/item': {EquipItemSlots: {}},
        '@/babylon/scene/activeMeshFreezer': {ActiveMeshFreezer: {setSkeletonActive() {}}},
    })
    try {
        for (let i = 0; i < 25; i++) {
            const entries = new core.InstantiatedEntries()
            const root = new core.Mesh('human', scene)
            const skeleton = new core.Skeleton('humanSkeleton', 'humanSkeleton', scene)
            new core.Bone('Bone.012', skeleton, null, core.Matrix.Identity())
            new core.Bone('Bone.009', skeleton, null, core.Matrix.Identity())
            const source = new core.AnimationGroup('humanAnimation', scene)
            const animation = new core.Animation('position', 'position.x', 30, core.Animation.ANIMATIONTYPE_FLOAT)
            animation.setKeys([{frame: 0, value: 0}, {frame: 1800, value: 1}])
            source.addTargetedAnimation(animation, root)
            entries.rootNodes.push(root)
            entries.skeletons.push(skeleton)
            entries.animationGroups.push(source)
            CharacterModel.instantiate = async () => entries
            const model = new CharacterModel({id: i, pos: core.Vector3.Zero(), insideView: true,
                isMyChar: () => false, getModelHeight: () => 2, equipSet: new Map()})
            model.snapToParentPosition = () => {}
            await model.initAsync()
            assert.equal(scene.animationGroups.length, 18)
            let soundDisposed = false
            model.footStepSounds.set('dirt', {isPlaying: false, dispose() {soundDisposed = true}})
            model.removeFromScene()
            assert.equal(scene.animationGroups.length, 0)
            assert.equal(scene._activeAnimatables.length, 0)
            assert.equal(scene.skeletons.length, 0)
            assert.equal(soundDisposed, true)
            assert.equal(scene.transformNodes.length, 0)
            assert.equal(scene.meshes.length, 0)
        }
    } finally {
        scene.dispose()
        engine.dispose()
    }
})

test('removing monsters releases per-monster clips and nodes while preserving the reusable model', async () => {
    const core = await import('@babylonjs/core/index.js')
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const node = new core.Mesh('reusableMonster', scene)
    const skeleton = new core.Skeleton('reusableSkeleton', 'reusableSkeleton', scene)
    const source = new core.AnimationGroup('reusableSource', scene)
    const animation = new core.Animation('position', 'position.x', 30, core.Animation.ANIMATIONTYPE_FLOAT)
    animation.setKeys([{frame: 0, value: 0}, {frame: 600, value: 1}])
    source.addTargetedAnimation(animation, node)
    const {MonsterModel} = loadModule('babylon/monsters/monsterModel.ts', {
        '@babylonjs/core': core,
        '@/babylon/scene/activeMeshFreezer': {ActiveMeshFreezer: {setSkeletonActive() {}}},
        '@/babylon/monsters/monsterLoader': {MonsterLoader: {monsterTemplates: new Map([[1, {
            deactivateClone() {node.setEnabled(false)}, freeClone() {node.setEnabled(false)},
        }]])}},
    })
    try {
        for (let i = 0; i < 25; i++) {
            const model = new MonsterModel({}, {insideView: true})
            Object.assign(model, {node, mesh: node, skeleton, animation: source, template: {id: 1}, initialized: true})
            model.nameTextNode.parent = node
            model.lhandNode.parent = node
            const clips = Array.from({length: 6}, (_, index) => ({animation: source.clone(`clip${index}`)}))
            ;[model.idleAnim, model.walkAnim, model.deadAnim, model.attackBowAnim, ...model.attackAnims] = clips
            for (const clip of clips) {clip.animation.start(true); clip.animation.pause()}
            model.removeFromScene()
            assert.equal(scene.animationGroups.length, 1)
            assert.equal(scene._activeAnimatables.length, 0)
            assert.equal(scene.skeletons.length, 1)
            assert.equal(scene.meshes.length, 1)
            assert.equal(scene.transformNodes.length, 0)
            assert.equal(node.isDisposed(), false)
            const unseenModel = new MonsterModel({}, {insideView: false})
            unseenModel.removeFromScene()
            assert.equal(scene.transformNodes.length, 0, 'also release nodes of monsters that never entered view')
        }
    } finally {
        scene.dispose()
        engine.dispose()
    }
})

test('a human model removed while loading disposes the late result without activating it', async () => {
    const core = await import('@babylonjs/core/index.js')
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const {CharacterModel} = loadModule('babylon/character/characterModel.ts', {'@babylonjs/core': core})
    try {
        const entries = new core.InstantiatedEntries()
        entries.rootNodes.push(new core.Mesh('lateHuman', scene))
        entries.skeletons.push(new core.Skeleton('lateSkeleton', 'lateSkeleton', scene))
        entries.animationGroups.push(new core.AnimationGroup('lateAnimation', scene))
        let resolveLoad
        CharacterModel.instantiate = () => new Promise(resolve => { resolveLoad = resolve })
        const model = new CharacterModel({id: 1, pos: core.Vector3.Zero()})
        const loading = model.initAsync()
        model.removeFromScene()
        resolveLoad(entries)
        await loading
        assert.equal(model.initialized, false)
        assert.equal(scene.animationGroups.length, 0)
        assert.equal(scene.skeletons.length, 0)
        assert.equal(scene.meshes.length, 0)
        assert.equal(scene.transformNodes.length, 0)
    } finally {
        scene.dispose()
        engine.dispose()
    }
})
