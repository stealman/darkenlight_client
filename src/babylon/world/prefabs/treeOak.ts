import { Mesh, MeshBuilder, Scene, Vector3 } from '@babylonjs/core'
import { Prefab } from '@/babylon/world/worldRenderer'
import { Materials } from '@/babylon/materials'

export const PrefabOak = {
    getPrefab(scene: Scene) {
        const box = MeshBuilder.CreateBox("box", { width: 0.5, height: 0.5, depth: 0.5}, scene);
        box.position = new Vector3(0, 0, 0);
        box.isVisible = false

        const blocks: Mesh[] = []
        let y = 0
        let layer = [{ x: 0, z: 0 }, {x: -0.5, z: -1}, {x: 0, z: -1}, {x: 0.5, z: -1}, {x: -1, z: -0.5}, {x: 1, z: -0.5}, {x: -1, z: 0}, {x: 1, z: 0}, {x: -1, z: 0.5}, {x: 1, z: 0.5}, {x: -0.5, z: 1}, {x: 0, z: 1}, {x: 0.5, z: 1}, {x: 1, z: 1} ]
        layer.forEach((pos) => {
            const clone = box.clone("clone")
            clone.position = new Vector3(pos.x, y, pos.z)
            blocks.push(clone)
        })

        y += 0.5
        layer = [{ x: 0, z: 0 }, { x: -0.5, z: -1 }, { x: 0, z: -1 }, { x: 0.5, z: -1 }, { x: -1, z: -0.5 }, { x: -0.5, z: -0.5 }, { x: 1, z: -0.5 }, { x: -1, z: 0 }, { x: 1, z: 0 },
            { x: -1, z: 0.5 }, { x: 0.5, z: 0.5 }, { x: 1, z: 0.5 }, { x: -0.5, z: 1 }, { x: 0, z: 1 }, { x: 0.5, z: 1 }, { x: 1, z: 1 }];

        layer.forEach((pos) => {
            const clone = box.clone("clone")
            clone.position = new Vector3(pos.x, y, pos.z)
            blocks.push(clone)
        })

        y += 0.5
        layer = [{ x: 0, z: -0.5 }, { x: 0.5, z: -0.5 },
            { x: -0.5, z: 0 }, { x: 0.5, z: 0 },
            { x: 0, z: 0.5 }, { x: -0.5, z: 0.5 }];

        layer.forEach((pos) => {
            const clone = box.clone("clone")
            clone.position = new Vector3(pos.x, y, pos.z)
            blocks.push(clone)
        })

        y += 0.5
        layer = [{ x: 0.5, z: 0 }, { x: 0, z: -0.5 }, { x: 0, z: 0.5 }, { x: 0, z: 0 }];

        layer.forEach((pos) => {
            const clone = box.clone("clone")
            clone.position = new Vector3(pos.x, y, pos.z)
            blocks.push(clone)
        })

        // Merge bloks and set material
        const merged = Mesh.MergeMeshes(blocks, true) as Mesh
        merged.material = Materials.blockMatAlpha1
        merged.name = "prefab_tree1"
        merged.alwaysSelectAsActiveMesh = true

        return new Prefab(merged)
    }
}
