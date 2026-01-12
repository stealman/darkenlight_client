<template>
    <div id="app">
        <canvas id="renderCanvas" ref="canvas" class="renderer noselect"></canvas>
        <canvas ref="miniMapCanvas" id='miniMapCanvas' class="noselect"></canvas>
        <canvas id="overlayCanvas" class="noselect"></canvas>

        <!-- Menu button
        <div style="position: absolute; top: 5px; left: 10px;" @click="showSettingsDialog()" v-html="getHamburgerMenuSvg('icon-white', 'icon-settings')"></div> -->

        <TouchControllers ref='touchControls' />

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

    <div class="dialog-backdrop" style="background-color: #000;" v-if="gameLoading" >
        <div class="dialog-window adaptive">
            <div class="dialog-header" style="margin-top: 20px;">Nahrávání ...</div>
        </div>
    </div>

    <LoginDialog ref="loginDialog" v-if="displayLoginDialog" @login="loginRequestSent" />

    <SettingsDialog ref="settingsDialog" v-if="displaySettingsDialog"
                    @close="displaySettingsDialog = false"
                    @close-with-restart-prompt="closeSettingsWithRestartPrompt"
                    @device-type-selected="updateControls"
                    @touch-coltrols-changed="touchControls.updateControls()"
                    @open-login-dialog="displayLoginDialog = true"/>

</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, onUnmounted } from 'vue'
import { Renderer } from './babylon/scene/renderer'
import { Settings } from '@/settings/settings'
import { GameManager } from '@/GameManager'
import GmPanel from '@/vue/views/gm/GmPanel.vue'
import { GMManager } from '@/gm/GM'
import { Data } from '@/data/globalData'
import TouchControllers from '@/vue/views/touchControllers.vue'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { Connector } from '@/network/connector'
import LoginDialog from '@/vue/views/loginDialog.vue'
import SettingsDialog from '@/vue/views/settingsDialog.vue'
import { Controller } from '@/controlls/controller'

const canvas = ref<HTMLCanvasElement | null>(null)
const miniMapCanvas = ref<HTMLCanvasElement | null>(null)
const gmPanelVisible = GMManager.gmPanelVisible
const myCharRef = Data.myCharRef

const gameLoading = ref(true);
const displayLoginDialog = ref(false);
const loginRequestSentFlag = ref(false);

const displaySettingsDialog = ref(false);
const displayRestartPrompt = ref(false);

const touchControls = ref();
const settingsDialog = ref();
const loginDialog = ref();

onMounted(async () => {
    window.onerror = function (errorMsg, url, lineNumber) {
        console.log(`Error: ${errorMsg} Script: ${url} Line: ${lineNumber}`);
    }

    const wrapper = document.getElementById("appWrapper");
    if (wrapper) wrapper.style.height = window.innerHeight + "px";

    window.addEventListener("resize", resizeEventHandler)
    document.addEventListener("keydown", (e) => Controller.processKeydown(e));
    document.addEventListener("keyup", (e) => Controller.processKeyup(e));
    await nextTick()

    Settings.touchEnabled = "ontouchstart" in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
    Settings.mouseEnabled = !Settings.touchEnabled;
    Settings.shadows = !Settings.touchEnabled
    Settings.debug = !Settings.touchEnabled

    // explicitně přebíjíš výše → nechávám stejně jako v původním kódu
    Settings.shadows = true

    updateControls()
    if (document.getElementById("renderCanvas")) {
        Connector.initialize()

        console.log("INIT GAME", Date.now());
        await GameManager.prepareGame(document.getElementById("renderCanvas") as HTMLCanvasElement)
        console.log("GAME INITIALIZED", Date.now());
        gameLoading.value = false
        displayLoginDialog.value = true

        // Auto login

        /**
        const loginForm = localStorage.getItem("LOGIN_FORM");
        if (loginForm) {
            const form = JSON.parse(loginForm);
            if (form.autoLogin) {
                displayLoginDialog.value = false;
                Connector.sendLoginRequest(form.login, form.password)
                loginRequestSent()
                return;
            } else {
                displayLoginDialog.value = true;
            }
        } else {
            displayLoginDialog.value = true;
        }*/
    }
})

onUnmounted(() => {
    window.removeEventListener("resize", resizeEventHandler);
});

const loginRequestSent = () => {
    loginRequestSentFlag.value = true;
    //requestFullscreen()
    document.oncontextmenu = () => false;
    displayLoginDialog.value = false;
}

const updateControls = () => {
    touchControls.value.updateControls()
}

const showSettingsDialog = () => {
    displaySettingsDialog.value = true;
    settingsDialog.value.openDialog()
}

const closeSettingsWithRestartPrompt = () => {
    displaySettingsDialog.value = false;
    displayRestartPrompt.value = true;
}

const toggleGmPanel = () => {
    GMManager.toggleGmPanel()
}

const requestFullscreen = () => {
    Renderer.requestFullscreen()
    const btn = document.getElementById('fullScreenBtn')
    if (btn) btn.style.display = 'none'
}

function resizeEventHandler() {
    const wrapper = document.getElementById("appWrapper");
    if (wrapper) wrapper.style.height = window.innerHeight + "px";
    if (Renderer.engine && GameManager.started) {
        GameManager.onResize()
        WorldRenderer.lastPos = null
    }
}
</script>
