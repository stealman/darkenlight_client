import type { RoofTile } from './terrainRoofShape'

export const TERRAIN_SNOW_SURFACE = 104
export const SNOWMELT_MAX_DISTANCE = 2.55
const SNOWMELT_TILE_REACH = SNOWMELT_MAX_DISTANCE + Math.SQRT1_2
export const terrainSurface = (tile: RoofTile) => tile.snowed ? TERRAIN_SNOW_SURFACE : tile.type
export function hasTerrainTransition(cover: number, substrate: number) {
    if (cover === TERRAIN_SNOW_SURFACE) return substrate >= 1 && substrate <= 5
    if (cover === 2 || cover === 5) return substrate === 1 || substrate === 3 || substrate === 4
    if (cover === 4) return substrate === 1 || substrate === 3
    return cover === 1 && substrate === 3
}

type Boundary<T> = {x: number, z: number, height: number, alongX: boolean, cover: number, substrate: number, material: T}
type TransitionTile = RoofTile & {height: number}

export function findTerrainTransitions<T>(map: TransitionTile[][],
                                         materialFor: (cover: number, substrate: number) => T | undefined, extendSnowmelt = true,
                                         surfaceOf: (tile: TransitionTile) => number = terrainSurface) {
    const bucketSize = 4
    const columns = Math.ceil((map[0]?.length ?? 0) / bucketSize)
    const edges = new Map<number, Boundary<T>[]>()
    const directions = [[1, 0], [0, 1]] as const
    const corners = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const
    const isPath = (tile: TransitionTile) => tile.stonePath || tile.beigeStonePath
    const distance = (x: number, z: number, edge: Boundary<T>) => Math.hypot(
        Math.max(0, Math.abs(x - edge.x) - (edge.alongX ? 0.5 : 0)),
        Math.max(0, Math.abs(z - edge.z) - (edge.alongX ? 0 : 0.5)),
    )
    map.forEach((row, x) => row.forEach((tile, z) => {
        if (isPath(tile)) return
        for (const [dx, dz] of directions) {
            const neighbor = map[x + dx]?.[z + dz]
            if (!neighbor || isPath(neighbor) || neighbor.height !== tile.height) continue
            let cover = surfaceOf(tile), substrate = surfaceOf(neighbor)
            let material = materialFor(cover, substrate)
            if (!material) {
                [cover, substrate] = [substrate, cover]
                material = materialFor(cover, substrate)
            }
            if (!material) continue
            const edge = {x: x + dx / 2, z: z + dz / 2, height: tile.height, alongX: dz !== 0, cover, substrate, material}
            const key = Math.floor(x / bucketSize) * columns + Math.floor(z / bucketSize)
            const bucket = edges.get(key)
            if (bucket) bucket.push(edge)
            else edges.set(key, [edge])
        }
    }))
    return map.map((row, x) => row.map((tile, z) => {
        if (isPath(tile)) return undefined
        const type = surfaceOf(tile)
        const candidates: Boundary<T>[] = []
        const range = 4
        for (let bx = Math.floor(Math.max(0, x - range) / bucketSize); bx <= Math.floor((x + range) / bucketSize); bx++) {
            for (let bz = Math.floor(Math.max(0, z - range) / bucketSize); bz <= Math.min(columns - 1, Math.floor((z + range) / bucketSize)); bz++) {
                for (const edge of edges.get(bx * columns + bz) ?? []) {
                    if (edge.height === tile.height && (type === edge.cover || type === edge.substrate)) candidates.push(edge)
                }
            }
        }
        let nearest: Boundary<T> | undefined
        let reach = 2.5
        let snowmeltEdge: Boundary<T> | undefined
        let snowmeltReach = SNOWMELT_TILE_REACH
        const canExtendSnowmelt = extendSnowmelt && (type === 1 || type === 3 || type === 4)
        for (const edge of candidates) {
            const length = distance(x, z, edge)
            if (length < reach) {
                nearest = edge
                reach = length
            } else if (canExtendSnowmelt && edge.cover === TERRAIN_SNOW_SURFACE && length < snowmeltReach) {
                snowmeltEdge = edge
                snowmeltReach = length
            }
        }
        // Keep normal material transitions ahead of the optional meltwater extension.
        const snowmeltOnly = !nearest
        nearest ??= snowmeltEdge
        if (!nearest) return undefined
        const {cover, substrate, material} = nearest
        const samePair = candidates.filter(edge => edge.cover === cover && edge.substrate === substrate)
        const sign = type === cover ? 1 : -1
        const field = corners.map(([dx, dz]) =>
            sign * samePair.reduce((min, edge) => Math.min(min, distance(x + dx, z + dz, edge)), range))
        return {cover: type === cover, coverType: cover, substrateType: substrate, material, field, snowmeltOnly}
    }))
}
