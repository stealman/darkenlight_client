const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

function load(file, dependencies) {
    const exports = {}
    const compiled = ts.transpileModule(readFileSync(join(__dirname, '../src', file), 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText
    new Function('exports', 'require', compiled)(exports, name => dependencies[name] ?? {})
    return exports
}

test('game models render data-driven shared hair and retain it across equipment and viewport changes', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {PBRCustomMaterial} = await import('@babylonjs/materials/custom/pbrCustomMaterial.js')
    await import('@babylonjs/loaders/glTF/index.js')
    core.DracoCompression.Configuration = {decoder: {
        wasmUrl: 'local', wasmBinaryUrl: 'local',
        wasmBinary: readFileSync(join(__dirname, '../public/models/draco/draco_decoder_gltf.wasm')),
        jsModule: require('../public/models/draco/draco_decoder_gltf.js'),
    }}
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const loads = new Map()
    const readGlb = file => core.SceneLoader.LoadAssetContainerAsync('',
        `data:;base64,${readFileSync(join(__dirname, '../public/models/human', file)).toString('base64')}`, scene, undefined, '.glb')
    const deps = {
        '@babylonjs/materials': {PBRCustomMaterial},
        '@babylonjs/core': {...core, SceneLoader: {LoadAssetContainerAsync: async (_root, url) => {
            loads.set(url, (loads.get(url) ?? 0) + 1)
            return readGlb(url.split('/').pop())
        }}},
        '@/babylon/modelAssetUrl': {modelAssetUrl: url => url},
        '@/settings/settings': {Settings: {isDetailLevelMedium: () => false}},
        '@/data/myPlayer': {MyPlayer: {myChar: null}},
        '@/data/items/item': {EquipItemSlots: {HEAD: 'HEAD'}, EquipSlotModelsCb: {HELM: {modelId: 1100}, CHAIN_COIF: {modelId: 2100}}},
        '@/babylon/character/characterModelEquipModifiers': {getCharacterModelEquipModifier: () => null},
        '@/babylon/scene/activeMeshFreezer': {ActiveMeshFreezer: {setSkeletonActive() {}}},
        '@/babylon/scene/lights': {Lights: {
            registerDynamicLightMesh() {}, addShadowCaster() {}, registerActorLightMesh() {},
            unregisterActorLightMesh() {}, removeShadowCaster() {}, supportsParallelShaderCompilation: () => false,
        }},
    }
    const equipment = load('babylon/item/equipManager.ts', deps)
    deps['@/babylon/item/equipManager'] = equipment
    deps['@/babylon/item/codebook/equipCbItem'] = load('babylon/item/codebook/equipCbItem.ts', deps)
    const material = load('babylon/character/characterMaterial.ts', deps)
    deps['@/babylon/character/characterMaterial'] = material
    const head = load('babylon/character/characterHead.ts', {...deps, './characterMaterial': material})
    deps['@/babylon/character/characterHead'] = head
    const hairMaterial = load('babylon/character/characterHairMaterial.ts', {...deps, '@babylonjs/materials': {PBRCustomMaterial}})
    const hair = load('babylon/character/characterHair.ts', {...deps, './characterHairMaterial': hairMaterial})
    const config = JSON.parse(readFileSync(join(__dirname, '../public/admin-utils/equipment-modifiers.json'), 'utf8'))
    const fitting = id => {
        const value = config.hair[id]
        return Object.fromEntries(['position', 'rotation', 'scale'].map(key => [key, new core.Vector3(value[key].x, value[key].y, value[key].z)]))
    }
    const equipmentFitting = load('babylon/character/characterEquipmentFitting.ts', deps)
    const originalFetch = global.fetch
    try {
        global.fetch = async () => ({ok: true, json: async () => ({equipment: {}, pauldrons: {}, hair: config.hair})})
        await equipmentFitting.preloadCharacterEquipmentFitting(scene)
    } finally {
        global.fetch = originalFetch
    }
    const {CharacterModel} = load('babylon/character/characterModel.ts', {...deps,
        './characterMaterial': material, './characterHead': head, './characterHair': hair,
        './humanModelRig': load('babylon/character/humanModelRig.ts', deps),
        './characterEquipmentFitting': equipmentFitting,
    })
    const models = []
    try {
        const body = await readGlb('human_male.glb')
        for (let index = 0; index < 2; index++) {
            const owner = {id: index + 1, pos: new core.Vector3(index * 3, 0, 0), logicYpos: 0, insideView: true,
                headTypeId: 1, hairTypeId: 1, hairColorId: index ? 12 : 1,
                equipSet: new Map(), getModelHeight: () => 2, isMyChar: () => index === 0}
            models.push(await CharacterModel.create(owner, true, body.instantiateModelsToScene(undefined, false, {doNotInstantiate: true})))
        }
        const type = models[0].equipSet.get('HAIR').type
        assert.equal(models[1].equipSet.get('HAIR').type, type)
        const bodyMaterial = model => model.model.getChildMeshes().find(mesh => mesh.skeleton).material
        assert.equal(bodyMaterial(models[0]), bodyMaterial(models[1]), 'Bodies in one scene share the prepared material')
        assert.equal(loads.get('/models/human/human_male_hair_1.glb'), 1)
        const dormantType = await hair.loadCharacterHair(scene, 4)
        const material = dormantType.mesh.material
        const originalCompile = material.forceCompilationAsync
        const warmupLayouts = []
        material.forceCompilationAsync = async (mesh, options) => {
            warmupLayouts.push([options.useInstances, mesh.hasThinInstances])
        }
        try {
            await equipment.EquipManager.warmUpShaders([dormantType])
        } finally {
            material.forceCompilationAsync = originalCompile
        }
        assert.deepEqual(warmupLayouts, [[true, true]])
        assert.equal(dormantType.mesh.thinInstanceCount, 0)
        assert.equal(dormantType.mesh.isEnabled(), false)
        equipment.EquipManager.onFrame()
        assert.equal(type.mesh.thinInstanceCount, 2)
        assert.deepEqual(Array.from(type.uvBuffer.slice(0, 4)), [0, 0, 0.75, 0.5])
        assert.ok(models[0].equipSet.get('HAIR').attachmentWorldMatrix.equalsWithEpsilon(
            head.characterHeadMatrix(fitting(1)).multiply(models[0].equipSet.get('FACE').bone.getTransformNode().computeWorldMatrix(true)), 1e-5))
        models[0].clearAllEquippedItems()
        assert.ok(models[0].equipSet.has('HAIR'))
        models[0].parent.insideView = false
        models[0].removeFromView()
        equipment.EquipManager.onFrame()
        assert.equal(type.mesh.thinInstanceCount, 1)
        models[1].parent.hairColorId = 2
        const originalItem = models[1].equipSet.get('HAIR')
        await models[1].refreshHairAppearance()
        equipment.EquipManager.onFrame()
        assert.equal(models[1].equipSet.get('HAIR'), originalItem, 'color updates keep the same instance')
        assert.deepEqual(Array.from(type.uvBuffer.slice(0, 2)), [0.25, 0])
        models[1].parent.hairTypeId = 2
        await models[1].refreshHairAppearance()
        equipment.EquipManager.onFrame()
        assert.equal(type.mesh.isEnabled(), false)
        assert.notEqual(models[1].equipSet.get('HAIR').type, type)
        assert.equal(models[1].equipSet.get('HAIR').type.mesh.material, type.mesh.material)
        models[0].parent.hairTypeId = 3
        await models[0].refreshHairAppearance()
        equipment.EquipManager.onFrame()
        assert.equal(models[0].equipSet.get('HAIR').type.mesh.isEnabled(), false, 'hidden characters stay hidden after style updates')
        models[0].parent.insideView = true
        await models[0].addToView()
        equipment.EquipManager.onFrame()
        assert.equal(models[0].equipSet.get('HAIR').type.mesh.thinInstanceCount, 1)
        const createWithHeadgear = async (modelId, hairTypeId) => {
            const owner = {...models[1].parent, id: models.length + 1, hairTypeId,
                equipSet: new Map([['HEAD', {modelId, materialId: 1}]])}
            const model = await CharacterModel.create(owner, true, body.instantiateModelsToScene(undefined, false, {doNotInstantiate: true}))
            models.push(model)
            return model
        }
        const initialCoif = await createWithHeadgear(2100, 2)
        assert.equal(initialCoif.equipSet.has('HEAD'), false)
        assert.equal(initialCoif.equipSet.get('HAIR').type.mesh.name, 'character-hair-2')
        assert.ok(initialCoif.parent.equipSet.has('HEAD'), 'hidden helmets remain equipped in character data')
        const initialPlate = await createWithHeadgear(1100, 4)
        assert.equal(initialPlate.equipSet.has('HEAD'), false)
        assert.equal(initialPlate.equipSet.get('HAIR').type.mesh.name, 'character-hair-4')
        for (const hairTypeId of [1, 2, 3, 4]) {
            const model = models[1]
            model.parent.hairTypeId = hairTypeId
            await model.refreshHairAppearance()
            for (const modelId of [1100, 2100]) {
                model.parent.equipSet.set('HEAD', {modelId, materialId: 1})
                model.clearAllEquippedItems()
                model.assignEquippedItems()
                model.assignHelmet(modelId, 0)
                await model.refreshHairAppearance()
                assert.equal(model.equipSet.has('HEAD'), false)
                const uncovered = model.equipSet.get('HAIR')
                assert.equal(uncovered.type.mesh.name, `character-hair-${hairTypeId}`)
                assert.deepEqual(uncovered.matVector.asArray(), [0.25, 0])
            }
            model.parent.equipSet.delete('HEAD')
            model.removeEquippedItem('HEAD')
            await model.refreshHairAppearance()
            assert.equal(model.equipSet.get('HAIR').type.mesh.name, `character-hair-${hairTypeId}`)
        }
        assert.equal([...loads.keys()].some(url => url.includes('_helmet.glb')), false, 'game characters never need covered hair meshes')
        models.forEach(model => model.removeFromScene())
        equipment.EquipManager.onFrame()
        for (const [type] of equipment.EquipManager.equippedItems) assert.equal(type.mesh.isEnabled(), false)
    } finally {
        scene.dispose()
        engine.dispose()
    }
})
