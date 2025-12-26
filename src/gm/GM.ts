import { Connector } from '@/network/connector'
import { GMSaveMapDataMsg, GMTerrainHeightChange } from '@/network/messages'
import { GMSceneManager } from '@/babylon/gm/GmSceneManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { ref } from 'vue'

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

    shiftKeyPressed: ref(false),

    tab: GmTabs.OVERVIEW,

    onLeftClickEvent() {
        if (this.tab === GmTabs.TERRAIN_EDIT) {
            const affectedBlocks = []
            const block = WorldDataManager.getBlockMap()[GMSceneManager.hoverBlockMarker!.position.x][GMSceneManager.hoverBlockMarker!.position.z]
            affectedBlocks.push({ x: GMSceneManager.hoverBlockMarker!.position.x, z: GMSceneManager.hoverBlockMarker!.position.z, height: block.height + (this.shiftKeyPressed.value ? -1 : 1) })
            Connector.sendMessage(new GMTerrainHeightChange(affectedBlocks))
        }
    },

    onMiddleClickEvent() {
        if (this.tab === GmTabs.TERRAIN_EDIT) {
            const affectedBlocks = []
            const block = WorldDataManager.getBlockMap()[GMSceneManager.hoverBlockMarker!.position.x][GMSceneManager.hoverBlockMarker!.position.z]
            affectedBlocks.push({ x: GMSceneManager.hoverBlockMarker!.position.x, z: GMSceneManager.hoverBlockMarker!.position.z, height: block.height - 1 })
            Connector.sendMessage(new GMTerrainHeightChange(affectedBlocks))
        }
    },

    shiftPressed(pressed: boolean) {
        this.shiftKeyPressed.value = pressed
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


