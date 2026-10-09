import { Connector } from '@/network/connector'
import { GMBuildingChange, GMCreateItemMsg, GMDayNightCycleMsg, GMForceSaveDataMsg, GMGenerateBiomeMsg, GMLoadItemCodebookMsg, GMLoadWorldMapImageMsg, GMLoadWorldSettingsMsg, GMLoadWorldsMsg, GMNpcAction, GMSaveMapDataMsg, GMSaveWorldMapHeightChangesMsg, GMSaveWorldMapSurfaceChangesMsg, GMSaveWorldMapTerrainChangesMsg, GMSaveWorldSettingsMsg, GMStaticDeleteInfoRequest, GMStaticObjectChange, GMTeleportMsg, GMTerrainChange } from '@/network/messages'
import { GMItemCodebookItem, GMStaticDeleteInfoData, GMWorldBiomeTreesChangedData, GMWorldMapImageData, GMWorldSettingsData, GMWorldsData } from '@/network/messageIfs'
import { GMSceneManager } from '@/babylon/gm/GmSceneManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { ref, watch } from 'vue'
import { Vector3 } from '@babylonjs/core'
import { Utils } from '@/utils/utils'
import { GMSpawns } from '@/gm/GmSpawns'
import { Renderer } from '@/babylon/scene/renderer'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { NpcManager } from '@/babylon/npc/npcManager'
import { TargetingManager } from '@/gui/targettingManager'
import { MyPlayer } from '@/data/myPlayer'
import { StaticObjectsCodebook } from '@/babylon/world/statics/staticsCodebook'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import { TreeManager } from '@/babylon/world/treeManager'
import type { StaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'
import type { BuildingData } from '@/babylon/world/buildings/buildingManager'

/**
 * Main GM tabs
 *
 * OVERVIEW
 * TERRAIN_EDIT
 */
export const GmTabs = {
    OVERVIEW: 'overview',
    WORLDS: 'worlds',
    TERRAIN_EDIT: 'terrain_edit',
    BIOME_EDIT: 'biome_edit',
    WALLS_AND_FENCES_EDIT: 'walls_and_fences_edit',
    STATICS_EDIT: 'statics_edit',
    BUILDINGS_EDIT: 'buildings_edit',
    SPAWNS_EDIT: 'spawns_edit',
    NPCS_EDIT: 'npcs_edit'
}

export const VOID_TERRAIN_SELECTION = 102
export const STONE_PATH_TERRAIN_SELECTION = 103
export const BEIGE_STONE_PATH_TERRAIN_SELECTION = 104
export const WALL_TORCH_STATIC_ID = 261
export const TORCH_STAND_STATIC_ID = 262
export const LANTERN_STAND_STATIC_ID = 263
export const STONE_ENTRANCE_STATIC_ID = 281
export const FIREPLACE_SMALL_STATIC_ID = 241
export const FIREPLACE_LARGE_STATIC_ID = 242
export const CEMETERY_EMBER_BOWL_STATIC_ID = 337
export const PALISADE_WALL_2_STATIC_ID = 203
export const PALISADE_SMALL_STATIC_ID = 204
export const PALISADE_SPIKED_STATIC_ID = 205
export const WALKABLE_BLOCK_STATIC_ID = 206
export const CAMP_FENCE_STATIC_ID = 207
export const CEMETERY_IRON_FENCE_STATIC_ID = 208
export const RUINED_CEMETERY_WALL_STATIC_ID = 209
export const CEMETERY_STONE_WALL_STATIC_ID = 210
export const CAMP_BENCH_STATIC_ID = 301
export const PLANK_PILE_STATIC_ID = 302
export const LOG_PILE_STATIC_ID = 303
export const SUPPLY_CRATE_STATIC_ID = 304
export const CAMP_BARREL_STATIC_ID = 305
export const STUMP_WITH_AXE_STATIC_ID = 307
export const CEMETERY_STATIC_IDS = new Set([321, 322, 323, 324, 325, 328, 329, 330, 331, 332, 333, 334])

const WALL_FENCE_STATIC_IDS = new Set([201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 221, 222])
const GENERAL_STATIC_IDS = new Set([241, 242, 261, 262, 263, 281, 301, 302, 303, 304, 305, 306, 307, 321, 322, 323, 324, 325, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337])
const LIGHT_SOURCE_STATIC_IDS = new Set([FIREPLACE_SMALL_STATIC_ID, FIREPLACE_LARGE_STATIC_ID, WALL_TORCH_STATIC_ID, TORCH_STAND_STATIC_ID, LANTERN_STAND_STATIC_ID, STONE_ENTRANCE_STATIC_ID, CEMETERY_EMBER_BOWL_STATIC_ID])

const rectangularFootprint = (sizeX: number, sizeZ: number) => {
    const offsets: Array<{x: number, z: number}> = []
    for (let x = 0; x < sizeX; x++) {
        for (let z = 0; z < sizeZ; z++) offsets.push({x, z})
    }
    return offsets
}

const buildingFootprint = (type: number, facing: string, width: number, depth: number) => {
    if (type === 2) return rectangularFootprint(Math.max(2, width), Math.max(2, depth))
    if (type === 3) return rectangularFootprint(4, 4)
    const houseWidth = facing === '+X' || facing === '-X' ? 3 : 5
    const houseDepth = facing === '+X' || facing === '-X' ? 5 : 3
    const offsets = rectangularFootprint(houseWidth, houseDepth)
    for (const localX of [1, 2, 3]) {
        if (facing === '+X') offsets.push({x: 3, z: 4 - localX})
        else if (facing === '-Z') offsets.push({x: 4 - localX, z: -1})
        else if (facing === '-X') offsets.push({x: -1, z: localX})
        else offsets.push({x: localX, z: 3})
    }
    return offsets
}

export const GMManager = {
    gmPanelVisible: ref(false),
    consumePointerMoveEvents: false,
    consumeLeftClickEvents: false,
    consumeMiddleClickEvents: false,

    affectedSize: ref(1),
    shiftKeyPressed: ref(false),
    selectedTerrain: ref (0),
    terrainEditMode: ref('terrain'),
    selectedMinable: ref('M1'),
    selectedTree: ref (0),
    selectedShrub: ref (0),

    selectedWallFence: ref (0),
    palisadeOrientation: ref('Z'),
    spikedPalisadeFacing: ref('+Z'),
    walkableBlockHeight: ref(1),
    walkableBlockMaterial: ref('WOOD'),
    selectedStatic: ref (0),
    selectedBuildingType: ref(0),
    buildingFacing: ref('+Z'),
    buildingWidth: ref(2),
    buildingDepth: ref(2),
    shedHighSide: ref('+Z'),
    shedSideFills: ref({'+X': '', '-X': '', '+Z': '', '-Z': ''} as Record<string, string>),
    campObjectFacing: ref('+Z'),
    logPileLength: ref(1),
    torchFacing: ref('-Z'),
    torchMountHeight: ref(2),
    lightIntensity: ref(5),
    lightRange: ref(5),
    entranceFacing: ref('+Z'),
    entranceDestinationWorld: ref(0),
    entranceDestinationX: ref(99),
    entranceDestinationZ: ref(80),
    selectedNpcName: ref(''),
    selectedNpcType: ref<'common' | 'guard'>('common'),
    selectedNpc: ref<any | null>(null),
    npcDetailsDialogOpenRequested: ref(false),
    teleportWorlds: ref([] as Array<{id: number, name: string}>),
    onlineCharacters: ref([] as Array<{id: number, name: string, worldId: number}>),
    worldSettings: ref<GMWorldSettingsData | null>(null),
    worldMapImage: ref<GMWorldMapImageData | null>(null),
    worldBiomeTreesChanged: ref<GMWorldBiomeTreesChangedData | null>(null),
    itemCodebook: ref([] as GMItemCodebookItem[]),
    selectedTeleportWorld: ref(0),
    deleteConfirmationVisible: ref(false),
    deleteConfirmationTitle: ref(''),
    deleteConfirmationMessage: ref(''),
    pendingDelete: null as {type: 'STATIC' | 'BUILDING', x: number, z: number} | null,
    editingStatic: ref<StaticObject | null>(null),
    editingBuilding: ref<BuildingData | null>(null),

    tab: GmTabs.OVERVIEW,

    toggleGmPanel() {
        if (this.gmPanelVisible.value) {
            this.consumePointerMoveEvents = false
            this.consumeLeftClickEvents = false
            this.consumeMiddleClickEvents = false
            GMSceneManager.hoverBlockMarker?.setEnabled(false)
            GMSceneManager.spawnMarker?.setEnabled(false)
            GMSpawns.removeAllMarkers()
            this.closeDeleteConfirmation()
            this.editingStatic.value = null
            this.editingBuilding.value = null
        }
        GMSceneManager.initialize(Renderer.scene)
        this.gmPanelVisible.value = !this.gmPanelVisible.value
        if (this.gmPanelVisible.value) {
            this.loadTeleportWorlds()
        }
    },

    onLeftClickEvent() {
        if (this.tab === GmTabs.TERRAIN_EDIT) {
            const data = []
            const markerPos = new Vector3(GMSceneManager.hoverBlockMarker!.position.x, 0, GMSceneManager.hoverBlockMarker!.position.z)
            const halfSize = Math.floor(this.affectedSize.value / 2)
            const lowestHeight = this.getLowestAffectedBlockHeight(markerPos, this.affectedSize.value)
            const highestHeight = this.getHighestAffectedBlockHeight(markerPos, this.affectedSize.value)
            const sanitizedMinable = this.getSanitizedMinableValue()
            const materializeGeneratedWall = this.terrainEditMode.value === 'terrain'
                && this.selectedTerrain.value !== 0
                && this.selectedTerrain.value !== 100
                && this.selectedTerrain.value !== 101
                && this.selectedTerrain.value !== STONE_PATH_TERRAIN_SELECTION
                && this.selectedTerrain.value !== BEIGE_STONE_PATH_TERRAIN_SELECTION
                && this.selectedTerrain.value !== VOID_TERRAIN_SELECTION

            for (let offsetX = -halfSize; offsetX <= halfSize; offsetX++) {
                for (let offsetZ = -halfSize; offsetZ <= halfSize; offsetZ++) {
                    const block = WorldDataManager.getBlockMap()[markerPos.x + offsetX][markerPos.z + offsetZ]
                    let height = block.height
                    let type = block.type
                    let snowed = block.snowed
                    let stonePath = block.stonePath
                    let beigeStonePath = block.beigeStonePath
                    let minable = block.getMinableValue()

                    if (this.terrainEditMode.value === 'minable') {
                        minable = sanitizedMinable
                    } else if (this.selectedTerrain.value === 0) {

                        // For elevation UP, only elevate blocks with lowest height
                        if (!this.shiftKeyPressed.value) {
                            if (block.height === lowestHeight) {
                                height += 1
                            }
                        } else {
                            // For elevation DOWN, only lower blocks with highest height
                            if (block.height === highestHeight) {
                                height -= 1
                            }
                        }
                    } else {
                        // Terrain type change
                        if (this.selectedTerrain.value == 100) {
                            snowed = true
                            stonePath = false
                            beigeStonePath = false
                        } else if (this.selectedTerrain.value == 101) {
                            snowed = false
                            stonePath = false
                            beigeStonePath = false
                        } else if (this.selectedTerrain.value === STONE_PATH_TERRAIN_SELECTION) {
                            snowed = false
                            stonePath = true
                            beigeStonePath = false
                        } else if (this.selectedTerrain.value === BEIGE_STONE_PATH_TERRAIN_SELECTION) {
                            snowed = false
                            stonePath = false
                            beigeStonePath = true
                        } else {
                            type = this.selectedTerrain.value === VOID_TERRAIN_SELECTION ? 0 : this.selectedTerrain.value
                        }
                    }

                    data.push({
                        x: markerPos.x + offsetX,
                        z: markerPos.z + offsetZ,
                        height: height,
                        type: type,
                        snowed: snowed,
                        stonePath: stonePath,
                        beigeStonePath: beigeStonePath,
                        minable: minable,
                        materializeGeneratedWall: materializeGeneratedWall
                    })
                }
            }
            Connector.sendMessage(new GMTerrainChange(data))
        }

        if (this.tab === GmTabs.BIOME_EDIT) {
            const markerPos = new Vector3(GMSceneManager.hoverBlockMarker!.position.x, 0, GMSceneManager.hoverBlockMarker!.position.z)
            if (this.selectedTree.value > 0) {
                const treeData = { x: markerPos.x, z: markerPos.z, size: Utils.roundToOneDecimal(1.1 + Math.random() * 0.6) , type: this.selectedTree.value }
                Connector.sendMessage(new GMStaticObjectChange("ADD_TREE", [treeData] ) )

            } else if (this.selectedShrub.value > 0) {
                const shrubData = { x: markerPos.x, z: markerPos.z, type: this.selectedShrub.value }
                Connector.sendMessage(new GMStaticObjectChange("ADD_OBJECT", [shrubData] ) )

            } else if (this.selectedTree.value === -1 && this.selectedShrub.value === -1) {
                this.requestStaticDelete(markerPos.x, markerPos.z)
            }
        }

        if (this.tab === GmTabs.WALLS_AND_FENCES_EDIT) {
            const markerPos = new Vector3(GMSceneManager.hoverBlockMarker!.position.x, 0, GMSceneManager.hoverBlockMarker!.position.z)
            if (this.editingStatic.value) {
                return
            }
            if (this.selectedWallFence.value === -2) {
                this.beginStaticEdit(markerPos.x, markerPos.z, WALL_FENCE_STATIC_IDS)
            } else if (this.selectedWallFence.value > 0) {
                Connector.sendMessage(new GMStaticObjectChange('ADD_OBJECT', [
                    this.createWallFenceData(markerPos.x, markerPos.z, this.selectedWallFence.value),
                ]))

            } else if (this.selectedWallFence.value === -1) {
                this.requestStaticDelete(markerPos.x, markerPos.z)
            }
        }

        if (this.tab === GmTabs.STATICS_EDIT) {
            const markerPos = new Vector3(GMSceneManager.hoverBlockMarker!.position.x, 0, GMSceneManager.hoverBlockMarker!.position.z)
            if (this.editingStatic.value) {
                return
            }
            if (this.selectedStatic.value === -2) {
                this.beginStaticEdit(markerPos.x, markerPos.z, GENERAL_STATIC_IDS)
            } else if (this.selectedStatic.value > 0) {
                Connector.sendMessage(new GMStaticObjectChange('ADD_OBJECT', [
                    this.createStaticData(markerPos.x, markerPos.z, this.selectedStatic.value),
                ]))

            } else if (this.selectedStatic.value === -1) {
                this.requestStaticDelete(markerPos.x, markerPos.z)
            }
        }

        if (this.tab === GmTabs.BUILDINGS_EDIT) {
            const markerPos = new Vector3(GMSceneManager.hoverBlockMarker!.position.x, 0, GMSceneManager.hoverBlockMarker!.position.z)
            if (this.editingBuilding.value) {
                Connector.sendMessage(new GMBuildingChange('MOVE', {
                    id: this.editingBuilding.value.id,
                    x: markerPos.x,
                    z: markerPos.z,
                }))
                return
            }
            if (this.selectedBuildingType.value === -2) {
                this.beginBuildingEdit(markerPos.x, markerPos.z)
            } else if (this.selectedBuildingType.value > 0) {
                Connector.sendMessage(new GMBuildingChange('ADD', {
                    x: markerPos.x,
                    z: markerPos.z,
                    type: this.selectedBuildingType.value,
                    facing: this.buildingFacing.value,
                    width: this.buildingWidth.value,
                    depth: this.buildingDepth.value,
                    shedHighSide: this.shedHighSide.value,
                    shedSideFills: this.shedSideFills.value,
                }))
            } else if (this.selectedBuildingType.value === -1) {
                this.pendingDelete = {type: 'BUILDING', x: markerPos.x, z: markerPos.z}
                this.deleteConfirmationTitle.value = 'Smazat budovu'
                this.deleteConfirmationMessage.value = `Opravdu chcete smazat budovu na X ${markerPos.x}, Z ${markerPos.z}?`
                this.deleteConfirmationVisible.value = true
            }
        }

        if (this.tab === GmTabs.SPAWNS_EDIT) {
            const markerPos = new Vector3(GMSceneManager.hoverBlockMarker!.position.x, 0, GMSceneManager.hoverBlockMarker!.position.z)
            GMSpawns.onClick(markerPos.x, markerPos.z)
        }

        if (this.tab === GmTabs.NPCS_EDIT) {
            const markerPos = new Vector3(GMSceneManager.hoverBlockMarker!.position.x, 0, GMSceneManager.hoverBlockMarker!.position.z)
            const npc = NpcManager.getNpcOnTile(markerPos.x, markerPos.z)
            if (npc) {
                this.selectNpcForEditing(npc)
                return
            }
            if (this.selectedNpc.value) {
                this.selectedNpc.value = null
                return
            }
            const name = this.selectedNpcName.value.trim() || (this.selectedNpcType.value === 'guard' ? 'Guard' : '')
            if (!name) {
                return
            }
            Connector.sendMessage(new GMNpcAction('CREATE', {
                x: markerPos.x,
                z: markerPos.z,
                name: name,
                type: this.selectedNpcType.value,
                wanderingRange: 0
            }))
        }
    },

    requestStaticDelete(x: number, z: number) {
        if (!StaticsManager.getObjectsOnTile(x, z).some((obj) => obj.type === CAMP_BARREL_STATIC_ID)) {
            this.closeDeleteConfirmation()
            Connector.sendMessage(new GMStaticObjectChange('REMOVE_ON_TILE', [{x, z}]))
            return
        }
        this.deleteConfirmationVisible.value = false
        this.pendingDelete = {type: 'STATIC', x, z}
        Connector.sendMessage(new GMStaticDeleteInfoRequest(x, z))
    },

    consumeStaticDeleteInfo(data: GMStaticDeleteInfoData) {
        if (this.pendingDelete?.type !== 'STATIC'
            || this.pendingDelete.x !== data.x || this.pendingDelete.z !== data.z) return
        if (data.barrelCount === 0) {
            Connector.sendMessage(new GMStaticObjectChange('REMOVE_ON_TILE', [{x: data.x, z: data.z}]))
            this.pendingDelete = null
            return
        }
        const itemLabel = data.itemCount === 1 ? 'item' : data.itemCount >= 2 && data.itemCount <= 4 ? 'itemy' : 'itemů'
        this.deleteConfirmationTitle.value = data.barrelCount === 1 ? 'Smazat barel' : 'Smazat barely'
        this.deleteConfirmationMessage.value = data.barrelCount === 1
            ? `Opravdu chcete smazat barel? Obsahuje ${data.itemCount} ${itemLabel}.`
            : `Opravdu chcete smazat ${data.barrelCount} barely? Celkem obsahují ${data.itemCount} ${itemLabel}.`
        this.deleteConfirmationVisible.value = true
    },

    confirmDelete() {
        if (!this.pendingDelete) return
        const {type, x, z} = this.pendingDelete
        if (type === 'BUILDING') {
            Connector.sendMessage(new GMBuildingChange('REMOVE_ON_TILE', {x, z}))
        } else {
            Connector.sendMessage(new GMStaticObjectChange('REMOVE_ON_TILE', [{x, z}]))
        }
        this.closeDeleteConfirmation()
    },

    closeDeleteConfirmation() {
        this.deleteConfirmationVisible.value = false
        this.pendingDelete = null
    },

    createWallFenceData(x: number, z: number, type: number) {
        const data: {x: number, z: number, type: number, meta?: Record<string, number | string>} = {x, z, type}
        if (type === PALISADE_WALL_2_STATIC_ID || type === PALISADE_SMALL_STATIC_ID || type === CAMP_FENCE_STATIC_ID
            || type === CEMETERY_IRON_FENCE_STATIC_ID || type === RUINED_CEMETERY_WALL_STATIC_ID
            || type === CEMETERY_STONE_WALL_STATIC_ID) {
            data.meta = {orientation: this.palisadeOrientation.value}
        } else if (type === PALISADE_SPIKED_STATIC_ID) {
            data.meta = {facing: this.spikedPalisadeFacing.value}
        } else if (type === WALKABLE_BLOCK_STATIC_ID) {
            data.meta = {
                surfaceHeight: this.walkableBlockHeight.value,
                material: this.walkableBlockMaterial.value,
            }
        }
        return data
    },

    createStaticData(x: number, z: number, type: number) {
        const data: {x: number, z: number, type: number, meta?: Record<string, number | string>} = {x, z, type}
        const lightMetadata = {lightIntensity: this.lightIntensity.value, lightRange: this.lightRange.value}
        if (type === FIREPLACE_SMALL_STATIC_ID || type === FIREPLACE_LARGE_STATIC_ID || type === CEMETERY_EMBER_BOWL_STATIC_ID) {
            data.meta = lightMetadata
        } else if (type === WALL_TORCH_STATIC_ID) {
            data.meta = {facing: this.torchFacing.value, mountHeight: this.torchMountHeight.value, ...lightMetadata}
        } else if (type === TORCH_STAND_STATIC_ID || type === LANTERN_STAND_STATIC_ID) {
            data.meta = {facing: this.torchFacing.value, ...lightMetadata}
        } else if (type === LOG_PILE_STATIC_ID) {
            data.meta = {facing: this.campObjectFacing.value, length: this.logPileLength.value}
        } else if (type === CAMP_BENCH_STATIC_ID || type === PLANK_PILE_STATIC_ID
            || type === SUPPLY_CRATE_STATIC_ID || type === CAMP_BARREL_STATIC_ID
            || type === STUMP_WITH_AXE_STATIC_ID || CEMETERY_STATIC_IDS.has(type)) {
            data.meta = {facing: this.campObjectFacing.value}
        } else if (type === STONE_ENTRANCE_STATIC_ID) {
            data.meta = {
                facing: this.entranceFacing.value,
                destinationWorldId: this.entranceDestinationWorld.value,
                destinationX: this.entranceDestinationX.value,
                destinationZ: this.entranceDestinationZ.value,
                ...lightMetadata,
            }
        }
        return data
    },

    beginStaticEdit(x: number, z: number, allowedTypes: Set<number>) {
        const object = StaticsManager.getObjectsOnTile(x, z).find((candidate) => allowedTypes.has(candidate.type))
        if (!object) return

        this.editingStatic.value = object
        if (this.tab === GmTabs.WALLS_AND_FENCES_EDIT) this.selectedWallFence.value = object.type
        else this.selectedStatic.value = object.type

        const status = object.status ?? {}
        if (LIGHT_SOURCE_STATIC_IDS.has(object.type)) {
            this.lightIntensity.value = status.lightIntensity ?? 5
            this.lightRange.value = status.lightRange ?? 5
        }
        if (object.type === PALISADE_WALL_2_STATIC_ID || object.type === PALISADE_SMALL_STATIC_ID || object.type === CAMP_FENCE_STATIC_ID
            || object.type === CEMETERY_IRON_FENCE_STATIC_ID || object.type === RUINED_CEMETERY_WALL_STATIC_ID
            || object.type === CEMETERY_STONE_WALL_STATIC_ID) {
            this.palisadeOrientation.value = status.orientation === 'X' ? 'X' : 'Z'
        } else if (object.type === PALISADE_SPIKED_STATIC_ID) {
            this.spikedPalisadeFacing.value = status.facing ?? '+Z'
        } else if (object.type === WALKABLE_BLOCK_STATIC_ID) {
            this.walkableBlockHeight.value = status.surfaceHeight === 0.5 ? 0.5 : 1
            this.walkableBlockMaterial.value = status.material ?? 'WOOD'
        } else if (object.type === WALL_TORCH_STATIC_ID) {
            this.torchFacing.value = status.facing ?? '-Z'
            this.torchMountHeight.value = status.mountHeight ?? 2
        } else if (object.type === TORCH_STAND_STATIC_ID || object.type === LANTERN_STAND_STATIC_ID) {
            this.torchFacing.value = status.facing ?? '+Z'
        } else if (object.type === LOG_PILE_STATIC_ID) {
            this.campObjectFacing.value = status.facing ?? '+Z'
            this.logPileLength.value = status.length === 2 || status.length === 3 ? status.length : 1
        } else if (object.type === CAMP_BENCH_STATIC_ID || object.type === PLANK_PILE_STATIC_ID
            || object.type === SUPPLY_CRATE_STATIC_ID || object.type === CAMP_BARREL_STATIC_ID
            || object.type === STUMP_WITH_AXE_STATIC_ID || CEMETERY_STATIC_IDS.has(object.type)) {
            this.campObjectFacing.value = status.facing ?? '+Z'
        } else if (object.type === STONE_ENTRANCE_STATIC_ID) {
            this.entranceFacing.value = status.facing ?? '+Z'
            this.entranceDestinationWorld.value = status.destinationWorldId ?? MyPlayer.worldId
            this.entranceDestinationX.value = status.destinationX ?? 0
            this.entranceDestinationZ.value = status.destinationZ ?? 0
        }
    },

    saveStaticEdit() {
        const object = this.editingStatic.value
        if (!object) return
        const data = this.tab === GmTabs.WALLS_AND_FENCES_EDIT
            ? this.createWallFenceData(object.position.x, object.position.z, object.type)
            : this.createStaticData(object.position.x, object.position.z, object.type)
        Connector.sendMessage(new GMStaticObjectChange('UPDATE_OBJECT', [data]))
        this.cancelStaticEdit()
    },

    cancelStaticEdit() {
        this.editingStatic.value = null
        if (this.tab === GmTabs.WALLS_AND_FENCES_EDIT) this.selectedWallFence.value = 0
        if (this.tab === GmTabs.STATICS_EDIT) this.selectedStatic.value = 0
    },

    beginBuildingEdit(x: number, z: number) {
        const building = BuildingManager.getBuildingOnTile(x, z)
        if (!building) return
        this.editingBuilding.value = building
        this.selectedBuildingType.value = building.tp
        this.buildingFacing.value = building.facing ?? '+Z'
        this.buildingWidth.value = building.width ?? 2
        this.buildingDepth.value = building.depth ?? 2
        this.shedHighSide.value = building.shedHighSide ?? '+Z'
        this.shedSideFills.value = { '+X': '', '-X': '', '+Z': '', '-Z': '', ...building.shedSideFills }
    },

    saveBuildingEdit() {
        const building = this.editingBuilding.value
        if (!building) return
        Connector.sendMessage(new GMBuildingChange('UPDATE', {
            id: building.id,
            type: building.tp,
            facing: this.buildingFacing.value,
            width: this.buildingWidth.value,
            depth: this.buildingDepth.value,
            shedHighSide: this.shedHighSide.value,
            shedSideFills: this.shedSideFills.value,
        }))
        this.cancelBuildingEdit()
    },

    cancelBuildingEdit() {
        this.editingBuilding.value = null
        this.selectedBuildingType.value = 0
    },

    getLowestAffectedBlockHeight(centerPos: Vector3, size: number): number {
        let lowestHeight = Number.MAX_SAFE_INTEGER
        const halfSize = Math.floor(size / 2)
        for (let offsetX = -halfSize; offsetX <= halfSize; offsetX++) {
            for (let offsetZ = -halfSize; offsetZ <= halfSize; offsetZ++) {
                const block = WorldDataManager.getBlockMap()[centerPos.x + offsetX][centerPos.z + offsetZ]
                if (block.height < lowestHeight) {
                    lowestHeight = block.height
                }
            }
        }
        return lowestHeight
    },

    getHighestAffectedBlockHeight(centerPos: Vector3, size: number): number {
        let highestHeight = Number.MIN_SAFE_INTEGER
        const halfSize = Math.floor(size / 2)
        for (let offsetX = -halfSize; offsetX <= halfSize; offsetX++) {
            for (let offsetZ = -halfSize; offsetZ <= halfSize; offsetZ++) {
                const block = WorldDataManager.getBlockMap()[centerPos.x + offsetX][centerPos.z + offsetZ]
                if (block.height > highestHeight) {
                    highestHeight = block.height
                }
            }
        }
        return highestHeight
    },

    onFrame(timeRate: number, actualTime: number) {
        if (this.tab === GmTabs.SPAWNS_EDIT) {
            GMSpawns.onFrame(timeRate, actualTime)
        }
        const deletingStatics = this.gmPanelVisible.value && (
            (this.tab === GmTabs.STATICS_EDIT && this.selectedStatic.value === -1)
            || (this.tab === GmTabs.WALLS_AND_FENCES_EDIT && this.selectedWallFence.value === -1)
            || (this.tab === GmTabs.BIOME_EDIT && this.selectedTree.value === -1 && this.selectedShrub.value === -1)
        )
        const previewingStatics = deletingStatics || (this.gmPanelVisible.value && (
            (this.tab === GmTabs.STATICS_EDIT && this.selectedStatic.value === -2 && !this.editingStatic.value)
            || (this.tab === GmTabs.WALLS_AND_FENCES_EDIT && this.selectedWallFence.value === -2 && !this.editingStatic.value)
        ))
        const marker = GMSceneManager.hoverBlockMarker
        const previewTypes = this.tab === GmTabs.STATICS_EDIT && this.selectedStatic.value === -2
            ? GENERAL_STATIC_IDS
            : this.tab === GmTabs.WALLS_AND_FENCES_EDIT && this.selectedWallFence.value === -2
                ? WALL_FENCE_STATIC_IDS
                : undefined
        StaticsManager.updateDeletePreview(
            previewingStatics && marker?.isEnabled() === true,
            Math.round(marker?.position.x ?? 0),
            Math.round(marker?.position.z ?? 0),
            actualTime,
            previewTypes,
        )
        TreeManager.updateDeletePreview(
            deletingStatics && marker?.isEnabled() === true,
            Math.round(marker?.position.x ?? 0),
            Math.round(marker?.position.z ?? 0),
            actualTime,
        )
        const previewingBuilding = this.gmPanelVisible.value && this.tab === GmTabs.BUILDINGS_EDIT
            && (this.selectedBuildingType.value === -1
                || (this.selectedBuildingType.value === -2 && !this.editingBuilding.value))
        BuildingManager.updateSelectionPreview(
            previewingBuilding && marker?.isEnabled() === true,
            Math.round(marker?.position.x ?? 0),
            Math.round(marker?.position.z ?? 0),
            actualTime,
        )
    },

    onMiddleClickEvent() {
    },

    shiftPressed(pressed: boolean) {
        this.shiftKeyPressed.value = pressed
    },

    affectedSizeChanged(size: number) {
        this.affectedSize.value = size
        GMSceneManager.setHoverBlockMarkerSize(size)
    },

    updateStaticMarkerFootprint() {
        const objectInfo = StaticObjectsCodebook.get(this.selectedStatic.value)
        if (!objectInfo) {
            GMSceneManager.setHoverBlockMarkerFootprint([{x: 0, z: 0}])
            return
        }

        let sizeX = objectInfo.sizeX
        let sizeZ = objectInfo.sizeZ
        let facing = this.selectedStatic.value === STONE_ENTRANCE_STATIC_ID
            ? this.entranceFacing.value
            : this.campObjectFacing.value
        if (this.selectedStatic.value === LOG_PILE_STATIC_ID) {
            sizeX = 1
            sizeZ = this.logPileLength.value
        }
        if (facing === '-X' || facing === '+X') [sizeX, sizeZ] = [sizeZ, sizeX]
        GMSceneManager.setHoverBlockMarkerFootprint(rectangularFootprint(sizeX, sizeZ))
    },

    updateBuildingMarkerFootprint() {
        GMSceneManager.setHoverBlockMarkerFootprint(this.selectedBuildingType.value > 0
            ? buildingFootprint(
                this.selectedBuildingType.value,
                this.buildingFacing.value,
                this.buildingWidth.value,
                this.buildingDepth.value,
            )
            : [{x: 0, z: 0}])
    },

    getSanitizedMinableValue(): string | null {
        const value = (this.selectedMinable.value ?? '').trim().toUpperCase()

        if (value === '') {
            return null
        }

        if (value === 'C') {
            return value
        }

        if (/^M([1-9]|10)$/.test(value)) {
            return value.substring(1)
        }

        return null
    },

    openTab(tab: string) {
        // Close current tab
        switch (this.tab) {
            case GmTabs.TERRAIN_EDIT:
                this.closeTabTerrainEdit()
                break
            case GmTabs.BIOME_EDIT:
                this.closeTabBiomeEdit()
                break
            case GmTabs.WALLS_AND_FENCES_EDIT:
                this.closeTabWallsAndFencesEdit()
                break
            case GmTabs.STATICS_EDIT:
                this.closeTabStaticsEdit()
                break
            case GmTabs.BUILDINGS_EDIT:
                this.closeTabBuildingsEdit()
                break
            case GmTabs.SPAWNS_EDIT:
                this.closeTabSpawnsEdit()
                break
            case GmTabs.NPCS_EDIT:
                this.closeTabNpcsEdit()
                break

        }

        // Open new tab
        switch (tab) {
            case GmTabs.OVERVIEW:
                this.openTabOverview()
                break
            case GmTabs.WORLDS:
                this.openTabWorlds()
                break
            case GmTabs.TERRAIN_EDIT:
                this.openTabTerrainEdit()
                break
            case GmTabs.BIOME_EDIT:
                this.openTabBiomeEdit()
                break
            case GmTabs.WALLS_AND_FENCES_EDIT:
                this.openTabWallsAndFencesEdit()
                break
            case GmTabs.STATICS_EDIT:
                this.openTabStaticsEdit()
                break
            case GmTabs.BUILDINGS_EDIT:
                this.openTabBuildingsEdit()
                break
            case GmTabs.SPAWNS_EDIT:
                this.openTabSpawnsEdit()
                break
            case GmTabs.NPCS_EDIT:
                this.openTabNpcsEdit()
                break
        }
    },

    openTabOverview() {
        this.tab = GmTabs.OVERVIEW
    },

    openTabWorlds() {
        this.tab = GmTabs.WORLDS
    },

    openTabTerrainEdit() {
        this.tab = GmTabs.TERRAIN_EDIT
        this.consumePointerMoveEvents = true
        this.consumeLeftClickEvents = true
        this.consumeMiddleClickEvents = true
        this.selectedTerrain.value = 0
        this.terrainEditMode.value = 'terrain'
        GMSceneManager.hoverBlockMarker?.setEnabled(true)
    },

    openTabBiomeEdit() {
        this.tab = GmTabs.BIOME_EDIT
        this.consumePointerMoveEvents = true
        this.consumeLeftClickEvents = true
        this.selectedTree.value = 0
        this.selectedShrub.value = 0
        GMSceneManager.setHoverBlockMarkerSize(1)
        GMSceneManager.hoverBlockMarker?.setEnabled(true)
    },

    openTabWallsAndFencesEdit() {
        this.tab = GmTabs.WALLS_AND_FENCES_EDIT
        this.consumePointerMoveEvents = true
        this.consumeLeftClickEvents = true
        this.selectedWallFence.value = 0
        this.editingStatic.value = null
        GMSceneManager.setHoverBlockMarkerSize(1)
        GMSceneManager.hoverBlockMarker?.setEnabled(true)
    },

    openTabSpawnsEdit() {
        this.tab = GmTabs.SPAWNS_EDIT
        this.consumePointerMoveEvents = true
        this.consumeLeftClickEvents = true
        // Load all spawns
        GMSpawns.checkAndLoadSpawns()
        GMSceneManager.setHoverBlockMarkerSize(1)
        GMSceneManager.hoverBlockMarker?.setEnabled(true)
        GMSpawns.renderSpawnMarkers()
    },

    openTabStaticsEdit() {
        this.tab = GmTabs.STATICS_EDIT
        this.consumePointerMoveEvents = true
        this.consumeLeftClickEvents = true
        this.selectedStatic.value = 0
        this.editingStatic.value = null
        GMSceneManager.setHoverBlockMarkerSize(1)
        GMSceneManager.hoverBlockMarker?.setEnabled(true)
    },

    openTabBuildingsEdit() {
        this.tab = GmTabs.BUILDINGS_EDIT
        this.consumePointerMoveEvents = true
        this.consumeLeftClickEvents = true
        this.selectedBuildingType.value = 0
        this.editingBuilding.value = null
        GMSceneManager.setHoverBlockMarkerSize(1)
        GMSceneManager.hoverBlockMarker?.setEnabled(true)
    },

    openTabNpcsEdit() {
        this.tab = GmTabs.NPCS_EDIT
        this.consumePointerMoveEvents = true
        this.consumeLeftClickEvents = true
        GMSceneManager.setHoverBlockMarkerSize(1)
        GMSceneManager.hoverBlockMarker?.setEnabled(true)
        const selectedTarget = TargetingManager.selectedTarget
        if (selectedTarget?.getObjectType() === 'N' || (selectedTarget?.getObjectType() === 'M' && NpcManager.guards.has(selectedTarget.id))) {
            const npc = selectedTarget.getObjectType() === 'N'
                ? NpcManager.npcs.get(selectedTarget.id)
                : NpcManager.guards.get(selectedTarget.id)
            if (npc) {
                this.selectNpcForEditing(npc)
            }
        }
    },

    closeTabTerrainEdit() {
        this.consumePointerMoveEvents = false
        this.consumeLeftClickEvents = false
        this.consumeMiddleClickEvents = false
        GMSceneManager.hoverBlockMarker?.setEnabled(false)
    },

    closeTabBiomeEdit() {
        this.consumePointerMoveEvents = false
        this.consumeLeftClickEvents = false
        GMSceneManager.hoverBlockMarker?.setEnabled(false)
    },

    closeTabWallsAndFencesEdit() {
        this.consumePointerMoveEvents = false
        this.consumeLeftClickEvents = false
        GMSceneManager.hoverBlockMarker?.setEnabled(false)
        this.editingStatic.value = null
    },

    closeTabStaticsEdit() {
        this.consumePointerMoveEvents = false
        this.consumeLeftClickEvents = false
        GMSceneManager.hoverBlockMarker?.setEnabled(false)
        this.editingStatic.value = null
    },

    closeTabBuildingsEdit() {
        this.consumePointerMoveEvents = false
        this.consumeLeftClickEvents = false
        GMSceneManager.hoverBlockMarker?.setEnabled(false)
        this.editingBuilding.value = null
    },

    closeTabSpawnsEdit() {
        this.consumePointerMoveEvents = false
        this.consumeLeftClickEvents = false
        GMSceneManager.hoverBlockMarker?.setEnabled(false)
        GMSpawns.removeAllMarkers()
    },

    closeTabNpcsEdit() {
        this.consumePointerMoveEvents = false
        this.consumeLeftClickEvents = false
        GMSceneManager.hoverBlockMarker?.setEnabled(false)
    },

    saveMapData() {
        Connector.sendMessage(new GMSaveMapDataMsg())
    },

    forceSaveData() {
        Connector.sendMessage(new GMForceSaveDataMsg())
        OnScreenMessageManager.addMessage("Hra uložena")
    },

    teleport(worldId: number, x: number, z: number, characterId: number) {
        Connector.sendMessage(new GMTeleportMsg(worldId, x, z, characterId))
    },

    setDayNightTime(time: string) {
        const match = /^(\d{2}):(\d{2})$/.exec(time)
        if (!match) {
            return
        }
        const hours = Number(match[1])
        const minutes = Number(match[2])
        if (hours > 23 || minutes > 59) {
            return
        }
        Connector.sendMessage(new GMDayNightCycleMsg('SET', hours * 60 + minutes))
    },

    resumeDayNightCycle() {
        Connector.sendMessage(new GMDayNightCycleMsg('RESUME'))
    },

    loadTeleportWorlds() {
        Connector.sendMessage(new GMLoadWorldsMsg())
    },

    consumeTeleportWorlds(data: GMWorldsData) {
        this.teleportWorlds.value = data.worlds
        this.onlineCharacters.value = data.characters
        this.selectedTeleportWorld.value = MyPlayer.worldId
        this.entranceDestinationWorld.value = MyPlayer.worldId
    },

    loadWorldSettings(worldId: number) {
        Connector.sendMessage(new GMLoadWorldSettingsMsg(worldId))
    },

    consumeWorldSettings(settings: GMWorldSettingsData) {
        this.worldSettings.value = settings
    },

    saveWorldSettings(worldId: number, settings: Omit<GMWorldSettingsData, 'id' | 'size'>) {
        Connector.sendMessage(new GMSaveWorldSettingsMsg(worldId, settings))
    },

    loadWorldMapImage(worldId: number, mapType: 'height' | 'terrain' | 'surface' | 'biome' | 'gathering') {
        Connector.sendMessage(new GMLoadWorldMapImageMsg(worldId, mapType))
    },

    consumeWorldMapImage(image: GMWorldMapImageData) {
        this.worldMapImage.value = image
    },

    consumeWorldBiomeTreesChanged(change: GMWorldBiomeTreesChangedData) {
        this.worldBiomeTreesChanged.value = change
    },

    saveWorldMapHeightChanges(worldId: number, changes: Array<{x: number, z: number, height: number}>) {
        Connector.sendMessage(new GMSaveWorldMapHeightChangesMsg(worldId, changes))
    },

    saveWorldMapTerrainChanges(worldId: number, changes: Array<{x: number, z: number, type: number}>) {
        Connector.sendMessage(new GMSaveWorldMapTerrainChangesMsg(worldId, changes))
    },

    saveWorldMapSurfaceChanges(worldId: number, changes: Array<{x: number, z: number, surface: 'SNOW' | 'STONE_PATH' | 'BEIGE_STONE_PATH' | 'NONE'}>) {
        Connector.sendMessage(new GMSaveWorldMapSurfaceChangesMsg(worldId, changes))
    },

    generateBiome(worldId: number, preset: 'NORTH_WOOD', density: number, rows: number[][]) {
        Connector.sendMessage(new GMGenerateBiomeMsg(worldId, 'GENERATE', preset, density, rows))
    },

    deforestBiome(worldId: number, rows: number[][]) {
        Connector.sendMessage(new GMGenerateBiomeMsg(worldId, 'DEFOREST', 'NORTH_WOOD', 1, rows))
    },

    loadItemCodebook() {
        Connector.sendMessage(new GMLoadItemCodebookMsg())
    },

    consumeItemCodebook(items: GMItemCodebookItem[]) {
        this.itemCodebook.value = items
    },

    createItem(type: string, codebookId: number, quantity: number | null, quality: number | null) {
        Connector.sendMessage(new GMCreateItemMsg(type, codebookId, quantity, quality))
    },

    saveSelectedNpc() {
        if (!this.selectedNpc.value) {
            return
        }
        Connector.sendMessage(new GMNpcAction('UPDATE', this.selectedNpc.value))
        this.selectedNpc.value = null
    },

    deleteSelectedNpc() {
        if (!this.selectedNpc.value) {
            return
        }
        Connector.sendMessage(new GMNpcAction('DELETE', {id: this.selectedNpc.value.id}))
        this.selectedNpc.value = null
    },

    selectNpcForEditing(npc: any) {
        this.selectedNpc.value = {
            id: npc.definitionId ?? npc.id,
            name: npc.name,
            titleCZ: npc.titleCZ ?? npc.title ?? '',
            titleEN: npc.titleEN ?? npc.title ?? '',
            type: npc.type,
            bodyType: npc.bodyType ?? 'steve',
            equipment: {...(npc.equipment ?? {})},
            features: (npc.features ?? []).map((feature: any) => ({
                type: feature.type,
                settings: feature.type === 'vendor' || feature.type === 'repairer' ? {
                    itemCategories: [...(feature.settings?.itemCategories ?? [])],
                    weaponMaterials: [...(feature.settings?.weaponMaterials ?? [])],
                    armorMaterials: [...(feature.settings?.armorMaterials ?? [])],
                    bowMaterials: [...(feature.settings?.bowMaterials ?? [])],
                    individualItems: {
                        weapons: [...(feature.settings?.individualItems?.weapons ?? [])],
                        bows: [...(feature.settings?.individualItems?.bows ?? [])],
                        metalArmor: [...(feature.settings?.individualItems?.metalArmor ?? [])],
                        leatherArmor: [...(feature.settings?.individualItems?.leatherArmor ?? [])],
                        resources: [...(feature.settings?.individualItems?.resources ?? [])],
                    },
                } : feature.type === 'crafting'
                    ? {itemCategories: [...(feature.settings?.itemCategories ?? [])]}
                    : feature.type === 'healer'
                        ? {potionTiers: [...(feature.settings?.potionTiers ?? ['small', 'normal', 'great'])]}
                    : {}
            })),
            wanderingRange: npc.wanderingRange ?? npc.wr ?? 0,
            guard: npc.guard ?? npc.guardMetadata ?? {level: npc.level ?? 1, aggroRange: 6, pursueRange: 12, respawnSeconds: 15, patrolPoints: []},
        }
    },

    openNpcDetails(npc?: any) {
        if (npc) {
            this.selectNpcForEditing(npc)
        }
        const id = npc?.definitionId ?? npc?.id ?? this.selectedNpc.value?.id
        if (Number.isInteger(id)) {
            Connector.sendMessage(new GMNpcAction('DETAILS', {id: id}))
        }
    },

    processNpcDetails(data: any) {
        this.selectNpcForEditing(data)
        this.npcDetailsDialogOpenRequested.value = true
    },

    cancelSelectedNpc() {
        this.selectedNpc.value = null
        this.selectedNpcName.value = ''
    },

    setSelectedNpcDetails(name: string, titleCZ: string, titleEN: string, bodyType: string, equipment: any, features: any[], wanderingRange: number, guard: any) {
        if (this.selectedNpc.value) {
            this.selectedNpc.value.name = name
            this.selectedNpc.value.titleCZ = titleCZ
            this.selectedNpc.value.titleEN = titleEN
            this.selectedNpc.value.bodyType = bodyType
            this.selectedNpc.value.equipment = equipment
            this.selectedNpc.value.features = features
            this.selectedNpc.value.wanderingRange = wanderingRange
            this.selectedNpc.value.guard = guard
        }
    }
}

watch([
    GMManager.selectedStatic,
    GMManager.campObjectFacing,
    GMManager.logPileLength,
    GMManager.entranceFacing,
], () => GMManager.updateStaticMarkerFootprint())

watch([
    GMManager.selectedBuildingType,
    GMManager.buildingFacing,
    GMManager.buildingWidth,
    GMManager.buildingDepth,
], () => GMManager.updateBuildingMarkerFootprint())


