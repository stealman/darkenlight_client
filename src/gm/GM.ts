import { Connector } from '@/network/connector'
import { GMSaveMapDataMsg, GMTerrainChange } from '@/network/messages'
import { GMSceneManager } from '@/babylon/gm/GmSceneManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { ref } from 'vue'
import { Vector3 } from '@babylonjs/core'

/**
 * Main GM tabs
 *
 * OVERVIEW
 * TERRAIN_EDIT
 */
export const GmTabs = {
    OVERVIEW: 'overview',
    TERRAIN_EDIT: 'terrain_edit'
}

export const GMManager = {
    gmPanelVisible: false,
    consumePointerMoveEvents: false,
    consumeLeftClickEvents: false,
    consumeMiddleClickEvents: false,

    affectedSize: ref(1),
    shiftKeyPressed: ref(false),
    selectedTerrain: ref (0),

    tab: GmTabs.OVERVIEW,

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
                    if (this.selectedTerrain.value == 0) {

                        // For elevation UP, only elevate blocks with lowest height
                        if (!this.shiftKeyPressed.value) {
                            if (block.height == lowestHeight) {
                                height = height + 1
                            }
                        } else {
                            // For elevation DOWN, only lower blocks with highest height
                            if (block.height == highestHeight) {
                                height = height - 1
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
        switch (this.tab) {
            case GmTabs.TERRAIN_EDIT:
                this.closeTabTerrainEdit()
                break
        }

        switch (tab) {
            case GmTabs.OVERVIEW:
                this.openTabOverview()
                break
            case GmTabs.TERRAIN_EDIT:
                this.openTabTerrainEdit()
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
        GMSceneManager.hoverBlockMarker?.setEnabled(true)
    },

    closeTabTerrainEdit() {
        this.consumePointerMoveEvents = false
        this.consumeLeftClickEvents = false
        this.consumeMiddleClickEvents = false
        GMSceneManager.hoverBlockMarker?.setEnabled(false)
    },

    saveMapData() {
        Connector.sendMessage(new GMSaveMapDataMsg())
    }
}


