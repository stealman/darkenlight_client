<template>
    <div id="touchControllsLayer">
        <div id="joystick-zone" :class="{ 'touch-controls--settings-active': settingsActive }" style="position:absolute;left:20px;bottom:20px;width:150px;height:150px;"></div>
    </div>
</template>

<script setup>

import { onMounted, onUnmounted, ref } from 'vue'
import { Controller } from '@/controlls/controller'
import nipplejs from 'nipplejs'
import { Settings } from '@/settings/settings'
import { GuiButtonsManager } from '@/gui/guiButtonsManager'

defineProps({
    settingsActive: Boolean,
})

let joystickManager = null;

onMounted(() => {
    updateFromSettings()
})

onUnmounted(() => {
    joystickManager?.destroy()
    joystickManager = null
})

const updateFromSettings = () => {
    if (GuiButtonsManager.btnBackpack && GuiButtonsManager.btnCharacter) GuiButtonsManager.updatePositions()
    const joystickZone = document.getElementById("joystick-zone")

    if (joystickManager) {
        joystickManager.destroy()
        joystickManager = null
    }

    if (!Settings.isPhoneOrTablet()) {
        joystickZone.style.display = "none"
        document.getElementById("btn-target-lock").style.display = "none"
        return;
    }

    joystickZone.style.display =  "block"
    const joySize = Settings.joystickSize
    const joyPos = { left: Math.round(joySize / 2) + "px", bottom: Math.round(joySize / 2) + "px" }

    joystickZone.style.left = Settings.joystickLeft + "px"
    joystickZone.style.bottom = Settings.joystickBottom + "px"
    joystickZone.style.width = joySize + "px"
    joystickZone.style.height = joySize + "px"

    joystickManager = nipplejs.create({
        zone: joystickZone,
        mode: "static",
        position: joyPos,
        color: "transparent",
        restOpacity: 0.6,
        size: joySize,
    });

    joystickManager.on("move", (evt, data) => {
        if (data && data.vector) {
            Controller.processJoystick(data.vector.x, data.vector.y);
        }
    });

    joystickManager.on("end", () => Controller.processJoystick(0, 0));

    setButtonsPosition()
}

const setButtonsPosition = () => {
    const targetLockButton = document.getElementById("btn-target-lock")
    targetLockButton.style.left = Settings.targetLockLeft + "px"
    targetLockButton.style.bottom = Settings.targetLockBottom + "px"
    targetLockButton.style.width = Settings.targetLockSize + "px"
    targetLockButton.style.height = Settings.targetLockSize + "px"
    targetLockButton.style.display = "block"

    document.getElementById("btn-action-stop").style.left = (Settings.joystickLeft + Settings.joystickSize - 70) + "px"
    document.getElementById("btn-action-stop").style.bottom = (Settings.joystickBottom + Settings.joystickSize -10) + "px"
}

defineExpose({
    updateFromSettings
})
</script>

<style>

#touchControllsLayer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

#touchControllsLayer > * {
    pointer-events: auto;
}

#joystick-zone.touch-controls--settings-active {
    z-index: 2200;
}

/* NippleJS owns geometry and movement; override only its inline paint styles. */
#joystick-zone .nipple {
    opacity: .6 !important;
}

#joystick-zone .back,
#joystick-zone .front {
    box-sizing: border-box;
    opacity: 1 !important;
}

#joystick-zone .back {
    background: radial-gradient(circle, transparent 48%, rgba(var(--gui-gold), .08) 70%, rgba(0, 0, 0, .3)), var(--gui-surface) center / cover !important;
    border: 2px solid rgba(var(--ui-dark), .65);
    box-shadow: inset 0 0 0 1px rgba(var(--gui-gold), .35), inset 0 0 16px rgba(0, 0, 0, .7), 0 2px 5px rgba(0, 0, 0, .35);
}

#joystick-zone .back::after {
    content: '';
    position: absolute;
    inset: 9%;
    border: 1px solid rgba(var(--gui-gold), .2);
    border-radius: 50%;
    background:
        linear-gradient(rgba(var(--gui-gold), .5), rgba(var(--gui-gold), .5)) center top / 1px 6% no-repeat,
        linear-gradient(rgba(var(--gui-gold), .5), rgba(var(--gui-gold), .5)) center bottom / 1px 6% no-repeat,
        linear-gradient(rgba(var(--gui-gold), .5), rgba(var(--gui-gold), .5)) left center / 6% 1px no-repeat,
        linear-gradient(rgba(var(--gui-gold), .5), rgba(var(--gui-gold), .5)) right center / 6% 1px no-repeat;
    pointer-events: none;
}

#joystick-zone .front {
    background: radial-gradient(circle at 35% 25%, rgba(var(--gui-gold), .2), transparent 65%), var(--gui-button-surface) center / cover !important;
    border: 2px solid rgba(var(--gui-gold), .65);
    box-shadow: inset 0 0 0 2px rgba(0, 0, 0, .5), inset 0 1px 4px rgba(var(--gui-gold), .2), 0 3px 7px rgba(0, 0, 0, .65);
}

#joystick-zone .front::after {
    content: '';
    position: absolute;
    inset: 35%;
    border: 1px solid rgba(var(--gui-gold), .4);
    border-radius: 50%;
    pointer-events: none;
}

#joystick-zone:active .front {
    border-color: rgb(var(--gui-gold));
    filter: brightness(1.15);
}
</style>
