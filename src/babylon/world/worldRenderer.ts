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
import { GMSpawns } from '@/gm/GmSpawns'
import { GMManager, GmTabs } from '@/gm/GM'
import { Lights } from '@/babylon/scene/lights'
import { ViewportManager } from '@/utils/viewport'
import { WorldDataManager } from '@/data/worldDataManager'
import { TargetingManager } from '@/gui/targettingManager'
import { MyPlayer } from '@/data/myPlayer'

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

        this.blockWithAlpha1 = new SymmetricBlock(Builder.createBlock(scene, this.worldParentNode), Materials.blockMatAlpha1!)
        this.blockWithAlpha1.mesh.doNotSyncBoundingInfo = true

        // Initialize managers
        TerrainManager.initialize(scene)
        TreeManager.initialize(scene)
        StaticsManager.initialize(scene)
        FoliageManager.initialize(scene, this.worldParentNode)

        Lights.addShadowCaster(TerrainManager.terrainBlock1!)
        Lights.addShadowCaster(TerrainManager.terrainPlane!)
        Lights.addShadowCaster(TerrainManager.terrainWaterPlane!)
        Lights.addShadowCaster(this.block1.mesh)
        Lights.addShadowCaster(this.blockWithAlpha1.mesh)
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

        // Render terrain
        TerrainManager.renderTerrain()

        // Render trees
        TreeManager.renderTrees()

        // Render statics
        StaticsManager.renderObjects()

        // Render decorative foliage
        FoliageManager.renderFoliage()

        if (GMManager.gmPanelVisible && GMManager.tab === GmTabs.SPAWNS_EDIT) {
            GMSpawns.renderSpawnMarkers()
        }

        this.block1!.setThinInstanceBuffers()
        this.block1!.mesh.thinInstanceRefreshBoundingInfo(false);

        this.blockWithAlpha1!.setThinInstanceBuffers()
        this.blockWithAlpha1!.mesh.thinInstanceRefreshBoundingInfo(false);
    }
}

export class Prefab {
    mesh: Mesh
    matrices: Matrix[] = []
    uvData: Vector2[] = []

    constructor(mesh: Mesh) {
        this.mesh = mesh
        this.mesh.doNotSyncBoundingInfo = true
    }

    clearMatrices() {
        this.matrices = []
        this.uvData = []
    }

    setThinInstanceBuffers() {
        this.mesh.thinInstanceSetBuffer("matrix", BabylonUtils.createPositionBuffer(this.matrices), 16)
        this.mesh.thinInstanceSetBuffer("uvc", BabylonUtils.createUvBuffer(this.uvData), 2)
    }
}

class SymmetricBlock {
    mesh: Mesh
    matrices: Matrix[] = []
    uvData: Vector2[] = []

    constructor(mesh: Mesh, material: PBRCustomMaterial) {
        this.mesh = mesh
        this.mesh.material = material
    }

    clearMatrices() {
        this.matrices = []
        this.uvData = []
    }

    setThinInstanceBuffers() {
        this.mesh.thinInstanceSetBuffer("matrix", BabylonUtils.createPositionBuffer(this.matrices), 16)
        this.mesh.thinInstanceSetBuffer("uvc", BabylonUtils.createUvBuffer(this.uvData), 2)
    }
}
