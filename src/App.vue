<template>
  <div id="app">
      <canvas ref="canvas" class="renderer">
      </canvas>
      <canvas ref="miniMapCanvas" id='miniMapCanvas' ></canvas>

      <!-- Top GUI panel -->
      <div class="top-bar">
          <div style="display:flex; gap:15px; align-items:center;">
              <div id="fpsLabel" style="font-size:20px; color:#aaa;">FPS:</div>
              <div id="posLabel" style="font-size:20px; color:#aaa;">POS:</div>
          </div>

          <div style="display:flex; gap:15px; align-items:center;">
              <button style="font-size:18px; color:#aaa;" @click="requestFullscreen()">Fullscreen</button>
              <button v-if="myCharRef?.className ==='GM'" style="font-size:18px; color:#aaa;" @click="toggleGmPanel()">GM Panel</button>
          </div>
      </div>

      <GmPanel id='gmPanel' v-if="gmPanelVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Renderer } from './babylon/scene/renderer'
import { Settings } from '@/settings/settings'
import { GameManager } from '@/GameManager'
import GmPanel from '@/vue/views/gm/GmPanel.vue'
import { GMSceneManager } from '@/babylon/gm/GmSceneManager'
import { GMManager } from '@/gm/GM'
import { Controller } from '@/controlls/controller'
import { Data } from '@/data/globalData'

// refs
const canvas = ref<HTMLCanvasElement | null>(null)
const miniMapCanvas = ref<HTMLCanvasElement | null>(null)
const gmPanelVisible = ref(false)
const myCharRef = Data.myCharRef

// lifecycle
onMounted(() => {
    if (!canvas.value) return

    Settings.touchEnabled =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        // @ts-ignore – kvůli starším browserům
        navigator.msMaxTouchPoints > 0

    Settings.shadows = !Settings.touchEnabled
    Settings.debug = !Settings.touchEnabled

    // explicitně přebíjíš výše → nechávám stejně jako v původním kódu
    Settings.shadows = true

    GameManager.initialize(canvas)

    document.addEventListener("keydown", (e) => Controller.processKeydown(e));
    document.addEventListener("keyup", (e) => Controller.processKeyup(e));
})

const toggleGmPanel = () => {
    gmPanelVisible.value = !gmPanelVisible.value
    GMSceneManager.initialize(Renderer.scene)
    GMManager.gmPanelVisible = gmPanelVisible.value
}

// methods → normální const funkce
const requestFullscreen = () => {
    Renderer.requestFullscreen()
    const btn = document.getElementById('fullScreenBtn')
    if (btn) btn.style.display = 'none'
}
</script>

<style scoped>
#app {
  height: 100vh;
  overflow: hidden;
}

.renderer {
    width: 100%;
    height: 100%;
    position: relative;
}

#miniMapCanvas {
    width: 100px;
    height: 100px;
    position: absolute;
    right: 0px;
    background-color: black;
    opacity: 0.65;
    border-left: 2px ridge rosybrown;
    border-bottom: 2px ridge rosybrown;
}

.top-bar {
    position: absolute;
    top: 0;
    left: 0;

    display: flex;
    align-items: center;
    gap: 25px;

    padding: 6px 10px;
    width: max-content;

    background: rgba(0,0,0,0.2);
}

#fpsLabel,
#posLabel,
button {
    font-size: 18px;
    color: #aaa;
}

</style>
