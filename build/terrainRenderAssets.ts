import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'
import { decodeCompiledMap, TileFlags } from '../../../server/darkenlight_server/src/runtime/compiledMap'
import { muddyDirtLayout, terrainCoverLayout, TERRAIN_ATLAS_REGION_SIZE, visitTerrainAtlasPlacements } from '../src/babylon/world/terrainAtlasPlacement'
import {
    createTerrainRenderBuffer, decodeTerrainRenderData, terrainRenderAssetName,
    terrainRenderBaseBytes, terrainTransitionArea, TERRAIN_RENDER_BORDER, TERRAIN_RENDER_WORLD_BUDGET,
    TERRAIN_TRANSITION_FALLBACK, TERRAIN_TRANSITION_RECORD_BYTES, TERRAIN_TRANSITION_SNOWMELT_FLAG,
} from '../src/babylon/world/terrainRenderData'
import { isSnowRoof, outdoorSurfaceHeight, terrainRoofShape, terrainSurfaceAtlasType } from '../src/babylon/world/terrainRoofShape'
import { findTerrainTransitions, hasTerrainTransition, terrainSurface } from '../src/babylon/world/terrainTransitionField'

const size = TERRAIN_ATLAS_REGION_SIZE

export function compileTerrainRenderData(bytes: Uint8Array) {
    const {width, depth, indices, palette} = decodeCompiledMap(bytes)
    const tiles = palette.map(tile => ({
        type: tile.flags & TileFlags.deep || tile.type === 51 ? 50 : tile.type,
        height: tile.height,
        snowed: !!(tile.flags & TileFlags.snow),
        stonePath: !!(tile.flags & TileFlags.stone),
        beigeStonePath: !!(tile.flags & TileFlags.beige),
        deepWater: !!(tile.flags & TileFlags.deep) || tile.type === 51,
        deposit: !!(tile.flags & TileFlags.coal) || tile.ore > 0,
    }))
    const heights = tiles.map(outdoorSurfaceHeight)
    const inMap = (x: number, z: number) => x >= 0 && x < width && z >= 0 && z < depth
    const heightAt = (x: number, z: number) => inMap(x, z) ? heights[indices[x * depth + z]] : undefined
    const snowAt = (x: number, z: number) => inMap(x, z) && isSnowRoof(tiles[indices[x * depth + z]])
    const baseBytes = terrainRenderBaseBytes(width, depth)
    const extraBudget = TERRAIN_RENDER_WORLD_BUDGET - bytes.byteLength - baseBytes
    if (extraBudget < 0) throw new Error(`Terrain needs ${bytes.byteLength + baseBytes} B before transitions`)
    const buffer = createTerrainRenderBuffer(width, depth, extraBudget)
    const result = decodeTerrainRenderData(buffer, width, depth)
    let used = 0
    for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
            const key = x * depth + z
            const tile = tiles[indices[key]]
            if (tile.type <= 0 || heights[indices[key]] === undefined) continue
            result.shapes[key] = terrainRoofShape(x, z, tile, heights[indices[key]]!, heightAt, snowAt)
        }
    }
    const canBlend = (a: typeof tiles[number], b: typeof tiles[number]) => {
        if (a.height !== b.height || a.stonePath || a.beigeStonePath || b.stonePath || b.beigeStonePath) return false
        const first = terrainSurface(a), second = terrainSurface(b)
        return hasTerrainTransition(first, second) || hasTerrainTransition(second, first)
    }
    for (let x = 0; x < width; x += size) {
        for (let z = 0; z < depth; z += size) {
            const regionWidth = Math.min(size, width - x)
            const regionDepth = Math.min(size, depth - z)
            const byType = new Map<number, Map<number, number>>()
            for (let dx = 0; dx < regionWidth; dx++) {
                for (let dz = 0; dz < regionDepth; dz++) {
                    const tile = tiles[indices[(x + dx) * depth + z + dz]]
                    const atlasType = terrainSurfaceAtlasType(tile)
                    if (!(atlasType >= 1 && atlasType <= 5 || atlasType === 104) || tile.type === 50
                        || (tile.deposit && (tile.type !== 3 || tile.snowed))) continue
                    let remaining = byType.get(atlasType)
                    if (!remaining) byType.set(atlasType, remaining = new Map())
                    remaining.set(dx * regionDepth + dz, tile.height)
                }
            }
            for (const [type, remaining] of byType) {
                visitTerrainAtlasPlacements(remaining, regionDepth, regionWidth, x, z,
                    type === 1 || type === 4 ? muddyDirtLayout : terrainCoverLayout, type === 3 || type === 104,
                    false, (_, dx, dz, _height, code) => { result.atlas[(x + dx) * depth + z + dz] = code })
            }
            const left = Math.max(0, x - TERRAIN_RENDER_BORDER), top = Math.max(0, z - TERRAIN_RENDER_BORDER)
            const right = Math.min(width, x + size + TERRAIN_RENDER_BORDER), bottom = Math.min(depth, z + size + TERRAIN_RENDER_BORDER)
            const region = x / size * result.columns + z / size
            let hasContacts = false
            scan: for (let tx = left; tx < right; tx++) {
                for (let tz = top; tz < bottom; tz++) {
                    const index = tx * depth + tz
                    const tile = tiles[indices[index]]
                    if ((tx + 1 < right && canBlend(tile, tiles[indices[index + depth]]))
                        || (tz + 1 < bottom && canBlend(tile, tiles[indices[index + 1]]))) {
                        hasContacts = true
                        break scan
                    }
                }
            }
            if (!hasContacts) continue
            const window = Array.from({length: right - left}, (_, dx) =>
                Array.from({length: bottom - top}, (_, dz) => tiles[indices[(left + dx) * depth + top + dz]]))
            const field = findTerrainTransitions(window, hasTerrainTransition)
            const area = terrainTransitionArea(width, depth, x, z)
            const stride = area.bottom - area.top
            const start = used
            let count = 0
            used++ // One byte for the number of records in the region.
            write: for (let tx = area.left; tx < area.right; tx++) {
                for (let tz = area.top; tz < area.bottom; tz++) {
                    const tile = field[tx - left][tz - top]
                    if (!tile) continue
                    if (used + TERRAIN_TRANSITION_RECORD_BYTES > extraBudget) {
                        result.transitionOffsets[region] = TERRAIN_TRANSITION_FALLBACK
                        break write
                    }
                    result.transitionBytes.setUint8(used, (tx - area.left) * stride + tz - area.top)
                    const packedCover = tile.coverType | (tile.snowmeltOnly ? TERRAIN_TRANSITION_SNOWMELT_FLAG : 0)
                    result.transitionBytes.setUint8(used + 1, packedCover)
                    result.transitionBytes.setUint8(used + 2, tile.substrateType)
                    tile.field.forEach((value, index) => result.transitionBytes.setFloat32(used + 3 + index * 4, value, true))
                    used += TERRAIN_TRANSITION_RECORD_BYTES
                    count++
                }
            }
            if (!count || result.transitionOffsets[region] === TERRAIN_TRANSITION_FALLBACK) used = start
            else {
                result.transitionOffsets[region] = start + 1
                result.transitionBytes.setUint8(start, count)
            }
        }
    }
    return buffer.slice(0, baseBytes + used)
}

export function terrainRenderAssets(worldDir: string): Plugin {
    return {
        name: 'world-terrain-render-data',
        apply: 'build',
        generateBundle() {
            const manifest = JSON.parse(readFileSync(resolve(worldDir, 'manifest.json'), 'utf8'))
            const {worlds} = JSON.parse(readFileSync(resolve(worldDir, 'world.json'), 'utf8')) as {
                worlds: {id: number, environment?: {type?: string}}[]
            }
            const indoorWorlds = new Set(worlds.filter(world => world.environment?.type === 'indoor').map(world => world.id))
            const emitted = new Set<string>()
            for (const [worldId, path] of Object.entries<string>(manifest.terrainMaps)) {
                if (indoorWorlds.has(Number(worldId))) continue
                const expected = manifest.files[path]
                const bytes = readFileSync(resolve(worldDir, path))
                if (createHash('sha256').update(bytes).digest('hex') !== expected) {
                    this.error(`World ${worldId} terrain checksum mismatch`)
                }
                const asset = terrainRenderAssetName(expected)
                if (emitted.has(asset)) continue
                let render: ArrayBuffer
                try {
                    render = compileTerrainRenderData(bytes)
                } catch (error) {
                    this.error(`World ${worldId}: ${String(error)}`)
                }
                emitted.add(asset)
                this.emitFile({type: 'asset', fileName: `world/${asset}`, source: new Uint8Array(render)})
                this.info(`World ${worldId} terrain and render data: ${bytes.byteLength + render.byteLength} B`)
            }
        },
    }
}
