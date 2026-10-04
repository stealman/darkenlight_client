import { Matrix, TransformNode, Vector2 } from '@babylonjs/core'
import { EquipManager } from '@/babylon/item/equipManager'
import { Lights } from '@/babylon/scene/lights'
import { Prefab } from '@/babylon/world/worldRenderer'

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

        const mesh = source.clone(`staticEquipPart_${modelId}`, this.parent, false)
        if (!mesh) throw new Error(`Unable to clone equip model ${modelId} for static object part`)
        mesh.setEnabled(false)
        mesh.alwaysSelectAsActiveMesh = true
        mesh.doNotSyncBoundingInfo = true
        mesh.receiveShadows = true

        const prefab = new Prefab(mesh)
        this.prefabs.set(modelId, prefab)
        Lights.addShadowCaster(mesh, true, true)
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
