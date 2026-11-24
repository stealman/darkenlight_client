import {
    Matrix,
    Mesh,
    Scene,
    TransformNode, Vector2, Vector3,
} from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials } from '@/babylon/materials'
import { TreeManager } from '@/babylon/world/treeManager'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'
import { getTerrainHeightOffset, TerrainManager } from '@/babylon/world/terrainManager'
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
import { TerrainDebrisManager } from '@/babylon/world/terrainDebrisManager'
import { StoneBatch } from '@/babylon/world/stoneBatch'
import { isSnowRoof, outdoorSurfaceHeight } from '@/babylon/world/terrainRoofShape'
import { StaticTerrainContact } from '@/babylon/world/statics/staticTerrainContact'

// The viewport already renders a four-tile reserve. On touch devices, keep one
// tile of that reserve instead of rebuilding every world buffer on every tile.
const TOUCH_WORLD_RENDER_STEP_TILES = 2
const STATIC_TERRAIN_CONTACT_ENABLED = true

export const WorldRenderer = {
    snowCoverMask: new Set<number>(),
    block1: null as SymmetricBlock | null,
    staticTerrainContact: null as StaticTerrainContact | null,
    blockWithAlpha1: null as SymmetricBlock | null,
    translucentPlane: null as SymmetricBlock | null,
    worldParentNode: null as TransformNode | null,

    lastPos: null as Vector3 | null,

    initialize(scene: Scene) {
        this.lastPos = null
        this.worldParentNode = new TransformNode("worldNode", scene)

        // Global blocks
        let blockMaterial = Materials.blockMat1!
        this.staticTerrainContact = null
        if (STATIC_TERRAIN_CONTACT_ENABLED && !Settings.isDetalLevelLow()) {
            blockMaterial = Materials.createBlockMat1(scene)
            blockMaterial.maxSimultaneousLights = Materials.blockMat1!.maxSimultaneousLights
            this.staticTerrainContact = new StaticTerrainContact(blockMaterial)
        }
        this.block1 = new SymmetricBlock(Builder.createWrappedBlock(scene, this.worldParentNode), blockMaterial)
        this.block1.mesh.doNotSyncBoundingInfo = true
        this.block1.mesh.receiveShadows = true

        this.blockWithAlpha1 = new SymmetricBlock(Builder.createBlock(scene, this.worldParentNode), Materials.blockMatAlpha1!)
        this.blockWithAlpha1.mesh.doNotSyncBoundingInfo = true
        this.blockWithAlpha1.mesh.receiveShadows = true

        this.translucentPlane = new SymmetricBlock(Builder.createHorizontalPlane(scene, this.worldParentNode, 1, 0), Materials.blockMatTrans!)
        this.translucentPlane.mesh.doNotSyncBoundingInfo = true
        this.translucentPlane.mesh.receiveShadows = true
        StoneBatch.initialize(scene, this.worldParentNode, true)

        // Initialize managers
        TerrainManager.initialize(scene)
        IndoorTerrainOcclusionManager.initialize(scene, this.worldParentNode)
        TreeManager.initialize(scene)
        StaticsManager.initialize(scene)
        BuildingManager.initialize(scene, this.worldParentNode)
        FoliageManager.initialize(scene, this.worldParentNode)
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
        Lights.addShadowCaster(StoneBatch.prefab!.mesh, true, true)
        // Transparent/alpha world geometry is not a local static-light caster.
        Lights.addShadowCaster(this.blockWithAlpha1.mesh, true)
        TreeManager.addAllShadowCasters()
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
        this.staticTerrainContact?.clear()
        this.blockWithAlpha1!.clearMatrices()
        this.translucentPlane!.clearMatrices()
        StoneBatch.clear()
        const blockMap = WorldDataManager.getBlockMap()
        const {mask: snowCoverMask, vegetationMask} = createSnowCoverMask(
            TreeManager.allTrees,
            StaticsManager.allStatics,
            blockMap.length,
            MyPlayer.worldId,
            (x, z) => blockMap[x][z].height,
        )
        this.snowCoverMask = snowCoverMask

        // Render terrain
        const outdoorTerrain = TerrainManager.renderTerrain((terrainMatrices, terrainUvData) => {
            StaticsManager.renderTerrainBlocks(terrainMatrices, terrainUvData)
        }, snowCoverMask)

        // Render trees
        TreeManager.renderTrees()

        // Render statics
        // renderTerrainBlocks already updated visibility for this same pass.
        StaticsManager.renderObjects(true)
        TerrainDebrisManager.render()

        // Buildings own their meshes so they can later fade independently.
        BuildingManager.renderBuildings()

        // Runtime chunks are wider than the visual viewport. Keep loaded
        // equipment decorations in memory, but only submit visible ones to
        // the shared equipment thin-instance meshes.
        EquipmentDecorationsManager.refreshVisibility()

        // Render decorative foliage
        if (outdoorTerrain) {
            FoliageManager.foliageMesh?.setEnabled(false)
            FoliageManager.groundMesh?.setEnabled(false)
        } else {
            FoliageManager.renderFoliage(snowCoverMask, vegetationMask)
            RockDebrisManager.renderRockDebris(Lights.indoor)
        }
        StoneBatch.flush()
        FoggyAreaManager.refreshVisibleAreas()

        if (GMManager.gmPanelVisible.value && GMManager.tab === GmTabs.SPAWNS_EDIT) {
            GMSpawns.renderSpawnMarkers()
        }
        if (GMManager.gmPanelVisible.value && GMManager.tab === GmTabs.FOG_EDIT) {
            GMFoggyAreas.renderMarkers()
        }

        this.block1!.setThinInstanceBuffers()
        this.staticTerrainContact?.upload(this.block1!.mesh, this.block1!.matrices.length)

        this.blockWithAlpha1!.setThinInstanceBuffers()

        this.translucentPlane!.setThinInstanceBuffers()

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
        Lights.registerSharedLightMesh(StoneBatch.prefab!.mesh)
    },

    addTerrainContactBlock(matrix: Matrix, uv: Vector2, blendGroundLighting = false, snowReach = 4 / 3) {
        const batch = this.block1!
        const index = batch.matrices.length
        batch.matrices.push(matrix)
        batch.uvData.push(uv)
        if (!this.staticTerrainContact) return

        // Sample the tile under the bottom center, accounting for tilted parts.
        const m = matrix.m
        const x = Math.round(m[12] - m[4] * 0.5)
        const z = Math.round(m[14] - m[6] * 0.5)
        const foot = m[13] - m[5] * 0.5 - 0.5 // The wrapped cube prefab sits half a unit lower.
        const snowHeight = this.getSnowContactHeight(x, z)
        if (snowHeight !== undefined && Math.abs(foot - snowHeight) <= 0.15) {
            this.staticTerrainContact.addSnow(index, snowHeight, snowReach, blendGroundLighting)
        }
    },

    getSnowContactHeight(x: number, z: number) {
        if (this.staticTerrainContact) return this.getSnowSurfaceHeight(x, z)
    },

    getSnowSurfaceHeight(x: number, z: number) {
        if (Lights.indoor) return
        const map = WorldDataManager.getBlockMap()
        const tile = map[x]?.[z]
        if (!tile || !isSnowRoof(tile) || tile.stonePath || tile.beigeStonePath
            || this.snowCoverMask.has(x * map.length + z) || BuildingManager.hasFloorAtTile(x, z)) return
        return TerrainManager.usesOutdoorTerrain() ? outdoorSurfaceHeight(tile) : tile.height + getTerrainHeightOffset(tile, false)
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
        this.matrixBuffer = updateWorldInstanceBuffers(this.mesh, this.matrices, this.uvData)
    }
}

export class SymmetricBlock {
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
        this.matrixBuffer = updateWorldInstanceBuffers(this.mesh, this.matrices, this.uvData)
    }
}
