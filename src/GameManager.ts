import { Renderer } from '@/babylon/scene/renderer'
import { ViewportManager } from '@/utils/viewport'
import { OverlayManager } from '@/gui/overlayManager'
import { Targetable, TargetingManager } from '@/gui/targettingManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { MyPlayer } from '@/babylon/character/myPlayer'
import { Settings } from '@/settings/settings'

export const GameManager = {
    started: false as boolean,

    async prepareGame(canvas: HTMLCanvasElement) {
        let storedSettings = null
        const storedSettingsString = localStorage.getItem("STORED_SETTINGS")

        // Pokud nejsou zadna nastaveni, nastavime vychozi hodnoty
        if (!storedSettingsString) {
            storedSettings = Settings.getDefaultSettings()
            localStorage.setItem("STORED_SETTINGS", JSON.stringify(storedSettings))
        } else {
            storedSettings = JSON.parse(storedSettingsString)
        }
        Settings.initialize(storedSettings)
        await Renderer.initialize(canvas)
    },

    async startGame() {
        WorldDataManager.fetchWorldDataIfNeeded()
        await MyPlayer.initialize(Renderer.scene)
        Renderer.gameStarted()
        this.onResize()
        this.started = true
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
