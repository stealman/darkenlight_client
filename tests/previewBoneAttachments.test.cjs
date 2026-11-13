const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

test('neutral preview equipment follows authored bones with no additional rotation, mirror or offset', async () => {
    const core = await import('@babylonjs/core/index.js')
    await import('@babylonjs/loaders/glTF/index.js')
    const load = file => {
        const exports = {}
        const compiled = ts.transpileModule(readFileSync(join(__dirname, '../' + file), 'utf8'), {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
        }).outputText
        new Function('exports', 'require', compiled)(exports, name => name === '@babylonjs/core' ? core : {})
        return exports
    }
    const {bindPreviewEquipment, bindPreviewWeapon, loadEquipmentModifierConfig} = load('src/adminUtils/equipmentModifierConfig.ts')
    const {EquipItem, EquipManager} = load('src/babylon/item/equipManager.ts')
    const {Matrix, Quaternion, Vector3} = core
    const config = JSON.parse(readFileSync(join(__dirname, '../public/admin-utils/equipment-modifiers.json'), 'utf8'))
    const {weaponAttachment, ...armorConfig} = config
    assert.deepEqual(armorConfig, {equipment: {}, pauldrons: {}})
    const nonNeutral = () => ({position: Vector3.One(), rotation: Vector3.One(), scale: Vector3.One().scale(2)})
    const equipment = new Map([[2300, nonNeutral()]])
    const pauldrons = new Map([[2200, {left: nonNeutral(), right: nonNeutral()}]])
    const originalFetch = global.fetch
    try {
        global.fetch = async () => ({ok: true, json: async () => config})
        await loadEquipmentModifierConfig(equipment, pauldrons)
    } finally {
        global.fetch = originalFetch
    }
    for (const value of [equipment.get(2300), pauldrons.get(2200).left, pauldrons.get(2200).right]) {
        assert(value.position.equals(Vector3.Zero()))
        assert(value.rotation.equals(Vector3.Zero()))
        assert(value.scale.equals(Vector3.One()))
    }
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    try {
        const bytes = readFileSync(join(__dirname, '../public/models/steve/human_male_new.glb'))
        const container = await core.SceneLoader.LoadAssetContainerAsync('', `data:;base64,${bytes.toString('base64')}`, scene, undefined, '.glb')
        const entries = container.instantiateModelsToScene(undefined, false, {doNotInstantiate: true})
        const root = entries.rootNodes[0]
        root.scaling.multiplyInPlace(new Vector3(0.3, 0.28, 0.3))
        const skeleton = entries.skeletons[0]
        const mesh = root.getChildMeshes().find(mesh => mesh.skeleton === skeleton)
        const parent = {worldMatrix: Matrix.Identity(), rotationQuaternion: Quaternion.Identity()}
        const type = {
            count: 8, cbData: {matCols: 1, matRows: 1, resolveMaterialAtlasIndex: () => 0},
            mesh: {thinInstanceBufferUpdated() {}}, instanceBuffer: new Float32Array(8 * 16),
            uvBufferDirty: false, ensureThinBuffers() {},
        }
        const names = ['Body', 'Head', 'LA', 'RA', 'LH', 'RH', 'LL', 'RL']
        const items = names.map(name => {
            const item = new EquipItem(type, 0, parent, skeleton.bones.find(bone => bone.name === name),
                new Vector3(1, 1, -1), new Vector3(0, Math.PI / 2, 0), Vector3.One(), equipment.get(2300))
            bindPreviewEquipment(item, parent)
            return item
        })
        EquipManager.equippedItems.set(type, new Set(items))
        const animation = entries.animationGroups[0]
        animation.start(true)
        animation.pause()
        for (const frame of [0, 30, 75, 100, 150, 200, 250, 275, 350, 425, 450, 480, 525]) {
            animation.goToFrame(frame)
            scene.incrementRenderId()
            root.computeWorldMatrix(true)
            mesh.computeWorldMatrix(true)
            skeleton.prepare()
            parent.worldMatrix.copyFrom(root.getWorldMatrix())
            items.forEach(item => item.onFrame())
            EquipManager.onFrame()
            items.forEach((item, i) => {
                const expected = item.bone.getFinalMatrix().multiply(parent.worldMatrix)
                const actual = Matrix.FromArray(type.instanceBuffer, i * 16)
                assert(Math.max(...actual.asArray().map((v, k) => Math.abs(v - expected.asArray()[k]))) < 0.00001,
                    `${names[i]}: direct bone transform at frame ${frame}`)
            })
        }
        // Weapon restoration must preserve the previous world size/orientation,
        // while the armor assertions above continue to use raw bone transforms.
        animation.goToFrame(0)
        scene.incrementRenderId()
        mesh.computeWorldMatrix(true)
        skeleton.prepare()
        parent.worldMatrix.copyFrom(root.getWorldMatrix())
        parent.worldMatrix.decompose(undefined, parent.rotationQuaternion)
        const hand = skeleton.bones.find(bone => bone.name === 'RH')
        const weaponType = {...type, count: 1, instanceBuffer: new Float32Array(16)}
        const weapon = new EquipItem(weaponType, 0, parent, hand, null, null, null)
        weapon.onFrame()
        const before = Matrix.Compose(Vector3.One(), weapon.quaternion, weapon.position)
        bindPreviewWeapon(weapon, parent)
        EquipManager.equippedItems.clear()
        EquipManager.equippedItems.set(weaponType, new Set([weapon]))
        const near = (a, b, label) => assert(Math.max(...a.asArray().map((v, i) => Math.abs(v - b.asArray()[i]))) < 0.00001, label)
        const local = before.multiply(hand.getFinalMatrix().multiply(parent.worldMatrix).invert())
        for (const frame of [0, 100, 150, 200, 250, 350, 480]) {
            animation.goToFrame(frame)
            scene.incrementRenderId()
            mesh.computeWorldMatrix(true)
            skeleton.prepare()
            weapon.onFrame()
            EquipManager.onFrame()
            const actual = Matrix.FromArray(weaponType.instanceBuffer)
            if (frame === 0) near(actual, before, 'Weapon world size/orientation restored')
            near(actual.multiply(hand.getFinalMatrix().multiply(parent.worldMatrix).invert()), local,
                `Restored weapon stays attached to RH, frame ${frame}`)
        }
        assert(weaponAttachment, 'Weapon correction retained separately from armor')
        entries.dispose()
        container.dispose()
    } finally {
        engine.dispose()
    }
})
