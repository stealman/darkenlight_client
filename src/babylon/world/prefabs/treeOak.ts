import { Mesh, MeshBuilder, Scene } from '@babylonjs/core'
import { Prefab } from '@/babylon/world/worldRenderer'
import { Materials } from '@/babylon/materials'
import { addLeafBlockPlanes } from './leafBlockPlanes'

export const PrefabOak = {
    getPrefab(scene: Scene): Prefab {
        const blocks: Mesh[] = []
        // Uneven lobes break the circular silhouette without filling the crown.
        const lobes = [
            [-0.5, 0.1, -0.4], [0.45, 0.22, -0.42],
            [-0.52, 0.35, 0.36], [0.48, 0.08, 0.4],
            [-0.35, 0.8, -0.12], [0.25, 1.05, 0.24], [0.1, 0.65, -0.46],
            [0.56, 0.64, -0.06], [-0.22, 0.65, 0.5],
        ]
        const offsets = [
            [-0.28, -0.12, -0.24], [0.28, 0.08, -0.24],
            [-0.28, 0.1, 0.24], [0.28, -0.1, 0.24], [0, 0.3, 0],
        ]
        lobes.forEach(([cx, cy, cz], lobe) => {
            const angle = lobe * 1.37
            const cos = Math.cos(angle)
            const sin = Math.sin(angle)
            for (let i = 0; i < offsets.length; i++) {
                const [x, y, z] = offsets[i]
                const variation = ((lobe * 3 + i * 2) % 5) / 4
                // Match the birch's block sizes and deterministic variation.
                const block = MeshBuilder.CreateBox('oakLeaf', {
                    width: 0.5 + variation * 0.06,
                    height: 0.36 + (1 - variation) * 0.06,
                    depth: 0.46 + variation * 0.06,
                }, scene)
                block.position.set(cx + x * cos - z * sin, cy + y, cz + x * sin + z * cos)
                block.rotation.z = Math.sin(angle + i) * 0.1
                blocks.push(block)
                if (i < 4 && Math.hypot(block.position.x, block.position.z) > 0.75 && (lobe + i) % 3 === 0) {
                    addLeafBlockPlanes(blocks, block, lobe * 5 + i)
                }
            }
        })

        const merged = Mesh.MergeMeshes(blocks, true) as Mesh
        merged.material = Materials.blockMatAlpha1
        merged.name = "prefab_tree1"
        merged.alwaysSelectAsActiveMesh = true

        return new Prefab(merged)
    }
}
