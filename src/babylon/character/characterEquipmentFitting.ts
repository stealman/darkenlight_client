import { Matrix, Mesh, Quaternion, SceneLoader, Vector3, VertexData } from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'
import type { EquipItem, EquipItemType, EquipModelModifier } from '@/babylon/item/equipManager'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'
import type { CharacterGender } from './characterAppearance'

type Vector = { x: number, y: number, z: number }
type Transform = { position: Vector, rotation: Vector, scale: Vector }
interface EquipmentFitting {
    equipment: Record<string, Transform>
    pauldrons: Record<string, { left: Transform, right: Transform }>
    legs?: Record<string, { left: Transform, right: Transform }>
    weaponAttachment?: { correction: number[] }
    hair?: Record<string, Transform>
}

const scenes = new WeakMap<Scene, Map<CharacterGender, { config: EquipmentFitting, sources: Map<number, EquipItemType> }>>()
const loading = new WeakMap<Scene, Map<CharacterGender, Promise<void>>>()
const vector = ({ x, y, z }: Vector) => new Vector3(x, y, z)
const matrix = (value: Transform) => Matrix.Compose(vector(value.scale), Quaternion.FromEulerVector(vector(value.rotation)), vector(value.position))
const weaponGripRotation = Matrix.RotationY(Math.PI)

export function getCharacterHairFitting(scene: Scene, typeId: number, gender: CharacterGender = 'M'): EquipModelModifier {
    const hair = scenes.get(scene)?.get(gender)?.config.hair
    const fitting = hair?.[typeId] ?? (gender === 'F' ? hair?.[1] : undefined)
    return fitting
        ? {position: vector(fitting.position), rotation: vector(fitting.rotation), scale: vector(fitting.scale)}
        : {position: Vector3.Zero(), rotation: Vector3.Zero(), scale: Vector3.One()}
}

export function getCharacterWeaponAttachmentMatrix(modifier: Matrix, correction: Matrix | null) {
    const local = weaponGripRotation.multiply(modifier)
    return correction ? local.multiply(correction) : local
}

export async function loadRawArmorGeometry(scene: Scene, file: string) {
    const container = await SceneLoader.LoadAssetContainerAsync('', modelAssetUrl('/models/equip/armors/' + file), scene)
    try {
        const meshes = container.meshes.filter(mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0 && !mesh.skeleton)
        if (meshes.length !== 1) throw new Error(`Expected one rigid armor mesh in ${file}`)
        return VertexData.ExtractFromMesh(meshes[0] as Mesh, true, true)
    } finally {
        container.dispose()
    }
}

export function preloadCharacterEquipmentFitting(scene: Scene, gender: CharacterGender = 'M'): Promise<void> {
    let variants = loading.get(scene)
    if (!variants) { variants = new Map(); loading.set(scene, variants) }
    let promise = variants.get(gender)
    if (!promise) {
        promise = loadCharacterEquipmentFitting(scene, gender)
        variants.set(gender, promise)
    }
    return promise
}

async function loadCharacterEquipmentFitting(scene: Scene, gender: CharacterGender) {
    const url = gender === 'F' ? '/admin-utils/equipment-modifiers-female.json' : '/admin-utils/equipment-modifiers.json'
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('Could not load character equipment fitting')
    const config: EquipmentFitting = await response.json()
    const [{ TEXTURED_ARMOR_ASSETS }, { EquipManager, EquipItemType }, { Lights }, { Settings }] = await Promise.all([
        import('@/babylon/item/codebook/armorsModelsCb'), import('@/babylon/item/equipManager'),
        import('@/babylon/scene/lights'), import('@/settings/settings'),
    ])
    const fitted = new Set([...Object.keys(config.equipment), ...Object.keys(config.pauldrons), ...Object.keys(config.legs ?? {})].map(Number))
    const sources = new Map<number, EquipItemType>()
    await Promise.all([...fitted].filter(id => id >= 1000).map(async id => {
        const asset = TEXTURED_ARMOR_ASSETS.get(id)
        const base = EquipManager.getItemType(id)
        if (!asset || !base?.mesh) throw new Error(`Equipment source ${id} is unavailable`)
        const femaleFile = id === 1000 ? 'female-armor-plate.glb' : id === 2000 ? 'female-armor-chain.glb' : undefined
        const data = await loadRawArmorGeometry(scene, gender === 'F' && femaleFile ? femaleFile : asset.modelFile.split('?')[0])
        // Keep the existing normalized sources for monsters and ground items.
        const type = new EquipItemType(base.cbData)
        const mesh = new Mesh(`character-equipment-${gender}-${id}`, scene)
        data.applyToMesh(mesh)
        mesh.material = base.mesh.material
        mesh.parent = base.mesh.parent
        mesh.receiveShadows = true
        mesh.alwaysSelectAsActiveMesh = true
        mesh.setEnabled(false)
        type.mesh = mesh
        type.castsShadows = base.castsShadows
        type.sunShadowEnabled = type.castsShadows && !Settings.isDetailLevelMedium()
        Lights.registerDynamicLightMesh(mesh)
        if (type.castsShadows) {
            Lights.addShadowCaster(mesh, true, false, false, true, (position, rangeSquared) => {
                if (Settings.isDetailLevelMedium() && !Lights.indoor && !type.hasLocalPlayerShadowEquipment()) return false
                for (const item of EquipManager.equippedItems.get(type) ?? []) {
                    if (Vector3.DistanceSquared(position, item.position) <= rangeSquared) return true
                }
                return false
            }, true, !Settings.isDetailLevelMedium())
        }
        sources.set(id, type)
    }))
    let variants = scenes.get(scene)
    if (!variants) { variants = new Map(); scenes.set(scene, variants) }
    variants.set(gender, { config, sources })
}

export function applyCharacterEquipmentFitting(scene: Scene, slot: string, item: EquipItem, gender: CharacterGender = 'M') {
    const state = scenes.get(scene)?.get(gender)
    if (!state) return
    const id = item.type.id
    let fitting: Transform | undefined
    if (slot === 'LEFT_PAULDRON' || slot === 'RIGHT_PAULDRON') {
        fitting = state.config.pauldrons[id]?.[slot === 'LEFT_PAULDRON' ? 'left' : 'right']
    } else if (slot === 'LEFT_LEG' || slot === 'RIGHT_LEG') {
        fitting = state.config.legs?.[id]?.[slot === 'LEFT_LEG' ? 'left' : 'right']
    } else {
        fitting = state.config.equipment[id]
    }
    if (slot === 'WEAPON') {
        const modifier = fitting ? matrix(fitting) : item.modelModifierMatrix ?? Matrix.Identity()
        const correction = state.config.weaponAttachment ? Matrix.FromArray(state.config.weaponAttachment.correction) : null
        item.attachUsingFullBoneTransform(getCharacterWeaponAttachmentMatrix(modifier, correction), false)
    } else if (fitting) {
        item.type = state.sources.get(id) ?? item.type
        item.attachUsingFullBoneTransform(matrix(fitting))
    }
}
