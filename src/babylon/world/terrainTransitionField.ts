import type { RoofTile } from './terrainRoofShape'

export const TERRAIN_SNOW_SURFACE = 104
export const SNOWMELT_DISTANCE_SCALE = 1.35
export const SNOWMELT_MAX_DISTANCE = 2.55 * SNOWMELT_DISTANCE_SCALE
const SNOWMELT_TILE_REACH = SNOWMELT_MAX_DISTANCE + Math.SQRT1_2
export const SNOWMELT_DRY_DISTANCE = Math.ceil(SNOWMELT_TILE_REACH)
export const NO_SNOWMELT_FIELD = Array<number>(4).fill(SNOWMELT_DRY_DISTANCE)
export const terrainSurface = (tile: RoofTile) => tile.snowed ? TERRAIN_SNOW_SURFACE : tile.type
export function hasTerrainTransition(cover: number, substrate: number) {
    if (cover === TERRAIN_SNOW_SURFACE) return substrate >= 1 && substrate <= 5
    if (cover === 2 || cover === 5) return substrate === 1 || substrate === 3 || substrate === 4
    if (cover === 4) return substrate === 1 || substrate === 3
    return cover === 1 && substrate === 3
}

type Boundary<T> = {x: number, z: number, height: number, alongX: boolean, cover: number, substrate: number, material: T}
type TransitionTile = RoofTile & {height: number}
export type TerrainBoundaryField = {coverType: number, substrateType: number, field: number[]}
type TerrainTransition<T> = TerrainBoundaryField & {
    cover: boolean
    material: T
    snowmeltOnly: boolean
    snowmeltField?: number[]
    secondary?: TerrainBoundaryField
}

export function sharedTerrainSurface(first: TerrainBoundaryField, second: TerrainBoundaryField) {
    return second.coverType === first.coverType || second.substrateType === first.coverType ? first.coverType : first.substrateType
}

export function findTerrainTransitions<T>(map: TransitionTile[][],
                                         materialFor: (cover: number, substrate: number) => T | undefined, extendSnowmelt = true,
                                         surfaceOf: (tile: TransitionTile) => number = terrainSurface): (TerrainTransition<T> | undefined)[][] {
    const bucketSize = 4
    const columns = Math.ceil((map[0]?.length ?? 0) / bucketSize)
    const edges = new Map<number, Boundary<T>[]>()
    const directions = [[1, 0], [0, 1]] as const
    const corners = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const
    const distance = (x: number, z: number, edge: Boundary<T>) => Math.hypot(
        Math.max(0, Math.abs(x - edge.x) - (edge.alongX ? 0.5 : 0)),
        Math.max(0, Math.abs(z - edge.z) - (edge.alongX ? 0 : 0.5)),
    )
    map.forEach((row, x) => row.forEach((tile, z) => {
        for (const [dx, dz] of directions) {
            const neighbor = map[x + dx]?.[z + dz]
            if (!neighbor || neighbor.height !== tile.height) continue
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
        const type = surfaceOf(tile)
        const candidates: Boundary<T>[] = []
        const snowEdges: Boundary<T>[] = []
        const canExtendSnowmelt = extendSnowmelt && (type === TERRAIN_SNOW_SURFACE || (type >= 1 && type <= 5))
        const range = extendSnowmelt ? SNOWMELT_DRY_DISTANCE : 4
        for (let bx = Math.floor(Math.max(0, x - range) / bucketSize); bx <= Math.floor((x + range) / bucketSize); bx++) {
            for (let bz = Math.floor(Math.max(0, z - range) / bucketSize); bz <= Math.min(columns - 1, Math.floor((z + range) / bucketSize)); bz++) {
                for (const edge of edges.get(bx * columns + bz) ?? []) {
                    if (edge.height !== tile.height) continue
                    candidates.push(edge)
                    if (canExtendSnowmelt && edge.cover === TERRAIN_SNOW_SURFACE) snowEdges.push(edge)
                }
            }
        }
        let nearest: Boundary<T> | undefined
        let reach = 2.5
        for (const edge of candidates) {
            if (type !== edge.cover && type !== edge.substrate) continue
            const length = distance(x, z, edge)
            if (length < reach) {
                nearest = edge
                reach = length
            }
        }
        const distances = (boundaries: Boundary<T>[]) => corners.map(([dx, dz]) =>
            boundaries.reduce((min, edge) => Math.min(min, distance(x + dx, z + dz, edge)), range))
        const fieldFor = (edge: Boundary<T>, surface: number): TerrainBoundaryField => {
            const {cover, substrate} = edge
            const field = distances(candidates.filter(candidate => candidate.cover === cover && candidate.substrate === substrate))
            if (surface !== cover) for (let i = 0; i < field.length; i++) field[i] = -field[i]
            return {coverType: cover, substrateType: substrate, field}
        }
        // Runoff follows the nearest snow edge even where a different material pair owns the tile.
        const snowmeltField = snowEdges.some(edge => distance(x, z, edge) < SNOWMELT_TILE_REACH)
            ? distances(snowEdges) : undefined
        if (!nearest) {
            if (!snowmeltField || type === TERRAIN_SNOW_SURFACE) return undefined
            const material = materialFor(TERRAIN_SNOW_SURFACE, type)
            if (!material) return undefined
            return {cover: false, coverType: TERRAIN_SNOW_SURFACE, substrateType: type, material,
                field: NO_SNOWMELT_FIELD.map(value => -value), snowmeltOnly: true, snowmeltField}
        }
        const {cover, substrate, material} = nearest
        // Close to a junction, keep a second pair sharing one of the first pair's materials.
        let secondaryEdge: Boundary<T> | undefined
        let secondaryReach = 2.5
        for (const edge of candidates) {
            if (edge.cover === cover && edge.substrate === substrate) continue
            if (edge.cover !== cover && edge.cover !== substrate && edge.substrate !== cover && edge.substrate !== substrate) continue
            const length = distance(x, z, edge)
            if (length < secondaryReach) {
                secondaryEdge = edge
                secondaryReach = length
            }
        }
        const primary = fieldFor(nearest, type)
        const secondary = secondaryEdge && fieldFor(secondaryEdge,
            type === secondaryEdge.cover || type === secondaryEdge.substrate ? type
                : secondaryEdge.cover === cover || secondaryEdge.substrate === cover ? cover : substrate)
        return {...primary, cover: type === cover, material, snowmeltOnly: false, snowmeltField, secondary}
    }))
}
