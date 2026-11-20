import { Color3, Mesh, Scene, SceneLoader, Vector3, VertexData } from '@babylonjs/core'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { EquipItem, EquipItemType, EquipManager } from '@/babylon/item/equipManager'
import { createCharacterHairMaterial } from './characterHairMaterial'
import { characterHeadMatrix } from '@/babylon/character/characterHead'
import type { CharacterModel } from '@/babylon/character/characterModel'
import type { EquipModelModifier } from '@/babylon/item/equipManager'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'
import { Lights } from '@/babylon/scene/lights'
import { EquipSlotModelsCb } from '@/data/items/item'

export function getCharacterHairMode(headModelId?: number): 'normal' | 'helmet' | 'hidden' {
    if (headModelId == null) return 'normal'
    if (headModelId === EquipSlotModelsCb.CHAIN_COIF.modelId) return 'hidden'
    return headModelId === EquipSlotModelsCb.HELM.modelId ? 'helmet' : 'normal'
}

export function hideCharacterHair(model: CharacterModel) {
    const item = model.equipSet.get('HAIR')
    if (!item) return
    EquipManager.removeEquippedItem(item)
    model.equipSet.delete('HAIR')
}

export const CHARACTER_HAIR_TYPES: Array<{id: number, file: string, albedoFile: string, helmetFile?: string}> = [
    { id: 1, file: 'human_male_hair_1.glb', albedoFile: 'human_male_hair_1.png', helmetFile: 'human_male_hair_1_helmet.glb' },
    { id: 2, file: 'human_male_hair_2.glb', albedoFile: 'human_male_hair_1.png', helmetFile: 'human_male_hair_2_helmet.glb' },
    { id: 3, file: 'human_male_hair_3.glb', albedoFile: 'human_male_hair_1.png', helmetFile: 'human_male_hair_3_helmet.glb' },
    { id: 4, file: 'human_male_hair_4.glb', albedoFile: 'human_male_hair_1.png', helmetFile: 'human_male_hair_4_helmet.glb' },
]

const sources = new WeakMap<Scene, Map<string, Promise<EquipItemType>>>()

export const FEMALE_CHARACTER_HAIR_TYPES: typeof CHARACTER_HAIR_TYPES = [
    { id: 1, file: 'human_female_hair_1.glb', albedoFile: 'human_female_hair_1.png' },
    { id: 2, file: 'human_female_hair_2.glb', albedoFile: 'human_female_hair_1.png' },
    { id: 3, file: 'human_female_hair_3.glb', albedoFile: 'human_female_hair_1.png' },
    { id: 4, file: 'human_female_hair_4.glb', albedoFile: 'human_female_hair_1.png' },
]

export function loadCharacterHair(scene: Scene, typeId = 1, underHelmet = false, gender: 'M' | 'F' = 'M'): Promise<EquipItemType> {
    const definitions = gender === 'F' ? FEMALE_CHARACTER_HAIR_TYPES : CHARACTER_HAIR_TYPES
    const definition = definitions.find(type => type.id === typeId) ?? definitions[0]
    const file = underHelmet && definition.helmetFile ? definition.helmetFile : definition.file
    let types = sources.get(scene)
    if (!types) {
        types = new Map()
        sources.set(scene, types)
    }
    let source = types.get(file)
    if (!source) {
        source = createSource(scene, {...definition, file}, gender).catch(error => {
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
        const suffix = definition.file === definition.helmetFile ? '-helmet' : ''
        const prefix = gender === 'F' ? 'character-female-hair' : 'character-hair'
        const mesh = new Mesh(`${prefix}-${definition.id}${suffix}`, scene)
        VertexData.ExtractFromMesh(meshes[0] as Mesh, true, true).applyToMesh(mesh)
        mesh.material = createCharacterHairMaterial(scene, `${prefix}-material-${definition.id}${suffix}`, '/models/human/' + definition.albedoFile)
        mesh.receiveShadows = true
        mesh.alwaysSelectAsActiveMesh = true
        mesh.setEnabled(false)
        const type = new EquipItemType(new EquipCbItem(-10000 - definition.id - (gender === 'F' ? 100 : 0), mesh.name, Vector3.Zero(), Vector3.One(), null, null))
        type.mesh = mesh
        type.tintBuffer = new Float32Array(0)
        Lights.registerDynamicLightMesh(mesh)
        return type
    } finally {
        container.dispose()
    }
}

export function setCharacterHairColor(item: EquipItem, hexColor: string) {
    item.tint = Color3.FromHexString(hexColor).toLinearSpace()
    item.type.tintBufferDirty = true
}

export function setCharacterHairLightness(item: EquipItem, lightness: number) {
    item.tintLightness = lightness
    item.type.tintBufferDirty = true
}

export function attachCharacterHair(model: CharacterModel, type: EquipItemType, fitting: EquipModelModifier, hexColor = '#664e0a', lightness = 0.6): EquipItem {
    const previous = model.equipSet.get('HAIR')
    if (previous) EquipManager.removeEquippedItem(previous)
    const head = model.equipSet.get('FACE')!
    const item = new EquipItem(type, 0, head.parent, head.bone, null, null, null)
    item.attachUsingFullBoneTransform(characterHeadMatrix(fitting))
    setCharacterHairColor(item, hexColor)
    setCharacterHairLightness(item, lightness)
    model.equipSet.set('HAIR', item)
    EquipManager.addEquippedItem(item)
    return item
}
