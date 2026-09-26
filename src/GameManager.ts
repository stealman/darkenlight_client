import { Renderer } from '@/babylon/scene/renderer'
import { ViewportManager } from '@/utils/viewport'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import { Targetable, TargetingManager } from '@/gui/targettingManager'
import { MyPlayer } from '@/data/myPlayer'
import { Settings } from '@/settings/settings'
import { Connector } from '@/network/connector'
import { LogoutMsg } from '@/network/messages'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { InventoryManager } from '@/data/inventoryManager'
import { setLocale } from '@/i18n'
import { MyStatusPanel } from '@/gui/myStatusPanel'
import { WorldDataManager } from '@/data/worldDataManager'

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

        // Initialize Renderer and load assets
        reportLoadingProgress(15, 'app.loadingPreparingRenderer')
        await Renderer.initialize(canvas)
        reportLoadingProgress(100, 'app.loadingReady')
    },

    async startGame(charData) {
        reportLoadingProgress(35, 'app.loadingCharacter')
        await MyPlayer.initialize(charData)
        reportLoadingProgress(70, 'app.loadingWorld')
        InventoryManager.initializeWeaponSetupsForCharacter()
        ActionButtonsManager.loadBindingsForCharacter(MyPlayer.myChar.id)
        this.onResize()
        reportLoadingProgress(90, 'app.loadingStarting')
        await Renderer.gameStarted()
        this.started = true
    },

    async stopGame(notifyServer: boolean = true) {
        Connector.resetSession()
        if (notifyServer) {
            Connector.sendMessage(new LogoutMsg())
        }
        MyPlayer.reset()
        WorldDataManager.reset()
        this.started = false
        await Renderer.gameStopped()
    },

    onResize() {
        Renderer.engine!.resize();
        OverlayManager.onResize()
        ViewportManager.onResize()
        ActionButtonsManager.renderActionButtons()
        MyStatusPanel.onResize()
        TargetingManager.prepareTargetSprites()
    }
}

export interface Attackable extends Targetable {
    hpPercent: number
    insideView: boolean

    getWeaponSoundType(): string
    getBodySoundType(): string
    getParrySoundType(): string | null

}
