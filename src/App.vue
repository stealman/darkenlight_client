<template>
    <div id="app">
        <canvas id="renderCanvas" ref="canvas" class="renderer noselect game-session-canvas" :class="{ 'game-session-canvas--visible': gameSessionActive }"></canvas>
        <canvas ref="miniMapCanvas" id="miniMapCanvas" class="noselect game-session-canvas" :class="{ 'game-session-canvas--visible': gameSessionActive }"></canvas>
        <canvas id="overlayCanvas" class="noselect game-session-canvas" :class="{ 'game-session-canvas--visible': gameSessionActive }"></canvas>

        <div v-show="gameSessionActive">
            <div id="system-buttons">
                <div @click="showSettingsDialog()" v-html="getHamburgerMenuSvg('icon-white', 'icon-settings')"></div>
                <div v-if="myCharRef?.className === 'GM'" @click="showDebug" v-html="getInspectSvg('icon-white', 'icon-inspect')"></div>
                <button v-if="myCharRef?.className === 'GM'" class="gm-panel-button" @click="toggleGmPanel()">{{ t('app.gmPanel') }}</button>
            </div>

            <div id="emeralds-info">
                <span id="emeralds-info-count" class="ui-emerald-text-gradient">0</span>
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

            <TouchControllers v-if="gameSessionActive && touchControlsReady" ref="touchControls" :settings-active="targetLockSettingsActive" />

            <label id="btn-target-lock" :class="{ 'target-lock--settings-active': targetLockSettingsActive }" style="display: none; opacity: 0.65; position: absolute; width: 64px; height: 64px;" v-html="getTargetLockSvg('icon-red', 'icon-target-lock')" @pointerdown="TargetingManager.onPointerDown()" @pointerup="TargetingManager.onPointerUp()"></label>

            <label id="btn-action-stop" style="display: none; opacity: 0.65; position: absolute; width: 64px; height: 64px;" v-html="getStopActionSvg('icon-blue', 'icon-stop-action')" @pointerdown="AudioManager.playGuiButtonClick(); MyPlayer.stopActions()"></label>

            <div id="action-button-stop" class="action-button">
                <div id="action-button-stop-inner">
                    <img class="action-icon" src="/images/icons/buttons/btn_stop.png" />
                </div>
            </div>

            <div id="action-buttons-1"></div>
            <div id="action-buttons-2" style="display: none;"></div>
            <div id="opportunity-action-buttons"></div>

            <GmPanel id="gmPanel" v-if="gmPanelVisible" />
            <NpcDetailsDialog ref="npcDetailsDialog" />

            <OnScreenMessages />
        </div>
    </div>

    <Transition name="game-dialog-fade">
        <div class="dialog-backdrop" style="background-color: #000;" v-if="gameLoading">
            <div class="dialog-window adaptive">
                <div class="dialog-surface">
                    <div class="dialog-header">{{ t('common.loading') }}</div>
                    <div class="dialog-content dialog-content--modal loading-dialog-content">
                        <div class="loading-dialog-phase">{{ t(loadingPhaseKey) }}</div>
                        <div class="loading-progress-track" role="progressbar" :aria-valuenow="loadingProgress" aria-valuemin="0" aria-valuemax="100">
                            <div class="loading-progress-fill" :style="{ width: `${loadingProgress}%` }"></div>
                        </div>
                        <div class="loading-progress-value">{{ loadingProgress }} %</div>
                    </div>
                </div>
            </div>
        </div>
    </Transition>

    <Transition name="game-dialog-fade">
        <LoginDialog ref="loginDialog" v-if="displayLoginDialog" @guest-login-check="guestLoginCheckRequested" />
    </Transition>

    <Transition name="game-dialog-fade">
        <GuestCharacterCreationDialog
            v-if="displayGuestCharacterCreationDialog"
            :name="pendingGuestCharacterName"
            @create="createGuestCharacter"
            @back="returnToLoginFromGuestCharacterCreation"
        />
    </Transition>

    <SettingsDialog
        ref="settingsDialog"
        v-show="displaySettingsDialog"
        :visible="displaySettingsDialog"
        @close="displaySettingsDialog = false"
        @close-with-restart-prompt="closeSettingsWithRestartPrompt"
        @touch-coltrols-changed="touchControlsChanged"
        @logout="logout"
        @device-type-selected="deviceTypeChanged"
        @toggle-fullscreen="toggleFullscreen"
        @target-lock-settings-active="targetLockSettingsActive = $event"
    />

    <InventoryDialog ref="inventoryDialog" v-show="displayInventoryDialog" @close="displayInventoryDialog = false" />
    <CharacterDialog ref="characterDialog" v-show="displayCharacterDialog" @close="displayCharacterDialog = false" />
    <CraftingDialog ref="craftingDialog" v-show="displayCraftingDialog" @close="displayCraftingDialog = false" />
    <NpcUseDialog ref="npcUseDialog" v-show="displayNpcUseDialog" @close="displayNpcUseDialog = false" />

    <div class="dialog-backdrop death-dialog-backdrop" v-if="isDead">
        <div class="dialog-window adaptive">
            <div class="dialog-surface">
                <div class="dialog-header text-warning">{{ t('death.title') }}</div>
                <div class="dialog-content death-dialog-content" style="text-align: center;">
                    <div>{{ t('death.description') }}</div>
                    <div class="dialog-actions death-dialog-actions">
                        <button class="dialog-button" :disabled="respawnDelayRemaining > 0" @click="MyPlayer.requestRespawn()"><span class="ui-text-gradient--button-state">{{ t('death.respawn') }}</span></button>
                    </div>
                    <div class="death-dialog-countdown">
                        {{ respawnDelayRemaining > 0
                            ? t('death.respawnLocked', { seconds: respawnDelayRemaining })
                            : t('death.autoRespawn', { seconds: autoRespawnRemaining }) }}
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="dialog-backdrop" v-if="displayRestartPrompt" @click.self="displayRestartPrompt = false">
        <div class="dialog-window adaptive">
            <div class="dialog-surface">
                <div class="dialog-header">{{ t('app.restartGame') }}</div>
                <div class="dialog-content dialog-content--modal">
                    {{ t('app.restartPrompt') }}
                    <div class="dialog-actions" style="margin-top: 20px;">
                        <button class="dialog-button" @click="reloadPage"><span class="ui-text-gradient--button-state">{{ t('common.restart') }}</span></button>
                        <button class="dialog-button" @click="displayRestartPrompt = false"><span class="ui-text-gradient--button-state">{{ t('common.later') }}</span></button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div v-if="displayErrorDialog" class="dialog-backdrop inventory-dialog-backdrop">
        <div class="dialog-window adaptive">
            <div class="dialog-surface">
                <div class="dialog-header text-warning">{{ t('app.errorTitle') }}</div>
                <div class="dialog-content dialog-content--modal" style="text-align: center;">
                    <div>{{ errorDialogMessage }}</div>

                    <div v-if="errorDialogCanRestart" style="margin-top: 5vh;">{{ t('app.errorRestartQuestion') }}</div>
                    <div class="dialog-actions" style="margin-top: 20px;">
                        <button v-if="errorDialogCanRestart" class="dialog-button" @click="reloadPage"><span class="ui-text-gradient--button-state">{{ t('common.restart') }}</span></button>
                        <button class="dialog-button" @click="closeErrorDialog"><span class="ui-text-gradient--button-state">{{ t('common.close') }}</span></button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <PwaControls :visible="displayLoginDialog && !gameLoading" />
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Renderer } from './babylon/scene/renderer'
import { GameManager } from '@/GameManager'
import GmPanel from '@/vue/views/gm/GmPanel.vue'
import NpcDetailsDialog from '@/vue/views/gm/NpcDetailsDialog.vue'
import { GMManager } from '@/gm/GM'
import TouchControllers from '@/vue/views/touchControllers.vue'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { Connector } from '@/network/connector'
import LoginDialog from '@/vue/views/loginDialog.vue'
import GuestCharacterCreationDialog from '@/vue/views/guestCharacterCreationDialog.vue'
import SettingsDialog from '@/vue/views/settingsDialog.vue'
import InventoryDialog from '@/vue/views/inventory/inventoryDialog.vue'
import CharacterDialog from '@/vue/views/character/CharacterDialog.vue'
import CraftingDialog from '@/vue/views/crafting/craftingDialog.vue'
import NpcUseDialog from '@/vue/views/npc/NpcUseDialog.vue'
import OnScreenMessages from '@/vue/views/onScreenMessages.vue'
import PwaControls from '@/vue/views/PwaControls.vue'
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
const isDead = MyPlayer.isDead
const deathDialogTime = ref(Date.now())
const respawnDelayRemaining = computed(() => Math.max(0, Math.ceil((MyPlayer.respawnAvailableAt.value - deathDialogTime.value) / 1000)))
const autoRespawnRemaining = computed(() => Math.max(0, Math.ceil((MyPlayer.autoRespawnAt.value - deathDialogTime.value) / 1000)))
let deathDialogTimer: number | null = null
let touchControlsLayoutTimeout: number | null = null
let touchControlsActivationTimeout: number | null = null

const gameLoading = ref(true)
const displayLoginDialog = ref(false)
const displayGuestCharacterCreationDialog = ref(false)
const pendingGuestCharacterName = ref('')
const displayErrorDialog = ref(false)
const errorDialogMessage = ref('')
const errorDialogCanRestart = ref(false)
const loginRequestSentFlag = ref(false)
const gameSessionActive = ref(false)
const touchControlsReady = ref(false)
const loadingPhaseKey = ref('app.loadingPreparing')
const loadingProgress = ref(5)

const displaySettingsDialog = ref(false)
const targetLockSettingsActive = ref(false)
const displayRestartPrompt = ref(false)

const displayInventoryDialog = ref(false)
const displayCharacterDialog = ref(false)
const displayCraftingDialog = ref(false)
const displayNpcUseDialog = ref(false)
const autoLoginTemporarilyDisabled = true

const touchControls = ref()
const settingsDialog = ref()
const loginDialog = ref()
const inventoryDialog = ref()
const characterDialog = ref()
const craftingDialog = ref()
const npcUseDialog = ref()
const npcDetailsDialog = ref()
const { t } = useI18n()

const closeGameplayDialogs = () => {
    targetLockSettingsActive.value = false
    displaySettingsDialog.value = false
    displayRestartPrompt.value = false
    displayInventoryDialog.value = false
    displayCharacterDialog.value = false
    displayCraftingDialog.value = false
    displayNpcUseDialog.value = false
    gmPanelVisible.value = false
    inventoryDialog.value?.forceClose?.()
}

const onGameStarted = async () => {
    displayLoginDialog.value = false
    displayGuestCharacterCreationDialog.value = false
    loadingProgress.value = 100
    await nextTick()
    await new Promise<void>((resolve) => window.setTimeout(resolve, 450))
    gameLoading.value = false
    await nextTick()
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    gameSessionActive.value = true
    loginRequestSentFlag.value = true
    await nextTick()
    GameManager.onResize()
    WorldRenderer.lastPos = null
    if (touchControlsActivationTimeout !== null) {
        window.clearTimeout(touchControlsActivationTimeout)
    }
    touchControlsActivationTimeout = window.setTimeout(() => {
        touchControlsActivationTimeout = null
        touchControlsReady.value = true
    }, 500)
}

const onLoginFailed = () => {
    gameLoading.value = false
    gameSessionActive.value = false
    loginRequestSentFlag.value = false
    displayGuestCharacterCreationDialog.value = false
    displayLoginDialog.value = true
}

const onLoginError = (event: Event) => {
    const message = (event as CustomEvent<{message?: string}>).detail?.message
    showErrorDialog(message || t('login.missingCredentials'))
}

const onApplicationError = (event: Event) => {
    const message = (event as CustomEvent<{message?: string}>).detail?.message
    showErrorDialog(message || t('app.errorTitle'), true)
}

const showErrorDialog = (message: string, canRestart: boolean = false) => {
    errorDialogMessage.value = message
    errorDialogCanRestart.value = canRestart
    displayErrorDialog.value = true
}

const closeErrorDialog = () => {
    AudioManager.playGuiButtonClick()
    displayErrorDialog.value = false
    errorDialogMessage.value = ''
    errorDialogCanRestart.value = false
}

const guestLoginCheckRequested = () => {
    loadingPhaseKey.value = 'app.loadingConnecting'
    loadingProgress.value = 20
    gameLoading.value = true
    displayLoginDialog.value = false
}

const onGuestCharacterNameCheck = (event: Event) => {
    const detail = (event as CustomEvent<{name?: string, exists?: boolean}>).detail
    if (!detail?.name || typeof detail.exists !== 'boolean') {
        return
    }

    if (detail.exists) {
        Connector.sendLoginRequest(undefined, undefined, detail.name)
        loginRequestSent()
        return
    }

    pendingGuestCharacterName.value = detail.name
    gameLoading.value = false
    displayGuestCharacterCreationDialog.value = true
}

const createGuestCharacter = (classKey: 'FIGHTER' | 'MYSTIC') => {
    if (!pendingGuestCharacterName.value) {
        return
    }
    Connector.createGuestCharacter(pendingGuestCharacterName.value, classKey)
    loginRequestSent()
}

const returnToLoginFromGuestCharacterCreation = () => {
    displayGuestCharacterCreationDialog.value = false
    displayLoginDialog.value = true
}

const onSessionEnded = () => {
    void logout(false)
}

const onLoadingProgress = (event: Event) => {
    const detail = (event as CustomEvent<{ progress: number, phaseKey: string }>).detail
    if (!detail || !Number.isFinite(detail.progress)) {
        return
    }
    loadingProgress.value = Math.max(0, Math.min(100, Math.round(detail.progress)))
    loadingPhaseKey.value = detail.phaseKey
}

const scheduleTouchControlsLayout = () => {
    if (!Settings.isPhoneOrTablet()) {
        return
    }

    if (touchControlsLayoutTimeout !== null) {
        window.clearTimeout(touchControlsLayoutTimeout)
    }

    touchControlsLayoutTimeout = window.setTimeout(() => {
        touchControlsLayoutTimeout = null
        syncAppViewportSize()
        if (GameManager.started) {
            GameManager.onResize()
            WorldRenderer.lastPos = null
        }
        touchControls.value?.updateFromSettings?.()
    }, 180)
}

const syncAppViewportSize = () => {
    const viewport = window.visualViewport
    const viewportWidth = Math.round(viewport?.width || window.innerWidth)
    const viewportHeight = Math.round(viewport?.height || window.innerHeight)
    const viewportTop = Math.round(viewport?.offsetTop || 0)
    const wrapper = document.getElementById('appWrapper')
    const app = document.getElementById('app')

    document.documentElement.style.setProperty('--app-viewport-height', `${viewportHeight}px`)
    document.documentElement.style.setProperty('--app-viewport-top', `${viewportTop}px`)
    document.documentElement.style.setProperty('--login-viewport-top-inset', `${Math.round(viewportHeight * 0.01)}px`)
    document.documentElement.style.setProperty('--login-viewport-bottom-inset', `${Math.round(viewportHeight * 0.04)}px`)

    if (wrapper) wrapper.style.height = viewportHeight + 'px'
    if (app) {
        app.style.width = viewportWidth + 'px'
        app.style.height = viewportHeight + 'px'
    }
}

watch(GMManager.npcDetailsDialogOpenRequested, (openRequested) => {
    if (!openRequested) {
        return
    }
    GMManager.npcDetailsDialogOpenRequested.value = false
    npcDetailsDialog.value?.openDialog()
})

watch(isDead, (dead) => {
    if (!dead) {
        if (deathDialogTimer !== null) {
            window.clearInterval(deathDialogTimer)
            deathDialogTimer = null
        }
        return
    }
    deathDialogTime.value = Date.now()
    deathDialogTimer = window.setInterval(() => deathDialogTime.value = Date.now(), 250)
    displaySettingsDialog.value = false
    displayRestartPrompt.value = false
    displayInventoryDialog.value = false
    displayCharacterDialog.value = false
    displayCraftingDialog.value = false
    displayNpcUseDialog.value = false
    gmPanelVisible.value = false
    inventoryDialog.value?.forceClose?.()
})

onMounted(async () => {
    window.onerror = function (errorMsg, url, lineNumber) {
        console.log(`Error: ${errorMsg} Script: ${url} Line: ${lineNumber}`)
    }

    syncAppViewportSize()

    window.addEventListener('resize', resizeEventHandler)
    window.addEventListener('orientationchange', scheduleTouchControlsLayout)
    document.addEventListener('fullscreenchange', scheduleTouchControlsLayout)
    window.visualViewport?.addEventListener('resize', scheduleTouchControlsLayout)
    window.addEventListener('ui:open-inventory', onOpenInventoryHotkey)
    window.addEventListener('ui:open-character', onOpenCharacterHotkey)
    window.addEventListener('ui:open-crafting', onOpenCraftingMenu as EventListener)
    window.addEventListener('ui:open-npc-use', onOpenNpcUseMenu as EventListener)
    window.addEventListener('ui:inventory-updated', onInventoryUpdated as EventListener)
      window.addEventListener('game:started', onGameStarted)
      window.addEventListener('game:login-error', onLoginError as EventListener)
      window.addEventListener('game:application-error', onApplicationError as EventListener)
      window.addEventListener('game:login-failed', onLoginFailed)
    window.addEventListener('game:guest-character-name-check', onGuestCharacterNameCheck as EventListener)
    window.addEventListener('game:session-ended', onSessionEnded)
    window.addEventListener('game:loading-progress', onLoadingProgress)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    await nextTick()

    if (document.getElementById('renderCanvas')) {
        console.log('INIT GAME', Date.now())
        await Connector.initialize()
        await GameManager.prepareGame(document.getElementById('renderCanvas') as HTMLCanvasElement)
        console.log('GAME INITIALIZED', Date.now())

        await nextTick()
        await new Promise<void>((resolve) => window.setTimeout(resolve, 180))
        gameLoading.value = false
        displayLoginDialog.value = true

        const loginForm = localStorage.getItem('DARKENLIGHT_LOGIN_FORM')
        if (loginForm) {
            const form = JSON.parse(loginForm)
            if (form.autoLogin && !autoLoginTemporarilyDisabled) {
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
    if (deathDialogTimer !== null) window.clearInterval(deathDialogTimer)
    if (touchControlsLayoutTimeout !== null) window.clearTimeout(touchControlsLayoutTimeout)
    if (touchControlsActivationTimeout !== null) window.clearTimeout(touchControlsActivationTimeout)
    window.removeEventListener('resize', resizeEventHandler)
    window.removeEventListener('orientationchange', scheduleTouchControlsLayout)
    document.removeEventListener('fullscreenchange', scheduleTouchControlsLayout)
    window.visualViewport?.removeEventListener('resize', scheduleTouchControlsLayout)
    window.removeEventListener('ui:open-inventory', onOpenInventoryHotkey)
    window.removeEventListener('ui:open-character', onOpenCharacterHotkey)
    window.removeEventListener('ui:open-crafting', onOpenCraftingMenu as EventListener)
    window.removeEventListener('ui:open-npc-use', onOpenNpcUseMenu as EventListener)
    window.removeEventListener('ui:inventory-updated', onInventoryUpdated as EventListener)
      window.removeEventListener('game:started', onGameStarted)
      window.removeEventListener('game:login-error', onLoginError as EventListener)
      window.removeEventListener('game:application-error', onApplicationError as EventListener)
      window.removeEventListener('game:login-failed', onLoginFailed)
    window.removeEventListener('game:guest-character-name-check', onGuestCharacterNameCheck as EventListener)
    window.removeEventListener('game:session-ended', onSessionEnded)
    window.removeEventListener('game:loading-progress', onLoadingProgress)
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('keyup', onKeyUp)
})

const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'F11' || (event.altKey && event.key === 'Enter')) {
        event.preventDefault()
        void Renderer.toggleFullscreen()
        return
    }
    Controller.processKeydown(event)
}

const onKeyUp = (event: KeyboardEvent) => {
    Controller.processKeyup(event)
}

const loginRequestSent = () => {
    loadingPhaseKey.value = 'app.loadingConnecting'
    loadingProgress.value = 20
    gameLoading.value = true
    if (Settings.deviceType !== 'DESKTOP') {
        requestFullscreen()
    }
    document.oncontextmenu = () => false
    displayLoginDialog.value = false
    displayGuestCharacterCreationDialog.value = false
}

const showSettingsDialog = () => {
    if (isDead.value) {
        return
    }
    AudioManager.playGuiButtonClick()
    displaySettingsDialog.value = true
}

const showInventoryDialog = () => {
    if (isDead.value) {
        return
    }
    AudioManager.playGuiButtonClick()
    displayInventoryDialog.value = true
    nextTick(() => {
        inventoryDialog.value?.openDialog()
    })
}

const showCharacterDialog = () => {
    if (isDead.value) {
        return
    }
    AudioManager.playGuiButtonClick()
    displayCharacterDialog.value = true
    nextTick(() => {
        characterDialog.value?.openDialog()
    })
}

const onOpenCharacterHotkey = () => {
    if (!loginRequestSentFlag.value || isDead.value) {
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
    if (!loginRequestSentFlag.value || isDead.value) {
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

const onOpenCraftingMenu = (event: Event) => {
    if (!loginRequestSentFlag.value || isDead.value) {
        return
    }

    const detail = (event as CustomEvent).detail
    if (!detail) {
        return
    }

    displayCraftingDialog.value = true
    nextTick(() => {
        craftingDialog.value?.openDialog?.(detail)
    })
}

const onOpenNpcUseMenu = (event: Event) => {
    if (isDead.value) {
        return
    }
    const detail = (event as CustomEvent).detail
    if (!detail) {
        return
    }
    displayNpcUseDialog.value = true
    nextTick(() => {
        npcUseDialog.value?.openDialog?.(detail)
    })
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

const toggleFullscreen = () => {
    void Renderer.toggleFullscreen().catch((error) => console.error('Cannot toggle fullscreen:', error))
}

const reloadPage = () => {
    window.location.reload()
}

const logout = async (notifyServer: boolean = true) => {
    closeGameplayDialogs()
    if (touchControlsActivationTimeout !== null) {
        window.clearTimeout(touchControlsActivationTimeout)
        touchControlsActivationTimeout = null
    }
    touchControlsReady.value = false
    gameSessionActive.value = false
    loginRequestSentFlag.value = false
    displayLoginDialog.value = false
    displayGuestCharacterCreationDialog.value = false
    await new Promise<void>((resolve) => window.setTimeout(resolve, 300))
    loadingPhaseKey.value = 'app.loadingDisconnecting'
    loadingProgress.value = 15
    gameLoading.value = true
    await GameManager.stopGame(notifyServer)
    gameLoading.value = false
    displayLoginDialog.value = true
}

const requestFullscreen = () => {
    void Renderer.requestFullscreen()
        .then(scheduleTouchControlsLayout)
        .catch((error) => console.error('Cannot enter fullscreen:', error))
}

function resizeEventHandler() {
    syncAppViewportSize()
    if (Renderer.engine && GameManager.started) {
        GameManager.onResize()
        WorldRenderer.lastPos = null
    }
    scheduleTouchControlsLayout()
}
</script>
