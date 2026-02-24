<template>
    <div id="setting-dialog-backdrop" class="dialog-backdrop" @click.self="closeDialog" >
        <div class="dialog-window adaptive inventory-dialog-window">
            <div class="dialog-content">
                <div class="inventory-content-shell">
                    <div class="inventory-layout">
                        <div class="equipment-panel">
                            <div class="equipment-layout">
                                <div class="equip-slot slot-helmet" @pointerdown="handleSlotPointerDown('HEAD')">
                                    <div v-if="!equipSlotImages.HEAD" v-html="getEquipSetHelmetSvg('icon-equipset icon-equipset-slot', 'icon-helmet')"></div>
                                    <img v-if="equipSlotImages.HEAD" :src="equipSlotImages.HEAD" alt="HEAD item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-necklace" @pointerdown="handleSlotPointerDown('NECKLACE')">
                                    <div v-if="!equipSlotImages.NECKLACE" v-html="getEquipSetNecklaceSvg('icon-equipset icon-equipset-slot', 'icon-necklace')"></div>
                                    <img v-if="equipSlotImages.NECKLACE" :src="equipSlotImages.NECKLACE" alt="NECKLACE item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-arms-armor" @pointerdown="handleSlotPointerDown('PAULDRONS')">
                                    <div v-if="!equipSlotImages.PAULDRONS" v-html="getEquipSetArmsSvg('icon-equipset icon-equipset-slot', 'icon-arms')"></div>
                                    <img v-if="equipSlotImages.PAULDRONS" :src="equipSlotImages.PAULDRONS" alt="PAULDRONS item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-body" @pointerdown="handleSlotPointerDown('BODY')">
                                    <div v-if="!equipSlotImages.BODY" v-html="getEquipSetArmorSvg('icon-equipset icon-equipset-slot', 'icon-armor')"></div>
                                    <img v-if="equipSlotImages.BODY" :src="equipSlotImages.BODY" alt="BODY item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-left-hand" @pointerdown="handleSlotPointerDown('L_HAND')">
                                    <div v-if="!equipSlotImages.L_HAND" v-html="getEquipSetHandSvg('icon-equipset icon-equipset-slot', 'icon-hand-left')"></div>
                                    <img v-if="equipSlotImages.L_HAND" :src="equipSlotImages.L_HAND" alt="L_HAND item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-right-hand" @pointerdown="handleSlotPointerDown('R_HAND')">
                                    <div v-if="!equipSlotImages.R_HAND" v-html="getEquipSetHandSvg('icon-equipset icon-equipset-slot', 'icon-hand-right')"></div>
                                    <img v-if="equipSlotImages.R_HAND" :src="equipSlotImages.R_HAND" alt="R_HAND item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-left-ring" @pointerdown="handleSlotPointerDown('L_RING')">
                                    <div v-if="!equipSlotImages.L_RING" v-html="getEquipSetRingSvg('icon-equipset icon-equipset-slot', 'icon-ring-left')"></div>
                                    <img v-if="equipSlotImages.L_RING" :src="equipSlotImages.L_RING" alt="L_RING item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-right-ring" @pointerdown="handleSlotPointerDown('R_RING')">
                                    <div v-if="!equipSlotImages.R_RING" v-html="getEquipSetRingSvg('icon-equipset icon-equipset-slot', 'icon-ring-right')"></div>
                                    <img v-if="equipSlotImages.R_RING" :src="equipSlotImages.R_RING" alt="R_RING item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-legs" @pointerdown="handleSlotPointerDown('LEGS')">
                                    <div v-if="!equipSlotImages.LEGS" v-html="getEquipSetLegsSvg('icon-equipset icon-equipset-slot', 'icon-legs')"></div>
                                    <img v-if="equipSlotImages.LEGS" :src="equipSlotImages.LEGS" alt="LEGS item" class="equip-item-image" />
                                </div>
                            </div>
                        </div>

                        <div class="inventory-panel">
                            <div class="inventory-placeholder">INVENTORY</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>

import { onMounted, onUnmounted, ref } from 'vue'
import { MyPlayer } from '@/data/myPlayer'
import {
    getEquipSetArmorSvg,
    getEquipSetArmsSvg, getEquipSetHandSvg,
    getEquipSetHelmetSvg, getEquipSetLegsSvg,
    getEquipSetNecklaceSvg, getEquipSetRingSvg,
} from '@/vue/icons/icons'
import { InventoryManager } from '@/data/InventoryManager'

const emit = defineEmits(['close'])
const equipSlotImages = ref({
    HEAD: null,
    NECKLACE: null,
    PAULDRONS: null,
    BODY: null,
    L_HAND: null,
    R_HAND: null,
    L_RING: null,
    R_RING: null,
    LEGS: null,
})

const EMPTY_ITEM_IMAGE = '/images/icons/buttons/btn_backpack.png'
const DOUBLE_CLICK_MS = 250
let lastPointerDownTime = 0
let lastPointerDownSlot = null
let singleClickTimer = null

const resolveSlotImage = (slot) => {
    const item = MyPlayer.myChar?.equipSet?.get(slot)
    if (!item) {
        return null
    }
    return EMPTY_ITEM_IMAGE
}

const refreshEquipSlotImages = () => {
    equipSlotImages.value.HEAD = resolveSlotImage('HEAD')
    equipSlotImages.value.NECKLACE = resolveSlotImage('NECKLACE')
    equipSlotImages.value.PAULDRONS = resolveSlotImage('PAULDRONS')
    equipSlotImages.value.BODY = resolveSlotImage('BODY')
    equipSlotImages.value.L_HAND = resolveSlotImage('L_HAND')
    equipSlotImages.value.R_HAND = resolveSlotImage('R_HAND')
    equipSlotImages.value.L_RING = resolveSlotImage('L_RING')
    equipSlotImages.value.R_RING = resolveSlotImage('R_RING')
    equipSlotImages.value.LEGS = resolveSlotImage('LEGS')
}

const onclick = (slot) => {
    console.log('Display item details for slot:', slot)
}

const onDoubleClick = (slot) => {
    InventoryManager.unequipSlot(slot)
    refreshEquipSlotImages()
}

const handleSlotPointerDown = (slot) => {
    const now = Date.now()
    const isDoubleClick = lastPointerDownSlot === slot && (now - lastPointerDownTime) <= DOUBLE_CLICK_MS

    if (isDoubleClick) {
        if (singleClickTimer) {
            clearTimeout(singleClickTimer)
            singleClickTimer = null
        }
        lastPointerDownSlot = null
        lastPointerDownTime = 0
        onDoubleClick(slot)
        return
    }

    lastPointerDownSlot = slot
    lastPointerDownTime = now

    if (singleClickTimer) {
        clearTimeout(singleClickTimer)
    }
    singleClickTimer = setTimeout(() => {
        onclick(slot)
        singleClickTimer = null
    }, DOUBLE_CLICK_MS)
}

onMounted(() => {

})

onUnmounted(() => {
    if (singleClickTimer) {
        clearTimeout(singleClickTimer)
        singleClickTimer = null
    }
})

const openDialog = () => {
    refreshEquipSlotImages()
}

const closeDialog = () => {
    emit('close');
}

defineExpose({
    openDialog
})

</script>

<style scoped>
.inventory-dialog-window {
    width: min(960px, 85vw, calc(85vh * 1.6));
    max-width: 85vw;
    max-height: 85vh;
}

.dialog-content {
    display: flex;
    align-items: center;
    justify-content: center;
}

.inventory-content-shell {
    width: 100%;
    aspect-ratio: 16 / 10;
    max-height: min(600px, 85vh);
    overflow: auto;
}

.inventory-layout {
    display: flex;
    width: 100%;
    height: 100%;
}

.equipment-panel {
    width: 25%;
    height: 100%;
    border-right: 1px solid rgba(176, 143, 86, 0.35);
    padding: 2%;
    box-sizing: border-box;
}

.equipment-layout {
    position: relative;
    width: 100%;
    height: 100%;
    --equip-slot-size: 40%;
}

.equip-slot {
    position: absolute;
    width: var(--equip-slot-size);
    aspect-ratio: 1 / 1;
    border: 1px solid rgba(176, 143, 86, 0.9);
    background: rgba(15, 11, 8, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    color: var(--ui-text-muted);
    box-sizing: border-box;
    user-select: none;
}

.equip-item-image {
    position: absolute;
    width: 80%;
    height: 80%;
    object-fit: cover;
    z-index: 2;
    pointer-events: none;
}

.slot-helmet {
    left: 5%;
    top: 1%;
}

.slot-necklace {
    right: 5%;
    top: 1%;
}

.slot-arms-armor {
    left: 50%;
    top: 18%;
    transform: translateX(-50%);
}

.slot-body {
    left: 50%;
    top: 35%;
    transform: translateX(-50%);
}

.slot-left-hand {
    left: 5%;
    top: 52%;
}

.slot-right-hand {
    right: 5%;
    top: 52%;
}

.slot-left-ring {
    left: 5%;
    top: 69%;
}

.slot-right-ring {
    right: 5%;
    top: 69%;
}

.slot-legs {
    left: 50%;
    top: 86%;
    transform: translateX(-50%);
}

.inventory-panel {
    width: 75%;
    height: 100%;
    padding: 2%;
    box-sizing: border-box;
}

.inventory-placeholder {
    width: 100%;
    height: 100%;
    border: 1px dashed rgba(176, 143, 86, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ui-text-muted);
    font-size: 0.75rem;
}
</style>
