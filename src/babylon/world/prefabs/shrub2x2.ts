import { Mesh, MeshBuilder, Scene, Vector3 } from '@babylonjs/core'
import { Prefab } from '@/babylon/world/worldRenderer'
import { Materials } from '@/babylon/materials'

export const PrefabShrub2x2 = {
    getPrefab(scene: Scene) {

        const box = MeshBuilder.CreateBox("box", { width: 0.5, height: 0.5, depth: 0.5 }, scene)
        box.isVisible = false

        const blocks: Mesh[] = []
        let y = 0

        // 1
        let layer = [
            { x: -1.0, z: -0.5 },
            { x: -0.5, z: -1.0 },
            { x: 0.5, z: -1.0 },
            { x: 1.0, z: -0.5 },

            { x: -1.0, z: 0.5 },
            { x: -0.5, z: 0.5 },
            { x: 0.5, z: 0.5 },
            { x: 1.0, z: 0.5 },

            { x: -0.5, z: 1.0 },
            { x: 0.5, z: 1.0 },

            { x: 0, z: 0 }
        ]

        layer.forEach(p => {
            const c = box.clone("c")
            c.position = new Vector3(p.x, y, p.z)
            blocks.push(c)
        })

        // 2
        y += 0.5
        layer = [
            { x: -0.75, z: -0.25 },
            { x: -0.25, z: -0.75 },
            { x: 0.25, z: -0.75 },
            { x: 0.75, z: -0.25 },

            { x: -0.75, z: 0.25 },
            { x: 0.75, z: 0.25 },

            { x: -0.25, z: 0.75 },
            { x: 0.25, z: 0.75 },

            { x: 0, z: 0 }
        ]

        layer.forEach(p => {
            const c = box.clone("c")
            c.position = new Vector3(p.x, y, p.z)
            blocks.push(c)
        })

        // 3
        y += 0.5
        layer = [
            { x: -0.75, z: -0.25 },
            { x: -0.25, z: -0.5 },
            { x: 0.25, z: -0.5 },
            { x: 0.75, z: -0.25 },

            { x: -0.75, z: 0.25 },
            { x: -0.25, z: 0.25 },
            { x: 0.25, z: 0.25 },
            { x: 0.75, z: 0.25 },

            { x: -0.25, z: 0.6 },
            { x: 0.25, z: 0.6 }
        ]

        layer.forEach(p => {
            const c = box.clone("c")
            c.position = new Vector3(p.x, y, p.z)
            blocks.push(c)
        })


        // 4
        y += 0.5
        layer = [
            { x: -0.35, z: -0.1 },
            { x: 0.35, z: -0.1 },

            { x: -0.2, z: 0.25 },
            { x: 0.2, z: 0.25 },

            { x: 0, z: 0.5 }
        ]

        layer.forEach(p => {
            const c = box.clone("c")
            c.position = new Vector3(p.x, y, p.z)
            blocks.push(c)
        })
        const merged = Mesh.MergeMeshes(blocks, true) as Mesh
        merged.material = Materials.blockMatAlpha1
        merged.name = "prefab_shrub2x2"
        merged.alwaysSelectAsActiveMesh = true
        return new Prefab(merged)
    }
}
