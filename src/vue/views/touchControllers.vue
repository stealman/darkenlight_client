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

    if (Settings.getDeviceType() === "DESKTOP") {
        joystickZone.style.display = "none"
        return;
    }

    joystickZone.style.display =  "block"
    const joySize = Settings.joystickSize
    const joyPos = { left:"0px", bottom: "0px" }

    joystickZone.style.left = Settings.joystickLeft + "px"
    joystickZone.style.bottom = Settings.joystickBottom + "px"

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
