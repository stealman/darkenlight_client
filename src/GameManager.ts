import { Renderer } from '@/babylon/scene/renderer'
import { ViewportManager } from '@/utils/viewport'
import { OverlayManager } from '@/gui/overlayManager'
import { Targetable, TargetingManager } from '@/gui/targettingManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { MyPlayer } from '@/babylon/character/myPlayer'

export const GameManager = {
    started: false as boolean,

    async prepareGame(canvas: HTMLCanvasElement) {
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
