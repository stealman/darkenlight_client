import { Color3, Matrix, Mesh, MeshBuilder, PBRMaterial, Scene, Texture, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { BabylonUtils } from '@/babylon/utils'
import { MapBlock, WorldDataManager } from '@/data/worldDataManager'
import { TerrainEnum1 } from '@/babylon/materials'
import { ViewportManager } from '@/utils/viewport'
import { MyPlayer } from '@/data/myPlayer'

export const FoliageManager = {
    FOLIAGE_TYPE_COUNT: 1,
    ATLAS_COLUMNS: 8,
    ATLAS_ROWS: 8,
    GENERATE_ON_TERRAINS: [
        { terrain: TerrainEnum1.TERRAIN_GRASS, rowIndex: 0, avgTilesPerFoliage: 4 },
        { terrain: TerrainEnum1.TERRAIN_MUDDY_DIRT, rowIndex: 1, avgTilesPerFoliage: 10 },
        { terrain: TerrainEnum1.TERRAIN_SNOW_GRASS, rowIndex: 2, avgTilesPerFoliage: 12 },
        { terrain: TerrainEnum1.TERRAIN_SNOW_MUDDY_DIRT, rowIndex: 2, avgTilesPerFoliage: 12 },
    ],
    foliageMesh: null as Mesh | null,
    foliageMaterial: null as PBRCustomMaterial | null,

    initialize(scene: Scene, parent: TransformNode | null) {
        this.foliageMesh = this.createFoliageMesh(scene, parent)
        this.foliageMaterial = new PBRCustomMaterial('foliageMaterial', scene)
        const foliageTexture = new Texture('/images/materials/foliage.png', scene)
        foliageTexture.hasAlpha = true
        foliageTexture.getAlphaFromRGB = false
        foliageTexture.wrapU = Texture.CLAMP_ADDRESSMODE
        foliageTexture.wrapV = Texture.CLAMP_ADDRESSMODE
        foliageTexture.updateSamplingMode(Texture.NEAREST_NEAREST)
        foliageTexture.uScale = 1 / this.ATLAS_COLUMNS
        foliageTexture.vScale = 1 / this.ATLAS_ROWS

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
        this.foliageMaterial.Vertex_Before_PositionUpdated('uvUpdated = uvUpdated + uvc;')
        this.foliageMaterial.Vertex_After_WorldPosComputed('vAlbedoUV = uvUpdated;')
        this.foliageMesh.material = this.foliageMaterial
    },

    renderFoliage() {
        const mesh = this.foliageMesh
        if (!mesh) {
            return
        }

        const matrices = []
        const uvData = []
        const blockMap = WorldDataManager.getBlockMap()
        const myPos = MyPlayer.myChar.getPositionRounded()

        for (let x = Math.max(0, myPos.x + ViewportManager.minX); x <= Math.min(blockMap.length - 1, myPos.x + ViewportManager.maxX); x++) {
            for (let z = Math.max(0, myPos.z + ViewportManager.minZ); z <= Math.min(blockMap.length - 1, myPos.z + ViewportManager.maxZ); z++) {
                if (!ViewportManager.isPointInVisibleMatrix(x, z, 2)) {
                    continue
                }

                const block = blockMap[x][z]
                const terrainConfig = this.getTerrainConfig(block)
                if (block.type <= 0 || !terrainConfig || !this.shouldSpawnAt(x, z, terrainConfig.avgTilesPerFoliage!)) {
                    continue
                }

                const foliageType = this.getFoliageType(x, z)
                const scale = this.getScale(x, z, foliageType)
                const offset = this.getOffset(x, z, foliageType)
                const rotation = this.getRotation(x, z, foliageType)
                const baseHeight = block.totalHeight - (block.snowed ? 0.1 : 0)
                const position = Matrix.Translation(x + offset.x, baseHeight, z + offset.z)
                const rotationMatrix = Matrix.RotationY(rotation)
                const scaleMatrix = Matrix.Scaling(scale.x, scale.y, scale.z)

                matrices.push(scaleMatrix.multiply(rotationMatrix).multiply(position))
                uvData.push(this.getAtlasOffset(x, z, terrainConfig.rowIndex))
            }
        }

        mesh.thinInstanceSetBuffer('matrix', BabylonUtils.createPositionBuffer(matrices), 16)
        mesh.thinInstanceSetBuffer('uvc', BabylonUtils.createUvBuffer(uvData), 2)
        mesh.setEnabled(matrices.length > 0)
        if (matrices.length > 0) {
            mesh.thinInstanceRefreshBoundingInfo(false)
        }
    },

    shouldSpawnAt(x: number, z: number, avgTilesPerFoliage: number): boolean {
        return this.hashTile(x, z, 0) % Math.max(1, avgTilesPerFoliage) === 0
    },

    getTerrainConfig(block: MapBlock): { terrain: { index: number }, rowIndex: number, avgTilesPerFoliage?: number } | null {
        const terrainIndex = this.getTerrainIndex(block)
        return this.GENERATE_ON_TERRAINS.find(config => config.terrain.index === terrainIndex) ?? null
    },

    getTerrainIndex(block: MapBlock): number {
        let type = block.type
        if (block.minableOre) {
            type += 1000
        }
        if (block.snowed) {
            type += 100
        }
        return type
    },

    getFoliageType(x: number, z: number): number {
        return this.hashTile(x, z, 1) % this.FOLIAGE_TYPE_COUNT
    },

    getAtlasOffset(x: number, z: number, rowIndex: number): Vector2 {
        const columnIndex = this.hashTile(x, z, 2) % this.ATLAS_COLUMNS
        const atlasRowIndex = (this.ATLAS_ROWS - 1) - rowIndex
        return new Vector2(columnIndex, atlasRowIndex)
    },

    getRotation(x: number, z: number, foliageType: number): number {
        return (this.hashTile(x, z, 100 + foliageType) % 360) * (Math.PI / 180)
    },

    getScale(x: number, z: number, foliageType: number): Vector3 {
        const scaleX = 0.5 + (this.hashTile(x, z, 200 + foliageType) % 20) / 100
        const scaleY = 0.5 + (this.hashTile(x, z, 300 + foliageType) % 20) / 100
        return new Vector3(scaleX, scaleY, scaleX)
    },

    getOffset(x: number, z: number, foliageType: number): Vector3 {
        const offsetX = ((this.hashTile(x, z, 400 + foliageType) % 60) / 100) - 0.3
        const offsetZ = ((this.hashTile(x, z, 500 + foliageType) % 60) / 100) - 0.3
        return new Vector3(offsetX, 0, offsetZ)
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
        return mesh
    },
}
