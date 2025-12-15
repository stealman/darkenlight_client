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
import { Data } from '@/data/globalData'
import { Renderer } from '@/babylon/scene/renderer'
import { PBRCustomMaterial } from '@babylonjs/materials'

export const WorldRenderer = {
    block1: null as SymmetricBlock | null,
    blockWithAlpha1: null as SymmetricBlock | null,
    worldParentNode: null as TransformNode | null,

    initialize(scene: Scene) {
        this.worldParentNode = new TransformNode("worldNode", scene)

        // Global blocks
        this.block1 = new SymmetricBlock(Builder.createBlock(scene, this.worldParentNode), Materials.blockMat1!)
        this.block1.mesh.doNotSyncBoundingInfo = true

        this.blockWithAlpha1 = new SymmetricBlock(Builder.createBlock(scene, this.worldParentNode), Materials.blockMatAlpha1!)
        this.blockWithAlpha1.mesh.doNotSyncBoundingInfo = true

        // Initialize managers
        TerrainManager.initialize(scene)
        TreeManager.initialize(scene)

        Renderer.addShadowCaster(TerrainManager.terrainBlock1!)
        Renderer.addShadowCaster(TerrainManager.terrainPlane!)
        Renderer.addShadowCaster(this.block1.mesh)
        Renderer.addShadowCaster(this.blockWithAlpha1.mesh)
        Renderer.addShadowCaster(TreeManager.prefabs.tree1!.mesh)
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

        this.block1!.setThinInstanceBuffers()
        this.block1!.mesh.thinInstanceRefreshBoundingInfo(false);

        this.blockWithAlpha1!.setThinInstanceBuffers()
        this.blockWithAlpha1!.mesh.thinInstanceRefreshBoundingInfo(false);
    },

    updateWorldParentNode() {
        this.worldParentNode!.position = new Vector3(-Data.myChar.getOffset().x, -Data.myChar.modelYpos, -Data.myChar.getOffset().z)
        TerrainManager.waterPlane!._unFreeze()
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
