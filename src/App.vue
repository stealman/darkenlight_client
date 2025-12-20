<template>
  <div id="app">
      <canvas ref="canvas" class="renderer">

      </canvas>
      <canvas ref="miniMapCanvas" id='miniMapCanvas' ></canvas>

      <span id="fpsLabel" style="z-index: 100; font-size: 20px; color: #aaa; position: absolute; left: 10px; top: 10px;">FPS: </span>
      <span id="posLabel" style="z-index: 100; font-size: 20px; color: #aaa; position: absolute; left: 10px; top: 30px;">POS: </span>
      <span id="meshLabel" style="z-index: 100; font-size: 20px; color: #aaa; position: absolute; left: 10px; top: 50px;">MESH: </span>
      <span id="facesLabel" style="z-index: 100; font-size: 20px; color: #aaa; position: absolute; left: 10px; top: 70px;">FACES: </span>
      <button id="fullScreenBtn" style="cursor: pointer; text-decoration: underline; font-size: 18px; color: #aaa; position: absolute; left: 10px; top: 160px;" @click="this.requestFullscreen()">Fullscreen</button>
      <button id="freezeBtn" style="cursor: pointer; text-decoration: underline; font-size: 18px; color: #aaa; position: absolute; left: 10px; top: 220px;" @click="this.freezeActiveMesh()">Freeze</button>
  </div>
</template>

<script lang="ts">
import { ref, onMounted } from 'vue'
import { Renderer } from './babylon/scene/renderer'
import { Settings } from '@/settings/settings'
import { Connector } from '@/network/connector'
import { GameManager } from '@/GameManager'

export default {
  name: 'App',

  setup() {
    const canvas = ref<HTMLCanvasElement | null>(null)
    const miniMapCanvas = ref<HTMLCanvasElement | null>(null)

    onMounted(async () => {
        if (canvas.value) {
            Settings.touchEnabled = ( 'ontouchstart' in window ) || ( navigator.maxTouchPoints > 0 ) || ( navigator.msMaxTouchPoints > 0 )
            Settings.shadows = !Settings.touchEnabled
            Settings.debug = !Settings.touchEnabled
            //Settings.debug = true
            // Settings.closeView = true
            Settings.shadows = true
            // console.log(Settings.shadows)

            GameManager.initialize(canvas)
        }
    });

    return {
      canvas
    }
  },

  methods: {
    requestFullscreen() {
      Renderer.requestFullscreen()
      document.getElementById("fullScreenBtn").style.display = "none"
    },

    freezeActiveMesh() {
      Renderer.freezeActiveMeshes()
    }
  }
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
    top: 0px;
    right: 0px;
    background-color: black;
    opacity: 0.65;
    border-left: 2px ridge rosybrown;
    border-bottom: 2px ridge rosybrown;
}
</style>
