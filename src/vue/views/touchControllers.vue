<template>
    <div id="touchControllsLayer">
        <div id="joystick-zone" style="position:absolute;left:20px;bottom:20px;width:150px;height:150px;"></div>
    </div>
</template>

<script setup>

import { onMounted, ref } from 'vue'
import { Controller } from '@/controlls/controller'
import nipplejs from 'nipplejs'
import { Settings } from '@/settings/settings'

let joystickManager = null;

onMounted(() => {
    updateFromSettings()
})

const updateFromSettings = () => {
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
        color: "blue",
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

const setButtonsPosition = (storedSettings) => {
    document.getElementById("btn-target-lock").style.left = (Settings.joystickLeft + Settings.joystickSize - 20) + "px"
    document.getElementById("btn-target-lock").style.bottom = (Settings.joystickBottom + Settings.joystickSize - 20) + "px"
    document.getElementById("btn-target-lock").style.display = "block"

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
</style>
