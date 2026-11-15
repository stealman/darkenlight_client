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

test('heads share one GLB batch, follow separate animated head joints and survive helmet removal', async () => {
    const core = await import('@babylonjs/core/index.js')
    await import('@babylonjs/loaders/glTF/index.js')
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const dependencies = {
        '@babylonjs/core': core,
        '@/settings/settings': {Settings: {isDetailLevelMedium: () => false}},
        '@/babylon/scene/lights': {Lights: {registerDynamicLightMesh() {}, addShadowCaster() {}}},
    }
    const equipment = load('babylon/item/equipManager.ts', dependencies)
    const {EquipItem, EquipManager} = equipment
    let loads = 0
    const {loadCharacterHead, characterHeadMatrix} = load('babylon/character/characterHead.ts', {
        ...dependencies,
        '@babylonjs/core': {...core, SceneLoader: {LoadAssetContainerAsync: async (_root, url) => {
            loads++
            assert.equal(url, '/models/human/human_male_head_1.glb')
            const bytes = readFileSync(join(__dirname, '../public' + url))
            return core.SceneLoader.LoadAssetContainerAsync('', `data:;base64,${bytes.toString('base64')}`, scene, undefined, '.glb')
        }}},
        '@/babylon/item/equipManager': equipment,
        '@/babylon/item/codebook/equipCbItem': load('babylon/item/codebook/equipCbItem.ts', dependencies),
        '@/babylon/modelAssetUrl': {modelAssetUrl: url => url},
        './characterMaterial': load('babylon/character/characterMaterial.ts', dependencies),
    })
    try {
        const [type, sameType] = await Promise.all([loadCharacterHead(scene, 1), loadCharacterHead(scene, 1)])
        assert.equal(type, sameType)
        assert.equal(await loadCharacterHead(scene, 1), type)
        assert.equal(loads, 1)
        assert.equal(scene.meshes.length, 1, 'imported source rig is disposed')
        assert.ok(type.mesh.getTotalVertices() > 0)
        assert.equal(type.mesh.material.roughness, 1)
        assert.equal(type.mesh.material.albedoTexture.name, '/models/human/human_male_head_1.png')
        const bytes = readFileSync(join(__dirname, '../public/models/human/human_male.glb'))
        const body = await core.SceneLoader.LoadAssetContainerAsync('', `data:;base64,${bytes.toString('base64')}`, scene, undefined, '.glb')
        const {CharacterModel} = load('babylon/character/characterModel.ts', {
            ...dependencies, '@/babylon/item/equipManager': equipment,
        })
        const characters = [0, 1].map(index => {
            const entries = body.instantiateModelsToScene(undefined, false, {doNotInstantiate: true})
            const root = entries.rootNodes[0]
            root.scaling.set(0.3, 0.28, -0.3)
            root.position.set(index * 4, 0, index * 2)
            root.rotation.y = index * 0.8
            const bone = entries.skeletons[0].bones.find(bone => bone.name === 'Head')
            const character = Object.create(CharacterModel.prototype)
            character.equipSet = new Map()
            const head = new EquipItem(type, 0, character, bone, null, null, null)
            head.attachUsingFullBoneTransform(characterHeadMatrix())
            character.equipSet.set('FACE', head)
            EquipManager.addEquippedItem(head)
            return {entries, bone, character, head, root}
        })
        EquipManager.onFrame()
        assert.equal(type.mesh.thinInstanceCount, 2)
        assert.equal(scene.meshes.filter(mesh => mesh.name === 'human-male-head1').length, 1)
        for (const [index, {entries, bone, head, root}] of characters.entries()) {
            const oldPosition = head.position.clone()
            const animation = entries.animationGroups[0]
            animation.start(true)
            animation.pause()
            animation.goToFrame(600 + index * 10)
            root.position.x += 3
            EquipManager.onFrame()
            const expected = characterHeadMatrix().multiply(bone.getTransformNode().computeWorldMatrix(true))
            const actual = core.Matrix.FromArray(type.instanceBuffer, index * 16)
            assert.ok(actual.equalsWithEpsilon(expected, 0.00001))
            assert.ok(!head.position.equalsWithEpsilon(oldPosition), 'animation/movement updates the head')
        }
        characters[0].character.equipSet.set('HEAD', new EquipItem(type, 0, characters[0].character, characters[0].bone, null, null, null))
        characters[0].character.removeEquippedItem('HEAD')
        characters[0].character.clearAllEquippedItems()
        assert.equal(characters[0].character.equipSet.get('FACE'), characters[0].head)
        EquipManager.removeEquippedItem(characters[0].head)
        EquipManager.onFrame()
        assert.equal(type.mesh.thinInstanceCount, 1)
        EquipManager.addEquippedItem(characters[0].head)
        EquipManager.onFrame()
        assert.equal(type.mesh.thinInstanceCount, 2)
        characters.forEach(({head}) => EquipManager.removeEquippedItem(head))
        EquipManager.onFrame()
        assert.equal(type.mesh.isEnabled(), false)
        const finalHead = await loadCharacterHead(scene, 2)
        assert.equal(finalHead, type, 'old ID 2 uses the final head 1 batch')
        assert.equal(finalHead.mesh.name, 'human-male-head1')
        assert.equal(finalHead.mesh.material.albedoTexture.invertY, false)
        assert.equal(finalHead.mesh.material.backFaceCulling, false)
        const {createCharacterMaterial} = load('babylon/character/characterMaterial.ts', dependencies)
        const bodyMaterial = createCharacterMaterial(scene, 'body', '/models/human/human_male.png')
        for (const property of ['metallic', 'roughness', 'directIntensity', 'environmentIntensity',
            'backFaceCulling', 'twoSidedLighting', 'usePhysicalLightFalloff']) {
            assert.equal(finalHead.mesh.material[property], bodyMaterial[property], property)
        }
        assert.equal(finalHead.mesh.material.emissiveTexture, finalHead.mesh.material.albedoTexture)
        assert.equal(bodyMaterial.emissiveTexture, bodyMaterial.albedoTexture)
        assert.ok(finalHead.mesh.material.emissiveColor.equals(new core.Color3(0.15, 0.15, 0.15)))
        assert.ok(finalHead.mesh.material.emissiveColor.equals(bodyMaterial.emissiveColor))
        assert.ok(finalHead.mesh.material.albedoColor.equals(bodyMaterial.albedoColor))
        assert.equal(finalHead.mesh.material.albedoTexture.gammaSpace, bodyMaterial.albedoTexture.gammaSpace)
        assert.equal(await loadCharacterHead(scene), finalHead, 'game default matches the textured preview head')
        assert.equal(await loadCharacterHead(scene, 999), finalHead, 'unknown types use the game default')
        assert.equal(loads, 1)
    } finally {
        scene.dispose()
        engine.dispose()
    }
})

test('players, bots, NPCs and guards use final head ID 1 for default and legacy spawn data', async () => {
    const core = await import('@babylonjs/core/index.js')
    const dependencies = {
        '@babylonjs/core': core,
        '@/babylon/audio/audioManager': {WeaponSoundTypes: {SWORD: 'sword'}, BodySoundTypes: {HARD: 'hard'}},
        '@/data/gameClass': {GameClasses: {FIGHTER: {key: 'FIGHTER'}, getByKey: () => ({key: 'FIGHTER'})}},
        '@/utils/utils': {Utils: {calculateWalkYPos: () => 0}},
        './characterAppearance': load('babylon/character/characterAppearance.ts', {}),
    }
    const Character = load('babylon/character/character.ts', dependencies).default
    const {Npc, Guard} = load('babylon/npc/npc.ts', {...dependencies, '@/babylon/character/character': {default: Character}})
    for (const headTypeId of [undefined, 1, 2, 7]) {
        const data = {id: 1, x: 0, z: 0, equipSet: {}, headTypeId}
        const player = new Character(data)
        const bot = new Character({...data, bot: true})
        const npc = new Npc(data)
        const guard = new Guard({...data, guard: {headTypeId}})
        for (const character of [player, bot, npc, guard]) {
            assert.equal(character.headTypeId, headTypeId === 2 ? 1 : headTypeId ?? 1)
            assert.equal(character.hairTypeId, 1)
            assert.equal(character.hairColor, '#664e0a')
            assert.equal(character.hairLightness, 0.6)
        }
        assert.equal(bot.isBot, true)
    }
    const hair = {hairTypeId: 4, hairColor: '#EFDB80', hairLightness: 1.5}
    const data = {id: 2, x: 0, z: 0, equipSet: {}, ...hair}
    for (const character of [new Character(data), new Npc(data), new Guard({...data, guard: hair})]) {
        assert.equal(character.hairTypeId, 4)
        assert.equal(character.hairColor, '#efdb80')
        assert.equal(character.hairLightness, 1.5)
    }
})
