import { TERRAIN_ATLAS_REGION_SIZE } from './terrainAtlasPlacement'
import type { PavingStone, StonePathBounds } from './stonePathLayout'

const MAGIC = 0x33524c44 // DLR3
const HEADER_BYTES = 16
export const PAVING_RECORD_BYTES = 37
const PAVING_FIELDS = ['left', 'right', 'front', 'back', 'height', 'rise', 'seed', 'edge'] as const
export const TERRAIN_RENDER_WORLD_BUDGET = 10_000_000
export const TERRAIN_RENDER_BORDER = 5
export const TERRAIN_TRANSITION_RECORD_BYTES = 19
export const TERRAIN_TRANSITION_SNOWMELT_FLAG = 128
export const TERRAIN_TRANSITION_FALLBACK = 0xffffffff

// Bump the asset version when the format or precomputation rules change.
export function terrainRenderAssetName(mapHash: string) {
    return `assets/render/v7-${mapHash}.dlr`
}

export function terrainRenderBaseBytes(width: number, depth: number) {
    const regions = Math.ceil(width / TERRAIN_ATLAS_REGION_SIZE) * Math.ceil(depth / TERRAIN_ATLAS_REGION_SIZE)
    return HEADER_BYTES + width * depth * 4 + regions * 4
}

export function createTerrainRenderBuffer(width: number, depth: number, transitionBytes: number,
    paving: readonly {key: number, stone: PavingStone}[] = []) {
    const pavingStart = terrainRenderBaseBytes(width, depth) + transitionBytes
    const buffer = new ArrayBuffer(pavingStart + paving.length * PAVING_RECORD_BYTES)
    const header = new DataView(buffer)
    header.setUint32(0, MAGIC, true)
    header.setUint32(4, width, true)
    header.setUint32(8, depth, true)
    header.setUint32(12, pavingStart, true)
    paving.forEach(({key, stone}, index) => {
        const offset = pavingStart + index * PAVING_RECORD_BYTES
        header.setUint32(offset, key, true)
        PAVING_FIELDS.forEach((field, i) => header.setFloat32(offset + 4 + 4 * i, stone[field], true))
        header.setUint8(offset + 36, stone.variant | (stone.beige ? 8 : 0))
    })
    return buffer
}

export function decodeTerrainRenderData(buffer: ArrayBuffer, width: number, depth: number) {
    if (buffer.byteLength < HEADER_BYTES) throw new Error('Truncated terrain render data')
    const header = new DataView(buffer)
    const columns = Math.ceil(depth / TERRAIN_ATLAS_REGION_SIZE)
    const regions = Math.ceil(width / TERRAIN_ATLAS_REGION_SIZE) * columns
    const count = width * depth
    const base = terrainRenderBaseBytes(width, depth)
    const pavingStart = header.getUint32(12, true)
    if (header.getUint32(0, true) !== MAGIC || header.getUint32(4, true) !== width
        || header.getUint32(8, true) !== depth || pavingStart < base || pavingStart > buffer.byteLength
        || (buffer.byteLength - pavingStart) % PAVING_RECORD_BYTES !== 0) {
        throw new Error('Invalid terrain render data')
    }
    return {
        width, depth, columns,
        shapes: new Uint16Array(buffer, HEADER_BYTES, count),
        atlas: new Uint16Array(buffer, HEADER_BYTES + count * 2, count),
        transitionOffsets: new Uint32Array(buffer, HEADER_BYTES + count * 4, regions),
        transitionBytes: new DataView(buffer, base, pavingStart - base),
        pavingBytes: new DataView(buffer, pavingStart),
    }
}

export type TerrainRenderData = ReturnType<typeof decodeTerrainRenderData>

export function visitBakedPaving(data: TerrainRenderData, bounds: StonePathBounds,
    visit: (stone: PavingStone, x: number, z: number) => void) {
    const bytes = data.pavingBytes
    const count = bytes.byteLength / PAVING_RECORD_BYTES
    if (!count) return
    // Records are sorted by their owning tile in x-major order.
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const first = x * data.depth + bounds.minZ, last = x * data.depth + bounds.maxZ
        let index = 0, end = count
        while (index < end) {
            const middle = Math.floor((index + end) / 2)
            if (bytes.getUint32(middle * PAVING_RECORD_BYTES, true) < first) index = middle + 1
            else end = middle
        }
        for (let offset = index * PAVING_RECORD_BYTES; offset < bytes.byteLength; offset += PAVING_RECORD_BYTES) {
            const key = bytes.getUint32(offset, true)
            if (key > last) break
            const flags = bytes.getUint8(offset + 36)
            const stone = {variant: flags & 7, beige: !!(flags & 8)} as PavingStone
            PAVING_FIELDS.forEach((field, i) => { stone[field] = bytes.getFloat32(offset + 4 + 4 * i, true) })
            visit(stone, x, key - x * data.depth)
        }
    }
}

export function terrainTransitionArea(width: number, depth: number, x: number, z: number) {
    // Wall contacts can use the tile just outside the region.
    return {
        left: Math.max(0, x - 1), top: Math.max(0, z - 1),
        right: Math.min(width, x + TERRAIN_ATLAS_REGION_SIZE + 1), bottom: Math.min(depth, z + TERRAIN_ATLAS_REGION_SIZE + 1),
    }
}

export function visitBakedTerrainTransitions(data: TerrainRenderData, x: number, z: number,
    visit: (x: number, z: number, cover: number, substrate: number, field: number[], snowmeltOnly: boolean) => void) {
    const region = x / TERRAIN_ATLAS_REGION_SIZE * data.columns + z / TERRAIN_ATLAS_REGION_SIZE
    const start = data.transitionOffsets[region]
    if (!start) return true
    if (start === TERRAIN_TRANSITION_FALLBACK || start > data.transitionBytes.byteLength) return false
    const count = data.transitionBytes.getUint8(start - 1)
    const end = start + count * TERRAIN_TRANSITION_RECORD_BYTES
    if (end > data.transitionBytes.byteLength) return false
    const {left, top, bottom} = terrainTransitionArea(data.width, data.depth, x, z)
    const stride = bottom - top
    for (let offset = start; offset < end; offset += TERRAIN_TRANSITION_RECORD_BYTES) {
        const tile = data.transitionBytes.getUint8(offset)
        const packedCover = data.transitionBytes.getUint8(offset + 1)
        const cover = packedCover & ~TERRAIN_TRANSITION_SNOWMELT_FLAG
        const substrate = data.transitionBytes.getUint8(offset + 2)
        const field = Array.from({length: 4}, (_, i) => data.transitionBytes.getFloat32(offset + 3 + i * 4, true))
        visit(left + Math.floor(tile / stride), top + tile % stride, cover, substrate, field, !!(packedCover & TERRAIN_TRANSITION_SNOWMELT_FLAG))
    }
    return true
}
