import { WorldDataManager } from '@/data/worldDataManager'
import type { MapBlock } from '@/data/worldDataManager'
import { Color4, Matrix, Mesh, ParticleSystem, Scene, TransformNode, Vector2 } from '@babylonjs/core'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'
import { Builder } from '@/babylon/builder'
import { MaterialEnum1 } from '@/babylon/materials'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { Settings } from '@/settings/settings'
import { ViewportManager } from '@/utils/viewport'
import { MyPlayer } from '@/data/myPlayer'
import { IndoorTerrainOcclusionManager } from '@/babylon/world/indoorTerrainOcclusionManager'
import { Lights } from '@/babylon/scene/lights'
import { SNOW_BLOCK_HEIGHT } from '@/babylon/world/beveledTerrainBlock'
import type { createOutdoorTerrain, createIndoorWaterFloor } from './outdoorTerrain'
import { BuildingManager } from './buildings/buildingManager'
import { TerrainContactShadow } from './terrainContactShadow'
import { StaticsManager } from './statics/staticsManager'
import { StepMarksRenderer } from './stepMarksRenderer'
import { TerrainWaterSurface } from './terrainWaterSurface'
import { configureTerrainWater } from './terrainWaterMaterial'
import { outdoorSurfaceHeight, WATER_BLOCK_TYPE } from './terrainRoofShape'

export { WATER_BLOCK_TYPE } from './terrainRoofShape'

export function getTerrainHeightOffset(block: MapBlock, hideSnow: boolean): number {
    if (hideSnow) return block.type === WATER_BLOCK_TYPE ? -0.1 : 0
    if (block.snowed && block.type > 0 && block.type < WATER_BLOCK_TYPE
        && !block.stonePath && !block.beigeStonePath) return SNOW_BLOCK_HEIGHT
    return block.heightOffset
}

export const TerrainManager = {
    terrainPlane: null as Mesh | null,
    dungeonBlock: null as Mesh | null,
    terrainWater: null as TerrainWaterSurface | null,
    waterPlane: null as Mesh | null,
    seaWaterLevel: null as number | null,

    hoverBlockMarker: null as Mesh | null,
    outdoorTerrain: null as ReturnType<typeof createOutdoorTerrain> | null,
    renderers: null as typeof import('./outdoorTerrain') | null,
    waterFloor: null as ReturnType<typeof createIndoorWaterFloor> | null,
    contactShadow: null as TerrainContactShadow | null,

    async initialize(scene: Scene) {
        this.renderers ??= await import('./outdoorTerrain')
        const parent = WorldRenderer.worldParentNode!
        this.outdoorTerrain = null
        this.waterFloor = null
        this.dungeonBlock = null
        const terrainSteps = StepMarksRenderer.field
        const contactShadow = new TerrainContactShadow(scene, terrainSteps ?? undefined)
        this.contactShadow = contactShadow
        IndoorTerrainOcclusionManager.initialize(scene, parent, this.renderers.createDungeonRockMaterial)
        this.hoverBlockMarker = Builder.createHorizontalPlane(scene, null, 1, 0)

        this.terrainPlane = Builder.createHorizontalPlane(scene, parent, 1, 0)
        this.terrainPlane.setEnabled(false)

        this.terrainWater = new TerrainWaterSurface(scene, parent)
        if (Settings.isShadowsEnabled()) {
            this.terrainPlane.receiveShadows = true
            this.terrainWater.mesh.receiveShadows = true
        }

        this.waterPlane = Builder.createHorizontalPlane(scene, parent, 2048, 0)
        configureTerrainWater(this.waterPlane, 'seaWater')
        this.waterPlane.position.y = 1
        this.waterPlane.isPickable = false
        this.waterPlane.alwaysSelectAsActiveMesh = true
        this.waterPlane.renderingGroupId = 0

        this.applySeaWaterLevel()
    },

    setSeaWaterLevel(seaWaterLevel: number | null) {
        this.seaWaterLevel = Number.isFinite(seaWaterLevel) ? seaWaterLevel : null
        this.applySeaWaterLevel()
    },

    applySeaWaterLevel() {
        const hasSea = this.seaWaterLevel !== null
        this.waterPlane?.setEnabled(hasSea)
        if (hasSea && this.waterPlane) {
            this.waterPlane.position.y = this.seaWaterLevel!
        }
    },

    usesOutdoorTerrain() {
        return !Lights.indoor
    },

    refreshGrassExclusions() {
        const world = WorldDataManager.worldDataMap.get(MyPlayer.worldId)
        if (world && this.usesOutdoorTerrain()) this.outdoorTerrain?.refreshGrassExclusions(world.noGrassTiles)
    },

    initializeDungeonBlock() {
        const plane = this.terrainPlane!
        const scene = plane.getScene()
        const mesh = Builder.createBlockWithFaces(scene, plane.parent as TransformNode)
        mesh.name = 'dungeonRockBlocks'
        mesh.material = this.renderers!.createDungeonRockMaterial(scene, 'dungeonRock')
        this.terrainPlane!.material = mesh.material
        mesh.thinInstanceEnablePicking = true
        mesh.receiveShadows = plane.receiveShadows
        Lights.registerSharedLightMesh(mesh)
        Lights.addShadowCaster(mesh, true)
        return mesh
    },

    renderTerrain(snowCoverMask: Set<number> = new Set()) {
        const world = WorldDataManager.worldDataMap.get(MyPlayer.worldId)!
        const map = world.blockMap
        const center = MyPlayer.myChar.getPositionRounded()
        const outdoor = this.usesOutdoorTerrain()
        if (outdoor) {
            this.outdoorTerrain ??= this.renderers!.createOutdoorTerrain(WorldRenderer.worldParentNode!, undefined,
                this.contactShadow ?? undefined, StepMarksRenderer.field ?? undefined)
            const load = WorldDataManager.terrainRenderLoad
            this.outdoorTerrain.render(map, center, snowCoverMask, world.renderRevision,
                load?.worldId === MyPlayer.worldId ? load.data : undefined, world.originalBlocks, world.noGrassTiles)
        } else {
            this.outdoorTerrain?.setEnabled(false)
        }
        this.renderTerrainArea(map, world.planeBlockMap, snowCoverMask, center, outdoor)
        this.contactShadow?.update(map, world.renderRevision, Lights.indoor ? [] : [
            ...BuildingManager.getBuildingFloorShadowFootprints(center),
            ...StaticsManager.getContactShadowFootprints(map),
        ])
        return outdoor
    },

    renderTerrainArea(
        blockMap: MapBlock[][],
        planeBlockMap: (MapBlock | false)[][],
        snowCoverMask: Set<number>,
        viewportCenter?: {x: number, y: number, z: number},
        outdoor = false,
    ) {
        const planeMatrices: Matrix[] = []
        const planeUvData: Vector2[] = []
        const waterTiles: {x: number, z: number, height: number}[] = []
        const waterFloors = outdoor ? undefined : new Map<number, number>()
        const rockUv = this.renderers!.dungeonRockUv
        const dungeon = outdoor ? null : (this.dungeonBlock ??= this.initializeDungeonBlock())
        const blockMatrices: Matrix[] = []
        const blockUvs: Vector2[] = []

        IndoorTerrainOcclusionManager.beginTerrainRender(blockMap, Lights.indoor)

        const maxIndex = blockMap.length - 1
        const minX = viewportCenter ? Math.max(0, viewportCenter.x + ViewportManager.minX) : 0
        const minZ = viewportCenter ? Math.max(0, viewportCenter.z + ViewportManager.minZ) : 0
        const maxX = viewportCenter ? Math.min(maxIndex, viewportCenter.x + ViewportManager.maxX) : maxIndex
        const maxZ = viewportCenter ? Math.min(maxIndex, viewportCenter.z + ViewportManager.maxZ) : maxIndex
        const renderPaving = !outdoor && Settings.detailLevel.paving === 'detailed'
        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const block = blockMap[x][z]
                // The outdoor batches already evaluated visibility for solid surfaces.
                if (outdoor && block.type !== WATER_BLOCK_TYPE) continue

                // Check if block is in visible matrix
                if (viewportCenter && !ViewportManager.isPointInVisibleMatrix(x, z, 2, block.totalHeight, 0, viewportCenter)) {
                    continue
                }

                if (renderPaving && block.type > 0 && (block.stonePath || block.beigeStonePath)) {
                    const pathMatrix = Matrix.Scaling(1, 0.12, 1)
                    pathMatrix.setTranslationFromFloats(x, block.height + 0.56, z)
                    WorldRenderer.block1!.matrices.push(pathMatrix)
                    WorldRenderer.block1!.uvData.push(block.beigeStonePath ? MaterialEnum1.ROCK1_BEIGE.uv : MaterialEnum1.ROCK1.uv)
                }
                if (block.type === WATER_BLOCK_TYPE) {
                    waterFloors?.set(x * blockMap[0].length + z, outdoorSurfaceHeight(block)!)
                    if (this.seaWaterLevel === null || block.height > this.seaWaterLevel) {
                        waterTiles.push({x, z, height: block.height})
                    }
                    continue
                }

                if (block.type <= 0) continue
                const hideSnow = block.snowed && snowCoverMask.has(x * blockMap.length + z)
                const heightOffset = block.stonePath || block.beigeStonePath ? 0 : getTerrainHeightOffset(block, hideSnow)
                const uv = rockUv(block, x, z, block.height)
                if (planeBlockMap[x][z]) {
                    planeMatrices.push(Matrix.Translation(x, block.height + heightOffset, z))
                    planeUvData.push(uv)
                    continue
                }

                const matrix = Matrix.Scaling(1, 1 + heightOffset, 1)
                matrix.setTranslationFromFloats(x, block.height + heightOffset * 0.5, z)
                IndoorTerrainOcclusionManager.routeTerrainBlock(x, z, block.height, matrix, uv, blockMatrices, blockUvs)

                let minHeight = block.height
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const neighbor = blockMap[x + dx]?.[z + dz]
                        if (neighbor && neighbor.type > 0) minHeight = Math.min(minHeight, neighbor.height)
                    }
                }
                for (let level = minHeight + 1; level < block.height; level++) {
                    IndoorTerrainOcclusionManager.routeTerrainBlock(x, z, level, Matrix.Translation(x, level, z),
                        rockUv(block, x, z, level), blockMatrices, blockUvs)
                }
            }
        }

        IndoorTerrainOcclusionManager.finishTerrainRender()

        // Apply buffers for instances
        if (dungeon) updateWorldInstanceBuffers(dungeon, blockMatrices, blockUvs)
        this.dungeonBlock?.setEnabled(!!dungeon && blockMatrices.length > 0)
        updateWorldInstanceBuffers(this.terrainPlane!, planeMatrices, planeUvData)
        this.terrainWater!.render(waterTiles, blockMap)
        if (waterFloors?.size) {
            this.waterFloor ??= this.renderers!.createIndoorWaterFloor(this.terrainPlane!)
            this.waterFloor.render(blockMap, waterFloors)
        } else this.waterFloor?.mesh.setEnabled(false)

        // Set enabled based on if there are instances to show
        this.terrainPlane!.setEnabled(planeMatrices.length > 0)
    },

    setParticleSplashColorByTerrainType(ps: ParticleSystem, block: MapBlock) {
        if (block.snowed) {
            ps.color1 = new Color4(0.9, 0.85, 0.9, 1)
            ps.color2 = new Color4(0.8, 0.85, 0.9, 1)
            ps.colorDead = new Color4(0.6, 0.6, 0.7, 0.3)
        } else if (block.type === 3) {
            // ROCK
            ps.color1 = new Color4(0.35, 0.32, 0.35, 1)
            ps.color2 = new Color4(0.3, 0.33, 0.38, 1)
            ps.colorDead = new Color4(0.2, 0.2, 0.2, 0.3)
        } else if (block.type === 4) {
            // MUDDY DIRT
            ps.color1 = new Color4(0.45, 0.35, 0.25, 1)
            ps.color2 = new Color4(0.35, 0.25, 0.15, 1)
            ps.colorDead = new Color4(0.2, 0.2, 0.2, 0.3)
        } else if (block.type === 50) {
            // WATER
            ps.color1 = new Color4(0.2, 0.7, 1, 1)
            ps.color2 = new Color4(0.1, 0.6, 0.8, 1)
            ps.colorDead = new Color4(0.1, 0.2, 0.4, 0.3)
        } else {
            // DEFAULT DIRT OR GRASS
            ps.color1 = new Color4(0.6, 0.5, 0.4, 1)
            ps.color2 = new Color4(0.5, 0.4, 0.3, 1)
            ps.colorDead = new Color4(0.3, 0.3, 0.3, 0.3)
        }
    }
}
