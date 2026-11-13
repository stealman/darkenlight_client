import { Matrix, Mesh, Quaternion, SceneLoader, Vector3, VertexData } from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'
import type { EquipItem, EquipItemType } from '@/babylon/item/equipManager'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'

type Vector = { x: number, y: number, z: number }
type Transform = { position: Vector, rotation: Vector, scale: Vector }
interface EquipmentFitting {
    equipment: Record<string, Transform>
    pauldrons: Record<string, { left: Transform, right: Transform }>
    legs?: Record<string, { left: Transform, right: Transform }>
    weaponAttachment?: { correction: number[] }
}

const scenes = new WeakMap<Scene, { config: EquipmentFitting, sources: Map<number, EquipItemType> }>()
const loading = new WeakMap<Scene, Promise<void>>()
const vector = ({ x, y, z }: Vector) => new Vector3(x, y, z)
const matrix = (value: Transform) => Matrix.Compose(vector(value.scale), Quaternion.FromEulerVector(vector(value.rotation)), vector(value.position))

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

export function preloadCharacterEquipmentFitting(scene: Scene): Promise<void> {
    let promise = loading.get(scene)
    if (!promise) {
        promise = loadCharacterEquipmentFitting(scene)
        loading.set(scene, promise)
    }
    return promise
}

async function loadCharacterEquipmentFitting(scene: Scene) {
    const response = await fetch('/admin-utils/equipment-modifiers.json', { cache: 'no-store' })
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
        const data = await loadRawArmorGeometry(scene, asset.modelFile.split('?')[0])
        // Keep the existing normalized sources for monsters and ground items.
        const type = new EquipItemType(base.cbData)
        const mesh = new Mesh(`character-equipment-${id}`, scene)
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
    scenes.set(scene, { config, sources })
}

export function applyCharacterEquipmentFitting(scene: Scene, slot: string, item: EquipItem) {
    const state = scenes.get(scene)
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
    if (fitting) {
        item.type = state.sources.get(id) ?? item.type
        item.attachUsingFullBoneTransform(matrix(fitting))
    } else if (slot === 'WEAPON' && state.config.weaponAttachment) {
        const modifier = item.modelModifierMatrix ?? Matrix.Identity()
        item.attachUsingFullBoneTransform(modifier.multiply(Matrix.FromArray(state.config.weaponAttachment.correction)), false)
    }
}
