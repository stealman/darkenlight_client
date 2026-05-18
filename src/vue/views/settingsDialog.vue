<template>
    <GameDialog
        backdrop-id="setting-dialog-backdrop"
        @close="closeDialog"
    >
        <template #header>
            <div v-for="tab in tabs" :key="tab.id" class="tab-item" :class="tab.id === activeTabId ? 'active' : ''" @click="activeTabId = tab.id">
                <label class="noselect">{{ tab.name }}</label>
            </div>
        </template>

                <div v-if="activeTabId == 1">
                    <div style="max-height: 65vh; overflow-y: auto;">
                        <div>{{ t('settings.deviceDescription') }}</div>
                        <div class="dialog-actions" style="margin-top: 20px;">
                            <button class="dialog-button" :class="storedSettings.deviceType == 'DESKTOP' ? 'selected' : ''" @click="setDeviceType('DESKTOP')">{{ t('settings.deviceDesktop') }}</button>
                            <button class="dialog-button" :class="storedSettings.deviceType == 'TABLET' ? 'selected' : ''" @click="setDeviceType('TABLET')">{{ t('settings.deviceTablet') }}</button>
                            <button class="dialog-button" :class="storedSettings.deviceType == 'PHONE' ? 'selected' : ''" @click="setDeviceType('PHONE')">{{ t('settings.devicePhone') }}</button>
                        </div>

                        <div v-if="storedSettings.deviceType == 'TABLET' || storedSettings.deviceType == 'PHONE'" style="margin-top: 20px;">
                            <table>
                                <tbody>
                                <tr>
                                    <td align="center" style="width: 50%">{{ t('settings.joystickSettings') }}</td>
                                </tr>

                                <tr>
                                    <td align="center">
                                        <div>
                                            <button class="dialog-button" @click="joystickSizeChanged(10)">+</button>
                                            <button class="dialog-button" @click="joystickSizeChanged(-10)">-</button>
                                        </div>
                                    </td>
                                </tr>

                                <tr>
                                    <td align="center">
                                        <div>
                                            <button class="dialog-button" @click="joystickLeftChanged(-10)">&larr;</button>
                                            <button class="dialog-button" @click="joystickBottomChanged(10)">&uarr;</button>
                                            <button class="dialog-button" @click="joystickBottomChanged(-10)">&darr;</button>
                                            <button class="dialog-button" @click="joystickLeftChanged(10)">&rarr;</button>
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
                    <div class="dialog-actions" style="margin-top: 20px;">
                        <button class="dialog-button" :class="storedSettings.detailLevel.name == 'HIGH' ? 'selected' : ''" @click="setDetailsLevel('HIGH')">{{ t('settings.graphicsHigh') }}</button>
                        <button class="dialog-button" :class="storedSettings.detailLevel.name == 'MEDIUM' ? 'selected' : ''" @click="setDetailsLevel('MEDIUM')">{{ t('settings.graphicsMedium') }}</button>
                        <button class="dialog-button" :class="storedSettings.detailLevel.name == 'LOW' ? 'selected' : ''" @click="setDetailsLevel('LOW')">{{ t('settings.graphicsLow') }}</button>
                    </div>

                    <div style="margin-top: 10px;">
                        <table>
                            <tbody>
                            <tr>
                                <td class="item-label" style="width: 25%">{{ t('settings.brightness') }}</td>
                                <td style="width: 25%">
                                    <input class="range-slider" type="range" min="1" max="10" step="1" style="zoom: 1.5;" v-model="storedSettings.brightness" @change="brightnessChanged()" />
                                </td>

                                <td class="item-label" style="width: 25%">{{ t('settings.targetMarkerBrightness') }}</td>
                                <td style="width: 25%">
                                    <input class="range-slider" type="range" min="0.1" max="1" step="0.1" style="zoom: 1.5;" v-model="storedSettings.targetMarkerOpacity" @change="targetMarkerOpacityChanged()" />
                                </td>
                            </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div v-if="activeTabId == 3">
                    <div style="max-height: 65vh; overflow-y: auto; overflow-x: hidden;">
                        {{ t('settings.actionButtons') }}
                        <div class="dialog-actions" style="margin-top: 20px;">
                            <button class="dialog-button" :class="storedSettings.actionButtonsLayout == '1COLUMN' ? 'selected' : ''" @click="setActionButtonsLayout('1COLUMN')">{{ t('settings.layoutOneColumn') }}</button>
                            <button class="dialog-button" :class="storedSettings.actionButtonsLayout == '2COLUMN' ? 'selected' : ''" @click="setActionButtonsLayout('2COLUMN')">{{ t('settings.layoutTwoColumns') }}</button>
                            <button class="dialog-button" :class="storedSettings.actionButtonsLayout == 'CORNER' ? 'selected' : ''" @click="setActionButtonsLayout('CORNER')">{{ t('settings.layoutCorner') }}</button>
                        </div>

                        <div style="margin-top: 10px;">
                            <table>
                                <tbody>
                                <tr>
                                    <td class="item-label" style="width: 25%">{{ t('settings.buttonSize') }}</td>
                                    <td style="width: 25%">
                                        <input class="range-slider" type="range" min="32" max="64" step="2" style="zoom: 1.5;" v-model="storedSettings.actionButtonSize" @change="actionButtonsChanged()" />
                                    </td>

                                    <td class="item-label" style="width: 25%">{{ t('settings.buttonsOffsetBottom') }}</td>
                                    <td style="width: 25%">
                                        <input class="range-slider" type="range" min="0" max="512" step="16" style="zoom: 1.5;" v-model="storedSettings.actionButtonsYOffset" @change="actionButtonsChanged()" />
                                    </td>
                                </tr>
                                <tr>
                                    <td class="item-label" style="width: 25%; padding-top: 1rem;">{{ t('settings.buttonCount') }}</td>
                                    <td style="width: 25%; padding-top: 1rem;">
                                        <input class="range-slider" type="range" min="4" max="10" step="2" style="zoom: 1.5;" v-model="storedSettings.actionButtonCount" @change="actionButtonsChanged()" />
                                    </td>
                                </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div v-if="activeTabId == 4">
                    <div style="margin-top: 10px;">
                        <div style="margin-top: 10px;">
                            <table>
                                <tbody>
                                <tr>
                                    <td class="item-label" style="width: 25%">{{ t('settings.volume') }}</td>
                                    <td style="width: 25%">
                                        <input class="range-slider" type="range" min="0" max="1" step="0.1" style="zoom: 1.5;" v-model="storedSettings.volume" @change="volumeChanged()" />
                                    </td>
                                    <td class="item-label" style="width: 25%">{{ t('settings.ambient') }}</td>
                                    <td style="width: 25%">
                                        <input class="range-slider" type="range" min="0" max="2" step="0.1" style="zoom: 1.5;" v-model="storedSettings.ambientVolume" @change="ambientVolumeChanged()" />
                                    </td>
                                </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div v-if="activeTabId == 5">
                    <div style="max-height: 65vh; overflow-y: auto;">
                        <div>{{ t('common.language') }}</div>
                        <div class="dialog-actions" style="margin-top: 20px;">
                            <button class="dialog-button" :class="storedSettings.language == 'cs' ? 'selected' : ''" @click="setLanguage('cs')">{{ t('common.czech') }}</button>
                            <button class="dialog-button" :class="storedSettings.language == 'en' ? 'selected' : ''" @click="setLanguage('en')">{{ t('common.english') }}</button>
                        </div>

                        <div class="dialog-actions" style="margin-top: 24px;">
                            <button class="dialog-button" @click="logoutFromAccount()">{{ t('settings.logout') }}</button>
                        </div>
                    </div>
                </div>

                <div v-if="graphicSettingsChanged" class="text-warning" style="margin-top: 20px;">{{ t('settings.graphicsRestartWarning') }}</div>
    </GameDialog>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import GameDialog from '@/vue/views/GameDialog.vue'
import { Settings } from '@/settings/settings'
import { Renderer } from '@/babylon/scene/renderer'
import { Lights } from '@/babylon/scene/lights'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { setLocale, useI18n } from '@/i18n'

const storedSettings = ref(Settings)
const emit = defineEmits(['close', 'closeWithRestartPrompt', 'deviceTypeSelected', 'touchColtrolsChanged', 'logout'])
const { t } = useI18n()

const tabs = computed(() => [
    { name: t('settings.tabs.controls'), id: 1 },
    { name: t('settings.tabs.graphics'), id: 2 },
    { name: t('settings.tabs.gui'), id: 3 },
    { name: t('settings.tabs.audio'), id: 4 },
    { name: t('settings.tabs.account'), id: 5 },
])
const activeTabId = ref(1)

const graphicSettingsChanged = ref(false)

onMounted(() => {
    Settings.touchEnabled = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0
    Settings.mouseEnabled = !Settings.touchEnabled
})

const openDialog = () => {
    graphicSettingsChanged.value = false
}

const setLanguage = (language) => {
    storedSettings.value.language = language
    setLocale(language)
    storeSettings()
}

const setDeviceType = (deviceType) => {
    storedSettings.value.deviceType = deviceType

    if (deviceType == 'PHONE') {
        storedSettings.value.joystickBottom = 50
        storedSettings.value.joystickLeft = 120
        storedSettings.value.joystickSize = 100
        storedSettings.value.hudSize = 1.2
        storedSettings.value.actionButtonSize = 40
        storedSettings.value.actionButtonsLayout = 'CORNER'
    } else if (deviceType == 'TABLET') {
        storedSettings.value.joystickBottom = 300
        storedSettings.value.joystickLeft = 120
        storedSettings.value.joystickSize = 150
        storedSettings.value.hudSize = 1
        storedSettings.value.actionButtonSize = 64
        storedSettings.value.actionButtonsLayout = '2COLUMN'
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
    Settings.setTargetMarkerOpacity(storedSettings.value.targetMarkerOpacity)
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
    openDialog
})

watch(activeTabId, (newVal) => {
    if (newVal == null) {
        activeTabId.value = 1
    }
})
</script>

<style>
</style>
