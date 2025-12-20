import { WorldDataManager } from '@/data/worldDataManager'
import { Matrix, Mesh, Scene } from '@babylonjs/core'
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
        this.waterPlane = Builder.createHorizontalPlane(scene, WorldRenderer.worldParentNode,256, 0)
        this.waterPlane.material = Materials.waterMaterial
        this.waterPlane.position.y = 1
        this.waterPlane.isPickable = false
        this.waterPlane.alwaysSelectAsActiveMesh = true

        for (let i = 1.25; i <= 4.75; i += 0.25) {
            this.waterPlane.createInstance('plane' + i).position.y = i
        }
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
                if (!ViewportManager.isPointInVisibleMatrix(x - myPos.x, z - myPos.z, 2)) {
                    continue
                }
                const block = blockMap[x][z]
                const heightOffset = block.heightOffset

                if (block.type > 0) {
                    if (planeBlockMap[x][z]) {
                        const matrix = Matrix.Translation( x - myPos.x, block.height + heightOffset, z - myPos.z);
                        planeMatrices.push(matrix)
                        planeUvData.push(PlaneEnum1.getPlaneByIndex(planeBlockMap[x][z].type))
                    } else {
                        const scaleMatrix = Matrix.Scaling(1, 1 + heightOffset, 1);
                        const matrix = scaleMatrix.multiply(Matrix.Translation( x - myPos.x, block.height + heightOffset * 0.5, z - myPos.z));
                        terrainMatrices1.push(matrix)
                        terrainUvData1.push(TerrainEnum1.getTerrainByIndex(block.type))
                    }
                }
            }
        }

        // Apply buffers for instances
        this.terrainBlock1!.thinInstanceSetBuffer("matrix", BabylonUtils.createPositionBuffer(terrainMatrices1), 16)
        this.terrainBlock1!.thinInstanceSetBuffer("uvc", BabylonUtils.createUvBuffer(terrainUvData1), 2)
        this.terrainPlane!.thinInstanceSetBuffer("matrix", BabylonUtils.createPositionBuffer(planeMatrices), 16)
        this.terrainPlane!.thinInstanceSetBuffer("uvc", BabylonUtils.createUvBuffer(planeUvData), 2)
    }
}
