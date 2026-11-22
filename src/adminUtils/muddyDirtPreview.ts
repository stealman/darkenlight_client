import { Matrix, Mesh, Texture, Vector2, Vector3 } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials, TerrainEnum1 } from '@/babylon/materials'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'
import type { MapBlock } from '@/data/worldDataManager'
import atlasUrl from './assets/muddy-dirt-atlas.png'
import normalAtlasUrl from './assets/muddy-dirt-normal-atlas.png'

const ATLAS_TILES = 16
// Origins use 128 px tiles from the top left of both square atlases.
// Fractions leave padding between the source images for texture filtering.
const PATTERNS = [
    {size: 3, origins: [[0, 0], [3.125, 0], [6.25, 0], [9.375, 0], [12.5, 0], [0, 3.125]]},
    {size: 2, origins: [[3.125, 3.125], [5.25, 3.125], [7.375, 3.125], [9.5, 3.125], [11.625, 3.125]]},
    {size: 1, origins: [[3.125, 5.25], [4.25, 5.25], [5.375, 5.25]]},
]

export function createMuddyDirtPreview(plane: Mesh) {
    const scene = plane.getScene()
    const mesh = Builder.createHorizontalPlane(scene, null, 1, 0)
    mesh.parent = plane.parent
    mesh.name = 'adminUtilsMuddyDirt'
    mesh.receiveShadows = plane.receiveShadows
    // Equal UV scales keep the normal strength consistent across quarter turns.
    const atlasScale = 1 / ATLAS_TILES
    const material = Materials.getPBRCustomMaterial(scene, 'adminUtilsMuddyDirt', '', atlasUrl, atlasScale, atlasScale, false)
    const texture = material.albedoTexture!
    texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
    const normalAtlas = new Texture(normalAtlasUrl, scene)
    normalAtlas.gammaSpace = false
    normalAtlas.level = 3
    normalAtlas.wrapU = normalAtlas.wrapV = Texture.CLAMP_ADDRESSMODE
    normalAtlas.uScale = normalAtlas.vScale = atlasScale
    material.bumpTexture = normalAtlas
    mesh.material = material
    mesh.setEnabled(false)

    return (map: MapBlock[][]) => {
        mesh.setEnabled(false)
        if (!plane.thinInstanceCount) return

        const remaining = new Map<number, number>()
        const otherMatrices: Matrix[] = []
        const otherUvs: Vector2[] = []
        const stride = map.length
        const sourceMatrices = plane.thinInstanceGetWorldMatrices()
        const sourceUvs = plane.getVertexBuffer('uvc')!.getFloatData(plane.thinInstanceCount)!
        for (let i = 0; i < plane.thinInstanceCount; i++) {
            const matrix = sourceMatrices[i]
            const {x, y, z} = matrix.getTranslation()
            const block = map[x][z]
            if (block.type === TerrainEnum1.TERRAIN_MUDDY_DIRT.index && !block.snowed) {
                remaining.set(x * stride + z, y)
            } else {
                otherMatrices.push(matrix)
                otherUvs.push(new Vector2(sourceUvs[i * 2], sourceUvs[i * 2 + 1]))
            }
        }
        if (!remaining.size) return

        const dirtMatrices: Matrix[] = []
        const dirtUvs: Vector2[] = []
        for (const {size, origins} of PATTERNS) {
            const center = (size - 1) / 2
            for (const [key, y] of remaining) {
                const x = Math.floor(key / stride)
                const z = key % stride
                if (x + size > stride || z + size > stride) continue
                let fits = true
                for (let dx = 0; dx < size && fits; dx++) {
                    for (let dz = 0; dz < size && fits; dz++) {
                        fits = remaining.get(key + dx * stride + dz) === y
                    }
                }
                if (!fits) continue

                // Stable choices keep textures in place when the preview is refreshed.
                const hash = Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663)
                const [atlasX, atlasTop] = origins[(hash >>> 5) % origins.length]
                const rotation = Matrix.RotationY(((hash >>> 12) & 3) * Math.PI / 2)
                for (let dx = 0; dx < size; dx++) {
                    for (let dz = 0; dz < size; dz++) {
                        remaining.delete(key + dx * stride + dz)
                        const offset = Vector3.TransformNormal(new Vector3(dx - center, 0, dz - center), rotation)
                        const matrix = rotation.clone()
                        matrix.setTranslationFromFloats(x + center + offset.x, y, z + center + offset.z)
                        dirtMatrices.push(matrix)
                        dirtUvs.push(new Vector2(atlasX + dx, ATLAS_TILES - atlasTop - size + dz))
                    }
                }
            }
        }

        updateWorldInstanceBuffers(plane, otherMatrices, otherUvs)
        plane.setEnabled(otherMatrices.length > 0)
        updateWorldInstanceBuffers(mesh, dirtMatrices, dirtUvs)
        mesh.setEnabled(true)
    }
}
