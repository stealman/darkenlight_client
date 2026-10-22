import { Matrix, Mesh, TransformNode, Vector2, VertexData } from '@babylonjs/core'
import { EquipManager } from '@/babylon/item/equipManager'
import { Lights } from '@/babylon/scene/lights'
import { Prefab } from '@/babylon/world/worldRenderer'
import { TEXTURED_ARMOR_MODEL_IDS } from '@/babylon/item/codebook/armorsModelsCb'

export const StaticEquipPartsRenderer = {
    parent: null as TransformNode | null,
    prefabs: new Map<number, Prefab>(),

    initialize(parent: TransformNode) {
        this.parent = parent
        this.prefabs.clear()
    },

    getPrefab(modelId: number): Prefab {
        const existing = this.prefabs.get(modelId)
        if (existing) return existing

        const source = EquipManager.itemTypes.get(modelId)?.mesh
        if (!source) throw new Error(`Missing equip model ${modelId} for static object part`)

        // Do not clone the source mesh here. Babylon clones share Geometry,
        // including its VAO cache, while the equipped item and this static
        // prefab use different thin-instance buffers. A viewport rebuild can
        // then bind the static buffers to the equipped mesh (or vice versa).
        const mesh = new Mesh(`staticEquipPart_${modelId}`, source.getScene())
        const vertexData = VertexData.ExtractFromMesh(source, true, true)
        vertexData.applyToMesh(mesh, false)
        mesh.parent = this.parent
        mesh.material = source.material
        mesh.position.copyFrom(source.position)
        mesh.rotation.copyFrom(source.rotation)
        mesh.scaling.copyFrom(source.scaling)
        if (source.rotationQuaternion) {
            mesh.rotationQuaternion = source.rotationQuaternion.clone()
        }
        mesh.setEnabled(false)
        mesh.alwaysSelectAsActiveMesh = true
        mesh.doNotSyncBoundingInfo = true
        mesh.receiveShadows = true

        const prefab = new Prefab(mesh)
        this.prefabs.set(modelId, prefab)
        if (!TEXTURED_ARMOR_MODEL_IDS.has(modelId)) {
            Lights.addShadowCaster(mesh, true, true)
        }
        Lights.registerSharedLightMesh(mesh)
        return prefab
    },

    clear() {
        this.prefabs.forEach((prefab) => prefab.clearMatrices())
    },

    addPart(prefab: Prefab, materialIndex: number, matrix: Matrix) {
        prefab.matrices.push(matrix)
        prefab.uvData.push(new Vector2(materialIndex, 0))
    },

    flush() {
        this.prefabs.forEach((prefab) => {
            prefab.setThinInstanceBuffers()
            prefab.mesh.setEnabled(prefab.matrices.length > 0)
        })
    },
}
