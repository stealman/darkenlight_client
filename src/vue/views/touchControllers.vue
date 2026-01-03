<template>
    <div id="touchControllsLayer">
        <div id="joystick-zone" style="position:absolute; width:100px; height:100px;"></div>
    </div>
</template>

<script setup>

import { onMounted } from 'vue'
import { Controller } from '@/controlls/controller'
import nipplejs from 'nipplejs'
import { Settings } from '@/settings/settings'

let joystickManager = null;

onMounted(() => {

})

const updateControls = () => {
    setJoystickPosition()
}

const setJoystickPosition = () => {
    const joystickZone = document.getElementById("joystick-zone")

    if (joystickManager) {
        joystickManager.destroy()
        joystickManager = null
    }

    if (!Settings.touchEnabled) {
        joystickZone.style.display = "none"
        return;
    }

    joystickZone.style.display =  "block"
    const joySize = 100
    const joyPos = { left:"30px", bottom: "30px" }

    joystickZone.style.left = 30 + "px"
    joystickZone.style.bottom = 30 + "px"

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
    updateControls
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
