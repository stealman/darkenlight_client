import { Mesh, MeshBuilder, Scene, Vector3 } from '@babylonjs/core'
import { Prefab } from '@/babylon/world/worldRenderer'
import { Materials } from '@/babylon/materials'

export const PrefabShrub1x1_tall = {
        getPrefab(scene: Scene) {
            const box = MeshBuilder.CreateBox("box", { width: 0.5, height: 0.5, depth: 0.5 }, scene)

            box.isVisible = false

            const blocks: Mesh[] = []
            let y = 0

            // --- Layer 1 (ground, nepravidelný 3x3)
            let layer = [
                { x: -0.5, z: -0.5 }, { x: 0.5, z: -0.5 },
                { x: -0.5, z: 0 },                     { x: 0.5, z: 0 },
                { x: 0, z: 0.5 }
            ]

            layer.forEach(pos => {
                const clone = box.clone("clone")
                clone.position = new Vector3(pos.x, y, pos.z)
                blocks.push(clone)
            })

            // --- Layer 2
            y += 0.5
            layer = [
                { x: -0.5, z: -0.5 }, { x: 0, z: -0.5 }, { x: 0, z: 0 },    { x: 0.5, z: 0 },
                { x: 0, z: 0.5 }
            ]

            layer.forEach(pos => {
                const clone = box.clone("clone")
                clone.position = new Vector3(pos.x, y, pos.z)
                blocks.push(clone)
            })

            // --- Layer 3 (užší, ale ne pyramida)
            y += 0.5
            layer = [
                { x: -0.5, z: 0 },
                { x: 0, z: -0.5 }, { x: 0, z: 0 },

            ]

            layer.forEach(pos => {
                const clone = box.clone("clone")
                clone.position = new Vector3(pos.x, y, pos.z)
                blocks.push(clone)
            })

            // --- Layer 4 (vršek, rozházenější)
            y += 0.5
            layer = [
                { x: 0, z: 0 },
            ]

            layer.forEach(pos => {
                const clone = box.clone("clone")
                clone.position = new Vector3(pos.x, y, pos.z)
                blocks.push(clone)
            })

            const merged = Mesh.MergeMeshes(blocks, true) as Mesh
            merged.material = Materials.blockMatAlpha1
            merged.name = "prefab_bush_1x1_tall"
            merged.alwaysSelectAsActiveMesh = true

            return new Prefab(merged)
        }
    }
