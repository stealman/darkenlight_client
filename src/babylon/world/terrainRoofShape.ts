export const TerrainEdge = { West: 1, East: 2, North: 4, South: 8 } as const
export const TerrainCorner = { NorthWest: 16, NorthEast: 32, SouthEast: 64, SouthWest: 128 } as const
export const TERRAIN_STEP_HEIGHT = 0.5
export const WATER_BLOCK_TYPE = 50
export const TERRAIN_ROOF_CORNERS = [
    [-1, -1, TerrainCorner.NorthWest, TerrainEdge.North | TerrainEdge.West],
    [1, -1, TerrainCorner.NorthEast, TerrainEdge.North | TerrainEdge.East],
    [1, 1, TerrainCorner.SouthEast, TerrainEdge.South | TerrainEdge.East],
    [-1, 1, TerrainCorner.SouthWest, TerrainEdge.South | TerrainEdge.West],
] as const
export const TERRAIN_CARDINAL_EDGES = [[-1, 0, TerrainEdge.West], [1, 0, TerrainEdge.East],
    [0, -1, TerrainEdge.North], [0, 1, TerrainEdge.South]] as const

export type RoofTile = {type: number, snowed: boolean, stonePath: boolean, beigeStonePath: boolean}
export type TerrainColumn = RoofTile & {height: number, deepWater: boolean}
export function terrainSurfaceAtlasType(tile: RoofTile) {
    const type = tile.snowed ? tile.type + 100 : tile.type
    return type >= 101 && type <= 105 ? 104 : type
}
export const isSnowRoof = (tile?: RoofTile) => !!tile && terrainSurfaceAtlasType(tile) === 104

export function outdoorSurfaceHeight(tile?: TerrainColumn) {
    if (!tile || tile.type <= 0) return undefined
    return tile.type === WATER_BLOCK_TYPE ? tile.height - (tile.deepWater ? 1 : 0.5) : tile.height
}

export function terrainRoofShape(x: number, z: number, tile: RoofTile, top: number,
    heightAt: (x: number, z: number) => number | undefined, snowAt: (x: number, z: number) => boolean) {
    const snowy = isSnowRoof(tile)
    let bevel = 0
    if (!snowy && tile.type < WATER_BLOCK_TYPE && !tile.stonePath && !tile.beigeStonePath) {
        for (const [dx, dz, bit] of TERRAIN_CARDINAL_EDGES) {
            if (top > (heightAt(x + dx, z + dz) ?? top) + 1e-6) bevel |= bit
        }
    }
    let steps = 0
    let wet = 0
    for (let i = 0; i < TERRAIN_ROOF_CORNERS.length; i++) {
        const [dx, dz, corner, sides] = TERRAIN_ROOF_CORNERS[i]
        const sideX = heightAt(x + dx, z)
        const sideZ = heightAt(x, z + dz)
        const diagonal = heightAt(x + dx, z + dz)
        if (tile.type !== 3 && Math.max(sideX ?? top, sideZ ?? top, diagonal ?? top) > top + TERRAIN_STEP_HEIGHT) wet |= 1 << i
        if (snowy || Math.min(sideX ?? top, sideZ ?? top, diagonal ?? top) >= top - 1e-6) continue
        if ((snowAt(x + dx, z) && Math.abs((sideX ?? -1) - top) < 1e-6)
            || (snowAt(x, z + dz) && Math.abs((sideZ ?? -1) - top) < 1e-6)
            || (snowAt(x + dx, z + dz) && Math.abs((diagonal ?? -1) - top) < 1e-6)) continue
        steps |= 1 << i
        if (!(bevel & sides)) bevel |= corner
    }
    return bevel | (steps << 8) | (wet << 12)
}

const cornerStepsByMask = Array.from({length: 16}, (_, mask) => Array.from({length: 4}, (_, corner) =>
    mask & (1 << corner) ? -1 : 0))

export const terrainRoofCornerSteps = (shape: number) => cornerStepsByMask[(shape >> 8) & 15]
