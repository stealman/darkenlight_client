import { Color3, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, Scene, Texture, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'
import { MapBlock, WorldDataManager } from '@/data/worldDataManager'
import { TerrainEnum1 } from '@/babylon/materials'
import { ViewportManager } from '@/utils/viewport'
import { MyPlayer } from '@/data/myPlayer'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'
import { Builder } from '@/babylon/builder'
import { getTerrainHeightOffset, WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import { smoothTerrainExperiment } from '@/babylon/world/terrainExperiment'

const ATLAS_SIZE = 8
const ATLAS_CELL_PIXELS = 32
const SCATTER_CELL_SIZE = 4
const CANDIDATES_PER_TILE = 2
// Rows are numbered from the top of foliage.png.
const GRASS = 0, MUD_GRASS = 1, SNOW_GRASS = 2, MEADOW = 3, FLOWERS = 4, DRY_GRASS = 5, MOSS = 6
const EXPOSED_GROUND_ROWS = [DRY_GRASS, MUD_GRASS, MEADOW]

type TerrainFoliage = {
    rows: readonly number[]
    tuftsPerTile: number
    mossPerTile: number
}

const SNOW_FOLIAGE: TerrainFoliage = {rows: [SNOW_GRASS, DRY_GRASS], tuftsPerTile: 0.14, mossPerTile: 0}
const TERRAIN_FOLIAGE = new Map<number, TerrainFoliage>([
    [TerrainEnum1.TERRAIN_DIRT.index, {rows: [], tuftsPerTile: 0, mossPerTile: 0.17}],
    [TerrainEnum1.TERRAIN_GRASS.index, {rows: [GRASS, MEADOW, MEADOW, FLOWERS], tuftsPerTile: 0.85, mossPerTile: 0.18}],
    [TerrainEnum1.TERRAIN_GRASS_WINTER.index, {rows: [GRASS, MEADOW, DRY_GRASS, DRY_GRASS], tuftsPerTile: 0.76, mossPerTile: 0.15}],
    [TerrainEnum1.TERRAIN_MUDDY_DIRT.index, {rows: [MUD_GRASS, MUD_GRASS, DRY_GRASS, FLOWERS], tuftsPerTile: 0.31, mossPerTile: 0.22}],
    [TerrainEnum1.TERRAIN_SNOW_GRASS.index, SNOW_FOLIAGE],
    [TerrainEnum1.TERRAIN_SNOW_GRASS_WINTER.index, SNOW_FOLIAGE],
    [TerrainEnum1.TERRAIN_SNOW_MUDDY_DIRT.index, {...SNOW_FOLIAGE, tuftsPerTile: 0.2}],
])

export const FoliageManager = {
    foliageMesh: null as Mesh | null,
    mossMesh: null as Mesh | null,
    foliageMaterial: null as PBRCustomMaterial | null,
    instancePosition: Vector3.Zero(),
    instanceRotation: Quaternion.Identity(),
    instanceScale: Vector3.One(),

    initialize(scene: Scene, parent: TransformNode | null) {
        this.foliageMesh = this.createFoliageMesh(scene, parent)
        this.mossMesh = Builder.createHorizontalPlane(scene, parent, 1, 0)
        this.mossMesh.name = 'groundMoss'
        this.mossMesh.doNotSyncBoundingInfo = true
        this.mossMesh.isPickable = false
        this.foliageMaterial = new PBRCustomMaterial('foliageMaterial', scene)
        const foliageTexture = new Texture('/images/materials/foliage.png', scene)
        foliageTexture.hasAlpha = true
        foliageTexture.getAlphaFromRGB = false
        foliageTexture.wrapU = Texture.CLAMP_ADDRESSMODE
        foliageTexture.wrapV = Texture.CLAMP_ADDRESSMODE
        foliageTexture.updateSamplingMode(Texture.NEAREST_NEAREST)
        foliageTexture.uScale = 1 / ATLAS_SIZE
        foliageTexture.vScale = 1 / ATLAS_SIZE

        this.foliageMaterial.albedoTexture = foliageTexture
        this.foliageMaterial.useAlphaFromAlbedoTexture = true
        this.foliageMaterial.albedoColor = Color3.White()
        this.foliageMaterial.emissiveColor = Color3.Black()
        this.foliageMaterial.alphaCutOff = 0.75
        this.foliageMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST
        this.foliageMaterial.backFaceCulling = false
        this.foliageMaterial.twoSidedLighting = true
        this.foliageMaterial.forceAlphaTest = true
        this.foliageMaterial.metallic = 0
        this.foliageMaterial.roughness = 1
        this.foliageMaterial.directIntensity = 0.5
        this.foliageMaterial.environmentIntensity = 1.5
        this.foliageMaterial.usePhysicalLightFalloff = false
        this.foliageMaterial.AddAttribute('uvc')
        this.foliageMaterial.Vertex_Definitions('attribute vec2 uvc;')
        this.foliageMaterial.Vertex_Before_PositionUpdated(
            `uvUpdated = (uvUpdated * ${ATLAS_CELL_PIXELS - 1}.0 + 0.5) / ${ATLAS_CELL_PIXELS}.0 + uvc;`,
        )
        this.foliageMesh.material = this.foliageMaterial
        this.mossMesh.material = this.foliageMaterial
        this.foliageMesh.setEnabled(false)
        this.mossMesh.setEnabled(false)
    },

    renderFoliage(snowCoverMask: ReadonlySet<number>, vegetationMask: ReadonlySet<number>) {
        const mesh = this.foliageMesh
        const mossMesh = this.mossMesh
        if (!mesh || !mossMesh) {
            return
        }

        const matrices: Matrix[] = []
        const uvData: Vector2[] = []
        const mossMatrices: Matrix[] = []
        const mossUvs: Vector2[] = []
        const blockMap = WorldDataManager.getBlockMap()
        const myPos = MyPlayer.myChar.getPositionRounded()
        const buildingBounds = Array.from(BuildingManager.buildings.values(), building => ({
            minX: building.data.x,
            maxX: building.data.x + building.getWidth(),
            minZ: building.data.z,
            maxZ: building.data.z + building.getDepth(),
        }))

        const canDecorate = (block: MapBlock, x: number, z: number) =>
            !block.stonePath && !block.beigeStonePath && !BuildingManager.hasFloorAtTile(x, z)
            && !buildingBounds.some(bounds => x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ)

        const minX = Math.max(0, myPos.x + ViewportManager.minX)
        const maxX = Math.min(blockMap.length - 1, myPos.x + ViewportManager.maxX)
        const minZ = Math.max(0, myPos.z + ViewportManager.minZ)
        const maxZ = Math.min(blockMap.length - 1, myPos.z + ViewportManager.maxZ)
        for (let cellX = Math.floor(minX / SCATTER_CELL_SIZE); cellX <= Math.floor(maxX / SCATTER_CELL_SIZE); cellX++) {
            for (let cellZ = Math.floor(minZ / SCATTER_CELL_SIZE); cellZ <= Math.floor(maxZ / SCATTER_CELL_SIZE); cellZ++) {
                // Absolute world cells seed the scatter. A tile can receive any number of candidates.
                const candidateCount = 24 + this.hashTile(cellX, cellZ, 70) % 17
                for (let index = 0; index < candidateCount; index++) {
                    const salt = 100 + index * 16
                    // Use the same precision as the instance buffer for tile boundary checks.
                    const worldX = Math.fround((cellX + this.roll(cellX, cellZ, salt)) * SCATTER_CELL_SIZE - 0.5)
                    const worldZ = Math.fround((cellZ + this.roll(cellX, cellZ, salt + 1)) * SCATTER_CELL_SIZE - 0.5)
                    const x = Math.round(worldX)
                    const z = Math.round(worldZ)
                    if (x < minX || x > maxX || z < minZ || z > maxZ) continue

                    const block = blockMap[x][z]
                    if (block.snowed && vegetationMask.has(x * blockMap.length + z)) continue
                    const config = TERRAIN_FOLIAGE.get(this.getTerrainIndex(block))
                    if (!config) continue

                    const density = this.patchDensity(worldX, worldZ)
                    const roll = this.roll(cellX, cellZ, salt + 9) * CANDIDATES_PER_TILE
                    const isTuft = roll < config.tuftsPerTile * density
                    if (!isTuft && (block.snowed || roll >= (config.tuftsPerTile + config.mossPerTile) * density)) continue
                    if (!ViewportManager.isPointInVisibleMatrix(x, z, 2, block.totalHeight) || !canDecorate(block, x, z)) continue

                    const hideSnow = block.snowed && snowCoverMask.has(x * blockMap.length + z)
                    const top = block.height + getTerrainHeightOffset(block, hideSnow)
                    if (isTuft) {
                        const row = config.rows[this.hashTile(cellX, cellZ, salt + 2) % config.rows.length]
                        matrices.push(this.tuftMatrix(cellX, cellZ, worldX, top, worldZ, row, salt))
                        uvData.push(this.getAtlasOffset(cellX, cellZ, row, salt))
                        continue
                    }

                    const size = 0.38 + this.roll(cellX, cellZ, salt + 10) * 0.18
                    const yaw = this.roll(cellX, cellZ, salt + 11) * 2 * Math.PI
                    // The rotated quad may cross tile borders on continuous ground.
                    const radius = size * 0.5 * (Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw)))
                    if (!this.canPlaceMoss(blockMap, worldX, worldZ, top, radius, canDecorate)) continue

                    this.instanceScale.set(size, 1, size)
                    this.instancePosition.set(worldX, top + 0.006, worldZ)
                    Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, this.instanceRotation)
                    mossMatrices.push(Matrix.Compose(this.instanceScale, this.instanceRotation, this.instancePosition))
                    mossUvs.push(this.getAtlasOffset(cellX, cellZ, MOSS, salt))
                }
            }
        }

        for (const tile of vegetationMask) {
            const x = Math.floor(tile / blockMap.length)
            const z = tile % blockMap.length
            if (x < minX || x > maxX || z < minZ || z > maxZ) continue
            const block = blockMap[x][z]
            if (!block.snowed || block.type <= 0 || block.type >= WATER_BLOCK_TYPE || !canDecorate(block, x, z)
                || !ViewportManager.isPointInVisibleMatrix(x, z, 2, block.totalHeight)) continue

            // Every exposed patch gets one tuft with a root inside its tile.
            const salt = 750
            const rootX = x + (this.roll(x, z, salt) - 0.5) * 0.8
            const rootZ = z + (this.roll(x, z, salt + 1) - 0.5) * 0.8
            const row = EXPOSED_GROUND_ROWS[this.hashTile(x, z, salt + 2) % EXPOSED_GROUND_ROWS.length]
            const top = block.height + getTerrainHeightOffset(block, true)
            matrices.push(this.tuftMatrix(x, z, rootX, top, rootZ, row, salt))
            uvData.push(this.getAtlasOffset(x, z, row, salt))
        }

        updateWorldInstanceBuffers(mesh, matrices, uvData)
        updateWorldInstanceBuffers(mossMesh, mossMatrices, mossUvs)
        mesh.setEnabled(matrices.length > 0)
        mossMesh.setEnabled(mossMatrices.length > 0)
    },

    canPlaceMoss(blockMap: MapBlock[][], worldX: number, worldZ: number, top: number, radius: number,
                 canDecorate: (block: MapBlock, x: number, z: number) => boolean): boolean {
        for (let x = Math.round(worldX - radius); x <= Math.round(worldX + radius); x++) {
            for (let z = Math.round(worldZ - radius); z <= Math.round(worldZ + radius); z++) {
                const block = blockMap[x]?.[z]
                if (!block || block.snowed || Math.abs(block.totalHeight - top) > 1e-6
                    || !TERRAIN_FOLIAGE.get(this.getTerrainIndex(block))?.mossPerTile
                    || !canDecorate(block, x, z) || smoothTerrainExperiment?.accepts(block, x, z)) return false
            }
        }
        return true
    },

    patchDensity(x: number, z: number): number {
        const patchSize = 5
        const cellX = Math.floor(x / patchSize)
        const cellZ = Math.floor(z / patchSize)
        const u = x / patchSize - cellX
        const v = z / patchSize - cellZ
        const near = this.roll(cellX, cellZ, 60) * (1 - u) + this.roll(cellX + 1, cellZ, 60) * u
        const far = this.roll(cellX, cellZ + 1, 60) * (1 - u) + this.roll(cellX + 1, cellZ + 1, 60) * u
        return 0.25 + (near * (1 - v) + far * v) * 1.6
    },

    getTerrainIndex(block: MapBlock): number {
        let type = block.type
        if (block.minableCoal) {
            type += 2000
        } else if (block.minableOreAvailable) {
            type += 1000
        }
        if (block.snowed) {
            type += 100
        }
        return type
    },

    getAtlasOffset(x: number, z: number, row: number, salt = 0): Vector2 {
        const columns = row < MEADOW ? ATLAS_SIZE : 4
        return new Vector2(this.hashTile(x, z, salt + 3) % columns, ATLAS_SIZE - 1 - row)
    },

    tuftMatrix(x: number, z: number, centerX: number, top: number, centerZ: number, row: number, salt: number): Matrix {
        const height = row === FLOWERS ? 0.44 : row === DRY_GRASS || row === SNOW_GRASS ? 0.55 : 0.65
        const width = 0.42 + this.roll(x, z, salt + 4) * 0.31
        const tuftHeight = height * (0.73 + this.roll(x, z, salt + 5) * 0.55)
        const rootInset = row === SNOW_GRASS ? 0.13 : 0.04
        this.instanceScale.set(width, tuftHeight, width)
        this.instancePosition.set(centerX, top - tuftHeight * rootInset, centerZ)
        Quaternion.RotationYawPitchRollToRef(this.roll(x, z, salt + 8) * 2 * Math.PI, 0, 0, this.instanceRotation)
        return Matrix.Compose(this.instanceScale, this.instanceRotation, this.instancePosition)
    },

    addSnowPreviewTuft(seed: number, centerX: number, matrices: Matrix[], uvData: Vector2[]) {
        const row = SNOW_FOLIAGE.rows[this.hashTile(seed, 0, 2) % SNOW_FOLIAGE.rows.length]
        const x = centerX + (this.roll(seed, 0, 6) - 0.5) * 0.32
        const z = (this.roll(seed, 0, 7) - 0.5) * 0.44
        matrices.push(this.tuftMatrix(seed, 0, x, 0, z, row, 0))
        uvData.push(this.getAtlasOffset(seed, 0, row))
    },

    roll(x: number, z: number, salt: number): number {
        return this.hashTile(x, z, salt) / 0x100000000
    },

    hashTile(x: number, z: number, salt: number): number {
        let hash = (MyPlayer.worldId * 73856093) ^ (x * 19349663) ^ (z * 83492791) ^ (salt * 2654435761)
        hash = Math.imul(hash ^ (hash >>> 16), 2246822519)
        hash = Math.imul(hash ^ (hash >>> 13), 3266489917)
        hash ^= hash >>> 16
        return hash >>> 0
    },

    createFoliageMesh(scene: Scene, parent: TransformNode | null): Mesh {
        const planes: Mesh[] = []
        for (let i = 0; i < 3; i++) {
            const plane = MeshBuilder.CreatePlane(`foliagePlane${i}`, { width: 1, height: 1 }, scene)
            plane.position.y = 0.5
            plane.rotation.y = i * (Math.PI / 3)
            planes.push(plane)
        }

        const mesh = Mesh.MergeMeshes(planes, true) as Mesh
        mesh.parent = parent
        mesh.alwaysSelectAsActiveMesh = true
        mesh.doNotSyncBoundingInfo = true
        mesh.isPickable = false
        return mesh
    },
}
