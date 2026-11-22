import { Matrix, Mesh, Texture, Vector2, Vector3 } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials } from '@/babylon/materials'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'
import type { MapBlock } from '@/data/worldDataManager'

const ATLAS_TILES = 16
// Origins use 128 px tiles from the top left of both square atlases.
// Fractions leave padding between the source images for texture filtering.
export const muddyDirtPatterns = [
    {size: 3, origins: [[0, 0], [3.125, 0], [6.25, 0], [9.375, 0], [12.5, 0], [0, 3.125]]},
    {size: 2, origins: [[3.125, 3.125], [5.25, 3.125], [7.375, 3.125], [9.5, 3.125], [11.625, 3.125]]},
    {size: 1, origins: [[3.125, 5.25], [4.25, 5.25], [5.375, 5.25]]},
]

type TerrainAtlas = {
    type: number
    colorUrl: string
    normal: {url: string, strength: number}
    patterns: ReadonlyArray<{size: number, origins: readonly (readonly number[])[]}>
}

export type TerrainAtlasTileFilter = (matrix: Matrix, uv: Vector2, x: number, z: number) => boolean

export function createTerrainPreviewPlane(plane: Mesh, name: string) {
    const mesh = Builder.createHorizontalPlane(plane.getScene(), null, 1, 0)
    mesh.parent = plane.parent
    mesh.name = name
    mesh.receiveShadows = plane.receiveShadows
    mesh.setEnabled(false)
    return mesh
}

export function createTerrainAtlasPreview(plane: Mesh, name: string, atlas: TerrainAtlas) {
    const mesh = createTerrainPreviewPlane(plane, name)
    const material = createAtlasMaterial(plane, name, atlas)
    mesh.material = material

    const render = (map: MapBlock[][], takeTile?: TerrainAtlasTileFilter) => {
        mesh.setEnabled(false)
        mesh.thinInstanceCount = 0
        if (!plane.thinInstanceCount) return

        const remaining = new Map<number, number>()
        const otherMatrices: Matrix[] = []
        const otherUvs: Vector2[] = []
        const atlasMatrices: Matrix[] = []
        const atlasUvs: Vector2[] = []
        const stride = map.length
        const sourceMatrices = plane.thinInstanceGetWorldMatrices()
        const sourceUvs = plane.getVertexBuffer('uvc')!.getFloatData(plane.thinInstanceCount)!
        for (let i = 0; i < plane.thinInstanceCount; i++) {
            const matrix = sourceMatrices[i]
            const {x, y, z} = matrix.getTranslation()
            const block = map[x][z]
            if (block.type === atlas.type && !block.snowed) {
                remaining.set(x * stride + z, y)
                continue
            }
            otherMatrices.push(matrix)
            otherUvs.push(new Vector2(sourceUvs[i * 2], sourceUvs[i * 2 + 1]))
        }

        if (!remaining.size) return
        for (const {size, origins} of atlas.patterns) {
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
                        const tileX = Math.round(x + center + offset.x)
                        const tileZ = Math.round(z + center + offset.z)
                        const matrix = rotation.clone()
                        matrix.setTranslationFromFloats(tileX, y, tileZ)
                        const uv = new Vector2(atlasX + dx, ATLAS_TILES - atlasTop - size + dz)
                        // Let the transition reuse the same atlas placement the tile would normally have.
                        if (takeTile?.(matrix, uv, tileX, tileZ)) continue
                        atlasMatrices.push(matrix)
                        atlasUvs.push(uv)
                    }
                }
            }
        }

        updateWorldInstanceBuffers(plane, otherMatrices, otherUvs)
        plane.setEnabled(otherMatrices.length > 0)
        updateWorldInstanceBuffers(mesh, atlasMatrices, atlasUvs)
        mesh.setEnabled(atlasMatrices.length > 0)
    }
    return {material, render}
}

function createAtlasMaterial(plane: Mesh, name: string, atlas: TerrainAtlas) {
    const scene = plane.getScene()
    // Equal UV scales keep the normal strength consistent across quarter turns.
    const scale = 1 / ATLAS_TILES
    const material = Materials.getPBRCustomMaterial(scene, name, '', atlas.colorUrl, scale, scale, false)
    const color = material.albedoTexture!
    color.wrapU = color.wrapV = Texture.CLAMP_ADDRESSMODE
    const normal = new Texture(atlas.normal.url, scene)
    normal.gammaSpace = false
    normal.level = atlas.normal.strength
    normal.wrapU = normal.wrapV = Texture.CLAMP_ADDRESSMODE
    normal.uScale = normal.vScale = scale
    material.bumpTexture = normal
    return material
}
