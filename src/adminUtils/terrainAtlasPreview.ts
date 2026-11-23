import { Matrix, Mesh, Texture, Vector2, Vector3 } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials } from '@/babylon/materials'
import { addTerrainPreviewRoof, configureTerrainEdgeLighting, configureMuddyDirtWetness, configureTerrainPreviewBatch, TerrainPreviewBatch } from './terrainPreviewBatch'
import type { TerrainPreviewTriangle } from './terrainPreviewBatch'
import type { TerrainPreviewSurfaces } from './terrainPreviewGeometry'

export const TERRAIN_ATLAS_TILES = 16
// Origins use 128 px tiles from the top left of both square atlases.
// Fractions leave padding between the source images for texture filtering.
export const muddyDirtPatterns = [
    {size: 3, origins: [[0, 0], [3.125, 0], [6.25, 0], [9.375, 0], [12.5, 0], [0, 3.125]]},
    {size: 2, origins: [[3.125, 3.125], [5.25, 3.125], [7.375, 3.125], [9.5, 3.125], [11.625, 3.125]]},
    {size: 1, origins: [[3.125, 5.25], [4.25, 5.25], [5.375, 5.25]]},
]

// Shared 128 px atlas layout, measured from the top left.
export const terrainCoverPatterns = [
    {size: 3, origins: [
        [0.0625, 0.0625], [3.1875, 0.0625], [6.3125, 0.0625], [9.4375, 0.0625], [12.5625, 0.0625],
        [0.0625, 3.1875], [3.1875, 3.1875], [6.3125, 3.1875],
    ]},
    {size: 2, origins: [
        [9.4375, 3.1875], [11.5625, 3.1875], [13.6875, 3.1875],
        [0.0625, 6.3125], [2.1875, 6.3125], [4.3125, 6.3125],
    ]},
    {size: 1, origins: [[6.4375, 6.3125], [7.5625, 6.3125], [8.6875, 6.3125], [9.8125, 6.3125], [10.9375, 6.3125]]},
]

type TerrainAtlas = {
    type: number
    colorUrl: string
    normal: {url: string, strength: number}
    roundDirtEdges?: boolean
    wetDirt?: boolean
    roundRockTop?: boolean
    varyAdjacentPatches?: boolean
    patterns: ReadonlyArray<{size: number, origins: readonly (readonly number[])[]}>
}

type AtlasPlacement = {size: number, height: number, variant: number, turn: number}

function firstAvailableChoice(start: number, count: number, used: ReadonlySet<number>) {
    for (let offset = 0; offset < count; offset++) {
        const choice = (start + offset) % count
        if (!used.has(choice)) return choice
    }
    return start
}

function variedPatchPlacement(placed: ReadonlyMap<number, AtlasPlacement>, stride: number,
                              x: number, z: number, size: number, height: number, variants: number, hash: number) {
    // Mix the grid hash before choosing a variant and a quarter-turn from different bits.
    const mixed = Math.imul(hash ^ (hash >>> 16), 0x7feb352d)
    const seed = (mixed ^ (mixed >>> 15)) >>> 0
    const usedVariants = new Set<number>()
    const usedTurns = new Set<number>()
    const visit = (nx: number, nz: number) => {
        if (nx < 0 || nz < 0 || nx >= stride || nz >= stride) return
        const neighbor = placed.get(nx * stride + nz)
        if (neighbor?.height !== height) return
        if (neighbor.size === size) usedVariants.add(neighbor.variant)
        usedTurns.add(neighbor.turn)
    }
    for (let i = 0; i < size; i++) {
        visit(x - 1, z + i)
        visit(x + size, z + i)
        visit(x + i, z - 1)
        visit(x + i, z + size)
    }
    return {
        size, height,
        variant: firstAvailableChoice((seed >>> 2) % variants, variants, usedVariants),
        turn: firstAvailableChoice(seed & 3, 4, usedTurns),
    }
}

export type TerrainAtlasTileFilter = (
    matrix: Matrix, uv: Vector2, x: number, z: number, roof: readonly TerrainPreviewTriangle[] | undefined, wetCorners: number,
) => boolean

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
    configureTerrainPreviewBatch(mesh, material)
    const {roundDirtEdges = false, roundRockTop = false, wetDirt = false} = atlas
    const roundEdges = roundDirtEdges || roundRockTop
    if (roundEdges) configureTerrainEdgeLighting(material, undefined, roundRockTop)
    if (wetDirt) configureMuddyDirtWetness(material, 'solid')

    const render = ({atlasTops, stride, roofs, wetCorners, cornerFloors}: TerrainPreviewSurfaces, takeTile?: TerrainAtlasTileFilter,
                    batch = new TerrainPreviewBatch()) => {
        const remaining = atlasTops.get(atlas.type)!
        const placed = atlas.varyAdjacentPatches ? new Map<number, AtlasPlacement>() : undefined
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
                const appearance = placed && variedPatchPlacement(placed, stride, x, z, size, y, origins.length, hash)
                const [atlasX, atlasTop] = origins[appearance?.variant ?? (hash >>> 5) % origins.length]
                const rotation = Matrix.RotationY((appearance?.turn ?? ((hash >>> 12) & 3)) * Math.PI / 2)
                for (let dx = 0; dx < size; dx++) {
                    for (let dz = 0; dz < size; dz++) {
                        remaining.delete(key + dx * stride + dz)
                        const offset = Vector3.TransformNormal(new Vector3(dx - center, 0, dz - center), rotation)
                        const tileX = Math.round(x + center + offset.x)
                        const tileZ = Math.round(z + center + offset.z)
                        const matrix = rotation.clone()
                        matrix.setTranslationFromFloats(tileX, y, tileZ)
                        const uv = new Vector2(atlasX + dx, TERRAIN_ATLAS_TILES - atlasTop - size + dz)
                        const tileKey = tileX * stride + tileZ
                        if (appearance) placed!.set(tileKey, appearance)
                        const floor = cornerFloors.get(tileKey)
                        const roof = roofs.get(tileKey)
                        const footMask = wetCorners.get(tileKey) ?? 0
                        const wetMask = wetDirt ? footMask : 0
                        if (floor) addTerrainPreviewRoof(batch, matrix, uv, floor, {mirrorAtTileEdge: true, roundDirtEdges: roundEdges, wetCorners: wetMask})
                        // Let the transition reuse the same atlas placement the tile would normally have.
                        if (takeTile?.(matrix, uv, tileX, tileZ, roof, footMask)) continue
                        addTerrainPreviewRoof(batch, matrix, uv, roof, {roundDirtEdges: roundEdges, wetCorners: wetMask})
                    }
                }
            }
        }

        batch.apply(mesh, roundEdges, wetDirt)
    }
    return {mesh, material, render}
}

function createAtlasMaterial(plane: Mesh, name: string, atlas: TerrainAtlas) {
    const scene = plane.getScene()
    // Equal UV scales keep the normal strength consistent across quarter turns.
    const scale = 1 / TERRAIN_ATLAS_TILES
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
