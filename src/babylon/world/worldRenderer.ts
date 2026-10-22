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
import { EquipmentDecorationsManager } from '@/babylon/world/equipmentDecorationsManager'
import { Settings } from '@/settings/settings'
import { IndoorTerrainOcclusionManager } from '@/babylon/world/indoorTerrainOcclusionManager'

// The viewport already renders a four-tile reserve. On touch devices, keep one
// tile of that reserve instead of rebuilding every world buffer on every tile.
const TOUCH_WORLD_RENDER_STEP_TILES = 2

export const WorldRenderer = {
    block1: null as SymmetricBlock | null,
    blockWithAlpha1: null as SymmetricBlock | null,
    translucentPlane: null as SymmetricBlock | null,
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

        this.translucentPlane = new SymmetricBlock(Builder.createHorizontalPlane(scene, this.worldParentNode, 1, 0), Materials.blockMatTrans!)
        this.translucentPlane.mesh.doNotSyncBoundingInfo = true
        this.translucentPlane.mesh.receiveShadows = true

        // Initialize managers
        TerrainManager.initialize(scene)
        IndoorTerrainOcclusionManager.initialize(scene, this.worldParentNode)
        TreeManager.initialize(scene)
        StaticsManager.initialize(scene)
        BuildingManager.initialize(scene, this.worldParentNode)
        FoliageManager.initialize(scene, this.worldParentNode)
        RockDebrisManager.initialize(scene, this.worldParentNode)
        FoggyAreaManager.initialize(scene)

        // Terrain receives local-light shadows, but does not need to cast into
        // every static-light shadow map. Keep the block terrain as a
        // sun/personal-light caster for raised terrain edges.
        Lights.addShadowCaster(TerrainManager.terrainBlock1!, true)
        // Flat terrain and water cannot create a useful nearby personal-light
        // silhouette, but would otherwise be redrawn into its map every frame.
        Lights.addShadowCaster(TerrainManager.terrainPlane!, false)
        Lights.addShadowCaster(TerrainManager.terrainWaterPlane!, false)
        Lights.addShadowCaster(this.block1.mesh, true, true)
        // Transparent/alpha world geometry is not a local static-light caster.
        Lights.addShadowCaster(this.blockWithAlpha1.mesh, true)
        TreeManager.addAllShadowCasters()
        StaticsManager.addAllShadowCasters()
    },

    checkRenderWorld() {
        const pos = MyPlayer.myChar.getPositionRounded()
        const renderStep = Settings.isPhoneOrTablet() ? TOUCH_WORLD_RENDER_STEP_TILES : 1
        const renderDue = this.lastPos == null
            || Math.abs(pos.x - this.lastPos.x) >= renderStep
            || Math.abs(pos.z - this.lastPos.z) >= renderStep
        if (renderDue) {
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
        this.translucentPlane!.clearMatrices()
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

        // Runtime chunks are wider than the visual viewport. Keep loaded
        // equipment decorations in memory, but only submit visible ones to
        // the shared equipment thin-instance meshes.
        EquipmentDecorationsManager.refreshVisibility()

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

        this.translucentPlane!.setThinInstanceBuffers()
        this.translucentPlane!.mesh.thinInstanceRefreshBoundingInfo(false);

        // Static-light shadow maps are cached. The visible thin-instance set
        // changed, so active maps need exactly one refresh for the new world
        // buffers; maps containing nearby actors keep updating every frame.
        Lights.invalidateStaticShadowMaps()

        // Static light slots are excluded from ordinary scene meshes and are
        // attached explicitly. Keep this registration separate from shader
        // warm-up so fireplaces and torches continue to illuminate terrain.
        Lights.registerSharedLightMesh(TerrainManager.terrainBlock1!)
        Lights.registerSharedLightMesh(TerrainManager.terrainPlane!)
        Lights.registerSharedLightMesh(this.block1!.mesh)
        Lights.registerSharedLightMesh(this.blockWithAlpha1!.mesh)
        Lights.registerSharedLightMesh(this.translucentPlane!.mesh)
        Lights.registerSharedLightMesh(RockDebrisManager.mesh!)
    },

    async warmUpOcclusionFadeShaders() {
        try {
            await Promise.all([
                TreeManager.warmUpFadeShaders(),
                BuildingManager.warmUpFadeShader(),
                IndoorTerrainOcclusionManager.warmUpFadeShader(),
            ])
        } catch (error) {
            console.warn('World occlusion fade shader warm-up failed', error)
        }
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
