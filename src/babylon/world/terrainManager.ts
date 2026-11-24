import { MapBlock, WorldDataManager } from '@/data/worldDataManager'
import { Color4, Matrix, Mesh, ParticleSystem, Scene, TransformNode, Vector2 } from '@babylonjs/core'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'
import { Builder } from '@/babylon/builder'
import { MaterialEnum1, Materials, PlaneEnum1, TerrainEnum1 } from '@/babylon/materials'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { Settings } from '@/settings/settings'
import { ViewportManager } from '@/utils/viewport'
import { MyPlayer } from '@/data/myPlayer'
import { IndoorTerrainOcclusionManager } from '@/babylon/world/indoorTerrainOcclusionManager'
import { Lights } from '@/babylon/scene/lights'
import { smoothTerrainExperiment } from '@/babylon/world/terrainExperiment'
import { BEVELED_TERRAIN_ENABLED, terrainBevelMask, terrainVerticalBevelMask, BeveledTerrain } from '@/babylon/world/beveledTerrain'
import { SNOW_BLOCK_HEIGHT } from '@/babylon/world/beveledTerrainBlock'
import type { createOutdoorTerrain } from './outdoorTerrain'

export const DIRT_BLOCK_TYPE = 1
const GRASS_BLOCK_TYPES = new Set([2, 5])
export const WATER_BLOCK_TYPE = 50

export function getTerrainHeightOffset(block: MapBlock, hideSnow: boolean): number {
    if (hideSnow) return block.type === WATER_BLOCK_TYPE ? -0.1 : 0
    if (BEVELED_TERRAIN_ENABLED && block.snowed && block.type > 0 && block.type < WATER_BLOCK_TYPE
        && !block.stonePath && !block.beigeStonePath) return SNOW_BLOCK_HEIGHT
    return block.heightOffset
}

export const TerrainManager = {
    waterBottomBlock: null as MapBlock | null,
    terrainBlock1: null as Mesh | null,
    terrainPlane: null as Mesh | null,
    terrainWaterPlane: null as Mesh | null,
    terrainBlockMatrixBuffer: new Float32Array(0),
    waterPlane: null as Mesh | null,
    seaWaterLevel: null as number | null,

    hoverBlockMarker: null as Mesh | null,
    outdoorTerrain: null as ReturnType<typeof createOutdoorTerrain> | null,
    outdoorFactory: null as typeof createOutdoorTerrain | null,

    initialize (scene: Scene) {
        this.outdoorTerrain = null
        if (!smoothTerrainExperiment && !this.outdoorFactory) {
            void import('./outdoorTerrain').then(({createOutdoorTerrain}) => {
                this.outdoorFactory = createOutdoorTerrain
                if (!scene.isDisposed && ViewportManager.viewPortInitialized) WorldRenderer.renderWorld()
            }).catch(error => console.error('Unable to load outdoor terrain', error))
        }
        this.initializeMeshes(scene, WorldRenderer.worldParentNode, () => {
            if (ViewportManager.viewPortInitialized) WorldRenderer.renderWorld()
        })
        this.hoverBlockMarker = Builder.createHorizontalPlane(scene, null,1, 0)
    },

    initializeMeshes(scene: Scene, parent: TransformNode | null, onSmoothReady: () => void) {
        this.waterBottomBlock = new MapBlock(0, DIRT_BLOCK_TYPE)

        // Terrain and plane blocks
        this.terrainBlock1 = Builder.createBlockWithFaces(scene, parent!)
        this.terrainBlock1.material = Materials.terrainMaterial
        this.terrainBlock1.isPickable = true
        this.terrainBlock1.thinInstanceEnablePicking = true

        this.terrainPlane = Builder.createHorizontalPlane(scene, parent, 1, 0)
        this.terrainPlane.material = Materials.planeMaterial

        this.terrainWaterPlane = Builder.createHorizontalPlane(scene, parent, 1, 0)
        this.terrainWaterPlane.material = Materials.planeWaterMaterial
        this.terrainWaterPlane.renderingGroupId = 0

        if (Settings.isShadowsEnabled()) {
            this.terrainBlock1.receiveShadows = true
            this.terrainPlane.receiveShadows = true
            this.terrainWaterPlane.receiveShadows = true
        }

        // Water planes
        this.waterPlane = Builder.createHorizontalPlane(scene, parent, 2048, 0)
        this.waterPlane.material = Materials.waterMaterial
        this.waterPlane.position.y = 1
        this.waterPlane.isPickable = false
        this.waterPlane.alwaysSelectAsActiveMesh = true
        this.waterPlane.renderingGroupId = 0

        this.applySeaWaterLevel()

        if (BEVELED_TERRAIN_ENABLED) BeveledTerrain.initialize(scene, parent)
        smoothTerrainExperiment?.initialize(scene, parent, onSmoothReady)
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

    addWaterTerrainLayer(
        x: number, z: number, blockHeight: number, planeHeightOffset: number, block: MapBlock, terrainMatrices1: Matrix[], terrainUvData1: Vector2[], waterPlaneMatrices: Matrix[], waterPlaneUvData: Vector2[]) {
        const bottomY = block.deepWater ? blockHeight - 1 : blockHeight - 0.5
        terrainMatrices1.push(Matrix.Translation(x, bottomY, z))
        terrainUvData1.push(TerrainEnum1.getTerrainForBlock(this.waterBottomBlock!))

        waterPlaneMatrices.push(Matrix.Translation(x, blockHeight + planeHeightOffset, z))
        waterPlaneUvData.push(PlaneEnum1.PLANE_WATER.uv)

        if (block.deepWater) {
            waterPlaneMatrices.push(Matrix.Translation(x, blockHeight - 0.5 + planeHeightOffset, z))
            waterPlaneUvData.push(PlaneEnum1.PLANE_WATER.uv)
        }
    },

    renderTerrain(renderTerrainStatics?: (terrainMatrices: Matrix[], terrainUvData: Vector2[]) => void, snowCoverMask: Set<number> = new Set()) {
        const world = WorldDataManager.worldDataMap.get(MyPlayer.worldId)!
        const map = world.blockMap
        const center = MyPlayer.myChar.getPositionRounded()
        const outdoor = !Lights.indoor && !smoothTerrainExperiment && !!this.outdoorFactory
        if (outdoor && this.outdoorFactory) {
            this.outdoorTerrain ??= this.outdoorFactory(WorldRenderer.worldParentNode!)
            const load = WorldDataManager.terrainRenderLoad
            this.outdoorTerrain.render(map, center, snowCoverMask, world.renderRevision,
                load?.worldId === MyPlayer.worldId ? load.data : undefined, world.originalBlocks)
        } else {
            this.outdoorTerrain?.setEnabled(false)
        }
        this.renderTerrainArea(map, world.planeBlockMap, snowCoverMask, center, renderTerrainStatics, outdoor)
        return outdoor
    },

    renderTerrainArea(
        blockMap: MapBlock[][],
        planeBlockMap: (MapBlock | false)[][],
        snowCoverMask: Set<number>,
        viewportCenter?: {x: number, y: number, z: number},
        renderTerrainStatics?: (terrainMatrices: Matrix[], terrainUvData: Vector2[]) => void,
        outdoor = false,
    ) {
        const terrainMatrices1: Matrix[] = []
        const terrainUvData1: Vector2[] = []
        const planeMatrices: Matrix[] = []
        const planeUvData: Vector2[] = []
        const waterPlaneMatrices: Matrix[] = []
        const waterPlaneUvData: Vector2[] = []

        IndoorTerrainOcclusionManager.beginTerrainRender(blockMap, Lights.indoor)
        smoothTerrainExperiment?.begin()
        if (BEVELED_TERRAIN_ENABLED) BeveledTerrain.begin()

        const maxIndex = blockMap.length - 1
        const minX = viewportCenter ? Math.max(0, viewportCenter.x + ViewportManager.minX) : 0
        const minZ = viewportCenter ? Math.max(0, viewportCenter.z + ViewportManager.minZ) : 0
        const maxX = viewportCenter ? Math.min(maxIndex, viewportCenter.x + ViewportManager.maxX) : maxIndex
        const maxZ = viewportCenter ? Math.min(maxIndex, viewportCenter.z + ViewportManager.maxZ) : maxIndex
        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const block = blockMap[x][z]

                // Check if block is in visible matrix
                if (viewportCenter && !ViewportManager.isPointInVisibleMatrix(x, z, 2, block.totalHeight, 0, viewportCenter)) {
                    continue
                }

                if (block.type > 0 && (block.stonePath || block.beigeStonePath)) {
                    const pathMatrix = Matrix.Scaling(1, 0.12, 1)
                    pathMatrix.setTranslationFromFloats(x, block.height + 0.56, z)
                    WorldRenderer.block1!.matrices.push(pathMatrix)
                    WorldRenderer.block1!.uvData.push(block.beigeStonePath ? MaterialEnum1.ROCK1_BEIGE.uv : MaterialEnum1.ROCK1.uv)
                }
                if (outdoor) {
                    if (block.type === WATER_BLOCK_TYPE) {
                        this.addWaterTerrainLayer(x, z, block.height, getTerrainHeightOffset(block, false), block,
                            terrainMatrices1, terrainUvData1, waterPlaneMatrices, waterPlaneUvData)
                    }
                    continue
                }

                const hideSnow = block.snowed && snowCoverMask.has(x * blockMap.length + z)
                const renderType = hideSnow && GRASS_BLOCK_TYPES.has(block.type) ? DIRT_BLOCK_TYPE : undefined
                const heightOffset = getTerrainHeightOffset(block, hideSnow)
                // A stone path is its own thin floor. Unlike snow it must not
                // stretch the terrain block beneath it.
                const terrainHeightOffset = block.stonePath || block.beigeStonePath ? 0 : heightOffset
                let bevelMask = BEVELED_TERRAIN_ENABLED && !Lights.indoor
                    ? terrainBevelMask(blockMap, x, z, snowCoverMask) : 0
                if (BEVELED_TERRAIN_ENABLED && !Lights.indoor && !planeBlockMap[x][z]
                    && block.type > 0 && block.type < WATER_BLOCK_TYPE && !block.stonePath && !block.beigeStonePath) {
                    bevelMask |= terrainVerticalBevelMask(blockMap, x, z, block.height, snowCoverMask)
                }

                if (block.type > 0) {
                    if (smoothTerrainExperiment?.accepts(block, x, z)) {
                        smoothTerrainExperiment.requestTile(x, z)
                    } else if (bevelMask && planeBlockMap[x][z]) {
                        BeveledTerrain.add(bevelMask, true, x, z, block.height, terrainHeightOffset,
                            PlaneEnum1.getPlaneForBlock(block, hideSnow, renderType))
                    } else if (planeBlockMap[x][z]) {
                        if (block.type === WATER_BLOCK_TYPE) {
                            this.addWaterTerrainLayer(x, z, block.height, heightOffset, block, terrainMatrices1, terrainUvData1, waterPlaneMatrices, waterPlaneUvData)
                        } else {
                            const matrix = Matrix.Translation(x, block.height + terrainHeightOffset, z)
                            planeMatrices.push(matrix)
                            planeUvData.push(PlaneEnum1.getPlaneForBlock(planeBlockMap[x][z] as MapBlock, hideSnow, renderType))
                        }
                    } else {

                        // Find lowest height for surrounding blocks to avoid gaps
                        let minHeight = block.height
                        for (let offsetX = -1; offsetX <= 1; offsetX++) {
                            for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
                                if (offsetX === 0 && offsetZ === 0) {
                                    continue
                                }
                                const neighborX = x + offsetX
                                const neighborZ = z + offsetZ
                                if (neighborX >= 0 && neighborX < blockMap.length && neighborZ >= 0 && neighborZ < blockMap.length) {
                                    const neighborBlock = blockMap[neighborX][neighborZ]
                                    if (neighborBlock.type > 0 && neighborBlock.height < minHeight) {
                                        minHeight = neighborBlock.height
                                    }
                                }
                            }
                        }

                        const matrix = Matrix.Scaling(1, 1 + terrainHeightOffset, 1)
                        matrix.setTranslationFromFloats(x, block.height + terrainHeightOffset * 0.5, z)

                        if (bevelMask) {
                            BeveledTerrain.add(bevelMask, false, x, z, block.height, terrainHeightOffset,
                                TerrainEnum1.getTerrainForBlock(block, hideSnow, renderType))
                        } else IndoorTerrainOcclusionManager.routeTerrainBlock(
                            x,
                            z,
                            block.height,
                            matrix,
                            TerrainEnum1.getTerrainForBlock(block, hideSnow, renderType),
                            terrainMatrices1,
                            terrainUvData1,
                        )

                        // If minheight is lower than current block height - 1, then fill the gap with blocks
                        for (let fillHeight = minHeight + 1; fillHeight < block.height; fillHeight++) {
                            // heightOffset only extends the top block (for example the 0.1 snow layer).
                            // Applying it to the regular fill blocks moves their top down from the
                            // snow block and leaves a visible horizontal gap in a terrain wall.
                            const fillMatrix = Matrix.Translation(x, fillHeight, z);
                            const fillType = GRASS_BLOCK_TYPES.has(block.type) ? DIRT_BLOCK_TYPE : renderType
                            const verticalMask = BEVELED_TERRAIN_ENABLED && !Lights.indoor
                                && block.type > 0 && block.type < WATER_BLOCK_TYPE && !block.stonePath && !block.beigeStonePath
                                ? terrainVerticalBevelMask(blockMap, x, z, fillHeight, snowCoverMask) : 0
                            if (verticalMask) {
                                BeveledTerrain.add(verticalMask, false, x, z, fillHeight, 0,
                                    TerrainEnum1.getTerrainForBlock(block, true, fillType))
                            } else IndoorTerrainOcclusionManager.routeTerrainBlock(
                                x,
                                z,
                                fillHeight,
                                fillMatrix,
                                TerrainEnum1.getTerrainForBlock(block, true, fillType),
                                terrainMatrices1,
                                terrainUvData1,
                            )
                        }
                    }

                }
            }
        }

        renderTerrainStatics?.(terrainMatrices1, terrainUvData1)
        IndoorTerrainOcclusionManager.finishTerrainRender()
        smoothTerrainExperiment?.finish(blockMap, snowCoverMask)
        if (BEVELED_TERRAIN_ENABLED) BeveledTerrain.finish()

        // Apply buffers for instances
        this.terrainBlockMatrixBuffer = updateWorldInstanceBuffers(this.terrainBlock1!, terrainMatrices1, terrainUvData1)
        updateWorldInstanceBuffers(this.terrainPlane!, planeMatrices, planeUvData)
        updateWorldInstanceBuffers(this.terrainWaterPlane!, waterPlaneMatrices, waterPlaneUvData)

        // Set enabled based on if there are instances to show
        this.terrainBlock1!.setEnabled(terrainMatrices1.length > 0)
        this.terrainPlane!.setEnabled(planeMatrices.length > 0)
        this.terrainWaterPlane!.setEnabled(waterPlaneMatrices.length > 0)
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
