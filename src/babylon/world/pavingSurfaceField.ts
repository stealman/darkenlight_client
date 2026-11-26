import { TerrainEnum1 } from '@/babylon/materials'
import type { MapBlock } from '@/data/worldDataManager'
import type { StonePathBounds } from './stonePathLayout'
import { isSnowRoof, WATER_BLOCK_TYPE } from './terrainRoofShape'

const SAMPLES = 8
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

export function buildPavingSurfaceField(map: MapBlock[][], bounds: StonePathBounds,
    snowHidden: (x: number, z: number) => boolean) {
    const tilesWide = bounds.maxX - bounds.minX + 1, tilesDeep = bounds.maxZ - bounds.minZ + 1
    const width = tilesWide * SAMPLES, depth = tilesDeep * SAMPLES
    const pixels = new Uint8Array(width * depth * 4)
    const sample = (tile: MapBlock, x: number, z: number) => {
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
        if (!tile.stonePath && !tile.beigeStonePath) {
            const snow = base[0] * 255, grass = base[1] * 255, winter = base[2] * 255, soil = base[3] * 255
            for (let sz = 0; sz < SAMPLES; sz++) {
                const start = ((tz * SAMPLES + sz) * width + tx * SAMPLES) * 4
                for (let offset = start; offset < start + SAMPLES * 4; offset += 4) {
                    pixels[offset] = snow
                    pixels[offset + 1] = grass
                    pixels[offset + 2] = winter
                    pixels[offset + 3] = soil
                }
            }
            continue
        }
        const neighbors = []
        for (const [index, [dx, dz]] of NEIGHBORS.entries()) {
            const neighbor = map[x + dx]?.[z + dz]
            if (!neighbor || neighbor.stonePath || neighbor.beigeStonePath || neighbor.height !== tile.height
                || neighbor.type <= 0 || neighbor.type >= WATER_BLOCK_TYPE) continue
            neighbors.push({index, surface: sample(neighbor, x + dx, z + dz)})
        }
        for (let sz = 0; sz < SAMPLES; sz++) for (let sx = 0; sx < SAMPLES; sx++) {
            const offset = ((tz * SAMPLES + sz) * width + tx * SAMPLES + sx) * 4
            const weights = fringeWeights[sz * SAMPLES + sx]
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
            pixels[offset] = Math.round(255 * (base[0] * (1 - strongest) + snow * blend))
            pixels[offset + 1] = Math.round(255 * (base[1] * (1 - strongest) + grass * blend))
            pixels[offset + 2] = Math.round(255 * (base[2] * (1 - strongest) + winter * blend))
            pixels[offset + 3] = Math.round(255 * (base[3] * (1 - strongest) + soil * blend))
        }
    }
    return {pixels, width, depth}
}
