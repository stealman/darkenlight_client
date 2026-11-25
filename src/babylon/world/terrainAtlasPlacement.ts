export const TERRAIN_ATLAS_TILES = 16
export const TERRAIN_ATLAS_REGION_SIZE = 12
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

type Pattern = {size: number, origins: readonly (readonly number[])[]}
type FinishPatch = (x: number, z: number, height: number, size: number, firstCell: number, turn: number) => void

type AtlasPlacement = {size: number, height: number, variant: number, turn: number}

function firstAvailableChoice(start: number, count: number, used: ReadonlySet<number>) {
    for (let offset = 0; offset < count; offset++) {
        const choice = (start + offset) % count
        if (!used.has(choice)) return choice
    }
    return start
}

function variedPatchPlacement(placed: ReadonlyMap<number, AtlasPlacement>, stride: number, width: number,
                              x: number, z: number, size: number, height: number, variants: number, hash: number,
                              sameRegion: (x: number, z: number, nx: number, nz: number) => boolean) {
    // Mix the grid hash before choosing a variant and a quarter-turn from different bits.
    const mixed = Math.imul(hash ^ (hash >>> 16), 0x7feb352d)
    const seed = (mixed ^ (mixed >>> 15)) >>> 0
    const usedVariants = new Set<number>()
    const usedTurns = new Set<number>()
    const visit = (nx: number, nz: number) => {
        if (nx < 0 || nz < 0 || nx >= width || nz >= stride || !sameRegion(x, z, nx, nz)) return
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

export function terrainAtlasLayout(patterns: readonly Pattern[]) {
    const cells: (readonly [number, number])[] = [[0, 0]]
    const patchSizes: number[] = []
    for (const {size, origins} of patterns) {
        for (const [u, v] of origins) {
            patchSizes[cells.length] = size
            for (let dx = 0; dx < size; dx++) {
                for (let dz = 0; dz < size; dz++) cells.push([u + dx, TERRAIN_ATLAS_TILES - v - size + dz])
            }
        }
    }
    return {patterns, cells, patchSizes}
}

export const muddyDirtLayout = terrainAtlasLayout(muddyDirtPatterns)
export const terrainCoverLayout = terrainAtlasLayout(terrainCoverPatterns)

function rotatedPatchOffset(dx: number, dz: number, last: number, turn: number) {
    return turn === 0 ? [dx, dz] : turn === 1 ? [dz, last - dx]
        : turn === 2 ? [last - dx, last - dz] : [last - dz, dx]
}

// The exported atlas stores cells rather than patch records. Confirm the whole
// rotated code sequence before joining tiles into a patch.
export function visitBakedTerrainAtlasPatches(remaining: Map<number, number>, stride: number, width: number,
    layout: ReturnType<typeof terrainAtlasLayout>, includeTile: (x: number, z: number) => boolean,
    readCode: (x: number, z: number) => number, visit: (key: number, x: number, z: number, height: number, code: number) => void,
    finishPatch: FinishPatch) {
    for (const [key, height] of remaining) {
        const x = Math.floor(key / stride), z = key % stride
        if (!includeTile(x, z)) continue
        const code = readCode(x, z)
        const cell = code >> 2
        const size = layout.patchSizes[cell]
        if (size === undefined || size < 2) continue
        const turn = code & 3
        const [offsetX, offsetZ] = rotatedPatchOffset(0, 0, size - 1, turn)
        const left = x - offsetX, top = z - offsetZ
        if (left < 0 || top < 0 || left + size > width || top + size > stride) continue
        let complete = true
        for (let dx = 0; dx < size && complete; dx++) {
            for (let dz = 0; dz < size && complete; dz++) {
                const [rx, rz] = rotatedPatchOffset(dx, dz, size - 1, turn)
                const tx = left + rx, tz = top + rz
                complete = includeTile(tx, tz) && remaining.get(tx * stride + tz) === height
                    && readCode(tx, tz) === (((cell + dx * size + dz) << 2) | turn)
            }
        }
        if (!complete) continue
        for (let tx = left; tx < left + size; tx++) {
            for (let tz = top; tz < top + size; tz++) {
                const tile = tx * stride + tz
                remaining.delete(tile)
                visit(tile, tx, tz, height, readCode(tx, tz))
            }
        }
        finishPatch(left, top, height, size, cell, turn)
    }
}

export function visitTerrainAtlasPlacements(remaining: Map<number, number>, stride: number, width: number,
    originX: number, originZ: number, layout: ReturnType<typeof terrainAtlasLayout>, varyPatches: boolean,
    groupByRegion: boolean, visit: (key: number, x: number, z: number, height: number, code: number) => void,
    finishPatch?: FinishPatch) {
    const placed = varyPatches ? new Map<number, AtlasPlacement>() : undefined
    const sameRegion = (x: number, z: number, nx: number, nz: number) => !groupByRegion ||
        (Math.floor((x + originX) / TERRAIN_ATLAS_REGION_SIZE) === Math.floor((nx + originX) / TERRAIN_ATLAS_REGION_SIZE)
        && Math.floor((z + originZ) / TERRAIN_ATLAS_REGION_SIZE) === Math.floor((nz + originZ) / TERRAIN_ATLAS_REGION_SIZE))
    let firstCell = 1
    for (const {size, origins} of layout.patterns) {
        const last = size - 1
        for (const [key, height] of remaining) {
            const x = Math.floor(key / stride)
            const z = key % stride
            if (x + size > width || z + size > stride || !sameRegion(x, z, x + last, z + last)) continue
            let fits = true
            for (let dx = 0; dx < size && fits; dx++) {
                for (let dz = 0; dz < size && fits; dz++) fits = remaining.get(key + dx * stride + dz) === height
            }
            if (!fits) continue
            const hash = Math.imul(x + originX + 1, 73856093) ^ Math.imul(z + originZ + 1, 19349663)
            const appearance = placed && variedPatchPlacement(placed, stride, width, x, z, size, height, origins.length, hash, sameRegion)
            const variant = appearance?.variant ?? (hash >>> 5) % origins.length
            const turn = appearance?.turn ?? ((hash >>> 12) & 3)
            const patchCell = firstCell + variant * size * size
            for (let dx = 0; dx < size; dx++) {
                for (let dz = 0; dz < size; dz++) {
                    remaining.delete(key + dx * stride + dz)
                    const [rx, rz] = rotatedPatchOffset(dx, dz, last, turn)
                    const tileX = x + rx
                    const tileZ = z + rz
                    const tileKey = tileX * stride + tileZ
                    if (appearance) placed!.set(tileKey, appearance)
                    const cell = patchCell + dx * size + dz
                    visit(tileKey, tileX, tileZ, height, (cell << 2) | turn)
                }
            }
            finishPatch?.(x, z, height, size, patchCell, turn)
        }
        firstCell += origins.length * size * size
    }
}
