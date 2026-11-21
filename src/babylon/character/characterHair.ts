import { Mesh, Scene, SceneLoader, Vector3, VertexData } from '@babylonjs/core'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { EquipItem, EquipItemType, EquipManager } from '@/babylon/item/equipManager'
import { getCharacterHairMaterial } from './characterHairMaterial'
import { characterHeadMatrix } from '@/babylon/character/characterHead'
import type { CharacterModel } from '@/babylon/character/characterModel'
import type { EquipModelModifier } from '@/babylon/item/equipManager'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'
import { Lights } from '@/babylon/scene/lights'
import { EquipSlotModelsCb } from '@/data/items/item'

export function isHairHiddenByHeadgear(headModelId: number | undefined, gender: 'M' | 'F'): boolean {
    return headModelId === EquipSlotModelsCb.HELM.modelId
        || headModelId === EquipSlotModelsCb.LEATHER_HELMET.modelId
        || (gender === 'M' && headModelId === EquipSlotModelsCb.CHAIN_COIF.modelId)
}

export function hideCharacterHair(model: CharacterModel) {
    const item = model.equipSet.get('HAIR')
    if (!item) return
    EquipManager.removeEquippedItem(item)
    model.equipSet.delete('HAIR')
}

export const CHARACTER_HAIR_TYPES: Array<{id: number, file: string, albedoFile: string}> = [
    { id: 1, file: 'human_male_hair_1.glb', albedoFile: 'human_male_hair_1.png' },
    { id: 2, file: 'human_male_hair_2.glb', albedoFile: 'human_male_hair_1.png' },
    { id: 3, file: 'human_male_hair_3.glb', albedoFile: 'human_male_hair_1.png' },
    { id: 4, file: 'human_male_hair_4.glb', albedoFile: 'human_male_hair_1.png' },
]

const sources = new WeakMap<Scene, Map<string, Promise<EquipItemType>>>()

export const FEMALE_CHARACTER_HAIR_TYPES: typeof CHARACTER_HAIR_TYPES = [
    { id: 1, file: 'human_female_hair_1.glb', albedoFile: 'human_female_hair_1.png' },
    { id: 2, file: 'human_female_hair_2.glb', albedoFile: 'human_female_hair_1.png' },
    { id: 3, file: 'human_female_hair_3.glb', albedoFile: 'human_female_hair_1.png' },
    { id: 4, file: 'human_female_hair_4.glb', albedoFile: 'human_female_hair_1.png' },
]

export function loadCharacterHair(scene: Scene, typeId = 1, gender: 'M' | 'F' = 'M'): Promise<EquipItemType> {
    const definitions = gender === 'F' ? FEMALE_CHARACTER_HAIR_TYPES : CHARACTER_HAIR_TYPES
    const definition = definitions.find(type => type.id === typeId) ?? definitions[0]
    const file = definition.file
    let types = sources.get(scene)
    if (!types) {
        types = new Map()
        sources.set(scene, types)
    }
    let source = types.get(file)
    if (!source) {
        source = createSource(scene, definition, gender).catch(error => {
            types.delete(file)
            throw error
        })
        types.set(file, source)
    }
    return source
}

async function createSource(scene: Scene, definition: typeof CHARACTER_HAIR_TYPES[number], gender: 'M' | 'F') {
    const container = await SceneLoader.LoadAssetContainerAsync('', modelAssetUrl('/models/human/' + definition.file), scene)
    try {
        const meshes = container.meshes.filter(mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0 && !mesh.skeleton)
        if (meshes.length !== 1) throw new Error(`Expected one rigid mesh in ${definition.file}`)
        const prefix = gender === 'F' ? 'character-female-hair' : 'character-hair'
        const mesh = new Mesh(`${prefix}-${definition.id}`, scene)
        VertexData.ExtractFromMesh(meshes[0] as Mesh, true, true).applyToMesh(mesh)
        mesh.material = getCharacterHairMaterial(scene,
            '/models/human/' + definition.albedoFile.replace('.png', '_atlas.png'))
        mesh.receiveShadows = true
        mesh.alwaysSelectAsActiveMesh = true
        mesh.setEnabled(false)
        const type = new EquipItemType(new EquipCbItem(-10000 - definition.id - (gender === 'F' ? 100 : 0), mesh.name, Vector3.Zero(), Vector3.One(), null, null))
        type.mesh = mesh
        Lights.registerDynamicLightMesh(mesh)
        return type
    } finally {
        container.dispose()
    }
}

export function setCharacterHairColorId(item: EquipItem, hairColorId: number) {
    const tile = hairColorId - 1
    item.matVector.set((tile % 4) / 4, Math.floor(tile / 4) / 4)
    item.type.uvBufferDirty = true
}

export function attachCharacterHair(model: CharacterModel, type: EquipItemType, fitting: EquipModelModifier, hairColorId = 1): EquipItem {
    const previous = model.equipSet.get('HAIR')
    if (previous) EquipManager.removeEquippedItem(previous)
    const head = model.equipSet.get('FACE')!
    const item = new EquipItem(type, 0, head.parent, head.bone, null, null, null)
    item.attachUsingFullBoneTransform(characterHeadMatrix(fitting))
    setCharacterHairColorId(item, hairColorId)
    model.equipSet.set('HAIR', item)
    EquipManager.addEquippedItem(item)
    return item
}
