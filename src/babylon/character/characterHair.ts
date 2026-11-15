import { Color3, Mesh, Scene, SceneLoader, Vector3, VertexData } from '@babylonjs/core'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { EquipItem, EquipItemType, EquipManager } from '@/babylon/item/equipManager'
import { createCharacterHairMaterial } from './characterHairMaterial'
import { characterHeadMatrix } from '@/babylon/character/characterHead'
import type { CharacterModel } from '@/babylon/character/characterModel'
import type { EquipModelModifier } from '@/babylon/item/equipManager'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'
import { Lights } from '@/babylon/scene/lights'
import { Settings } from '@/settings/settings'

export const CHARACTER_HAIR_TYPES = [
    { id: 1, file: 'human_male_hair_1.glb', albedoFile: 'human_male_hair_1.png' },
    { id: 2, file: 'human_male_hair_2.glb', albedoFile: 'human_male_hair_1.png' },
    { id: 3, file: 'human_male_hair_3.glb', albedoFile: 'human_male_hair_1.png' },
    { id: 4, file: 'human_male_hair_4.glb', albedoFile: 'human_male_hair_1.png' },
]

const sources = new WeakMap<Scene, Map<number, Promise<EquipItemType>>>()

export function loadCharacterHair(scene: Scene, typeId = 1): Promise<EquipItemType> {
    const definition = CHARACTER_HAIR_TYPES.find(type => type.id === typeId) ?? CHARACTER_HAIR_TYPES[0]
    typeId = definition.id
    let types = sources.get(scene)
    if (!types) {
        types = new Map()
        sources.set(scene, types)
    }
    let source = types.get(typeId)
    if (!source) {
        source = createSource(scene, definition).catch(error => {
            types.delete(typeId)
            throw error
        })
        types.set(typeId, source)
    }
    return source
}

async function createSource(scene: Scene, definition: typeof CHARACTER_HAIR_TYPES[number]) {
    const container = await SceneLoader.LoadAssetContainerAsync('', modelAssetUrl('/models/steve/' + definition.file), scene)
    try {
        const meshes = container.meshes.filter(mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0 && !mesh.skeleton)
        if (meshes.length !== 1) throw new Error(`Expected one rigid mesh in ${definition.file}`)
        const mesh = new Mesh(`character-hair-${definition.id}`, scene)
        VertexData.ExtractFromMesh(meshes[0] as Mesh, true, true).applyToMesh(mesh)
        mesh.material = createCharacterHairMaterial(scene, `character-hair-material-${definition.id}`, '/models/steve/' + definition.albedoFile)
        mesh.receiveShadows = true
        mesh.alwaysSelectAsActiveMesh = true
        mesh.setEnabled(false)
        const type = new EquipItemType(new EquipCbItem(-10000 - definition.id, mesh.name, Vector3.Zero(), Vector3.One(), null, null))
        type.mesh = mesh
        type.tintBuffer = new Float32Array(0)
        type.castsShadows = true
        type.sunShadowEnabled = !Settings.isDetailLevelMedium()
        Lights.registerDynamicLightMesh(mesh)
        Lights.addShadowCaster(mesh, true, false, false, true, (position, rangeSquared) => {
            if (Settings.isDetailLevelMedium() && !Lights.indoor && !type.hasLocalPlayerShadowEquipment()) return false
            for (const item of EquipManager.equippedItems.get(type) ?? []) {
                if (Vector3.DistanceSquared(position, item.position) <= rangeSquared) return true
            }
            return false
        }, true, !Settings.isDetailLevelMedium())
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
    item.castsOutdoorShadow = head.castsOutdoorShadow
    model.equipSet.set('HAIR', item)
    EquipManager.addEquippedItem(item)
    return item
}
