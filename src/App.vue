<template>
    <div id="app">
        <canvas id="renderCanvas" ref="canvas" class="renderer noselect"></canvas>
        <canvas v-show="loginRequestSentFlag" ref="miniMapCanvas" id='miniMapCanvas' class="noselect"></canvas>
        <canvas id="overlayCanvas" class="noselect"></canvas>

        <!-- Display game GUI only after login request is sent -->
        <div v-show="loginRequestSentFlag">

            <!-- Menu button-->
            <div style="position: absolute; top: 50px; left: 10px;" @click="showSettingsDialog()" v-html="getHamburgerMenuSvg('icon-white', 'icon-settings')"></div>

            <TouchControllers v-if="!gameLoading" ref='touchControls' />

            <!-- Target Lock  -->
            <label id="btn-target-lock" style="display: none; opacity: 0.65; position: absolute; width: 64px; height: 64px;" v-html="getTargetLockSvg('icon-blue', 'icon-target-lock')"
                   @pointerdown="TargetingManager.onPointerDown()" @pointerup="TargetingManager.onPointerUp()" ></label>

            <!-- Top GUI panel -->
            <div class="top-bar">
              <div style="display:flex; gap:15px; align-items:center;">
                  <div id="fpsLabel" style="font-size:12px; color:#aaa;">FPS:</div>
                  <div id="posLabel" style="font-size:12px; color:#aaa;">POS:</div>
              </div>

              <div style="display:flex; gap:15px; align-items:center;">
                  <button v-if="myCharRef?.className ==='GM'" style="font-size:18px; color:#aaa;" @click="toggleGmPanel()">GM Panel</button>
              </div>
            </div>

            <GmPanel id='gmPanel' v-if="gmPanelVisible" />

            <OnScreenMessages />
        </div>
    </div>

    <div class="dialog-backdrop" style="background-color: #000;" v-if="gameLoading" >
        <div class="dialog-window adaptive">
            <div class="dialog-header" style="margin-top: 20px;">Nahrávání ...</div>
        </div>
    </div>

    <LoginDialog ref="loginDialog" v-if="displayLoginDialog" @login="loginRequestSent" />

    <SettingsDialog ref="settingsDialog" v-show="displaySettingsDialog"
                    @close="displaySettingsDialog = false"
                    @close-with-restart-prompt="closeSettingsWithRestartPrompt"
                    @touch-coltrols-changed="touchControlsChanged"
                    @open-login-dialog="displayLoginDialog = true"
                    @device-type-selected="deviceTypeChanged"/>

    <!-- Restart prompt pokud v nastaveni doslo ke zmenam ktere to vyzadauji -->
    <div class="dialog-backdrop" v-if="displayRestartPrompt" @click.self="displayRestartPrompt = false">
        <div class="dialog-window adaptive">
            <div class="dialog-header" style="margin-top: 20px;">Restart hry</div>
            <div class="dialog-content" style="text-align: center;">
                Pro aplikaci nových nastavení je potřeba restartovat hru.
                <div class="dialog-actions" style="margin-top: 20px;">
                    <button class="dialog-button" @click="reloadPage">Restartovat</button>
                    <button class="dialog-button" @click="displayRestartPrompt = false">Později</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Chybovy dialog -->
    <div class="dialog-backdrop" id="dialog-error" style="display: none;">
        <div class="dialog-window adaptive">
            <div class="dialog-header text-warning" style="margin-top: 20px;">Došlo k chybě</div>
            <div class="dialog-content" style="text-align: center;">
                <div id="dialog-error-content"></div>

                <div style="margin-top: 5vh;">Chcete hru restartovat ?</div>
                <div class="dialog-actions" style="margin-top: 20px;">
                    <button class="dialog-button" @click="reloadPage">Restartovat</button>
                </div>
            </div>
        </div>
    </div>

</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, onUnmounted } from 'vue'
import { Renderer } from './babylon/scene/renderer'
import { GameManager } from '@/GameManager'
import GmPanel from '@/vue/views/gm/GmPanel.vue'
import { GMManager } from '@/gm/GM'
import { Data } from '@/data/globalData'
import TouchControllers from '@/vue/views/touchControllers.vue'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { Connector } from '@/network/connector'
import LoginDialog from '@/vue/views/loginDialog.vue'
import SettingsDialog from '@/vue/views/settingsDialog.vue'
import OnScreenMessages from '@/vue/views/onScreenMessages.vue'
import { Controller } from '@/controlls/controller'
import {
    getFullScreenSvg,
    getHamburgerMenuSvg,
    getInspectSvg,
    getTargetLockSvg,
} from '@/vue/icons/icons'
import { Settings } from '@/settings/settings'
import { TargetingManager } from '@/gui/targettingManager'

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

    if (document.getElementById("renderCanvas")) {
        console.log("INIT GAME", Date.now());
        Connector.initialize()
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
    if (Settings.deviceType !== "DESKTOP") {
        requestFullscreen()
    }
    document.oncontextmenu = () => false;
    displayLoginDialog.value = false;
}

const showSettingsDialog = () => {
    displaySettingsDialog.value = true;
    //settingsDialog.value.openDialog()
}

const closeSettingsWithRestartPrompt = () => {
    displaySettingsDialog.value = false;
    displayRestartPrompt.value = true;
}

const touchControlsChanged = () => {
    touchControls.value.updateFromSettings()
}

const deviceTypeChanged = () => {
    touchControls.value.updateFromSettings()
}

const toggleGmPanel = () => {
    GMManager.toggleGmPanel()
}

const reloadPage = () => {
    window.location.reload();
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
