import { Mesh, MeshBuilder, TransformNode } from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { Prefab } from '@/babylon/world/worldRenderer'

// One unit plane and atlas batch shared by all shrub sizes and leaf colours.
export const StaticLeafPlanes = {
    prefab: null as Prefab | null,

    initialize(parent: TransformNode) {
        const mesh = MeshBuilder.CreatePlane('staticLeafPlane', {
            size: 1,
            sideOrientation: Mesh.DOUBLESIDE,
        }, parent.getScene())
        mesh.parent = parent
        mesh.material = Materials.blockMatAlpha1
        mesh.alwaysSelectAsActiveMesh = true
        // Match tree foliage: keep scene fill/back lights and avoid dark
        // shadow projections across the intersecting alpha-cutout surfaces.
        mesh.receiveShadows = false
        mesh.setEnabled(false)
        this.prefab = new Prefab(mesh)
        Lights.addShadowCaster(mesh, false)
    },

    clear() {
        this.prefab?.clearMatrices()
    },

    flush() {
        if (!this.prefab) return
        this.prefab.setThinInstanceBuffers()
        this.prefab.mesh.setEnabled(this.prefab.matrices.length > 0)
    },
}
