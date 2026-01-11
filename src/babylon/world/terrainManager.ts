import { MapBlock, WorldDataManager } from '@/data/worldDataManager'
import { Color4, Matrix, Mesh, ParticleSystem, Scene } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { Builder } from '@/babylon/builder'
import { Materials, PlaneEnum1, TerrainEnum1 } from '@/babylon/materials'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { Settings } from '@/settings/settings'
import { ViewportManager } from '@/utils/viewport'
import { Data } from '@/data/globalData'

export const TerrainManager = {
    terrainBlock1: null as Mesh | null,
    terrainPlane: null as Mesh | null,
    waterPlane: null as Mesh | null,

    hoverBlockMarker: null as Mesh | null,

    initialize (scene: Scene) {

        // Terrain and plane blocks
        this.terrainBlock1 = Builder.createBlockWithFaces(scene, WorldRenderer.worldParentNode!)
        this.terrainBlock1.material = Materials.terrainMaterial
        this.terrainBlock1.isPickable = true
        this.terrainBlock1.thinInstanceEnablePicking = true

        this.terrainPlane = Builder.createHorizontalPlane(scene, WorldRenderer.worldParentNode!, 1, 0)
        this.terrainPlane.material = Materials.planeMaterial

        if (Settings.shadows) {
            this.terrainBlock1.receiveShadows = true
            this.terrainPlane.receiveShadows = true
        }

        // Water planes
        this.waterPlane = Builder.createHorizontalPlane(scene, WorldRenderer.worldParentNode,2048, 0)
        this.waterPlane.material = Materials.waterMaterial
        this.waterPlane.position.y = 1
        this.waterPlane.isPickable = false
        this.waterPlane.alwaysSelectAsActiveMesh = true

        for (let i = 1.25; i <= 4.75; i += 0.25) {
            this.waterPlane.createInstance('plane' + i).position.y = i
        }

        this.hoverBlockMarker = Builder.createHorizontalPlane(scene, null,1, 0)
    },

    renderTerrain() {
        const myPos = Data.myChar.getPositionRounded()
        const blockMap = WorldDataManager.getBlockMap()
        const planeBlockMap = WorldDataManager.getPlaneBlockMap()

        const terrainMatrices1 = []
        const terrainUvData1 = []
        const planeMatrices = []
        const planeUvData = []

        for (let x = Math.max(0, myPos.x + ViewportManager.minX); x <= Math.min(blockMap.length, myPos.x + ViewportManager.maxX); x++) {
            for (let z = Math.max(0, myPos.z + ViewportManager.minZ); z <= Math.min(blockMap.length, myPos.z + ViewportManager.maxZ); z++) {

                // Check if block is in visible matrix
                if (!ViewportManager.isPointInVisibleMatrix(x, z, 2)) {
                    continue
                }

                const block = blockMap[x][z]
                const heightOffset = block.heightOffset

                if (block.type > 0) {
                    if (planeBlockMap[x][z]) {
                        const matrix = Matrix.Translation( x, block.height + heightOffset, z);
                        planeMatrices.push(matrix)
                        planeUvData.push(PlaneEnum1.getPlaneForBlock(planeBlockMap[x][z]))
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

                        const scaleMatrix = Matrix.Scaling(1, 1 + heightOffset, 1);
                        const matrix = scaleMatrix.multiply(Matrix.Translation( x, block.height + heightOffset * 0.5, z));
                        terrainMatrices1.push(matrix)
                        terrainUvData1.push(TerrainEnum1.getTerrainForBlock(block))

                        // If minheight is lower than current block height - 1, then fill the gap with blocks
                        for (let fillHeight = minHeight + 1; fillHeight < block.height; fillHeight++) {
                            const fillMatrix = Matrix.Translation(x, fillHeight + heightOffset, z);
                            terrainMatrices1.push(fillMatrix)
                            terrainUvData1.push(TerrainEnum1.getTerrainForBlock(block, true))
                        }
                    }
                }
            }
        }

        // Apply buffers for instances
        this.terrainBlock1!.thinInstanceSetBuffer("matrix", BabylonUtils.createPositionBuffer(terrainMatrices1), 16)
        this.terrainBlock1!.thinInstanceSetBuffer("uvc", BabylonUtils.createUvBuffer(terrainUvData1), 2)
        this.terrainPlane!.thinInstanceSetBuffer("matrix", BabylonUtils.createPositionBuffer(planeMatrices), 16)
        this.terrainPlane!.thinInstanceSetBuffer("uvc", BabylonUtils.createUvBuffer(planeUvData), 2)
    },

    setParticleSplashColorByTerrainType(ps: ParticleSystem, block: MapBlock) {
        if (block.snowed) {
            ps.color1 = new Color4(0.9, 0.85, 0.9, 1)
            ps.color2 = new Color4(0.8, 0.85, 0.9, 1)
            ps.colorDead = new Color4(0.6, 0.6, 0.7, 0.3)
        } else if (block.type) {
            // ROCK
            ps.color1 = new Color4(0.35, 0.32, 0.35, 1)
            ps.color2 = new Color4(0.3, 0.33, 0.38, 1)
            ps.colorDead = new Color4(0.2, 0.2, 0.2, 0.3)
        } else if (block.type) {
            // MUDDY DIRT
            ps.color1 = new Color4(0.45, 0.35, 0.25, 1)
            ps.color2 = new Color4(0.35, 0.25, 0.15, 1)
            ps.colorDead = new Color4(0.2, 0.2, 0.2, 0.3)
        } else {
            // DEFAULT DIRT
            ps.color1 = new Color4(0.6, 0.5, 0.4, 1)
            ps.color2 = new Color4(0.5, 0.4, 0.3, 1)
            ps.colorDead = new Color4(0.3, 0.3, 0.3, 0.3)
        }
    }
}
