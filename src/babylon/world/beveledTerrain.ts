import type { MapBlock } from '@/data/worldDataManager'
import { SNOW_BLOCK_HEIGHT, TerrainVerticalCorner } from './beveledTerrainBlock'

const VERTICAL_NEIGHBORS = [
    [-1, -1, TerrainVerticalCorner.NorthWest], [1, -1, TerrainVerticalCorner.NorthEast],
    [1, 1, TerrainVerticalCorner.SouthEast], [-1, 1, TerrainVerticalCorner.SouthWest],
] as const

export function terrainVerticalBevelMask(map: MapBlock[][], x: number, z: number, topHeight: number, snowMask: Set<number>): number {
    let mask = 0
    for (const [dx, dz, bit] of VERTICAL_NEIGHBORS) {
        const sideX = map[x + dx]?.[z], sideZ = map[x]?.[z + dz]
        if (!sideX || !sideZ || sideX.type <= 0 || sideZ.type <= 0) continue
        // Full height steps only. Small snow/grass offsets retain their top
        // chamfer without cutting a deep notch through an otherwise hidden wall.
        if (sideX.height < topHeight && sideZ.height < topHeight
            && renderedTop(sideX, x + dx, z, snowMask, map.length) < topHeight
            && renderedTop(sideZ, x, z + dz, snowMask, map.length) < topHeight) mask |= bit
    }
    return mask
}

function renderedTop(tile: MapBlock, x: number, z: number, snowMask: Set<number>, size: number): number {
    const hidden = tile.snowed && !tile.stonePath && !tile.beigeStonePath && snowMask.has(x * size + z)
    if (hidden) return tile.height + (tile.type === 50 ? -0.1 : 0)
    if (tile.snowed && tile.type < 50 && !tile.stonePath && !tile.beigeStonePath) return tile.height + SNOW_BLOCK_HEIGHT
    return tile.totalHeight
}
