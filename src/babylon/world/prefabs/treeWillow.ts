import { Matrix, Mesh, MeshBuilder, Scene } from '@babylonjs/core'
import { Prefab } from '@/babylon/world/worldRenderer'
import { Materials } from '@/babylon/materials'

// Coordinates use the same block origin as the other tree trunks.
const WILLOW_MODEL_SCALE = 0.68
export const WILLOW_WOOD_BLOCKS: number[][] = []
for (let i = 0; i < 7; i++) {
    const bend = Math.max(0, i - 3)
    WILLOW_WOOD_BLOCKS.push([bend * 0.035, i * 0.4, -bend * 0.02, 0.4, 0.4])
}
for (const [angle, length, baseY, rise] of [
    [0.18, 5, 1.8, 0.14], [1.6, 3, 2, 0.17],
    [3.2, 4, 1.85, 0.12], [4.9, 4, 2.1, 0.13],
]) {
    for (let i = 1; i <= length; i++) {
        WILLOW_WOOD_BLOCKS.push([
            0.06 + Math.cos(angle) * i * 0.21, baseY + i * rise,
            -0.04 + Math.sin(angle) * i * 0.21, 0.28, 0.3,
        ])
    }
}
for (const block of WILLOW_WOOD_BLOCKS) {
    block[0] *= WILLOW_MODEL_SCALE
    // The shared wood mesh has a fixed -0.5 Y offset; scale around the tree base.
    block[1] = (block[1] - 0.5) * WILLOW_MODEL_SCALE + 0.5
    block[2] *= WILLOW_MODEL_SCALE
    block[3] *= WILLOW_MODEL_SCALE
    block[4] *= WILLOW_MODEL_SCALE
}

export const PrefabWillow = {
    getPrefab(scene: Scene): Prefab {
        const parts: Mesh[] = []
        const leaf = (x: number, y: number, z: number, variation: number) => {
            const mesh = MeshBuilder.CreateBox('willowLeaf', {
                width: 0.5 + variation * 0.06,
                height: 0.36 + (1 - variation) * 0.06,
                depth: 0.46 + variation * 0.06,
            }, scene)
            mesh.position.set(x, y, z)
            parts.push(mesh)
        }
        // Fixed, uneven spacing and lengths give each side a different silhouette.
        const strands = [
            [0.05, 1.12, 2.55, 6], [0.48, 1.05, 2.48, 4],
            [0.94, 1.19, 2.58, 5], [1.51, 0.94, 2.7, 3],
            [2.12, 1, 2.67, 4], [2.48, 1.12, 2.56, 5],
            [3.05, 0.89, 2.4, 4], [3.64, 1.02, 2.55, 3],
            [4.1, 1.17, 2.46, 5], [4.64, 1.03, 2.65, 4],
            [5.13, 1.13, 2.72, 6], [5.74, 1.18, 2.65, 5],
        ]
        strands.forEach(([angle, radius, top, length], i) => {
            const variation = (i % 5) / 4
            leaf(0.12 + Math.cos(angle) * radius * 0.55, top + 0.12, -0.06 + Math.sin(angle) * radius * 0.55, variation)
            for (let j = 0; j < length; j++) {
                if (j > 0 && (i + j) % 2 === 1) continue
                const r = radius + j * 0.018
                const drift = angle + Math.sin(i * 1.7) * j * 0.018
                leaf(0.12 + Math.cos(drift) * r, top - j * 0.31, -0.06 + Math.sin(drift) * r, ((i + j * 2) % 5) / 4)
            }
            if (i % 3 !== 1) {
                // Crossed, double-sided strips stay visible from every direction.
                // Short segments reuse the leaf atlas cell without stretching it
                // over the entire hanging vine or sampling neighbouring cells.
                const vineAngle = angle + 0.16
                const vineRadius = radius * 0.97
                const vineTop = top - 0.12
                const bottom = 0.22 + (i % 4) * 0.13
                const segments = Math.ceil((vineTop - bottom) / 0.42)
                const segmentHeight = (vineTop - bottom) / segments
                for (let j = 0; j < segments; j++) {
                    const t = (j + 0.5) / segments
                    const drift = Math.sin(t * 2.4 + i) * 0.055 * t
                    const width = (0.23 + variation * 0.04) * (1 - t * 0.4)
                    for (let face = 0; face < 2; face++) {
                        const vine = MeshBuilder.CreatePlane('willowVine', {
                            width,
                            height: segmentHeight + 0.015,
                            sideOrientation: Mesh.DOUBLESIDE,
                        }, scene)
                        vine.position.set(
                            0.12 + Math.cos(vineAngle) * vineRadius + drift,
                            vineTop - (j + 0.5) * segmentHeight,
                            -0.06 + Math.sin(vineAngle) * vineRadius - drift * 0.6,
                        )
                        vine.rotation.y = vineAngle + face * Math.PI / 2
                        parts.push(vine)
                    }
                }
            }
        })
        leaf(0.2, 2.9, -0.12, 0.5)
        const mesh = Mesh.MergeMeshes(parts, true)!
        mesh.bakeTransformIntoVertices(Matrix.Scaling(WILLOW_MODEL_SCALE, WILLOW_MODEL_SCALE, WILLOW_MODEL_SCALE))
        mesh.name = 'prefab_willow'
        mesh.material = Materials.blockMatAlpha1
        mesh.alwaysSelectAsActiveMesh = true
        return new Prefab(mesh)
    },
}
