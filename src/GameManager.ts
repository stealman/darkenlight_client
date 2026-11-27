import { Renderer } from '@/babylon/scene/renderer'
import { ViewportManager } from '@/utils/viewport'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import type { Targetable } from '@/gui/targettingManager'
// Preserve module evaluation order in the character/NPC dependency cycle.
import '@/gui/targettingManager'
import { MyPlayer } from '@/data/myPlayer'
import { Settings } from '@/settings/settings'
import { Connector } from '@/network/connector'
import { LogoutMsg } from '@/network/messages'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { InventoryManager } from '@/data/inventoryManager'
import { setLocale } from '@/i18n'
import { MyStatusPanel } from '@/gui/myStatusPanel'
import { WorldDataManager } from '@/data/worldDataManager'
import { UiIconManager } from '@/gui/uiIconManager'
import {PartyManager} from '@/data/partyManager'
import { GMManager } from '@/gm/GM'
import uiImageSettings from '@/gui/uiImageSettings.json'

const UI_IMAGE_PROGRESS_START = 5
const UI_IMAGE_PROGRESS_END = 30
const WARMUP_PROGRESS = {
    terrain: {start: 81, end: 90, key: 'app.loadingTerrain'},
    characters: {start: 90, end: 94, key: 'app.loadingAppearance'},
    monsters: {start: 94, end: 96, key: 'app.loadingMonsters'},
    lighting: {start: 96, end: 98, key: 'app.loadingLighting'},
}

function reportLoadingProgress(progress: number, phaseKey: string) {
    window.dispatchEvent(new CustomEvent('game:loading-progress', { detail: { progress, phaseKey } }))
}

export const GameManager = {
    started: false as boolean,

    async prepareGame(canvas: HTMLCanvasElement) {
        reportLoadingProgress(5, 'app.loadingPreparing')
        // Load or initialize settings
        let storedSettings = null
        const storedSettingsString = localStorage.getItem("DARKENLIGHT_STORED_SETTINGS")
        if (!storedSettingsString) {
            storedSettings = Settings.getDefaultSettings()
            localStorage.setItem("DARKENLIGHT_STORED_SETTINGS", JSON.stringify(storedSettings))
        } else {
            storedSettings = JSON.parse(storedSettingsString)
        }
        Settings.initialize(storedSettings)
        setLocale(Settings.language)

        await UiIconManager.initialize(
            uiImageSettings.saturation,
            (completed, total) => {
                const ratio = total > 0 ? completed / total : 1
                const progress = Math.floor(
                    UI_IMAGE_PROGRESS_START + ratio * (UI_IMAGE_PROGRESS_END - UI_IMAGE_PROGRESS_START),
                )
                reportLoadingProgress(progress, 'app.loadingPreparing')
            },
        )

        // Initialize Renderer and load assets
        reportLoadingProgress(35, 'app.loadingPreparingRenderer')
        await Renderer.initialize(canvas)
        reportLoadingProgress(100, 'app.loadingReady')
    },

    async initializeCharacter(charData) {
        reportLoadingProgress(35, 'app.loadingCharacter')
        await MyPlayer.initialize(charData)
        GMManager.restoreNoAggro(charData.gmNoAggro ?? true)
        GMManager.fastMode.value = MyPlayer.myChar?.className === 'GM' && (charData.gmFastMode ?? false)
        reportLoadingProgress(70, 'app.loadingWorld')
        InventoryManager.initializeWeaponSetupsForCharacter()
        ActionButtonsManager.loadBindingsForCharacter(MyPlayer.myChar.id, MyPlayer.myChar.name)
        this.onResize(true)
        Renderer.prepareGameView()
    },

    async startGame() {
        reportLoadingProgress(80, 'app.loadingWorld')
        await Renderer.gameStarted((phase, completed, total) => {
            const {start, end, key} = WARMUP_PROGRESS[phase]
            const ratio = total > 0 ? completed / total : 1
            reportLoadingProgress(start + Math.floor(ratio * (end - start)), key)
        })
        reportLoadingProgress(99, 'app.loadingStarting')
        this.started = true
    },

    async stopGame(notifyServer: boolean = true) {
        Renderer.engine?.stopRenderLoop()
        if (notifyServer) {
            Connector.sendMessage(new LogoutMsg())
        }
        // Drain the active response and save/stop the runtime while the world
        // still exists. No network callbacks may run against the reset scene.
        await Connector.closeConnection()
        PartyManager.reset()
        MyPlayer.reset()
        WorldDataManager.reset()
        this.started = false
        await Renderer.gameStopped()
    },

    onResize(forceViewport = false) {
        Renderer.engine!.resize();
        OverlayManager.onResize()
        const changed = ViewportManager.onResize(forceViewport)
        ActionButtonsManager.renderActionButtons()
        MyStatusPanel.onResize()
        return changed
    }
}

export interface Attackable extends Targetable {
    hpPercent: number
    insideView: boolean

    getWeaponSoundType(): string
    getBodySoundType(): string
    getParrySoundType(): string | null

}
