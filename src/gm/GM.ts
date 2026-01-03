import { Connector } from '@/network/connector'
import { GMSaveMapDataMsg, GMStaticObjectChange, GMTerrainChange } from '@/network/messages'
import { GMSceneManager } from '@/babylon/gm/GmSceneManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { ref } from 'vue'
import { Vector3 } from '@babylonjs/core'
import { Utils } from '@/utils/utils'
import { GMSpawns } from '@/gm/GmSpawns'
import { Renderer } from '@/babylon/scene/renderer'

/**
 * Main GM tabs
 *
 * OVERVIEW
 * TERRAIN_EDIT
 */
export const GmTabs = {
    OVERVIEW: 'overview',
    TERRAIN_EDIT: 'terrain_edit',
    BIOME_EDIT: 'biome_edit',
    WALLS_AND_FENCES_EDIT: 'walls_and_fences_edit',
    SPAWNS_EDIT: 'spawns_edit'
}

export const GMManager = {
    gmPanelVisible: ref(false),
    consumePointerMoveEvents: false,
    consumeLeftClickEvents: false,
    consumeMiddleClickEvents: false,

    affectedSize: ref(1),
    shiftKeyPressed: ref(false),
    selectedTerrain: ref (0),
    selectedTree: ref (0),
    selectedShrub: ref (0),

    selectedWallFence: ref (0),

    tab: GmTabs.OVERVIEW,

    toggleGmPanel() {
        if (this.gmPanelVisible.value) {
            this.consumePointerMoveEvents = false
            this.consumeLeftClickEvents = false
            this.consumeMiddleClickEvents = false
            GMSceneManager.hoverBlockMarker?.setEnabled(false)
            GMSceneManager.spawnMarker?.setEnabled(false)
            GMSpawns.removeAllMarkers()
        }
        GMSceneManager.initialize(Renderer.scene)
        this.gmPanelVisible.value = !this.gmPanelVisible.value
    },

    onLeftClickEvent() {
        if (this.tab === GmTabs.TERRAIN_EDIT) {
            const data = []
            const markerPos = new Vector3(GMSceneManager.hoverBlockMarker!.position.x, 0, GMSceneManager.hoverBlockMarker!.position.z)
            const halfSize = Math.floor(this.affectedSize.value / 2)
            const lowestHeight = this.getLowestAffectedBlockHeight(markerPos, this.affectedSize.value)
            const highestHeight = this.getHighestAffectedBlockHeight(markerPos, this.affectedSize.value)

            for (let offsetX = -halfSize; offsetX <= halfSize; offsetX++) {
                for (let offsetZ = -halfSize; offsetZ <= halfSize; offsetZ++) {
                    const block = WorldDataManager.getBlockMap()[markerPos.x + offsetX][markerPos.z + offsetZ]
                    let height = block.height
                    let type = block.type
                    let snowed = block.snowed

                    // Elevation change
                    if (this.selectedTerrain.value === 0) {

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
                        } else if (this.selectedTerrain.value == 101) {
                            snowed = false
                        } else {
                            type = this.selectedTerrain.value
                        }
                    }

                    data.push({
                        x: markerPos.x + offsetX,
                        z: markerPos.z + offsetZ,
                        height: height,
                        type: type,
                        snowed: snowed
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
                Connector.sendMessage(new GMStaticObjectChange("REMOVE_ON_TILE", [ { x: markerPos.x, z: markerPos.z } ] ) )
            }
        }

        if (this.tab === GmTabs.WALLS_AND_FENCES_EDIT) {
            const markerPos = new Vector3(GMSceneManager.hoverBlockMarker!.position.x, 0, GMSceneManager.hoverBlockMarker!.position.z)
            if (this.selectedWallFence.value > 0) {
                const wallFenceData = { x: markerPos.x, z: markerPos.z, type: this.selectedWallFence.value }
                Connector.sendMessage(new GMStaticObjectChange("ADD_OBJECT", [wallFenceData] ) )

            } else if (this.selectedWallFence.value === -1) {
                Connector.sendMessage(new GMStaticObjectChange("REMOVE_ON_TILE", [ { x: markerPos.x, z: markerPos.z } ] ) )
            }
        }

        if (this.tab === GmTabs.SPAWNS_EDIT) {
            const markerPos = new Vector3(GMSceneManager.hoverBlockMarker!.position.x, 0, GMSceneManager.hoverBlockMarker!.position.z)
            GMSpawns.onClick(markerPos.x, markerPos.z)
        }
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
            case GmTabs.SPAWNS_EDIT:
                this.closeTabSpawnsEdit()
                break

        }

        // Open new tab
        switch (tab) {
            case GmTabs.OVERVIEW:
                this.openTabOverview()
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
            case GmTabs.SPAWNS_EDIT:
                this.openTabSpawnsEdit()
                break
        }
    },

    openTabOverview() {
        this.tab = GmTabs.OVERVIEW
    },

    openTabTerrainEdit() {
        this.tab = GmTabs.TERRAIN_EDIT
        this.consumePointerMoveEvents = true
        this.consumeLeftClickEvents = true
        this.consumeMiddleClickEvents = true
        this.selectedTerrain.value = 0
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
    },

    closeTabSpawnsEdit() {
        this.consumePointerMoveEvents = false
        this.consumeLeftClickEvents = false
        GMSceneManager.hoverBlockMarker?.setEnabled(false)
        GMSpawns.removeAllMarkers()
    },

    saveMapData() {
        Connector.sendMessage(new GMSaveMapDataMsg())
    }
}


