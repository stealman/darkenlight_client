import { TERRAIN_ATLAS_REGION_SIZE } from './terrainAtlasPlacement'

const MAGIC = 0x32524c44 // DLR2
const HEADER_BYTES = 12
export const TERRAIN_RENDER_WORLD_BUDGET = 10_000_000
export const TERRAIN_RENDER_BORDER = 5
export const TERRAIN_TRANSITION_RECORD_BYTES = 19
export const TERRAIN_TRANSITION_SNOWMELT_FLAG = 128
export const TERRAIN_TRANSITION_FALLBACK = 0xffffffff

// Bump the asset version when the format or precomputation rules change.
export function terrainRenderAssetName(mapHash: string) {
    return `assets/render/v2-${mapHash}.dlr`
}

export function terrainRenderBaseBytes(width: number, depth: number) {
    const regions = Math.ceil(width / TERRAIN_ATLAS_REGION_SIZE) * Math.ceil(depth / TERRAIN_ATLAS_REGION_SIZE)
    return HEADER_BYTES + width * depth * 4 + regions * 4
}

export function createTerrainRenderBuffer(width: number, depth: number, extraBytes: number) {
    const buffer = new ArrayBuffer(terrainRenderBaseBytes(width, depth) + extraBytes)
    const header = new DataView(buffer)
    header.setUint32(0, MAGIC, true)
    header.setUint32(4, width, true)
    header.setUint32(8, depth, true)
    return buffer
}

export function decodeTerrainRenderData(buffer: ArrayBuffer, width: number, depth: number) {
    if (buffer.byteLength < HEADER_BYTES) throw new Error('Truncated terrain render data')
    const header = new DataView(buffer)
    const columns = Math.ceil(depth / TERRAIN_ATLAS_REGION_SIZE)
    const regions = Math.ceil(width / TERRAIN_ATLAS_REGION_SIZE) * columns
    const count = width * depth
    if (header.getUint32(0, true) !== MAGIC || header.getUint32(4, true) !== width
        || header.getUint32(8, true) !== depth || buffer.byteLength < terrainRenderBaseBytes(width, depth)) {
        throw new Error('Invalid terrain render data')
    }
    return {
        width, depth, columns,
        shapes: new Uint16Array(buffer, HEADER_BYTES, count),
        atlas: new Uint16Array(buffer, HEADER_BYTES + count * 2, count),
        transitionOffsets: new Uint32Array(buffer, HEADER_BYTES + count * 4, regions),
        transitionBytes: new DataView(buffer, terrainRenderBaseBytes(width, depth)),
    }
}

export type TerrainRenderData = ReturnType<typeof decodeTerrainRenderData>

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
