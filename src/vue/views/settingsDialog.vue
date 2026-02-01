<template>
    <div id="setting-dialog-backdrop" class="dialog-backdrop" @click.self="closeDialog" >
        <div class="dialog-window">
            <div class="dialog-header">
                <div v-for="tab in tabs" :key="tab.id" class="tab-item" :class="tab.id === activeTabId ? 'active' : ''" @click="activeTabId = tab.id">
                    <label class="noselect">{{ tab.name }}</label>
                </div>
            </div>
            <div class="dialog-content">

                <!-- Ovládání -->
                <div v-if="activeTabId == 1" >

                    <div style="max-height: 65vh; overflow-y: auto;">

                        Zařízení, na kterém hraješ.
                        <div class="dialog-actions" style="margin-top: 20px;">
                            <button class="dialog-button" :class="storedSettings.deviceType == 'DESKTOP' ? 'selected' : ''" @click="setDeviceType('DESKTOP')">PC</button>
                            <button class="dialog-button" :class="storedSettings.deviceType == 'TABLET' ? 'selected' : ''" @click="setDeviceType('TABLET')">Tablet</button>
                            <button class="dialog-button" :class="storedSettings.deviceType == 'PHONE' ? 'selected' : ''" @click="setDeviceType('PHONE')">Mobil</button>
                        </div>

                        <!-- Nastaveni pro dotykova zarizeni -->
                        <div v-if="storedSettings.deviceType == 'TABLET' || storedSettings.deviceType == 'PHONE'" style="margin-top: 20px;">
                            <table>
                                <tbody>
                                <tr>
                                    <td align="center" style="width: 50%">Nastavení joysticku</td>
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

                <!-- Grafika -->
                <div v-if="activeTabId == 2" >

                    <label>Úroveň detailů grafiky.</label>
                    <div class="dialog-actions" style="margin-top: 20px;">
                        <button class="dialog-button" :class="storedSettings.detailLevel.name == 'HIGH' ? 'selected' : ''" @click="setDetailsLevel('HIGH')">Vysoká</button>
                        <button class="dialog-button" :class="storedSettings.detailLevel.name == 'MEDIUM' ? 'selected' : ''" @click="setDetailsLevel('MEDIUM')">Střední</button>
                        <button class="dialog-button" :class="storedSettings.detailLevel.name == 'LOW' ? 'selected' : ''" @click="setDetailsLevel('LOW')">Nízká</button>
                    </div>

                    <div style="margin-top: 10px;">
                        <table>
                            <tbody>
                                <tr>
                                    <td class="item-label" style="width: 25%">Jas</td>
                                    <td  style="width: 25%">
                                        <input class="range-slider" type="range" min="1" max="10" step="1" style="zoom: 1.5;" v-model="storedSettings.brightness" @change="brightnessChanged()" />
                                    </td>

                                    <td class="item-label" style="width: 25%">Jas označníku</td>
                                    <td  style="width: 25%">
                                        <input class="range-slider" type="range" min="0.1" max="1" step="0.1" style="zoom: 1.5;" v-model="storedSettings.targetMarkerOpacity" @change="targetMarkerOpacityChanged()" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- GUI -->
                <div v-if="activeTabId == 3" >
                    <div style="max-height: 65vh; overflow-y: auto; overflow-x: hidden;">

                        Akční tlačítka
                        <div class="dialog-actions" style="margin-top: 20px;">
                            <button class="dialog-button" :class="storedSettings.actionButtonsLayout == '1COLUMN' ? 'selected' : ''" @click="setActionButtonsLayout('1COLUMN')">1 Sloupec</button>
                            <button class="dialog-button" :class="storedSettings.actionButtonsLayout == '2COLUMN' ? 'selected' : ''" @click="setActionButtonsLayout('2COLUMN')">2 Sloupce</button>
                            <button class="dialog-button" :class="storedSettings.actionButtonsLayout == 'CORNER' ? 'selected' : ''" @click="setActionButtonsLayout('CORNER')">Roh</button>
                        </div>

                        <div style="margin-top: 10px;">
                            <table>
                                <tbody>
                                    <tr>
                                        <td class="item-label" style="width: 25%">Velikost tlačítek</td>
                                        <td  style="width: 25%">
                                            <input class="range-slider" type="range" min="32" max="64" step="2" style="zoom: 1.5;" v-model="storedSettings.actionButtonSize" @change="actionButtonsChanged()" />
                                        </td>

                                        <td class="item-label" style="width: 25%">Odsazení zdola</td>
                                        <td  style="width: 25%">
                                            <input class="range-slider" type="range" min="0" max="256" step="16" style="zoom: 1.5;" v-model="storedSettings.actionButtonsYOffset" @change="actionButtonsChanged()" />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td class="item-label" style="width: 25%; padding-top: 1rem;">Počet tlačítek</td>
                                        <td  style="width: 25%; padding-top: 1rem;">
                                            <input class="range-slider" type="range" min="4" max="10" step="2" style="zoom: 1.5;" v-model="storedSettings.actionButtonCount" @change="actionButtonsChanged()" />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>


                <!-- Audio -->
                <div v-if="activeTabId == 4" >
                    <div style="margin-top: 10px;">
                        <div style="margin-top: 10px;">
                            <table>
                                <tbody>
                                <tr>
                                    <td class="item-label" style="width: 25%">Hlasitost</td>
                                    <td  style="width: 25%">
                                        <input class="range-slider" type="range" min="0" max="1" step="0.1" style="zoom: 1.5;" v-model="storedSettings.volume" @change="volumeChanged()" />
                                    </td>
                                    <td class="item-label" style="width: 25%">Ambient</td>
                                    <td  style="width: 25%">
                                        <input class="range-slider" type="range" min="0" max="2" step="0.1" style="zoom: 1.5;" v-model="storedSettings.ambientVolume" @change="ambientVolumeChanged()" />
                                    </td>
                                </tr>
                                </tbody>
                            </table>
                        </div>

                    </div>
                </div>

                <div v-if="graphicSettingsChanged" class="text-warning" style="margin-top: 20px;">Změny v nastavení grafiky se projeví až po restartu hry</div>
            </div>
        </div>
    </div>
</template>

<script setup>

import { onMounted, ref, watch } from 'vue'
import { Settings } from '@/settings/settings'
import { Renderer } from '@/babylon/scene/renderer'
import { Lights } from '@/babylon/scene/lights'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'

const storedSettings = ref(Settings)
const emit = defineEmits(['close', 'closeWithRestartPrompt', 'deviceTypeSelected', 'touchColtrolsChanged', 'logout'])

const tabs = [
    { name: 'Ovládání', id: 1 },
    { name: 'Grafika', id: 2 },
    { name: 'GUI', id: 3 },
    { name: 'Zvuk', id: 4 },
    { name: 'Odhlásit', id: 5 },
]
const activeTabId = ref(1)

const graphicSettingsChanged = ref(false)

onMounted(() => {
    // Detekce touch device
    Settings.touchEnabled = "ontouchstart" in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
    Settings.mouseEnabled = !Settings.touchEnabled;
})

const openDialog = () => {
    graphicSettingsChanged.value = false;
}

const setDeviceType = (deviceType) => {
    storedSettings.value.deviceType = deviceType

    // Defaultni nastaveni pro telefon a tablet
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
    emit('deviceTypeSelected');
}

const setActionButtonsLayout = (layout) => {
    storedSettings.value.actionButtonsLayout = layout
    storeSettings()
    ActionButtonsManager.renderActionButtons()
}

const setDetailsLevel = (level) => {
    storedSettings.value.setDetailLevel(level)
    graphicSettingsChanged.value = true;
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

const displayGlowChanged = () => {
    graphicSettingsChanged.value = true;
    Settings.setDisplayGlow(storedSettings.value.displayGlow)
    storeSettings()
}

const joystickSizeChanged = (change) => {
    storedSettings.value.joystickSize += change;
    touchControlsChanged()
}

const joystickLeftChanged = (change) => {
    storedSettings.value.joystickLeft += change;
    touchControlsChanged()
}

const joystickBottomChanged = (change) => {
    storedSettings.value.joystickBottom += change;
    touchControlsChanged()
}

const touchControlsChanged = () => {
    storeSettings()
    emit('touchColtrolsChanged');
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
        emit('closeWithRestartPrompt');
    } else {
        emit('close');
    }
}

defineExpose({
    openDialog
})

watch(activeTabId, (newVal) => {
    if (newVal == 5) {
        emit('logout')
        activeTabId.value = 1
        closeDialog()
    }
})

</script>

<style>

</style>
