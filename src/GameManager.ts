import { Renderer } from '@/babylon/scene/renderer'
import { ViewportManager } from '@/utils/viewport'
import { WorldDataManager } from '@/data/worldDataManager'
import { ref } from 'vue/dist/vue'
import { Connector } from '@/network/connector'
import { OverlayManager } from '@/gui/overlayManager'
import { Targetable } from '@/gui/targettingManager'

export const GameManager = {
    canvas: null as ref<HTMLCanvasElement | null>,

    initialize(canvas: ref<HTMLCanvasElement | null>) {
        this.canvas = canvas
        Connector.initialize()
    },

    async startGame() {
        WorldDataManager.fetchWorldDataIfNeeded()

        await Renderer.initialize(this.canvas.value)
        ViewportManager.onResize()
        OverlayManager.onResize()
    }
}

export interface Attackable extends Targetable {
    getWeaponSoundType(): string
    getBodySoundType(): string
    getParrySoundType(): string | null
}
