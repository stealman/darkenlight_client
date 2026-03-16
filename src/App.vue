<template>
    <div id="app">
        <canvas id="renderCanvas" ref="canvas" class="renderer noselect"></canvas>
        <canvas v-show="loginRequestSentFlag" ref="miniMapCanvas" id="miniMapCanvas" class="noselect"></canvas>
        <canvas id="overlayCanvas" class="noselect"></canvas>

        <div v-show="loginRequestSentFlag">
            <div id="system-buttons">
                <div @click="showSettingsDialog()" v-html="getHamburgerMenuSvg('icon-white', 'icon-settings')"></div>
                <div @click="showDebug()" v-html="getInspectSvg('icon-white', 'icon-inspect')"></div>
            </div>

            <div id="emeralds-info">
                <span id="emeralds-info-count" style="font-size: 2.25vh; color: #0f0;">0</span>
                <img id="emeralds-info-icon" src="/images/icons/emerald.png" style="width: 16px; height: 16px; margin-right: 4px;" />
            </div>

            <div id="gui-buttons">
                <div class="gui-action-button" id="btn-backpack" @click="showInventoryDialog()">
                    <img class="action-icon" src="/images/icons/buttons/btn_backpack.png" />
                    <img class="action-icon-hover" src="/images/icons/buttons/btn_backpack_hover.png" />
                </div>
                <div class="gui-action-button" id="btn-character" @click="showCharacterDialog()">
                    <img class="action-icon" src="/images/icons/buttons/btn_char.png" />
                    <img class="action-icon-hover" src="/images/icons/buttons/btn_char_hover.png" />
                </div>
            </div>

            <TouchControllers v-if="!gameLoading" ref="touchControls" />

            <label
                id="btn-target-lock"
                style="display: none; opacity: 0.65; position: absolute; width: 64px; height: 64px;"
                v-html="getTargetLockSvg('icon-red', 'icon-target-lock')"
                @pointerdown="TargetingManager.onPointerDown()"
                @pointerup="TargetingManager.onPointerUp()"
            ></label>

            <label
                id="btn-action-stop"
                style="display: none; opacity: 0.65; position: absolute; width: 64px; height: 64px;"
                v-html="getStopActionSvg('icon-blue', 'icon-stop-action')"
                @pointerdown="AudioManager.playGuiButtonClick(); MyPlayer.stopActions()"
            ></label>

            <div id="debug-panel">
                <div style="display:flex; gap:5px; align-items:center;">
                    <div id="fpsLabel" style="font-size:10px; color:#aaa;">FPS:</div>
                    <div id="posLabel" style="font-size:10px; color:#aaa;">POS:</div>
                </div>

                <div v-if="myCharRef?.className === 'GM'" style="display:flex; gap:15px; align-items:center;">
                    <button style="font-size:18px; color:#aaa;" @click="toggleGmPanel()">{{ t('app.gmPanel') }}</button>
                </div>
            </div>

            <div id="action-button-stop" class="action-button">
                <div id="action-button-stop-inner">
                    <img class="action-icon" src="/images/icons/buttons/btn_stop.png" />
                </div>
            </div>

            <div id="action-buttons-1"></div>
            <div id="action-buttons-2" style="display: none;"></div>
            <div id="opportunity-action-buttons"></div>

            <GmPanel id="gmPanel" v-if="gmPanelVisible" />

            <OnScreenMessages />
        </div>
    </div>

    <div class="dialog-backdrop" style="background-color: #000;" v-if="gameLoading">
        <div class="dialog-window adaptive">
            <div class="dialog-header" style="margin-top: 20px;">{{ t('common.loading') }}</div>
        </div>
    </div>

    <LoginDialog ref="loginDialog" v-if="displayLoginDialog" @login="loginRequestSent" />

    <SettingsDialog
        ref="settingsDialog"
        v-show="displaySettingsDialog"
        @close="displaySettingsDialog = false"
        @close-with-restart-prompt="closeSettingsWithRestartPrompt"
        @touch-coltrols-changed="touchControlsChanged"
        @logout="logout"
        @device-type-selected="deviceTypeChanged"
    />

    <InventoryDialog ref="inventoryDialog" v-show="displayInventoryDialog" @close="displayInventoryDialog = false" />
    <CharacterDialog ref="characterDialog" v-show="displayCharacterDialog" @close="displayCharacterDialog = false" />

    <div class="dialog-backdrop" v-if="displayRestartPrompt" @click.self="displayRestartPrompt = false">
        <div class="dialog-window adaptive">
            <div class="dialog-header" style="margin-top: 20px;">{{ t('app.restartGame') }}</div>
            <div class="dialog-content" style="text-align: center;">
                {{ t('app.restartPrompt') }}
                <div class="dialog-actions" style="margin-top: 20px;">
                    <button class="dialog-button" @click="reloadPage">{{ t('common.restart') }}</button>
                    <button class="dialog-button" @click="displayRestartPrompt = false">{{ t('common.later') }}</button>
                </div>
            </div>
        </div>
    </div>

    <div class="dialog-backdrop" id="dialog-error" style="display: none;">
        <div class="dialog-window adaptive">
            <div class="dialog-header text-warning" style="margin-top: 20px;">{{ t('app.errorTitle') }}</div>
            <div class="dialog-content" style="text-align: center;">
                <div id="dialog-error-content"></div>

                <div style="margin-top: 5vh;">{{ t('app.errorRestartQuestion') }}</div>
                <div class="dialog-actions" style="margin-top: 20px;">
                    <button class="dialog-button" @click="reloadPage">{{ t('common.restart') }}</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Renderer } from './babylon/scene/renderer'
import { GameManager } from '@/GameManager'
import GmPanel from '@/vue/views/gm/GmPanel.vue'
import { GMManager } from '@/gm/GM'
import TouchControllers from '@/vue/views/touchControllers.vue'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { Connector } from '@/network/connector'
import LoginDialog from '@/vue/views/loginDialog.vue'
import SettingsDialog from '@/vue/views/settingsDialog.vue'
import InventoryDialog from '@/vue/views/inventory/inventoryDialog.vue'
import CharacterDialog from '@/vue/views/character/CharacterDialog.vue'
import OnScreenMessages from '@/vue/views/onScreenMessages.vue'
import { Controller } from '@/controlls/controller'
import {
    getHamburgerMenuSvg,
    getInspectSvg,
    getStopActionSvg,
    getTargetLockSvg,
} from '@/vue/icons/icons'
import { Settings } from '@/settings/settings'
import { TargetingManager } from '@/gui/targettingManager'
import { MyPlayer } from '@/data/myPlayer'
import { AudioManager } from '@/babylon/audio/audioManager'
import { useI18n } from '@/i18n'

const canvas = ref<HTMLCanvasElement | null>(null)
const miniMapCanvas = ref<HTMLCanvasElement | null>(null)
const gmPanelVisible = GMManager.gmPanelVisible
const myCharRef = MyPlayer.myCharRef

const gameLoading = ref(true)
const displayLoginDialog = ref(false)
const loginRequestSentFlag = ref(false)

const displaySettingsDialog = ref(false)
const displayRestartPrompt = ref(false)

const displayInventoryDialog = ref(false)
const displayCharacterDialog = ref(false)

const touchControls = ref()
const settingsDialog = ref()
const loginDialog = ref()
const inventoryDialog = ref()
const characterDialog = ref()
const { t } = useI18n()

onMounted(async () => {
    window.onerror = function (errorMsg, url, lineNumber) {
        console.log(`Error: ${errorMsg} Script: ${url} Line: ${lineNumber}`)
    }

    const wrapper = document.getElementById('appWrapper')
    if (wrapper) wrapper.style.height = window.innerHeight + 'px'

    window.addEventListener('resize', resizeEventHandler)
    window.addEventListener('ui:open-inventory', onOpenInventoryHotkey)
    window.addEventListener('ui:open-character', onOpenCharacterHotkey)
    window.addEventListener('ui:inventory-updated', onInventoryUpdated as EventListener)
    document.addEventListener('keydown', (e) => Controller.processKeydown(e))
    document.addEventListener('keyup', (e) => Controller.processKeyup(e))
    await nextTick()

    if (document.getElementById('renderCanvas')) {
        console.log('INIT GAME', Date.now())
        Connector.initialize()
        await GameManager.prepareGame(document.getElementById('renderCanvas') as HTMLCanvasElement)
        console.log('GAME INITIALIZED', Date.now())

        gameLoading.value = false
        displayLoginDialog.value = true

        const loginForm = localStorage.getItem('DARKENLIGHT_LOGIN_FORM')
        if (loginForm) {
            const form = JSON.parse(loginForm)
            if (form.autoLogin) {
                displayLoginDialog.value = false
                Connector.sendLoginRequest(form.login, form.password)
                loginRequestSent()
                return
            } else {
                displayLoginDialog.value = true
            }
        } else {
            displayLoginDialog.value = true
        }
    }
})

onUnmounted(() => {
    window.removeEventListener('resize', resizeEventHandler)
    window.removeEventListener('ui:open-inventory', onOpenInventoryHotkey)
    window.removeEventListener('ui:open-character', onOpenCharacterHotkey)
    window.removeEventListener('ui:inventory-updated', onInventoryUpdated as EventListener)
})

const loginRequestSent = () => {
    loginRequestSentFlag.value = true
    if (Settings.deviceType !== 'DESKTOP') {
        requestFullscreen()
    }
    document.oncontextmenu = () => false
    displayLoginDialog.value = false
}

const showSettingsDialog = () => {
    AudioManager.playGuiButtonClick()
    displaySettingsDialog.value = true
}

const showInventoryDialog = () => {
    AudioManager.playGuiButtonClick()
    displayInventoryDialog.value = true
    nextTick(() => {
        inventoryDialog.value?.openDialog()
    })
}

const showCharacterDialog = () => {
    AudioManager.playGuiButtonClick()
    displayCharacterDialog.value = true
    nextTick(() => {
        characterDialog.value?.openDialog()
    })
}

const onOpenCharacterHotkey = () => {
    if (!loginRequestSentFlag.value) {
        return
    }

    if (displayCharacterDialog.value) {
        AudioManager.playGuiButtonClick()
        displayCharacterDialog.value = false
        return
    }
    showCharacterDialog()
}

const onOpenInventoryHotkey = () => {
    if (!loginRequestSentFlag.value) {
        return
    }

    if (displayInventoryDialog.value) {
        AudioManager.playGuiButtonClick()
        displayInventoryDialog.value = false
        return
    }
    showInventoryDialog()
}

const onInventoryUpdated = (event: Event) => {
    if (!displayInventoryDialog.value) {
        return
    }

    const detail = (event as CustomEvent<{ reason?: string, changedItemIds?: number[] }>).detail
    inventoryDialog.value?.refreshDialogFromInventoryUpdate?.(detail)
}

const closeSettingsWithRestartPrompt = () => {
    displaySettingsDialog.value = false
    displayRestartPrompt.value = true
}

const touchControlsChanged = () => {
    touchControls.value.updateFromSettings()
}

const deviceTypeChanged = () => {
    Settings.deviceTypeChanged()
    touchControls.value.updateFromSettings()
}

const toggleGmPanel = () => {
    GMManager.toggleGmPanel()
}

const showDebug = () => {
    Renderer.toggleDebug()
}

const reloadPage = () => {
    window.location.reload()
}

const logout = () => {
    displayLoginDialog.value = true
    GameManager.stopGame()
}

const requestFullscreen = () => {
    Renderer.requestFullscreen()
    const btn = document.getElementById('fullScreenBtn')
    if (btn) btn.style.display = 'none'
}

function resizeEventHandler() {
    const wrapper = document.getElementById('appWrapper')
    if (wrapper) wrapper.style.height = window.innerHeight + 'px'
    if (Renderer.engine && GameManager.started) {
        GameManager.onResize()
        WorldRenderer.lastPos = null
    }
}
</script>
