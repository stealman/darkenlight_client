import { TerrainEnum1 } from '@/babylon/materials'
import type { MapBlock } from '@/data/worldDataManager'
import type { StonePathBounds } from './stonePathLayout'
import { isSnowRoof, WATER_BLOCK_TYPE } from './terrainRoofShape'

const SAMPLES = 8
const ROW_BYTES = SAMPLES * 4
const CACHED_PATCHES = 512
// The last channel runs from rock dust through dry soil to wet mud.
export const PAVING_DRY_SOIL = 128 / 255
const NEIGHBORS = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
] as const

// Distance to each neighboring tile, including the diagonal at a bend.
const fringeWeights = Array.from({length: SAMPLES * SAMPLES}, (_, i) => {
    const x = (i % SAMPLES + 0.5) / SAMPLES
    const z = (Math.floor(i / SAMPLES) + 0.5) / SAMPLES
    return NEIGHBORS.map(([dx, dz]) => {
        const distance = Math.hypot(dx < 0 ? x : dx > 0 ? 1 - x : 0, dz < 0 ? z : dz > 0 ? 1 - z : 0)
        const t = Math.max(0, Math.min(1, (distance - 0.06) / 0.52))
        return 1 - t * t * (3 - 2 * t)
    })
})

type Surface = [snow: number, grass: number, winter: number, soil: number]
type FringeSource = {index: number, surface: Surface}
const flatRows = new Map<number, Uint8Array>()
const fringePatches = new Map<string, Uint8Array[]>()

function surfaceKey([snow, grass, winter, soil]: Surface) {
    return snow + 2 * grass + 4 * winter + 8 * Math.round(2 * soil)
}

function flatRow(base: Surface) {
    const key = surfaceKey(base)
    let row = flatRows.get(key)
    if (!row) {
        row = new Uint8Array(ROW_BYTES)
        const color = base.map(channel => channel * 255)
        for (let x = 0; x < ROW_BYTES; x += 4) row.set(color, x)
        flatRows.set(key, row)
    }
    return row
}

function fringePatch(base: Surface, neighbors: FringeSource[]) {
    // The field only depends on surface types in the immediate neighborhood.
    // Identical edges can share the same texels across positions and updates.
    const key = surfaceKey(base) + ':' + neighbors.map(({index, surface}) => index * 32 + surfaceKey(surface)).join(',')
    const cached = fringePatches.get(key)
    if (cached) return cached
    const patch = new Uint8Array(SAMPLES * ROW_BYTES)
    for (let i = 0; i < fringeWeights.length; i++) {
        const offset = i * 4
        const weights = fringeWeights[i]
        let strongest = 0, total = 0, snow = 0, grass = 0, winter = 0, soil = 0
        for (const {index, surface} of neighbors) {
            const weight = weights[index]
            strongest = Math.max(strongest, weight)
            total += weight
            snow += surface[0] * weight
            grass += surface[1] * weight
            winter += surface[2] * weight
            soil += surface[3] * weight
        }
        const blend = total ? strongest / total : 0
        patch[offset] = Math.round(255 * (base[0] * (1 - strongest) + snow * blend))
        patch[offset + 1] = Math.round(255 * (base[1] * (1 - strongest) + grass * blend))
        patch[offset + 2] = Math.round(255 * (base[2] * (1 - strongest) + winter * blend))
        patch[offset + 3] = Math.round(255 * (base[3] * (1 - strongest) + soil * blend))
    }
    if (fringePatches.size >= CACHED_PATCHES) fringePatches.delete(fringePatches.keys().next().value!)
    const rows = Array.from({length: SAMPLES}, (_, z) => patch.subarray(z * ROW_BYTES, (z + 1) * ROW_BYTES))
    fringePatches.set(key, rows)
    return rows
}

export function buildPavingSurfaceField(map: MapBlock[][], bounds: StonePathBounds,
    snowHidden: (x: number, z: number) => boolean) {
    const tilesWide = bounds.maxX - bounds.minX + 1, tilesDeep = bounds.maxZ - bounds.minZ + 1
    const width = tilesWide * SAMPLES, depth = tilesDeep * SAMPLES
    const pixels = new Uint8Array(width * depth * 4)
    const sample = (tile: MapBlock, x: number, z: number): Surface => {
        const snow = isSnowRoof(tile)
        const hidden = snow && snowHidden(x, z)
        return [
            Number(snow && !hidden),
            Number(!hidden && tile.type === TerrainEnum1.TERRAIN_GRASS.index),
            Number(!hidden && tile.type === TerrainEnum1.TERRAIN_GRASS_WINTER.index),
            tile.type === TerrainEnum1.TERRAIN_ROCK.index ? 0
                : tile.type === TerrainEnum1.TERRAIN_MUDDY_DIRT.index ? 1 : PAVING_DRY_SOIL,
        ]
    }
    for (let tx = 0; tx < tilesWide; tx++) for (let tz = 0; tz < tilesDeep; tz++) {
        const x = tx + bounds.minX, z = tz + bounds.minZ
        const tile = map[x][z]
        const base = sample(tile, x, z)
        let patch: Uint8Array[] | undefined
        if (tile.stonePath || tile.beigeStonePath) {
            const neighbors: FringeSource[] = []
            for (const [index, [dx, dz]] of NEIGHBORS.entries()) {
                const neighbor = map[x + dx]?.[z + dz]
                if (!neighbor || neighbor.stonePath || neighbor.beigeStonePath || neighbor.height !== tile.height
                    || neighbor.type <= 0 || neighbor.type >= WATER_BLOCK_TYPE) continue
                neighbors.push({index, surface: sample(neighbor, x + dx, z + dz)})
            }
            if (neighbors.length) patch = fringePatch(base, neighbors)
        }
        const row = flatRow(base)
        for (let sz = 0; sz < SAMPLES; sz++) {
            const offset = ((tz * SAMPLES + sz) * width + tx * SAMPLES) * 4
            pixels.set(patch?.[sz] ?? row, offset)
        }
    }
    return {pixels, width, depth}
}
