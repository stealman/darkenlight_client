import { Matrix, Mesh, Quaternion, Scene, SceneLoader, Vector3, VertexData } from '@babylonjs/core'
import { EquipItemType, EquipManager } from '@/babylon/item/equipManager'
import type { EquipModelModifier } from '@/babylon/item/equipManager'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'
import { Lights } from '@/babylon/scene/lights'
import { Settings } from '@/settings/settings'
import { createCharacterMaterial } from './characterMaterial'

// Raw GLB coordinates -> Head joint coordinates. Tune in adminUtils (radians).
export const HUMAN_HEAD_FITTING: EquipModelModifier = {
    scale: new Vector3(1.34, 1.3, 1.3),
    position: new Vector3(0.03, -0.01, 0.2),
    rotation: new Vector3(0, 0, 0),
}

export const HUMAN_FEMALE_HEAD_FITTING: EquipModelModifier = {
    scale: new Vector3(1.25, 1.25, 1.25),
    position: new Vector3(0.02, -0.12, 0.16),
    rotation: new Vector3(0, 0, 0),
}

export function characterHeadMatrix(fitting: EquipModelModifier = getCharacterHeadType().fitting): Matrix {
    return Matrix.Compose(fitting.scale, Quaternion.FromEulerVector(fitting.rotation), fitting.position)
}

export const DEFAULT_HEAD_TYPE_ID = 1
const headTypes = new Map<number, { id: number, file: string, fitting: EquipModelModifier, albedoFile?: string }>([
    [1, { id: 1, file: 'human_male_head_1.glb', fitting: HUMAN_HEAD_FITTING, albedoFile: 'human_male_head_1.png' }],
])

const femaleHead = { id: 1, file: 'human_female_head_1.glb', fitting: HUMAN_FEMALE_HEAD_FITTING, albedoFile: 'human_female_head_1.png' }

export function getCharacterHeadType(headTypeId = DEFAULT_HEAD_TYPE_ID, gender: 'M' | 'F' = 'M') {
    if (gender === 'F') return femaleHead
    return headTypes.get(headTypeId) ?? headTypes.get(DEFAULT_HEAD_TYPE_ID)!
}

const sources = new WeakMap<Scene, Map<string, Promise<EquipItemType>>>()

export function loadCharacterHead(scene: Scene, headTypeId = DEFAULT_HEAD_TYPE_ID, gender: 'M' | 'F' = 'M'): Promise<EquipItemType> {
    const definition = getCharacterHeadType(headTypeId, gender)
    const key = `${gender}:${definition.id}`
    let types = sources.get(scene)
    if (!types) {
        types = new Map()
        sources.set(scene, types)
    }
    let source = types.get(key)
    if (!source) {
        source = createHeadSource(scene, definition, gender).catch(error => {
            types.delete(key)
            throw error
        })
        types.set(key, source)
    }
    return source
}

async function createHeadSource(scene: Scene, definition: ReturnType<typeof getCharacterHeadType>, gender: 'M' | 'F'): Promise<EquipItemType> {
    const container = await SceneLoader.LoadAssetContainerAsync('', modelAssetUrl('/models/human/' + definition.file), scene)
    try {
        const meshes = container.meshes.filter(mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0 && !mesh.skeleton)
        if (meshes.length !== 1) throw new Error(`Expected one rigid mesh in ${definition.file}`)
        // Keep authored coordinates, just like the character armor fitting path.
        const mesh = new Mesh(`human-${gender === 'F' ? 'female' : 'male'}-head${definition.id}`, scene)
        VertexData.ExtractFromMesh(meshes[0] as Mesh, true, true).applyToMesh(mesh)
        mesh.material = createCharacterMaterial(scene, `human-${gender}-head${definition.id}-material`,
            definition.albedoFile ? '/models/human/' + definition.albedoFile : undefined)
        mesh.receiveShadows = true
        mesh.alwaysSelectAsActiveMesh = true
        mesh.setEnabled(false)
        // Client-only type: it is not an equipment/protocol model ID.
        const type = new EquipItemType(new EquipCbItem(-(definition.id + (gender === 'F' ? 100 : 0)), mesh.name, Vector3.Zero(), Vector3.One(), null, null))
        type.mesh = mesh
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
