import { Matrix, TransformNode, Vector2, VertexData } from '@babylonjs/core'
import { EquipBatchMesh, EquipManager } from '@/babylon/item/equipManager'
import { Lights } from '@/babylon/scene/lights'
import { Prefab, WorldRenderer } from '@/babylon/world/worldRenderer'
import { TEXTURED_ARMOR_MODEL_IDS } from '@/babylon/item/codebook/armorsModelsCb'

export const StaticEquipPartsRenderer = {
    parent: null as TransformNode | null,
    prefabs: new Map<number, Prefab>(),
    pendingPrefabs: new Set<number>(),

    initialize(parent: TransformNode) {
        this.parent = parent
        this.prefabs.clear()
        this.pendingPrefabs.clear()
    },

    getPrefab(modelId: number): Prefab | undefined {
        const existing = this.prefabs.get(modelId)
        if (existing) return existing

        const source = EquipManager.itemTypes.get(modelId)?.mesh
        if (!source) {
            if (!this.pendingPrefabs.has(modelId)) {
                const parent = this.parent
                const pending = EquipManager.requestModel(modelId)
                if (pending) {
                    this.pendingPrefabs.add(modelId)
                    void pending.then(() => {
                        if (this.parent !== parent || parent?.isDisposed()) return
                        this.pendingPrefabs.delete(modelId)
                        if (EquipManager.getItemType(modelId)?.mesh) WorldRenderer.lastPos = null
                    })
                }
            }
            return
        }

        // Do not clone the source mesh here. Babylon clones share Geometry,
        // including its VAO cache, while the equipped item and this static
        // prefab use different thin-instance buffers. A viewport rebuild can
        // then bind the static buffers to the equipped mesh (or vice versa).
        const mesh = new EquipBatchMesh(`staticEquipPart_${modelId}`, source.getScene())
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
