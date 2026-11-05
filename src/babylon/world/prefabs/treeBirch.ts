import { Mesh, MeshBuilder, Scene } from '@babylonjs/core'
import { Prefab } from '@/babylon/world/worldRenderer'
import { Materials } from '@/babylon/materials'

export const PrefabBirch = {
    getPrefab(scene: Scene): Prefab {
        const parts: Mesh[] = []
        // Five staggered blocks per lobe leave gaps instead of filling its volume.
        const offsets = [
            [-0.28, -0.12, -0.24], [0.28, 0.08, -0.24],
            [-0.28, 0.1, 0.24], [0.28, -0.1, 0.24], [0, 0.3, 0],
        ]
        for (let i = 0; i < 7; i++) {
            const angle = i * 2.39996
            const roll = Math.sin(angle) * 0.15
            const cos = Math.cos(roll)
            const sin = Math.sin(roll)
            // Fixed variation keeps all four leaf colours on the same geometry.
            for (let j = 0; j < offsets.length; j++) {
                const [x, y, z] = offsets[j]
                const variation = ((i * 3 + j * 2) % 5) / 4
                const mesh = MeshBuilder.CreateBox('birchLeaf', {
                    width: 0.5 + variation * 0.06,
                    height: 0.36 + (1 - variation) * 0.06,
                    depth: 0.46 + variation * 0.06,
                }, scene)
                mesh.position.set(
                    Math.cos(angle) * 0.55 + x * cos - y * sin,
                    0.4 + i * 0.2 + x * sin + y * cos,
                    Math.sin(angle) * 0.55 + z,
                )
                mesh.rotation.z = roll
                parts.push(mesh)
            }
        }
        const mesh = Mesh.MergeMeshes(parts, true)!
        mesh.name = 'prefab_birch'
        mesh.material = Materials.blockMatAlpha1
        mesh.alwaysSelectAsActiveMesh = true
        return new Prefab(mesh)
    },
}
