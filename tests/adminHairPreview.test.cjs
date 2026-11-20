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

test('male and female equipment tuning remains independent through switches, saves and reloads', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {loadEquipmentModifierConfig, getPreviewPairedModifiers} = load('adminUtils/equipmentModifierConfig.ts', {'@babylonjs/core': core})
    const maleUrl = '/admin-utils/equipment-modifiers.json'
    const femaleUrl = '/admin-utils/equipment-modifiers-female.json'
    const files = Object.fromEntries([maleUrl, femaleUrl].map(url => [url,
        JSON.parse(readFileSync(join(__dirname, '../public' + url), 'utf8'))]))
    const originalMale = structuredClone(files[maleUrl])
    const originalFetch = global.fetch
    global.fetch = async (url, options) => {
        assert.ok(files[url], url)
        if (options?.method === 'PUT') files[url] = JSON.parse(options.body)
        return {ok: true, json: async () => structuredClone(files[url])}
    }
    try {
        const equipment = new Map(), pauldrons = new Map()
        const male = await loadEquipmentModifierConfig(equipment, pauldrons)
        const female = await loadEquipmentModifierConfig(equipment, pauldrons, 'female')
        equipment.get(1000).position.x = 12
        female.record(1000)
        getPreviewPairedModifiers('legs', 1300).left.position.z = 7
        female.record(1300, 'legs')
        male.activate()
        assert.equal(equipment.get(1000).position.x, originalMale.equipment[1000].position.x)
        assert.notEqual(getPreviewPairedModifiers('legs', 1300).left.position.z, 7)
        female.activate()
        assert.equal(equipment.get(1000).position.x, 12)
        assert.equal(getPreviewPairedModifiers('legs', 1300).left.position.z, 7)
        await female.save()
        assert.deepEqual(files[maleUrl], originalMale)
        await loadEquipmentModifierConfig(equipment, pauldrons, 'female')
        assert.equal(equipment.get(1000).position.x, 12)
        assert.equal(getPreviewPairedModifiers('legs', 1300).left.position.z, 7)
    } finally {
        global.fetch = originalFetch
    }
})

test('hair fittings save independently per type and survive reload without changing armor tuning', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {loadEquipmentModifierConfig} = load('adminUtils/equipmentModifierConfig.ts', {'@babylonjs/core': core})
    const original = JSON.parse(readFileSync(join(__dirname, '../public/admin-utils/equipment-modifiers.json'), 'utf8'))
    let saved = structuredClone(original)
    const originalFetch = global.fetch
    global.fetch = async (_url, options) => {
        if (options?.method === 'PUT') saved = JSON.parse(options.body)
        return {ok: true, json: async () => structuredClone(saved)}
    }
    try {
        const config = await loadEquipmentModifierConfig(new Map(), new Map())
        const first = config.getHair(1)
        first.position.x += 0.25
        const second = {position: new core.Vector3(3, 4, 5), rotation: core.Vector3.Zero(), scale: core.Vector3.One()}
        config.recordHair(1, first)
        config.recordHair(2, second)
        config.recordHairColorId(6)
        await config.save()
        const loaded = await loadEquipmentModifierConfig(new Map(), new Map())
        assert.ok(loaded.getHair(1).position.equals(first.position))
        assert.ok(loaded.getHair(2).position.equals(second.position))
        assert.equal(loaded.getHairColorId(), 6)
        const copy = loaded.getHair(1)
        copy.position.x = 999
        assert.notEqual(loaded.getHair(1).position.x, 999, 'reading a fitting cannot mutate unsaved config')
        for (const key of ['equipment', 'pauldrons', 'legs', 'weaponAttachment']) assert.deepEqual(saved[key], original[key])
    } finally {
        global.fetch = originalFetch
    }
})

test('hair preview loads the real textured mesh once and follows the animated head with editable offsets', async () => {
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
    const deps = {
        '@babylonjs/core': core,
        '@/settings/settings': {Settings: {isDetailLevelMedium: () => false}},
        '@/babylon/scene/lights': {Lights: {registerDynamicLightMesh() {}, addShadowCaster() {}}},
    }
    const equipment = load('babylon/item/equipManager.ts', deps)
    const {EquipItem, EquipManager} = equipment
    const headModule = load('babylon/character/characterHead.ts', deps)
    let loads = 0
    const readGlb = name => core.SceneLoader.LoadAssetContainerAsync('',
        `data:;base64,${readFileSync(join(__dirname, '../public/models/human', name)).toString('base64')}`, scene, undefined, '.glb')
    const hairMaterial = load('babylon/character/characterHairMaterial.ts', {
        '@babylonjs/materials': {PBRCustomMaterial},
        '@/babylon/character/characterMaterial': load('babylon/character/characterMaterial.ts', deps),
    })
    const {CHARACTER_HAIR_TYPES: PREVIEW_HAIR_TYPES, loadCharacterHair: loadPreviewHair, attachCharacterHair: attachPreviewHair,
        setCharacterHairColorId: setPreviewHairColorId,
        hideCharacterHair: hidePreviewHair} = load('babylon/character/characterHair.ts', {
        ...deps,
        '@babylonjs/core': {...core, SceneLoader: {LoadAssetContainerAsync: async (_root, url) => {
            loads++
            assert.match(url, /^\/models\/human\/human_male_hair_\d+\.glb$/)
            return readGlb(url.split('/').pop())
        }}},
        '@/babylon/item/equipManager': equipment,
        '@/babylon/item/codebook/equipCbItem': load('babylon/item/codebook/equipCbItem.ts', deps),
        './characterHairMaterial': hairMaterial,
        '@/babylon/character/characterHead': headModule,
        '@/babylon/modelAssetUrl': {modelAssetUrl: url => url},
    })
    try {
        const [type, same] = await Promise.all([loadPreviewHair(scene, 1), loadPreviewHair(scene, 1)])
        assert.equal(type, same)
        assert.equal(loads, 1)
        assert.equal(scene.meshes.length, 1, 'source GLB nodes are disposed')
        assert.ok(type.mesh.getVerticesData('uv').length > 0)
        assert.equal(type.mesh.material.albedoTexture.name, '/models/human/human_male_hair_1_atlas.png')
        assert.equal(type.mesh.material.backFaceCulling, false)
        assert.ok(type.mesh.material.emissiveColor.equals(new core.Color3(0.15, 0.15, 0.15)))
        const body = await readGlb('human_male.glb')
        const entries = body.instantiateModelsToScene(undefined, false, {doNotInstantiate: true})
        entries.rootNodes[0].scaling.set(0.3, 0.28, -0.3)
        const bone = entries.skeletons[0].bones.find(bone => bone.name === 'Head')
        const owner = {}
        const face = new EquipItem(type, 0, owner, bone, null, null, null)
        const model = {equipSet: new Map([['FACE', face]])}
        const fitting = {position: new core.Vector3(0.03, -0.01, 0.2), rotation: core.Vector3.Zero(), scale: new core.Vector3(1.34, 1.3, 1.3)}
        const hair = attachPreviewHair(model, type, fitting)
        const animation = entries.animationGroups[0]
        animation.start(true)
        animation.pause()
        for (const frame of [0, 600, 2025]) {
            animation.goToFrame(frame)
            EquipManager.onFrame()
            const expected = headModule.characterHeadMatrix(fitting).multiply(bone.getTransformNode().computeWorldMatrix(true))
            assert.ok(core.Matrix.FromArray(type.instanceBuffer).equalsWithEpsilon(expected, 0.00001))
        }
        fitting.position.x += 1
        const replacement = attachPreviewHair(model, type, fitting)
        EquipManager.onFrame()
        assert.notEqual(replacement, hair)
        assert.equal(type.mesh.thinInstanceCount, 1, 'changing the preview replaces the previous instance')
        assert.equal(model.equipSet.get('FACE'), face)
        assert.equal(model.equipSet.get('HAIR'), replacement)
        const material = type.mesh.material
        const other = new EquipItem(type, 0, owner, bone, null, null, null)
        other.attachUsingFullBoneTransform(headModule.characterHeadMatrix(fitting))
        setPreviewHairColorId(replacement, 6)
        setPreviewHairColorId(other, 16)
        EquipManager.addEquippedItem(other)
        EquipManager.onFrame()
        assert.equal(type.mesh.thinInstanceCount, 2)
        assert.deepEqual(Array.from(type.uvBuffer.slice(0, 4)), [0.25, 0.25, 0.75, 0.75])
        assert.equal(type.mesh.material, material, 'different colors share the same material')
        await material.forceCompilationAsync(type.mesh, {useInstances: true})
        const originalBuffer = type.uvBuffer
        setPreviewHairColorId(replacement, 2)
        EquipManager.onFrame()
        assert.equal(type.uvBuffer, originalBuffer, 'changing only color retains GPU buffer capacity')
        assert.deepEqual(Array.from(type.uvBuffer.slice(0, 4)), [0.25, 0, 0.75, 0.75])
        const extras = Array.from({length: 10}, () => {
            const item = new EquipItem(type, 0, owner, bone, null, null, null)
            item.attachUsingFullBoneTransform(headModule.characterHeadMatrix(fitting))
            EquipManager.addEquippedItem(item)
            return item
        })
        EquipManager.onFrame()
        assert.equal(type.mesh.thinInstanceCount, 12)
        assert.ok(type.uvBuffer.length >= 12 * 2)
        assert.deepEqual(Array.from(type.uvBuffer.slice(0, 6)), [0.25, 0, 0.75, 0.75, 0, 0])
        extras.forEach(item => EquipManager.removeEquippedItem(item))
        EquipManager.removeEquippedItem(replacement)
        EquipManager.onFrame()
        assert.equal(type.mesh.thinInstanceCount, 1)
        assert.deepEqual(Array.from(type.uvBuffer.slice(0, 2)), [0.75, 0.75], 'atlas offsets follow instance compaction')
        EquipManager.removeEquippedItem(other)
        EquipManager.onFrame()
        assert.equal(type.mesh.isEnabled(), false)
        const secondType = await loadPreviewHair(scene, 2)
        assert.notEqual(secondType, type)
        assert.ok(secondType.mesh.getTotalVertices() > 0)
        assert.equal(secondType.mesh.material.albedoTexture.name, type.mesh.material.albedoTexture.name)
        attachPreviewHair(model, secondType, fitting, 12)
        EquipManager.onFrame()
        assert.equal(secondType.mesh.thinInstanceCount, 1)
        assert.equal(type.mesh.isEnabled(), false)
        const firstAgain = await loadPreviewHair(scene, 1)
        assert.equal(firstAgain, type)
        const finalHair = attachPreviewHair(model, firstAgain, fitting)
        EquipManager.onFrame()
        assert.equal(type.mesh.thinInstanceCount, 1)
        assert.equal(secondType.mesh.isEnabled(), false)
        assert.equal(loads, 2, 'switching hair types reuses both cached GLB sources')
        for (const definition of PREVIEW_HAIR_TYPES.slice(2)) {
            const nextType = await loadPreviewHair(scene, definition.id)
            assert.notEqual(nextType, firstAgain)
            assert.notEqual(nextType, secondType)
            assert.ok(nextType.mesh.getTotalVertices() > 0)
            assert.equal(nextType.mesh.material.albedoTexture.name, type.mesh.material.albedoTexture.name)
            const nextHair = attachPreviewHair(model, nextType, fitting, 12)
            EquipManager.onFrame()
            assert.equal(nextType.mesh.thinInstanceCount, 1)
            assert.equal(type.mesh.isEnabled(), false)
            assert.equal(secondType.mesh.isEnabled(), false)
            assert.equal(await loadPreviewHair(scene, definition.id), nextType)
            EquipManager.removeEquippedItem(nextHair)
        }
        assert.equal(loads, PREVIEW_HAIR_TYPES.length)
        const restoredHair = attachPreviewHair(model, type, fitting, 1)
        EquipManager.onFrame()
        assert.equal(type.mesh.thinInstanceCount, 1)
        hidePreviewHair(model)
        hidePreviewHair(model)
        EquipManager.onFrame()
        assert.equal(type.mesh.isEnabled(), false, 'hiding hair removes its thin instance')
        assert.equal(model.equipSet.has('HAIR'), false, 'changing asset tabs cannot re-enable hidden hair')
        assert.equal(model.equipSet.get('FACE'), face)
        const uncoveredHair = attachPreviewHair(model, await loadPreviewHair(scene, 1), fitting, 1)
        EquipManager.onFrame()
        assert.equal(type.mesh.thinInstanceCount, 1)
        assert.ok(uncoveredHair.attachmentWorldMatrix.equalsWithEpsilon(restoredHair.attachmentWorldMatrix, 1e-5))
        assert.equal(loads, PREVIEW_HAIR_TYPES.length)
        EquipManager.removeEquippedItem(uncoveredHair)
        EquipManager.removeEquippedItem(finalHair)
    } finally {
        scene.dispose()
        engine.dispose()
    }
})
