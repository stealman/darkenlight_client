import { Renderer } from '@/babylon/scene/renderer'
import { ViewportManager } from '@/utils/viewport'
import { loadBMPData } from '@/utils/bmpLoader'
import { WorldData } from '@/babylon/world/worldData'
import { ref } from 'vue/dist/vue'

export const GameManager = {
    canvas: null as ref<HTMLCanvasElement | null>,

    initialize(canvas: ref<HTMLCanvasElement | null>) {
        this.canvas = canvas
    },

    async startGame() {
        await this.loadWorldData()
        await Renderer.initialize(this.canvas.value)
        ViewportManager.onResize()
    },

    async loadWorldData() {
        const mapData = await loadBMPData('./public/map4.png') as number[][]
        WorldData.setWorldMap(mapData)
    }
}
