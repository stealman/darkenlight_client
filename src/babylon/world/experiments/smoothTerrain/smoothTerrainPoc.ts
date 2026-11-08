import { Mesh, Scene, TransformNode, VertexData } from '@babylonjs/core'
import type { MapBlock } from '@/data/worldDataManager'
import { Materials, PlaneEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { Settings } from '@/settings/settings'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'
import { ActiveMeshFreezer } from '@/babylon/scene/activeMeshFreezer'
import { MyPlayer } from '@/data/myPlayer'
import { bakeTerrainAtlas, bevelTerrainSurfaces, TerrainSurface } from './terrainSurfaceBevel'

const CORNER_VARIATION = 0.12
const SURFACE_LAYER_SCALE = 0.5
const SNOW_LAYER_HEIGHT = 0.04
// Tile width/depth of a render chunk. Change here (for example 8, 16 or 32)
// and reload; geometry, visibility masks and normal halos follow this value.
export const SMOOTH_TERRAIN_CHUNK_SIZE = 24
const CHUNK_SIZE = SMOOTH_TERRAIN_CHUNK_SIZE
const MAX_CACHED_CHUNKS = 64

interface TerrainChunk {
    x: number
    z: number
    mesh: Mesh
    inputs: number[]
    lastUsed: number
    hasGeometry: boolean
    fullIndices: number[]
    tileRanges: Int32Array
    visibleTiles: Uint8Array | null
}

interface WantedChunk {
    x: number
    z: number
    tiles: Uint8Array
}

// Loaded exclusively by terrainExperiment.ts for ?terrain=smooth.
// Deliberately uses the existing viewport/data refresh instead of a second
// camera-following DynamicTerrain update loop. No gameplay heights are changed.
export const SmoothTerrainPoc = {
    scene: null as Scene | null,
    parent: null as TransformNode | null,
    chunks: new Map<string, TerrainChunk>(),
    wanted: new Map<string, WantedChunk>(),
    blockMap: null as MapBlock[][] | null,
    worldId: -1,
    generation: 0,
    positions: [] as number[],
    indices: [] as number[],
    uvs: [] as number[],
    offsets: [] as number[],
    normalKeys: [] as string[],

    initialize(scene: Scene, parent: TransformNode | null) {
        this.clearChunks()
        this.scene = scene
        this.parent = parent

    },

    begin() {
        this.wanted.clear()
    },

    clearGeometry() {
        this.positions.length = this.indices.length = this.uvs.length = this.offsets.length = this.normalKeys.length = 0
    },

    disposeChunk(chunk: TerrainChunk) {
        Lights.unregisterSharedLightMesh(chunk.mesh)
        chunk.mesh.dispose()
    },

    clearChunks() {
        this.chunks.forEach(chunk => this.disposeChunk(chunk))
        this.chunks.clear()
    },

    requestTile(x: number, z: number) {
        const cx = Math.floor(x / CHUNK_SIZE) * CHUNK_SIZE
        const cz = Math.floor(z / CHUNK_SIZE) * CHUNK_SIZE
        const key = `${cx};${cz}`
        let wanted = this.wanted.get(key)
        if (!wanted) {
            wanted = { x: cx, z: cz, tiles: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE) }
            this.wanted.set(key, wanted)
        }
        // Requests already pass the existing height-aware viewport filter and
        // its two-tile tolerance. Keep that reserve when clipping chunk edges.
        wanted.tiles[(x - cx) * CHUNK_SIZE + z - cz] = 1
    },

    // Exact numeric snapshots avoid hash collisions and catch all render inputs,
    // including in-place edits, snow masks and building floors. Two extra tiles
    // cover the normal halo and its corner-height dependencies.
    collectInputs(map: MapBlock[][], x: number, z: number, snowMask: Set<number>) {
        const inputs: number[] = []
        for (let tx = x - 2; tx < x + CHUNK_SIZE + 2; tx++) {
            for (let tz = z - 2; tz < z + CHUNK_SIZE + 2; tz++) {
                const block = map[tx]?.[tz]
                if (!block) { inputs.push(-1); continue }
                inputs.push(block.type, block.height, block.heightOffset,
                    (block.snowed ? 1 : 0) | (block.stonePath ? 2 : 0) | (block.beigeStonePath ? 4 : 0)
                    | (block.minableCoal ? 8 : 0) | (block.minableOreAvailable ? 16 : 0)
                    | (snowMask.has(tx * map.length + tz) ? 32 : 0)
                    | (BuildingManager.hasFloorAtTile(tx, tz) ? 64 : 0))
            }
        }
        return inputs
    },

    accepts(block: MapBlock, x: number, z: number) {
        return !Lights.indoor && block.type >= 1 && block.type <= 5
            && !block.minableCoal && !block.minableOreAvailable
            && !block.stonePath && !block.beigeStonePath && !BuildingManager.hasFloorAtTile(x, z)
    },

    cornerNoise(x: number, z: number) {
        let hash = Math.imul(MyPlayer.worldId, 73856093) ^ Math.imul(x, 19349663) ^ Math.imul(z, 83492791)
        hash = Math.imul(hash ^ (hash >>> 16), 2246822519)
        hash = Math.imul(hash ^ (hash >>> 13), 3266489917)
        return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295 * 2 - 1
    },

    appendTile(map: MapBlock[][], x: number, z: number, hideSnow: boolean, renderType: number | undefined, snowMask: Set<number>) {
        const block = map[x][z]
        const height = (tile: MapBlock, tx: number, tz: number) => {
            if (tile.stonePath || tile.beigeStonePath) return tile.height
            if (tile.snowed && snowMask.has(tx * map.length + tz)) return tile.height
            const raised = this.accepts(tile, tx, tz) && (tile.snowed || tile.type === 2 || tile.type === 5)
            return tile.height + (raised && tile.snowed ? SNOW_LAYER_HEIGHT : tile.heightOffset * (raised ? SURFACE_LAYER_SCALE : 1))
        }
        const center = height(block, x, z)
        const corner = (cx: number, cz: number) => {
            let sum = 0, count = 0
            let minHeight = Infinity, maxHeight = -Infinity
            let minSurface = Infinity, maxSurface = -Infinity
            let naturalCorner = true
            for (let dx = -1; dx <= 0; dx++) {
                for (let dz = -1; dz <= 0; dz++) {
                    const tile = map[cx + dx]?.[cz + dz]
                    if (!tile || !this.accepts(tile, cx + dx, cz + dz)) naturalCorner = false
                    if (tile?.type > 0) {
                        const surface = height(tile, cx + dx, cz + dz)
                        sum += surface
                        count++
                        minHeight = Math.min(minHeight, tile.height)
                        maxHeight = Math.max(maxHeight, tile.height)
                        minSurface = Math.min(minSurface, surface)
                        maxSurface = Math.max(maxSurface, surface)
                    }
                }
            }
            const average = count ? sum / count : center
            // Only actual data height breaks get noise, never flat ground or
            // material/snow offsets. All four tiles calculate the same corner;
            // retained geometry and unloaded boundaries keep their old shape.
            if (!naturalCorner || maxHeight === minHeight) return average
            const amplitude = Math.min(CORNER_VARIATION, (maxHeight - minHeight) * CORNER_VARIATION)
            return Math.max(minSurface, Math.min(maxSurface, average + this.cornerNoise(cx, cz) * amplitude))
        }
        const a = corner(x, z), b = corner(x + 1, z)
        const c = corner(x, z + 1), d = corner(x + 1, z + 1)
        const uv = PlaneEnum1.getPlaneForBlock(block, hideSnow, renderType)
        const start = this.positions.length / 3
        // A 3x3 patch shares edge heights with adjacent tiles and keeps its
        // centre at the authoritative tile height (actors and statics anchor here).
        for (let j = 0; j <= 2; j++) {
            for (let i = 0; i <= 2; i++) {
                const u = i / 2, v = j / 2
                const y = i === 1 && j === 1 ? center
                    : a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
                this.positions.push(x - 0.5 + u, y, z - 0.5 + v)
                this.uvs.push(x + u, 1 - z - v)
                this.offsets.push(uv.x, uv.y)
                this.normalKeys.push(`${2 * x + i};${2 * z + j}`)
            }
        }
        for (let j = 0; j < 2; j++) {
            for (let i = 0; i < 2; i++) {
                const k = start + j * 3 + i
                // Babylon's default left-handed winding: surface normals face +Y.
                this.indices.push(k, k + 1, k + 3, k + 1, k + 4, k + 3)
            }
        }
        // Close the exposed boundary against water, retained blocks and the
        // unloaded map. Interior edges need no walls: their vertices coincide.
        const edges = [
            { dx: -1, dz: 0, vertices: [0, 3, 6] },
            { dx: 1, dz: 0, vertices: [8, 5, 2] },
            { dx: 0, dz: -1, vertices: [2, 1, 0] },
            { dx: 0, dz: 1, vertices: [6, 7, 8] },
        ]
        for (const edge of edges) {
            const neighbor = map[x + edge.dx]?.[z + edge.dz]
            if (neighbor && this.accepts(neighbor, x + edge.dx, z + edge.dz)) continue
            const bottom = neighbor?.type > 0 ? height(neighbor, x + edge.dx, z + edge.dz) : center - 1
            for (let segment = 0; segment < 2; segment++) {
                const first = (start + edge.vertices[segment]) * 3
                const second = (start + edge.vertices[segment + 1]) * 3
                const base = this.positions.length / 3
                for (const [source, lower] of [[first, false], [second, false], [first, true], [second, true]] as const) {
                    this.positions.push(this.positions[source], lower ? bottom : this.positions[source + 1], this.positions[source + 2])
                    this.uvs.push(source === first ? 0 : 1, lower ? 0 : 1)
                    this.offsets.push(uv.x, uv.y)
                    this.normalKeys.push(`wall;${base};${this.normalKeys.length}`)
                }
                this.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
            }
        }
    },

    rebuildChunk(chunk: TerrainChunk, map: MapBlock[][], snowMask: Set<number>) {
        this.clearGeometry()
        const append = (x: number, z: number) => {
            const block = map[x]?.[z]
            if (!block || !this.accepts(block, x, z)) return
            const hideSnow = block.snowed && snowMask.has(x * map.length + z)
            this.appendTile(map, x, z, hideSnow, hideSnow && (block.type === 2 || block.type === 5) ? 1 : undefined, snowMask)
        }
        // Generate neighboring tiles only for normal averaging. They are never
        // uploaded or drawn, so adjacent chunks have identical edge lighting.
        for (let x = chunk.x - 1; x <= chunk.x + CHUNK_SIZE; x++) {
            for (let z = chunk.z - 1; z <= chunk.z + CHUNK_SIZE; z++) {
                if (x < chunk.x || z < chunk.z || x === chunk.x + CHUNK_SIZE || z === chunk.z + CHUNK_SIZE) append(x, z)
            }
        }
        const indexStart = this.indices.length
        const tileGeometry = new Int32Array(CHUNK_SIZE * CHUNK_SIZE * 3)
        chunk.tileRanges.fill(0)
        chunk.visibleTiles = null
        for (let x = chunk.x; x < chunk.x + CHUNK_SIZE; x++) {
            for (let z = chunk.z; z < chunk.z + CHUNK_SIZE; z++) {
                const tile = (x - chunk.x) * CHUNK_SIZE + z - chunk.z
                const start = this.indices.length
                tileGeometry[tile * 3] = this.positions.length / 3
                append(x, z)
                tileGeometry[tile * 3 + 1] = start
                tileGeometry[tile * 3 + 2] = this.indices.length - start
            }
        }
        if (this.indices.length === indexStart) {
            chunk.hasGeometry = false
            chunk.fullIndices = []
            chunk.mesh.setEnabled(false)
            return
        }
        const normals: number[] = []
        VertexData.ComputeNormals(this.positions, this.indices, normals)
        // Weld lighting across duplicated atlas vertices without interpolating
        // UV offsets across different terrain types.
        const sums = new Map<string, number[]>()
        this.normalKeys.forEach((key, i) => {
            const n = sums.get(key) ?? [0, 0, 0]
            for (let axis = 0; axis < 3; axis++) n[axis] += normals[i * 3 + axis]
            sums.set(key, n)
        })
        this.normalKeys.forEach((key, i) => {
            const n = sums.get(key)!
            const length = Math.hypot(...n) || 1
            for (let axis = 0; axis < 3; axis++) normals[i * 3 + axis] = n[axis] / length
        })
        const drawIndices: number[] = []
        for (let tile = 0; tile < CHUNK_SIZE * CHUNK_SIZE; tile++) {
            const vertex = tileGeometry[tile * 3]
            const start = tileGeometry[tile * 3 + 1]
            const count = tileGeometry[tile * 3 + 2]
            chunk.tileRanges[tile * 2] = drawIndices.length
            if (!count) continue
            const y = this.positions[vertex * 3 + 1]
            let flat = true
            for (let i = vertex; i < vertex + 9; i++) {
                // Preserve the detailed boundary beside slopes: removing an
                // edge midpoint with a tilted normal would change lighting
                // interpolation on only one side of the shared edge.
                if (Math.abs(this.positions[i * 3 + 1] - y) > 1e-6
                    || Math.abs(normals[i * 3]) > 1e-6
                    || Math.abs(normals[i * 3 + 1] - 1) > 1e-6
                    || Math.abs(normals[i * 3 + 2]) > 1e-6) {
                    flat = false
                    break
                }
            }
            if (flat) {
                drawIndices.push(vertex, vertex + 2, vertex + 6, vertex + 2, vertex + 8, vertex + 6)
            }
            // First 24 indices are the original eight top triangles. Keep all
            // skirts and retain that top topology where height or lighting bends.
            for (let index = start + (flat ? 24 : 0); index < start + count; index++) {
                drawIndices.push(this.indices[index])
            }
            chunk.tileRanges[tile * 2 + 1] = drawIndices.length - chunk.tileRanges[tile * 2]
        }
        const data = new VertexData()
        const positions: number[] = [], compactNormals: number[] = [], uvs: number[] = [], offsets: number[] = []
        const blend: number[] = []
        const remap: number[] = []
        const shared = new Map<string, number>()
        for (const i of drawIndices) {
            if (remap[i] !== undefined) continue
            // normalKeys keeps hard wall edges separate. Different atlas cells
            // still need separate vertices; UVs are continuous within each cell.
            const key = `${this.normalKeys[i]};${this.offsets[i * 2]};${this.offsets[i * 2 + 1]}`
            let index = shared.get(key)
            if (index === undefined) {
                index = positions.length / 3
                shared.set(key, index)
                positions.push(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2])
                compactNormals.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2])
                uvs.push(this.uvs[i * 2], this.uvs[i * 2 + 1])
                offsets.push(this.offsets[i * 2], this.offsets[i * 2 + 1])
                blend.push(this.normalKeys[i].startsWith('wall;') ? 0 : 1)
            }
            remap[i] = index
        }
        const geometry = { positions, normals: compactNormals, uvs, offsets, blend, indices: drawIndices.map(index => remap[index]) }
        const surfaces = new Map<string, TerrainSurface>()
        const surfaceAt = (x: number, z: number) => {
            const key = `${x};${z}`
            const cached = surfaces.get(key)
            if (cached) return cached
            const block = map[x]?.[z]
            const valid = !!block && this.accepts(block, x, z)
            const hidden = block?.snowed && snowMask.has(x * map.length + z)
            const layer = valid && !hidden && (block.snowed || block.type === 2 || block.type === 5)
                ? block.snowed ? SNOW_LAYER_HEIGHT : block.heightOffset * SURFACE_LAYER_SCALE : 0
            const renderType = hidden && (block?.type === 2 || block?.type === 5) ? 1 : block?.type
            const uv = valid ? PlaneEnum1.getPlaneForBlock(block, !!hidden, renderType) : null
            const surface: TerrainSurface = { valid, layer,
                type: valid ? renderType + (block.snowed && !hidden ? 100 : 0) : -1,
                cell: uv ? [uv.x, uv.y] : [0, 0] }
            surfaces.set(key, surface)
            return surface
        }
        const cornerLayers = new Map<string, number>()
        const cornerLayer = (x: number, z: number) => {
            const key = `${x};${z}`
            const cached = cornerLayers.get(key)
            if (cached !== undefined) return cached
            let sum = 0, count = 0
            for (let dx = -1; dx <= 0; dx++) for (let dz = -1; dz <= 0; dz++) {
                if (map[x + dx]?.[z + dz]?.type > 0) { sum += surfaceAt(x + dx, z + dz).layer; count++ }
            }
            const layer = count ? sum / count : 0
            cornerLayers.set(key, layer)
            return layer
        }
        bevelTerrainSurfaces(geometry, chunk.tileRanges, chunk.x, chunk.z, CHUNK_SIZE, surfaceAt, (tx, tz, x, z) => {
            const u = x - tx + 0.5, v = z - tz + 0.5
            if (u === 0.5 && v === 0.5) return surfaceAt(tx, tz).layer
            return cornerLayer(tx, tz) * (1 - u) * (1 - v) + cornerLayer(tx + 1, tz) * u * (1 - v)
                + cornerLayer(tx, tz + 1) * (1 - u) * v + cornerLayer(tx + 1, tz + 1) * u * v
        })
        const atlasGeometry = bakeTerrainAtlas(geometry, chunk.tileRanges, chunk.x, chunk.z, CHUNK_SIZE)
        data.positions = atlasGeometry.positions
        data.indices = atlasGeometry.indices
        chunk.fullIndices = data.indices
        data.normals = atlasGeometry.normals
        data.uvs = atlasGeometry.uvs
        data.applyToMesh(chunk.mesh, true)
        chunk.mesh.setVerticesData('uvc', atlasGeometry.offsets, true, 2)
        chunk.mesh.refreshBoundingInfo()
        Lights.updateSharedLightMesh(chunk.mesh)
        chunk.mesh.setEnabled(true)
        chunk.hasGeometry = true
        // applyToMesh recreates submeshes even when the mesh stays enabled.
        // The frozen render queues otherwise keep the disposed old submesh
        // until an unrelated visibility change invalidates the active list.
        ActiveMeshFreezer.invalidate()
    },

    updateVisibleTiles(chunk: TerrainChunk, tiles: Uint8Array) {
        if (!chunk.hasGeometry) return
        const previous = chunk.visibleTiles
        if (previous && tiles.every((value, i) => value === previous[i])) {
            chunk.mesh.setEnabled(chunk.mesh.getTotalIndices() > 0)
            return
        }
        const indices: number[] = []
        for (let tile = 0; tile < tiles.length; tile++) {
            if (!tiles[tile]) continue
            const start = chunk.tileRanges[tile * 2]
            const end = start + chunk.tileRanges[tile * 2 + 1]
            for (let index = start; index < end; index++) indices.push(chunk.fullIndices[index])
        }
        // Only the draw list changes on movement. Positions, UVs, normals and
        // their GPU buffers stay intact. Includes each selected tile's skirts.
        chunk.mesh.updateIndices(indices)
        chunk.visibleTiles = tiles
        chunk.mesh.setEnabled(indices.length > 0)
        // Babylon can recreate the submesh when index count changes. Refresh
        // frozen queues just as for a geometry rebuild, avoiding stale draws.
        ActiveMeshFreezer.invalidate()
    },

    finish(map: MapBlock[][], snowMask: Set<number>) {
        if (!this.scene) return
        if (this.worldId !== MyPlayer.worldId || this.blockMap !== map) {
            this.clearChunks()
            this.worldId = MyPlayer.worldId
            this.blockMap = map
        }
        this.generation++
        this.chunks.forEach((chunk, key) => {
            if (!this.wanted.has(key)) chunk.mesh.setEnabled(false)
        })
        this.wanted.forEach(({ x, z, tiles }, key) => {
            const inputs = this.collectInputs(map, x, z, snowMask)
            let chunk = this.chunks.get(key)
            if (!chunk) {
                const mesh = new Mesh(`smooth_terrain_${x}_${z}`, this.scene!)
                mesh.parent = this.parent
                mesh.material = Materials.planeMaterial
                mesh.receiveShadows = Settings.isShadowsEnabled()
                mesh.setEnabled(false)
                Lights.registerSharedLightMesh(mesh)
                // Receive object shadows, but omit terrain from shadow-map passes.
                chunk = {
                    x, z, mesh, inputs: [], lastUsed: this.generation, hasGeometry: false,
                    fullIndices: [], tileRanges: new Int32Array(CHUNK_SIZE * CHUNK_SIZE * 2), visibleTiles: null,
                }
                this.chunks.set(key, chunk)
            }
            chunk.lastUsed = this.generation
            if (inputs.length !== chunk.inputs.length || inputs.some((value, i) => !Object.is(value, chunk!.inputs[i]))) {
                this.rebuildChunk(chunk, map, snowMask)
                chunk.inputs = inputs
            }
            this.updateVisibleTiles(chunk, tiles)
        })
        if (this.chunks.size > MAX_CACHED_CHUNKS) {
            const unused = [...this.chunks.entries()].filter(([key]) => !this.wanted.has(key))
                .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
            for (const [key, chunk] of unused) {
                if (this.chunks.size <= MAX_CACHED_CHUNKS) break
                this.disposeChunk(chunk)
                this.chunks.delete(key)
            }
        }
    },
}
