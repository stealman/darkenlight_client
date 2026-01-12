import { Renderer } from '@/babylon/scene/renderer'
import { ViewportManager } from '@/utils/viewport'
import { OverlayManager } from '@/gui/overlayManager'
import { Targetable, TargetingManager } from '@/gui/targettingManager'
import { MyPlayer } from '@/babylon/character/myPlayer'
import { Settings } from '@/settings/settings'
import { Connector } from '@/network/connector'
import { LogoutMsg } from '@/network/messages'

export const GameManager = {
    started: false as boolean,

    async prepareGame(canvas: HTMLCanvasElement) {
        // Load or initialize settings
        let storedSettings = null
        const storedSettingsString = localStorage.getItem("STORED_SETTINGS")
        if (!storedSettingsString) {
            storedSettings = Settings.getDefaultSettings()
            localStorage.setItem("STORED_SETTINGS", JSON.stringify(storedSettings))
        } else {
            storedSettings = JSON.parse(storedSettingsString)
        }
        Settings.initialize(storedSettings)

        // Initialize Renderer and load assets
        await Renderer.initialize(canvas)
    },

    async startGame() {
        await MyPlayer.initialize(Renderer.scene)
        Renderer.gameStarted()
        this.onResize()
        this.started = true
    },

    async stopGame() {
        Connector.sendMessage(new LogoutMsg())
        MyPlayer.reset()
        Renderer.gameStopped()
        this.started = false
    },

    onResize() {
        Renderer.engine!.resize();
        OverlayManager.onResize()
        ViewportManager.onResize()
        TargetingManager.prepareTargetSprite()
    }
}

export interface Attackable extends Targetable {
    getWeaponSoundType(): string
    getBodySoundType(): string
    getParrySoundType(): string | null
}
