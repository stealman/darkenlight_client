<template>
    <div id="setting-dialog-backdrop" class="dialog-backdrop" @click.self="closeDialog" >
        <div class="dialog-window">
            <div class="dialog-header">
                <div v-for="tab in tabs" :key="tab.id" class="tab-item" :class="tab.id === activeTabId ? 'active' : ''" @click="activeTabId = tab.id">
                    {{ tab.name }}
                </div>
            </div>
            <div class="dialog-content">

                <!-- Ovládání -->
                <div v-if="activeTabId == 1" >

                    <div style="max-height: 65vh; overflow-y: auto;">

                        Zařízení, na kterém hraješ.
                        <div class="dialog-actions" style="margin-top: 20px;">
                            <button class="dialog-button" :class="currentDevice == 'DESKTOP' ? 'selected' : ''" @click="setDeviceType('DESKTOP')">PC</button>
                            <button class="dialog-button" :class="currentDevice == 'TABLET' ? 'selected' : ''" @click="setDeviceType('TABLET')">Tablet</button>
                            <button class="dialog-button" :class="currentDevice == 'PHONE' ? 'selected' : ''" @click="setDeviceType('PHONE')">Mobil</button>
                        </div>

                        <!-- Nastaveni pro dotykova zarizeni -->
                        <div v-if="currentDevice == 'TABLET' || currentDevice == 'PHONE'" style="margin-top: 20px;">
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

                <!-- GUI -->
                <div v-if="activeTabId == 2" >
                    <div style="margin-top: 10px;">
                        <table>
                            <tbody>
                            <tr>
                                <td class="item-label" style="width: 25%">Velikost HUD</td>
                                <td  style="width: 25%">
                                    <input class="range-slider" type="range" min="0.5" max="3" step="0.1" style="zoom: 1.5;" v-model="storedSettings.HUD_SIZE" @change="hudSizeChanged()" />
                                </td>

                                <td class="item-label" style="width: 25%"></td>
                                <td  style="width: 25%">

                                </td>
                            </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Grafika -->
                <div v-if="activeTabId == 3" >

                    Úroveň detailů grafiky.
                    <div class="dialog-actions" style="margin-top: 20px;">
                        <button class="dialog-button" :class="storedSettings.DETAILS_LEVEL == 'HIGH' ? 'selected' : ''" @click="setDetailsLevel('HIGH')">Vysoká</button>
                        <button class="dialog-button" :class="storedSettings.DETAILS_LEVEL == 'MEDIUM' ? 'selected' : ''" @click="setDetailsLevel('MEDIUM')">Střední</button>
                        <button class="dialog-button" :class="storedSettings.DETAILS_LEVEL == 'LOW' ? 'selected' : ''" @click="setDetailsLevel('LOW')">Nízká</button>
                    </div>

                    <div style="margin-top: 10px;">
                        <table>
                            <tbody>
                                <tr>
                                    <td class="item-label" style="width: 25%">Jas</td>
                                    <td  style="width: 25%">
                                        <input class="range-slider" type="range" min="1" max="10" step="1" style="zoom: 1.5;" v-model="storedSettings.BRIGHTNESS" @change="brightnessChanged()" />
                                    </td>

                                    <td class="item-label" style="width: 25%">Hustota Mlhy</td>
                                    <td  style="width: 25%">
                                        <input class="range-slider" type="range" min="1" max="10" step="1" style="zoom: 1.5;" v-model="storedSettings.FOG_INTENSITY" @change="fogIntensityChanged()" />
                                    </td>
                                </tr>

                                <tr>
                                    <td class="item-label" style="width: 25%">Jas označníku</td>
                                    <td  style="width: 25%">
                                        <input class="range-slider" type="range" min="0.1" max="1" step="0.1" style="zoom: 1.5;" v-model="storedSettings.TARGET_MARKER_OPACITY" @change="targetMarkerOpacityChanged()" />
                                    </td>

                                    <td class="item-label" style="width: 25%">Zobrazit zář</td>
                                    <td  style="width: 25%">
                                        <Checkbox name="displayGlow" input-id="displayGlow" v-model="storedSettings.DISPLAY_GLOW" binary @change="displayGlowChanged()" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div v-if="graphicSettingsChanged" class="text-warning" style="margin-top: 20px;">Změny v nastavení grafiky se projeví až po restartu hry</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>

import { onMounted, ref, watch } from 'vue'
import { Settings } from '@/settings/settings'

const getDefaultSettings = () => {
    return {
        DEVICE_TYPE: Settings.touchEnabled ? 'PHONE' : 'DESKTOP',
        DETAILS_LEVEL: Settings.touchEnabled ? 'MEDIUM' : 'HIGH',

        JOYSTICK_SIZE: 100,
        JOYSTICK_BOTTOM: 50,
        JOYSTICK_LEFT: 120,

        BRIGHTNESS: 5,
        FOG_INTENSITY: 5,
        DISPLAY_GLOW: !Settings.touchEnabled,
        TARGET_MARKER_OPACITY: 1,
        AUTO_TARGETING: true,
        AUTO_FIRE: true,

        CAMERA_SENSITIVITY: Settings.touchEnabled ? 0.6 : 0.3,
        CAMERA_LOCK: false,

        HUD_SIZE: 1,
    }
}

const currentDevice = ref('DESKTOP');
const storedSettings = ref(getDefaultSettings())
const emit = defineEmits(['close', 'closeWithRestartPrompt', 'deviceTypeSelected', 'touchColtrolsChanged', 'openLoginDialog'])

const tabs = [
    { name: 'Ovládání', id: 1 },
    { name: 'GUI', id: 2 },
    { name: 'Grafika', id: 3 },
    { name: 'Zvuk', id: 4 },
    { name: 'Odhlásit', id: 5 },
]
const activeTabId = ref(1)

const graphicSettingsChanged = ref(false)

onMounted(() => {
    // Detekce touch device
    Settings.touchEnabled = "ontouchstart" in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
    Settings.mouseEnabled = !Settings.touchEnabled;

    // Nacteni ulozenych nastaveni
    storedSettings.value = localStorage.getItem("STORED_SETTINGS");

    // Pokud nejsou zadna nastaveni, nastavime vychozi hodnoty
    if (!storedSettings.value) {
        storedSettings.value = getDefaultSettings()
        storeSettings()
    } else {
        storedSettings.value = JSON.parse(storedSettings.value);

        if (!storedSettings.value.CAMERA_SENSITIVITY) {
            storedSettings.value.CAMERA_SENSITIVITY = storedSettings.value.DEVICE_TYPE == 'DESKTOP' ? 0.3 : 0.6
        }
    }

    currentDevice.value = storedSettings.value.DEVICE_TYPE
    Settings.initialize(storedSettings.value)
})

const openDialog = () => {
    graphicSettingsChanged.value = false;
}

const setDeviceType = (deviceType) => {
    Settings.deviceType = deviceType

    storedSettings.value.DEVICE_TYPE = deviceType;

    // Defaultni nastaveni pro telefon a tablet
    if (deviceType == 'PHONE') {
        storedSettings.value.JOYSTICK_BOTTOM = 50
        storedSettings.value.JOYSTICK_LEFT = 120
        storedSettings.value.THROTTLE_BOTTOM = 20
        storedSettings.value.THROTTLE_LEFT = 10
        storedSettings.value.CAMERA_SENSITIVITY = 0.6
        storedSettings.value.HUD_SIZE = 1.2
    } else if (deviceType == 'TABLET') {
        storedSettings.value.JOYSTICK_BOTTOM = 300
        storedSettings.value.JOYSTICK_LEFT = 120
        storedSettings.value.THROTTLE_BOTTOM = 250
        storedSettings.value.THROTTLE_LEFT = 10
        storedSettings.value.CAMERA_SENSITIVITY = 0.6
        storedSettings.value.HUD_SIZE = 1
    } else {
        storedSettings.value.CAMERA_SENSITIVITY = 0.3
        storedSettings.value.HUD_SIZE = 1
    }

    currentDevice.value = deviceType;
    storeSettings()
    emit('deviceTypeSelected');
}

const setDetailsLevel = (level) => {
    storedSettings.value.DETAILS_LEVEL = level
    graphicSettingsChanged.value = true;
    storeSettings()
}

const brightnessChanged = () => {
    graphicSettingsChanged.value = true;
    storeSettings()
}

const fogIntensityChanged = () => {
    Settings.setFogIntensity(storedSettings.value.FOG_INTENSITY)
    storeSettings()
}

const targetMarkerOpacityChanged = () => {
    Settings.setTargetMarkerOpacity(storedSettings.value.TARGET_MARKER_OPACITY)
    storeSettings()
}

const displayGlowChanged = () => {
    graphicSettingsChanged.value = true;
    Settings.setDisplayGlow(storedSettings.value.DISPLAY_GLOW)
    storeSettings()
}

const joystickSizeChanged = (change) => {
    storedSettings.value.JOYSTICK_SIZE += change;
    touchControlsChanged()
}

const joystickLeftChanged = (change) => {
    storedSettings.value.JOYSTICK_LEFT += change;
    touchControlsChanged()
}

const joystickBottomChanged = (change) => {
    storedSettings.value.JOYSTICK_BOTTOM += change;
    touchControlsChanged()
}

const touchControlsChanged = () => {
    // document.getElementById("setting-dialog-backdrop").style.backdropFilter = "none"
    storeSettings()
    emit('touchColtrolsChanged')
}

const hudSizeChanged = () => {
    Settings.setHudSize(storedSettings.value.HUD_SIZE)
    //CockpitPanelRenderer.hudSizeChanged()
    storeSettings()
}

const storeSettings = () => {
    localStorage.setItem("STORED_SETTINGS", JSON.stringify(storedSettings.value));
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
    if (newVal == 4) {
        emit('openLoginDialog')
        closeDialog()
    }
})

</script>

<style>

</style>
