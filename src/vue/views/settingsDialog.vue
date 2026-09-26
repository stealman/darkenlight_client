<template>
    <div class="settings-dialog-root">
        <GameDialog backdrop-id="setting-dialog-backdrop" @close="closeDialog">
            <template #header>
                <div class="settings-header-actions">
                    <div class="settings-header-action" @click.stop="resetConfirmationVisible = true" v-html="getRestoreDefaultsSvg('icon-white', 'icon-restore-defaults')"></div>
                    <div class="settings-header-action" @click.stop="emit('toggle-fullscreen')" v-html="getFullScreenSvg('icon-white', 'icon-fullscreen')"></div>
                </div>
                <div v-for="tab in tabs" :key="tab.id" class="tab-item" :class="tab.id === activeTabId ? 'active' : ''" @click="activeTabId = tab.id">
                    <label :class="['noselect', { 'ui-text-gradient': tab.id === activeTabId, 'ui-text-gradient--no-shadow': tab.id === activeTabId }]">{{ tab.name }}</label>
                </div>
            </template>

            <div v-if="activeTabId == 1">
                <div style="max-height: 65vh; overflow-y: auto">
                    <div>{{ t('settings.deviceDescription') }}</div>
                    <div class="dialog-actions" style="margin-top: 20px">
                        <button class="dialog-button" :class="{ selected: selectedDeviceType === 'DESKTOP' }" @click="setDeviceType('DESKTOP')">
                            <span class="ui-text-gradient--button-state">{{ t('settings.deviceDesktop') }}</span>
                        </button>
                        <button class="dialog-button" :class="{ selected: selectedDeviceType === 'TABLET' }" @click="setDeviceType('TABLET')">
                            <span class="ui-text-gradient--button-state">{{ t('settings.deviceTablet') }}</span>
                        </button>
                        <button class="dialog-button" :class="{ selected: selectedDeviceType === 'PHONE' }" @click="setDeviceType('PHONE')">
                            <span class="ui-text-gradient--button-state">{{ t('settings.devicePhone') }}</span>
                        </button>
                    </div>

                    <div v-if="storedSettings.deviceType == 'TABLET' || storedSettings.deviceType == 'PHONE'" style="margin-top: 20px">
                        <table>
                            <tbody>
                                <tr>
                                    <td class="settings-joystick-label" align="center" style="width: 50%">{{ t('settings.joystickSettings') }}</td>
                                </tr>

                                <tr>
                                    <td align="center">
                                        <div>
                                            <button class="dialog-button" @click="joystickSizeChanged(10)"><span class="ui-text-gradient--button-state">+</span></button>
                                            <button class="dialog-button" @click="joystickSizeChanged(-10)"><span class="ui-text-gradient--button-state">-</span></button>
                                        </div>
                                    </td>
                                </tr>

                                <tr>
                                    <td align="center">
                                        <div>
                                            <button class="dialog-button" @click="joystickLeftChanged(-10)"><span class="ui-text-gradient--button-state">&larr;</span></button>
                                            <button class="dialog-button" @click="joystickBottomChanged(10)"><span class="ui-text-gradient--button-state">&uarr;</span></button>
                                            <button class="dialog-button" @click="joystickBottomChanged(-10)"><span class="ui-text-gradient--button-state">&darr;</span></button>
                                            <button class="dialog-button" @click="joystickLeftChanged(10)"><span class="ui-text-gradient--button-state">&rarr;</span></button>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <table style="margin-top: 20px">
                            <tbody>
                                <tr>
                                    <td class="settings-joystick-label" align="center" style="width: 50%">{{ t('settings.targetLockSettings') }}</td>
                                </tr>

                                <tr>
                                    <td align="center">
                                        <div>
                                            <button class="dialog-button" @click="targetLockSizeChanged(10)"><span class="ui-text-gradient--button-state">+</span></button>
                                            <button class="dialog-button" @click="targetLockSizeChanged(-10)"><span class="ui-text-gradient--button-state">-</span></button>
                                        </div>
                                    </td>
                                </tr>

                                <tr>
                                    <td align="center">
                                        <div>
                                            <button class="dialog-button" @click="targetLockLeftChanged(-10)"><span class="ui-text-gradient--button-state">&larr;</span></button>
                                            <button class="dialog-button" @click="targetLockBottomChanged(10)"><span class="ui-text-gradient--button-state">&uarr;</span></button>
                                            <button class="dialog-button" @click="targetLockBottomChanged(-10)"><span class="ui-text-gradient--button-state">&darr;</span></button>
                                            <button class="dialog-button" @click="targetLockLeftChanged(10)"><span class="ui-text-gradient--button-state">&rarr;</span></button>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div v-if="activeTabId == 2">
                <label>{{ t('settings.graphicsLevel') }}</label>
                <div class="dialog-actions" style="margin-top: 20px">
                    <button class="dialog-button" :class="storedSettings.detailLevel.name == 'HIGH' ? 'selected' : ''" @click="setDetailsLevel('HIGH')">
                        <span class="ui-text-gradient--button-state">{{ t('settings.graphicsHigh') }}</span>
                    </button>
                    <button class="dialog-button" :class="storedSettings.detailLevel.name == 'MEDIUM' ? 'selected' : ''" @click="setDetailsLevel('MEDIUM')">
                        <span class="ui-text-gradient--button-state">{{ t('settings.graphicsMedium') }}</span>
                    </button>
                    <button class="dialog-button" :class="storedSettings.detailLevel.name == 'LOW' ? 'selected' : ''" @click="setDetailsLevel('LOW')">
                        <span class="ui-text-gradient--button-state">{{ t('settings.graphicsLow') }}</span>
                    </button>
                </div>

                <div style="margin-top: 10px">
                    <table>
                        <tbody>
                            <tr>
                                <td class="item-label" style="width: 25%">{{ t('settings.brightness') }}</td>
                                <td style="width: 25%">
                                    <input class="range-slider" type="range" min="1" max="10" step="1" style="zoom: 1.5" v-model="storedSettings.brightness" @change="brightnessChanged()" />
                                </td>

                                <td class="item-label" style="width: 25%">{{ t('settings.targetMarkerBrightness') }}</td>
                                <td style="width: 25%">
                                    <input
                                        class="range-slider"
                                        type="range"
                                        min="0.2"
                                        max="1.8"
                                        step="0.1"
                                        style="zoom: 1.5"
                                        v-model="storedSettings.targetMarkerOpacity"
                                        @change="targetMarkerOpacityChanged()"
                                    />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div v-if="activeTabId == 3">
                <div style="max-height: 65vh; overflow-y: auto; overflow-x: hidden">
                    {{ t('settings.actionButtons') }}
                    <div class="dialog-actions" style="margin-top: 20px">
                        <button class="dialog-button" :class="storedSettings.actionButtonsLayout == '1COLUMN' ? 'selected' : ''" @click="setActionButtonsLayout('1COLUMN')">
                            <span class="ui-text-gradient--button-state">{{ t('settings.layoutOneColumn') }}</span>
                        </button>
                        <button class="dialog-button" :class="storedSettings.actionButtonsLayout == '2COLUMN' ? 'selected' : ''" @click="setActionButtonsLayout('2COLUMN')">
                            <span class="ui-text-gradient--button-state">{{ t('settings.layoutTwoColumns') }}</span>
                        </button>
                        <button class="dialog-button" :class="storedSettings.actionButtonsLayout == 'CORNER' ? 'selected' : ''" @click="setActionButtonsLayout('CORNER')">
                            <span class="ui-text-gradient--button-state">{{ t('settings.layoutCorner') }}</span>
                        </button>
                    </div>

                    <div style="margin-top: 10px">
                        <table>
                            <tbody>
                                <tr>
                                    <td class="item-label" style="width: 25%">{{ t('settings.buttonSize') }}</td>
                                    <td style="width: 25%">
                                        <input
                                            class="range-slider"
                                            type="range"
                                            min="32"
                                            max="64"
                                            step="2"
                                            style="zoom: 1.5"
                                            v-model="storedSettings.actionButtonSize"
                                            @change="actionButtonsChanged()"
                                        />
                                    </td>

                                    <td class="item-label" style="width: 25%">{{ t('settings.miniMapSize') }}</td>
                                    <td style="width: 25%">
                                        <input class="range-slider" type="range" min="25" max="100" step="5" style="zoom: 1.5" v-model="storedSettings.miniMapSize" @change="miniMapSizeChanged()" />
                                    </td>
                                </tr>
                                <tr>
                                    <td class="item-label" style="width: 25%; padding-top: 1rem">{{ t('settings.buttonsOffsetBottom') }}</td>
                                    <td style="width: 25%; padding-top: 1rem">
                                        <input
                                            class="range-slider"
                                            type="range"
                                            min="0"
                                            max="512"
                                            step="16"
                                            style="zoom: 1.5"
                                            v-model="storedSettings.actionButtonsYOffset"
                                            @change="actionButtonsChanged()"
                                        />
                                    </td>

                                    <td class="item-label" style="width: 25%; padding-top: 1rem">{{ t('settings.buttonCount') }}</td>
                                    <td style="width: 25%; padding-top: 1rem">
                                        <input
                                            class="range-slider"
                                            type="range"
                                            min="4"
                                            max="10"
                                            step="2"
                                            style="zoom: 1.5"
                                            v-model="storedSettings.actionButtonCount"
                                            @change="actionButtonsChanged()"
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div v-if="activeTabId == 4">
                <div style="margin-top: 10px">
                    <div style="margin-top: 10px">
                        <table>
                            <tbody>
                                <tr>
                                    <td class="item-label" style="width: 25%">{{ t('settings.volume') }}</td>
                                    <td style="width: 25%">
                                        <input class="range-slider" type="range" min="0" max="1" step="0.1" style="zoom: 1.5" v-model="storedSettings.volume" @change="volumeChanged()" />
                                    </td>
                                    <td class="item-label" style="width: 25%">{{ t('settings.ambient') }}</td>
                                    <td style="width: 25%">
                                        <input class="range-slider" type="range" min="0" max="2" step="0.1" style="zoom: 1.5" v-model="storedSettings.ambientVolume" @change="ambientVolumeChanged()" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div v-if="activeTabId == 5">
                <div style="max-height: 65vh; overflow-y: auto">
                    <div>{{ t('common.language') }}</div>
                    <div class="dialog-actions" style="margin-top: 20px">
                        <button class="dialog-button" :class="storedSettings.language == 'cs' ? 'selected' : ''" @click="setLanguage('cs')">
                            <span class="ui-text-gradient--button-state">{{ t('common.czech') }}</span>
                        </button>
                        <button class="dialog-button" :class="storedSettings.language == 'en' ? 'selected' : ''" @click="setLanguage('en')">
                            <span class="ui-text-gradient--button-state">{{ t('common.english') }}</span>
                        </button>
                    </div>

                    <div class="dialog-actions" style="margin-top: 24px">
                        <button class="dialog-button" @click="logoutFromAccount()">
                            <span class="ui-text-gradient--button-state">{{ t('settings.logout') }}</span>
                        </button>
                    </div>
                </div>
            </div>

            <div v-if="graphicSettingsChanged" class="text-warning" style="margin-top: 20px">{{ t('settings.graphicsRestartWarning') }}</div>
        </GameDialog>

        <div v-if="resetConfirmationVisible" class="dialog-backdrop settings-reset-confirm-backdrop" @click.self="resetConfirmationVisible = false">
            <div class="dialog-window adaptive">
                <div class="dialog-header">{{ t('settings.restoreDefaultsTitle') }}</div>
                <div class="dialog-content settings-reset-confirm-content">
                    {{ t('settings.restoreDefaultsDescription') }}
                    <div class="dialog-actions" style="margin-top: 20px">
                        <button class="dialog-button" @click="restoreDefaultSettings">
                            <span class="ui-text-gradient--button-state">{{ t('settings.restoreDefaultsConfirm') }}</span>
                        </button>
                        <button class="dialog-button" @click="resetConfirmationVisible = false">
                            <span class="ui-text-gradient--button-state">{{ t('settings.restoreDefaultsCancel') }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import GameDialog from '@/vue/views/GameDialog.vue'
import { Settings } from '@/settings/settings'
import { Renderer } from '@/babylon/scene/renderer'
import { Lights } from '@/babylon/scene/lights'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { TargetingManager } from '@/gui/targettingManager'
import { ViewportManager } from '@/utils/viewport'
import { getFullScreenSvg, getRestoreDefaultsSvg } from '@/vue/icons/icons'
import { setLocale, useI18n } from '@/i18n'

const props = defineProps({
    visible: Boolean,
})
const storedSettings = ref(Settings)
const emit = defineEmits(['close', 'closeWithRestartPrompt', 'deviceTypeSelected', 'touchColtrolsChanged', 'logout', 'toggle-fullscreen', 'target-lock-settings-active'])
const { t } = useI18n()

const tabs = computed(() => [
    { name: t('settings.tabs.controls'), id: 1 },
    { name: t('settings.tabs.graphics'), id: 2 },
    { name: t('settings.tabs.gui'), id: 3 },
    { name: t('settings.tabs.audio'), id: 4 },
    { name: t('settings.tabs.account'), id: 5 },
])
const activeTabId = ref(1)
const selectedDeviceType = ref('DESKTOP')

const graphicSettingsChanged = ref(false)
const resetConfirmationVisible = ref(false)

onMounted(() => {
    Settings.touchEnabled = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0
    Settings.mouseEnabled = !Settings.touchEnabled
    syncSelectedDeviceType()
})

const openDialog = () => {
    graphicSettingsChanged.value = false
    syncSelectedDeviceType()
}

const syncSelectedDeviceType = () => {
    const deviceType = Settings.deviceType
    selectedDeviceType.value = ['DESKTOP', 'TABLET', 'PHONE'].includes(deviceType) ? deviceType : Settings.touchEnabled ? 'PHONE' : 'DESKTOP'
    storedSettings.value.deviceType = selectedDeviceType.value
}

const setLanguage = (language) => {
    storedSettings.value.language = language
    setLocale(language)
    storeSettings()
}

const setDeviceType = (deviceType) => {
    selectedDeviceType.value = deviceType
    storedSettings.value.deviceType = deviceType
    const targetLockDefaultPosition = Settings.getDefaultTargetLockPosition(
        deviceType == 'PHONE' ? 30 : deviceType == 'TABLET' ? 120 : 0,
        deviceType == 'PHONE' ? 64 : deviceType == 'TABLET' ? 250 : 0,
    )

    if (deviceType == 'PHONE') {
        storedSettings.value.joystickBottom = 100
        storedSettings.value.joystickLeft = 30
        storedSettings.value.joystickSize = 100
        storedSettings.value.targetLockBottom = targetLockDefaultPosition.bottom
        storedSettings.value.targetLockLeft = targetLockDefaultPosition.left
        storedSettings.value.targetLockSize = 64
        storedSettings.value.hudSize = 1.2
        storedSettings.value.actionButtonSize = 40
        storedSettings.value.actionButtonsLayout = 'CORNER'
        storedSettings.value.actionButtonsYOffset = 0
    } else if (deviceType == 'TABLET') {
        storedSettings.value.joystickBottom = 200
        storedSettings.value.joystickLeft = 80
        storedSettings.value.joystickSize = 120
        storedSettings.value.targetLockBottom = targetLockDefaultPosition.bottom
        storedSettings.value.targetLockLeft = targetLockDefaultPosition.left
        storedSettings.value.targetLockSize = 92
        storedSettings.value.hudSize = 1
        storedSettings.value.actionButtonSize = 56
        storedSettings.value.actionButtonsLayout = '2COLUMN'
        storedSettings.value.actionButtonsYOffset = 120
    } else {
        storedSettings.value.hudSize = 1
        storedSettings.value.actionButtonSize = 64
        storedSettings.value.actionButtonsLayout = '1COLUMN'
    }

    storeSettings()
    ActionButtonsManager.renderActionButtons()
    emit('deviceTypeSelected')
}

const setActionButtonsLayout = (layout) => {
    storedSettings.value.actionButtonsLayout = layout
    storeSettings()
    ActionButtonsManager.renderActionButtons()
}

const setDetailsLevel = (level) => {
    storedSettings.value.setDetailLevel(level)
    graphicSettingsChanged.value = true
    storeSettings()
}

const brightnessChanged = () => {
    Renderer.brightnessChanged()
    Lights.brightnessChanged()
    storeSettings()
}

const volumeChanged = () => {
    Settings.setVolume(storedSettings.value.volume)
    storeSettings()
}

const ambientVolumeChanged = () => {
    Settings.setAmbientVolume(storedSettings.value.ambientVolume)
    storeSettings()
}

const targetMarkerOpacityChanged = () => {
    Settings.setTargetMarkerOpacity(Number(storedSettings.value.targetMarkerOpacity))
    TargetingManager.prepareTargetSprites()
    storeSettings()
}

const joystickSizeChanged = (change) => {
    storedSettings.value.joystickSize += change
    touchControlsChanged()
}

const joystickLeftChanged = (change) => {
    storedSettings.value.joystickLeft += change
    touchControlsChanged()
}

const joystickBottomChanged = (change) => {
    storedSettings.value.joystickBottom += change
    touchControlsChanged()
}

const targetLockSizeChanged = (change) => {
    storedSettings.value.targetLockSize += change
    touchControlsChanged()
}

const targetLockLeftChanged = (change) => {
    storedSettings.value.targetLockLeft += change
    touchControlsChanged()
}

const targetLockBottomChanged = (change) => {
    storedSettings.value.targetLockBottom += change
    touchControlsChanged()
}

const touchControlsChanged = () => {
    storeSettings()
    emit('touchColtrolsChanged')
}

const actionButtonsChanged = () => {
    storedSettings.value.actionButtonSize = parseInt(storedSettings.value.actionButtonSize)
    storedSettings.value.actionButtonsYOffset = parseInt(storedSettings.value.actionButtonsYOffset)
    storedSettings.value.actionButtonCount = parseInt(storedSettings.value.actionButtonCount)
    ActionButtonsManager.renderActionButtons()
    storeSettings()
}

const miniMapSizeChanged = () => {
    storedSettings.value.miniMapSize = parseInt(storedSettings.value.miniMapSize)
    ViewportManager.onResize()
    storeSettings()
}

const restoreDefaultSettings = () => {
    const defaultSettings = Settings.getDefaultSettings()
    const detailLevelChanged = storedSettings.value.detailLevelName !== defaultSettings.detailLevelName

    Object.assign(storedSettings.value, defaultSettings)
    storedSettings.value.setDetailLevel(defaultSettings.detailLevelName)
    syncSelectedDeviceType()
    Settings.setVolume(defaultSettings.volume)
    Settings.setAmbientVolume(defaultSettings.ambientVolume)
    setLocale(defaultSettings.language)
    Renderer.brightnessChanged()
    Lights.brightnessChanged()
    ViewportManager.onResize()
    Settings.deviceTypeChanged()
    ActionButtonsManager.renderActionButtons()
    TargetingManager.prepareTargetSprites()
    emit('touchColtrolsChanged')
    graphicSettingsChanged.value = graphicSettingsChanged.value || detailLevelChanged
    resetConfirmationVisible.value = false
    storeSettings()
}

const storeSettings = () => {
    Settings.storeSettings()
}

const closeDialog = () => {
    if (graphicSettingsChanged.value) {
        emit('closeWithRestartPrompt')
    } else {
        emit('close')
    }
}

const logoutFromAccount = () => {
    emit('logout')
    activeTabId.value = 1
    closeDialog()
}

defineExpose({
    openDialog,
})

watch(activeTabId, (newVal) => {
    if (newVal == null) {
        activeTabId.value = 1
    }
})

watch(
    [activeTabId, () => props.visible],
    () => {
        if (props.visible) {
            syncSelectedDeviceType()
        }
        emit('target-lock-settings-active', props.visible && activeTabId.value === 1)
    },
    { immediate: true },
)
</script>

<style>
#setting-dialog-backdrop .dialog-header {
    position: relative;
}

#setting-dialog-backdrop .dialog-window {
    width: 620px;
}

#setting-dialog-backdrop .dialog-content {
    box-sizing: border-box;
    padding-right: 10px;
}

#setting-dialog-backdrop .dialog-content .dialog-button:not(:disabled):hover {
    background-image: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('/images/gui/bck_stone1.png');
}

.settings-joystick-label {
    color: rgb(var(--ui-base));
}

.settings-header-actions {
    position: absolute;
    top: 50%;
    left: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    transform: translateY(-50%);
}

.settings-header-action {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: url('/images/cursor-pointer.png'), pointer;
}

.settings-header-action .icon-white {
    fill: rgb(var(--ui-base));
}

.settings-header-action .icon-white:hover {
    fill: rgb(var(--ui-darkest));
}

.settings-reset-confirm-backdrop {
    z-index: 2300;
    background: rgba(0, 0, 0, 0.45);
}

.settings-reset-confirm-content {
    max-width: 440px;
    text-align: center;
}
</style>
