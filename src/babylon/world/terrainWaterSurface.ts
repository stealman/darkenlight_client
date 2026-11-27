import { Matrix, RawTexture, Texture, Vector2 } from '@babylonjs/core'
import type { Mesh, Scene, TransformNode } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import type { MapBlock } from '@/data/worldDataManager'
import { TERRAIN_CARDINAL_EDGES, WATER_BLOCK_TYPE } from './terrainRoofShape'
import { configureTerrainWater, POND_DISTANCE_RANGE, WATER_FIELD_RESOLUTION } from './terrainWaterMaterial'
import { updateWorldInstanceBuffers } from './worldInstanceBuffers'

// A texel of padding on every side keeps bilinear filtering within each tile's field.
const PATCH_SIZE = WATER_FIELD_RESOLUTION + 2
const PATCH_ROW_BYTES = PATCH_SIZE * 4
const CACHED_PATCHES = 8192
type WaterTile = {x: number, z: number, height: number}
type WaterPatch = {matrix: Matrix, height: number, pixels: Uint8Array}

export class TerrainWaterSurface {
    readonly mesh: Mesh
    #pixels = new Uint8Array(PATCH_SIZE * PATCH_SIZE * 4)
    #columns = 1
    readonly #atlas: {texture: RawTexture, scale: Vector2}
    readonly #patches = new Map<number, WaterPatch>()
    #map?: MapBlock[][]
    #revision?: number
    #visibleTiles: WaterTile[] = []
    #offsets: Vector2[] = []

    constructor(scene: Scene, parent: TransformNode | null) {
        this.mesh = Builder.createHorizontalPlane(scene, parent, 1, 0)
        this.mesh.name = 'terrainWater'
        this.mesh.isPickable = false
        this.mesh.setEnabled(false)
        this.#atlas = {texture: this.createTexture(), scale: new Vector2(1 / PATCH_SIZE, 1 / PATCH_SIZE)}
        configureTerrainWater(this.mesh, 'terrainWater', {tiles: this.#atlas})
        this.mesh.onDisposeObservable.addOnce(() => this.#atlas.texture.dispose())
    }

    private createTexture() {
        const size = this.#columns * PATCH_SIZE
        const texture = RawTexture.CreateRGBATexture(this.#pixels, size, size, this.mesh.getScene(),
            false, false, Texture.BILINEAR_SAMPLINGMODE)
        texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
        return texture
    }

    render(tiles: WaterTile[], map: MapBlock[][], revision?: number) {
        const sameMap = map === this.#map && revision === this.#revision
        if (!sameMap) {
            this.#patches.clear()
            this.#map = map
            this.#revision = revision
        }
        if (sameMap && tiles.length === this.#visibleTiles.length && tiles.every(({x, z, height}, index) => {
            const previous = this.#visibleTiles[index]
            return x === previous.x && z === previous.z && height === previous.height
        })) return
        this.#visibleTiles = tiles
        if (!tiles.length) {
            this.mesh.thinInstanceCount = 0
            this.mesh.setEnabled(false)
            return
        }
        const patches = tiles.slice()
        const bankTiles = new Set<number>()
        const stride = map[0].length
        // The shader's spill reaches less than one tile, including across corners.
        for (const {x, z, height} of tiles) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const bx = x + dx, bz = z + dz
                    const bank = map[bx]?.[bz]
                    if (!bank || bank.type <= 0 || bank.type === WATER_BLOCK_TYPE || bank.height !== height) continue
                    if (bz < 0 || bz >= stride) continue
                    const key = bx * stride + bz
                    if (bankTiles.has(key)) continue
                    bankTiles.add(key)
                    patches.push({x: bx, z: bz, height})
                }
            }
        }
        if (patches.length > this.#columns * this.#columns) {
            this.#columns = 2 ** Math.ceil(Math.log2(Math.sqrt(patches.length)))
            const size = this.#columns * PATCH_SIZE
            this.#pixels = new Uint8Array(size * size * 4)
            this.#atlas.scale.set(1 / size, 1 / size)
            this.#atlas.texture.dispose()
            this.#atlas.texture = this.createTexture()
            this.#offsets = []
        }

        const matrices: Matrix[] = []
        const rowBytes = this.#columns * PATCH_ROW_BYTES
        patches.forEach(({x, z, height}, index) => {
            const key = x * stride + z
            let patch = this.#patches.get(key)
            if (!patch || patch.height !== height) {
                patch = {matrix: Matrix.Translation(x, height, z), height, pixels: this.createDistancePatch(map, x, z, height)}
                if (this.#patches.size >= CACHED_PATCHES) this.#patches.delete(this.#patches.keys().next().value!)
                this.#patches.set(key, patch)
            }
            const col = index % this.#columns * PATCH_SIZE
            const row = Math.floor(index / this.#columns) * PATCH_SIZE
            for (let y = 0; y < PATCH_SIZE; y++) {
                this.#pixels.set(patch.pixels.subarray(y * PATCH_ROW_BYTES, (y + 1) * PATCH_ROW_BYTES),
                    (row + y) * rowBytes + col * 4)
            }
            matrices.push(patch.matrix)
            this.#offsets[index] ??= new Vector2(col + 1, row + 1)
        })
        this.#atlas.texture.update(this.#pixels)
        updateWorldInstanceBuffers(this.mesh, matrices, this.#offsets.slice(0, patches.length))
        this.mesh.setEnabled(true)
    }

    private createDistancePatch(map: MapBlock[][], x: number, z: number, level: number) {
        const isWater = (tx: number, tz: number) => {
            const block = map[tx]?.[tz]
            return block?.type === WATER_BLOCK_TYPE && block.height === level
        }
        // Read beyond the visible tiles so camera movement cannot change the shoreline.
        const edges: {x: number, z: number, halfX: number, halfZ: number}[] = []
        const radius = POND_DISTANCE_RANGE + 1 // Include the texel gutters.
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                if (!isWater(x + dx, z + dz)) continue
                for (const [nx, nz] of TERRAIN_CARDINAL_EDGES) {
                    if (!isWater(x + dx + nx, z + dz + nz)) {
                        edges.push({x: dx + nx * 0.5, z: dz + nz * 0.5, halfX: Math.abs(nz) * 0.5, halfZ: Math.abs(nx) * 0.5})
                    }
                }
            }
        }
        const pixels = new Uint8Array(PATCH_SIZE * PATCH_ROW_BYTES)
        for (let v = 0; v < PATCH_SIZE; v++) {
            const pz = (v - 0.5) / WATER_FIELD_RESOLUTION - 0.5
            for (let u = 0; u < PATCH_SIZE; u++) {
                const px = (u - 0.5) / WATER_FIELD_RESOLUTION - 0.5
                let distanceSquared = POND_DISTANCE_RANGE ** 2
                for (const edge of edges) {
                    const dx = Math.max(0, Math.abs(px - edge.x) - edge.halfX)
                    const dz = Math.max(0, Math.abs(pz - edge.z) - edge.halfZ)
                    distanceSquared = Math.min(distanceSquared, dx * dx + dz * dz)
                }
                const sign = isWater(x + Math.round(px), z + Math.round(pz)) ? 1 : -1
                pixels[v * PATCH_ROW_BYTES + u * 4] = Math.round((0.5 + sign * Math.sqrt(distanceSquared) / (2 * POND_DISTANCE_RANGE)) * 255)
            }
        }
        return pixels
    }
}
