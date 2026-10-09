import {
    Matrix,
    Mesh,
    Scene,
    TransformNode, Vector2, Vector3,
} from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials } from '@/babylon/materials'
import { TreeManager } from '@/babylon/world/treeManager'
import { BabylonUtils } from '@/babylon/utils'
import { TerrainManager } from '@/babylon/world/terrainManager'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import { FoliageManager } from '@/babylon/world/foliageManager'
import { RockDebrisManager } from '@/babylon/world/rockDebrisManager'
import { GMSpawns } from '@/gm/GmSpawns'
import { GMManager, GmTabs } from '@/gm/GM'
import { Lights } from '@/babylon/scene/lights'
import { ViewportManager } from '@/utils/viewport'
import { WorldDataManager } from '@/data/worldDataManager'
import { TargetingManager } from '@/gui/targettingManager'
import { MyPlayer } from '@/data/myPlayer'
import { createSnowCoverMask } from '@/babylon/world/snowCoverMask'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'
import { FoggyAreaManager } from '@/babylon/world/foggyAreaManager'
import { GMFoggyAreas } from '@/gm/GmFoggyAreas'

export const WorldRenderer = {
    block1: null as SymmetricBlock | null,
    blockWithAlpha1: null as SymmetricBlock | null,
    worldParentNode: null as TransformNode | null,

    lastPos: null as Vector3 | null,

    initialize(scene: Scene) {
        this.lastPos = null
        this.worldParentNode = new TransformNode("worldNode", scene)

        // Global blocks
        this.block1 = new SymmetricBlock(Builder.createWrappedBlock(scene, this.worldParentNode), Materials.blockMat1!)
        this.block1.mesh.doNotSyncBoundingInfo = true
        this.block1.mesh.receiveShadows = true

        this.blockWithAlpha1 = new SymmetricBlock(Builder.createBlock(scene, this.worldParentNode), Materials.blockMatAlpha1!)
        this.blockWithAlpha1.mesh.doNotSyncBoundingInfo = true
        this.blockWithAlpha1.mesh.receiveShadows = true

        // Initialize managers
        TerrainManager.initialize(scene)
        TreeManager.initialize(scene)
        StaticsManager.initialize(scene)
        BuildingManager.initialize(scene, this.worldParentNode)
        FoliageManager.initialize(scene, this.worldParentNode)
        RockDebrisManager.initialize(scene, this.worldParentNode)
        FoggyAreaManager.initialize(scene)

        Lights.addShadowCaster(TerrainManager.terrainBlock1!, true, true)
        Lights.addShadowCaster(TerrainManager.terrainPlane!, true, true)
        Lights.addShadowCaster(TerrainManager.terrainWaterPlane!, true, true)
        Lights.addShadowCaster(this.block1.mesh, true, true)
        Lights.addShadowCaster(this.blockWithAlpha1.mesh, true, true)
        TreeManager.addAllShadowCasters()
        StaticsManager.addAllShadowCasters()
    },

    checkRenderWorld() {
        const pos = MyPlayer.myChar.getPositionRounded()
        if (this.lastPos == null || pos.x !== this.lastPos.x || pos.z !== this.lastPos.z) {
            if (ViewportManager.viewPortInitialized) {
                WorldDataManager.fetchWorldDataIfNeeded()
                WorldRenderer.renderWorld()
                TargetingManager.resetCycleIndex()
                this.lastPos = pos
            }
        }
    },

    /**
     * Renders the world around the player
     */
    renderWorld() {
        this.block1!.clearMatrices()
        this.blockWithAlpha1!.clearMatrices()
        const blockMap = WorldDataManager.getBlockMap()
        const snowCoverMask = createSnowCoverMask(
            TreeManager.allTrees,
            StaticsManager.allStatics,
            blockMap.length,
            MyPlayer.worldId,
            (x, z) => blockMap[x][z].height,
        )

        // Render terrain
        TerrainManager.renderTerrain((terrainMatrices, terrainUvData) => {
            StaticsManager.renderTerrainBlocks(terrainMatrices, terrainUvData)
        }, snowCoverMask)

        // Render trees
        TreeManager.renderTrees()

        // Render statics
        StaticsManager.renderObjects()

        // Buildings own their meshes so they can later fade independently.
        BuildingManager.renderBuildings()

        // Render decorative foliage
        FoliageManager.renderFoliage()

        // Render decorative rock debris
        RockDebrisManager.renderRockDebris(Lights.indoor)
        FoggyAreaManager.refreshVisibleAreas()

        if (GMManager.gmPanelVisible && GMManager.tab === GmTabs.SPAWNS_EDIT) {
            GMSpawns.renderSpawnMarkers()
        }
        if (GMManager.gmPanelVisible && GMManager.tab === GmTabs.FOG_EDIT) {
            GMFoggyAreas.renderMarkers()
        }

        this.block1!.setThinInstanceBuffers()
        this.block1!.mesh.thinInstanceRefreshBoundingInfo(false);

        this.blockWithAlpha1!.setThinInstanceBuffers()
        this.blockWithAlpha1!.mesh.thinInstanceRefreshBoundingInfo(false);

        // Static light slots are excluded from ordinary scene meshes and are
        // attached explicitly. Keep this registration separate from shader
        // warm-up so fireplaces and torches continue to illuminate terrain.
        Lights.registerSharedLightMesh(TerrainManager.terrainBlock1!)
        Lights.registerSharedLightMesh(TerrainManager.terrainPlane!)
        Lights.registerSharedLightMesh(this.block1!.mesh)
        Lights.registerSharedLightMesh(this.blockWithAlpha1!.mesh)
        Lights.registerSharedLightMesh(RockDebrisManager.mesh!)
    }
}

export class Prefab {
    mesh: Mesh
    matrices: Matrix[] = []
    uvData: Vector2[] = []
    matrixBuffer: Float32Array = new Float32Array(0)

    constructor(mesh: Mesh) {
        this.mesh = mesh
        this.mesh.doNotSyncBoundingInfo = true
    }

    clearMatrices() {
        this.matrices = []
        this.uvData = []
    }

    setThinInstanceBuffers() {
        this.matrixBuffer = BabylonUtils.createPositionBuffer(this.matrices)
        this.mesh.thinInstanceSetBuffer("matrix", this.matrixBuffer, 16, false)
        this.mesh.thinInstanceSetBuffer("uvc", BabylonUtils.createUvBuffer(this.uvData), 2)
    }
}

class SymmetricBlock {
    mesh: Mesh
    matrices: Matrix[] = []
    uvData: Vector2[] = []
    matrixBuffer: Float32Array = new Float32Array(0)

    constructor(mesh: Mesh, material: PBRCustomMaterial) {
        this.mesh = mesh
        this.mesh.material = material
    }

    clearMatrices() {
        this.matrices = []
        this.uvData = []
    }

    setThinInstanceBuffers() {
        this.matrixBuffer = BabylonUtils.createPositionBuffer(this.matrices)
        this.mesh.thinInstanceSetBuffer("matrix", this.matrixBuffer, 16, false)
        this.mesh.thinInstanceSetBuffer("uvc", BabylonUtils.createUvBuffer(this.uvData), 2)
    }
}
