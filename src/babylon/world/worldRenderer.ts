import {
    Color3,
    Matrix,
    Mesh,
    MeshBuilder,
    Scene,
    StandardMaterial,
    TransformNode, Vector2, Vector3,
} from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials, TerrainEnum1 } from '@/babylon/materials'
import { TreeManager } from '@/babylon/world/treeManager'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'
import { getTerrainHeightOffset, TerrainManager, WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
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
import { SNOW_CONTACT_MAX_HEIGHT, StaticTerrainContact } from '@/babylon/world/statics/staticTerrainContact'
import type { DampContact } from '@/babylon/world/statics/staticTerrainContact'

// The viewport already renders a four-tile reserve. On touch devices, keep one
// tile of that reserve instead of rebuilding every world buffer on every tile.
const TOUCH_WORLD_RENDER_STEP_TILES = 2
const STATIC_TERRAIN_CONTACT_ENABLED = true

function updateGrassMarkers(parent: TransformNode, mesh: Mesh | null, name: string, color: string, matrices: Matrix[]) {
    if (!matrices.length) {
        mesh?.setEnabled(false)
        return mesh
    }
    if (!mesh) {
        const scene = parent.getScene()
        mesh = MeshBuilder.CreateGround(name, {width: 0.96, height: 0.96}, scene)
        mesh.parent = parent
        mesh.isPickable = false
        const material = new StandardMaterial(name, scene)
        material.disableLighting = true
        material.emissiveColor = Color3.FromHexString(color)
        material.alpha = 0.26
        mesh.material = material
    }
    updateWorldInstanceBuffers(mesh, matrices, [])
    mesh.setEnabled(true)
    return mesh
}

export interface StaticBaseContact {
    height: number
    snowHeight: number | undefined
}

export const WorldRenderer = {
    snowCoverMask: new Set<number>(),
    block1: null as SymmetricBlock | null,
    staticTerrainContact: null as StaticTerrainContact | null,
    blockWithAlpha1: null as SymmetricBlock | null,
    translucentPlane: null as SymmetricBlock | null,
    worldParentNode: null as TransformNode | null,
    grassExclusionMarkers: null as Mesh | null,
    forcedGrassMarkers: null as Mesh | null,

    lastPos: null as Vector3 | null,

    async initialize(scene: Scene) {
        this.lastPos = null
        this.grassExclusionMarkers?.dispose(false, true)
        this.grassExclusionMarkers = null
        this.forcedGrassMarkers?.dispose(false, true)
        this.forcedGrassMarkers = null
        this.worldParentNode = new TransformNode("worldNode", scene)

        // Global blocks
        const blockMaterial = this.createStaticBlockMaterial(scene, !Settings.isDetalLevelLow())
        this.block1 = new SymmetricBlock(Builder.createWrappedBlock(scene, this.worldParentNode), blockMaterial)
        this.block1.mesh.doNotSyncBoundingInfo = true
        this.block1.mesh.receiveShadows = true

        this.blockWithAlpha1 = new SymmetricBlock(Builder.createBlock(scene, this.worldParentNode), Materials.blockMatAlpha1!)
        this.blockWithAlpha1.mesh.doNotSyncBoundingInfo = true
        this.blockWithAlpha1.mesh.receiveShadows = true

        this.translucentPlane = new SymmetricBlock(Builder.createHorizontalPlane(scene, this.worldParentNode, 1, 0), Materials.blockMatTrans!)
        this.translucentPlane.mesh.doNotSyncBoundingInfo = true
        this.translucentPlane.mesh.receiveShadows = true
        StoneBatch.initialize(scene, this.worldParentNode, Settings.isDetalLevelHigh())

        // Initialize managers
        await TerrainManager.initialize(scene)
        TreeManager.initialize(scene)
        StaticsManager.initialize(scene)
        BuildingManager.initialize(scene, this.worldParentNode)
        FoggyAreaManager.initialize(scene)

        // Flat terrain cannot create a useful nearby personal-light
        // silhouette, but would otherwise be redrawn into its map every frame.
        Lights.addShadowCaster(TerrainManager.terrainPlane!, false)
        Lights.addShadowCaster(this.block1.mesh, true, true)
        Lights.addShadowCaster(StoneBatch.prefab!.mesh, true, true)
        // Transparent/alpha world geometry is not a local static-light caster.
        Lights.addShadowCaster(this.blockWithAlpha1.mesh, true)
        TreeManager.addAllShadowCasters()
    },

    checkRenderWorld() {
        const {x, y, z} = MyPlayer.myChar.pos
        const renderStep = Settings.isPhoneOrTablet() ? TOUCH_WORLD_RENDER_STEP_TILES : 1
        const renderDue = this.lastPos == null
            || Math.abs(Math.round(x) - this.lastPos.x) >= renderStep
            || Math.abs(Math.round(z) - this.lastPos.z) >= renderStep
        if (renderDue) {
            if (ViewportManager.viewPortInitialized) {
                WorldDataManager.fetchWorldDataIfNeeded()
                WorldRenderer.renderWorld()
                TargetingManager.resetCycleIndex()
                this.lastPos ??= new Vector3()
                this.lastPos.set(Math.round(x), Math.round(y), Math.round(z))
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
        const snowCoverMask = createSnowCoverMask(StaticsManager.allStatics, blockMap.length)
        this.snowCoverMask = snowCoverMask

        // Render terrain
        StaticsManager.prepareRender()
        const outdoorTerrain = TerrainManager.renderTerrain(snowCoverMask)

        // Render trees
        TreeManager.renderTrees()

        // Render statics
        // Visibility and render captures were prepared before terrain contact shadows.
        StaticsManager.renderObjects(true)
        TerrainDebrisManager.render()

        // Buildings own their meshes so they can later fade independently.
        BuildingManager.renderBuildings()

        // Runtime chunks are wider than the visual viewport. Keep loaded
        // equipment decorations in memory, but only submit visible ones to
        // the shared equipment thin-instance meshes.
        EquipmentDecorationsManager.refreshVisibility()

        if (!outdoorTerrain) RockDebrisManager.renderRockDebris(Lights.indoor)
        StoneBatch.flush()
        FoggyAreaManager.refreshVisibleAreas()

        if (GMManager.gmPanelVisible.value && GMManager.tab === GmTabs.SPAWNS_EDIT) {
            GMSpawns.renderSpawnMarkers()
        }
        if (GMManager.gmPanelVisible.value && GMManager.tab === GmTabs.FOG_EDIT) {
            GMFoggyAreas.renderMarkers()
        }
        this.refreshGrassOverrideMarkers()

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
        Lights.registerSharedLightMesh(TerrainManager.terrainPlane!)
        Lights.registerSharedLightMesh(this.block1!.mesh)
        Lights.registerSharedLightMesh(this.blockWithAlpha1!.mesh)
        Lights.registerSharedLightMesh(this.translucentPlane!.mesh)
        Lights.registerSharedLightMesh(StoneBatch.prefab!.mesh)
    },

    hideGrassOverrideMarkers() {
        this.grassExclusionMarkers?.setEnabled(false)
        this.forcedGrassMarkers?.setEnabled(false)
    },

    refreshGrassOverrideMarkers() {
        const parent = this.worldParentNode
        if (!parent || !MyPlayer.myChar || Lights.indoor || !GMManager.gmPanelVisible.value || GMManager.tab !== GmTabs.BIOME_EDIT) {
            this.hideGrassOverrideMarkers()
            return
        }
        const world = WorldDataManager.worldDataMap.get(MyPlayer.worldId)
        if (!world || (!world.noGrassTiles.size && !world.forcedGrassTiles.size)) {
            this.hideGrassOverrideMarkers()
            return
        }
        const center = MyPlayer.myChar.getPositionRounded()
        const markerMatrix = (tile: number, size: number) => {
            const x = Math.floor(tile / world.worldSize), z = tile % world.worldSize
            const block = world.blockMap[x]?.[z]
            if (!block || block.type <= 0 || block.type >= WATER_BLOCK_TYPE
                || !ViewportManager.isPointInVisibleMatrix(x, z, 2, block.totalHeight, 0, center)) return
            return Matrix.Scaling(size, 1, size).setTranslationFromFloats(x, block.height + 0.065, z)
        }
        const red: Matrix[] = [], blue: Matrix[] = []
        for (const tile of world.noGrassTiles) {
            const matrix = markerMatrix(tile, 1)
            if (matrix) red.push(matrix)
        }
        for (const [tile, level] of world.forcedGrassTiles) {
            const matrix = markerMatrix(tile, 0.4 + 0.12 * level)
            if (matrix) blue.push(matrix)
        }
        this.grassExclusionMarkers = updateGrassMarkers(parent, this.grassExclusionMarkers, 'grassExclusionMarkers', '#E62938', red)
        this.forcedGrassMarkers = updateGrassMarkers(parent, this.forcedGrassMarkers, 'forcedGrassMarkers', '#277EF0', blue)
    },

    createStaticBlockMaterial(scene: Scene, terrainContact: boolean) {
        this.staticTerrainContact = null
        if (!terrainContact || !STATIC_TERRAIN_CONTACT_ENABLED) return Materials.blockMat1!
        const material = Materials.createBlockMat1(scene)
        material.maxSimultaneousLights = Materials.blockMat1!.maxSimultaneousLights
        this.staticTerrainContact = new StaticTerrainContact(material)
        return material
    },

    addTerrainContactBlock(matrix: Matrix, uv: Vector2, blendGroundLighting = false, snowReach = 4 / 3,
        damp?: DampContact, baseContact?: StaticBaseContact) {
        const batch = this.block1!
        const index = batch.matrices.length
        batch.matrices.push(matrix)
        batch.uvData.push(uv)
        if (!this.staticTerrainContact) return

        if (baseContact) {
            if (baseContact.snowHeight !== undefined) {
                this.staticTerrainContact.addSnow(index, baseContact.snowHeight, snowReach, blendGroundLighting)
            } else if (damp) {
                this.staticTerrainContact.addDamp(index, baseContact.height, damp)
            }
            return
        }

        const m = matrix.m
        const foot = m[13] - m[5] * 0.5 - 0.5 // The wrapped cube prefab sits half a unit lower.
        const groundMossWithTop = damp === 'woodTopAndGroundMoss'
        const woodTop = groundMossWithTop ? 'woodTopWithMoss'
            : damp === 'woodTopWithMoss' || damp === 'stumpCut' ? damp : undefined
        // The top weathers even when the foot has no contact with soil or snow.
        if (woodTop) {
            this.staticTerrainContact.addDamp(index, foot, woodTop)
            if (snowReach <= 0 && !groundMossWithTop) return
        }
        if (damp === 'wellRoofMoss') {
            // The eave is the low end of the panel's local X axis on its upper face.
            const eaveHeight = foot + m[5] - Math.abs(m[1]) * 0.5
            this.staticTerrainContact.addDamp(index, eaveHeight, damp)
            return
        }
        if (damp === 'wellRim') {
            this.staticTerrainContact.addDamp(index, foot, damp)
            return
        }
        // Sample the tile under the bottom center, accounting for tilted parts.
        const x = Math.round(m[12] - m[4] * 0.5)
        const z = Math.round(m[14] - m[6] * 0.5)
        const snowHeight = this.getSnowContactHeight(x, z)
        const edgeDamp = damp === 'walkableEdges' ? damp : undefined
        if (snowReach > 0 && snowHeight !== undefined && Math.abs(foot - snowHeight) <= 0.15) {
            this.staticTerrainContact.addSnow(index, snowHeight, snowReach, blendGroundLighting,
                woodTop ?? edgeDamp)
        } else if (edgeDamp) {
            this.staticTerrainContact.addDamp(index, foot, edgeDamp)
        } else if (damp && (!woodTop || groundMossWithTop) && snowHeight === undefined && !Lights.indoor) {
            const tile = WorldDataManager.getBlockMap()[x]?.[z]
            if (!tile || tile.type <= 0 || tile.type >= WATER_BLOCK_TYPE) return
            const type = tile.type
            const floor = BuildingManager.getFloorHeightAtTile(x, z)
            if ((damp === 'moss' || groundMossWithTop) && (tile.stonePath || tile.beigeStonePath || floor > 0
                || (type !== TerrainEnum1.TERRAIN_GRASS.index && type !== TerrainEnum1.TERRAIN_GRASS_WINTER.index
                    && type !== TerrainEnum1.TERRAIN_DIRT.index && type !== TerrainEnum1.TERRAIN_MUDDY_DIRT.index))) return
            const terrainHeight = TerrainManager.usesOutdoorTerrain() ? outdoorSurfaceHeight(tile) : tile.height + getTerrainHeightOffset(tile, tile.snowed)
            if (terrainHeight !== undefined && Math.abs(foot - (terrainHeight + floor)) <= 0.15) {
                this.staticTerrainContact.addDamp(index, terrainHeight + floor, damp)
            }
        }
    },

    addWeatheredBlock(matrix: Matrix, uv: Vector2, anchor: Vector3, wear: number, snowReach = 1.4,
        blendGroundLighting = true) {
        const batch = this.block1!
        const index = batch.matrices.length
        batch.matrices.push(matrix)
        batch.uvData.push(uv)
        const contact = this.staticTerrainContact
        if (!contact || Lights.indoor) return

        const m = matrix.m
        const x = Math.round(m[12] - m[4] * 0.5)
        const z = Math.round(m[14] - m[6] * 0.5)
        const tile = WorldDataManager.getBlockMap()[x]?.[z]
        if (!tile || tile.type <= 0 || tile.type >= WATER_BLOCK_TYPE || tile.stonePath || tile.beigeStonePath
            || BuildingManager.hasFloorAtTile(x, z)) return
        const height = outdoorSurfaceHeight(tile)!
        if (Math.abs(anchor.y - height) > 0.15) return

        const bottom = m[13] - 0.5 - (Math.abs(m[1]) + Math.abs(m[5]) + Math.abs(m[9])) * 0.5
        if (tile.snowed) {
            if (snowReach > 0 && bottom < height + SNOW_CONTACT_MAX_HEIGHT * snowReach
                && this.getSnowSurfaceHeight(x, z) !== undefined) {
                contact.addSnow(index, height, snowReach, blendGroundLighting)
            }
        } else if (wear > 0) {
            const damp = tile.type === TerrainEnum1.TERRAIN_MUDDY_DIRT.index ? 1
                : tile.type === TerrainEnum1.TERRAIN_GRASS_WINTER.index ? 0.38 : 0
            const high = Settings.isDetalLevelHigh()
            if (damp && bottom < height + (high ? 1 : 0.48)) {
                const seed = Math.sin(anchor.x * 91.7 + anchor.z * 37.3) * 43758.5453
                const variation = 0.38 + (seed - Math.floor(seed)) * 0.83
                contact.addDamp(index, height, high ? 'groundWearHigh' : 'groundWear', Math.min(1.5, wear * damp * variation))
            }
        }
    },

    getSnowContactHeight(x: number, z: number) {
        if (this.staticTerrainContact) return this.getSnowSurfaceHeight(x, z)
    },

    getMuddyDirtContactHeight(x: number, z: number) {
        if (!this.staticTerrainContact || Lights.indoor) return
        const tile = WorldDataManager.getBlockMap()[x]?.[z]
        if (!tile || tile.type !== TerrainEnum1.TERRAIN_MUDDY_DIRT.index || tile.snowed
            || tile.stonePath || tile.beigeStonePath || BuildingManager.hasFloorAtTile(x, z)) return
        return TerrainManager.usesOutdoorTerrain() ? outdoorSurfaceHeight(tile) : tile.height + getTerrainHeightOffset(tile, false)
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
