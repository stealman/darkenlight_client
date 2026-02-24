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
                            <div class="inventory-grid-wrapper">
                                <div class="inventory-grid">
                                    <div
                                        v-for="slotIndex in INVENTORY_SLOT_COUNT"
                                        :key="slotIndex"
                                        class="inventory-item-slot"
                                        @pointerdown.prevent="handleInventorySlotPointerDown(slotIndex - 1, $event)"
                                    >
                                        <img v-if="inventorySlotImages[slotIndex - 1]" :src="inventorySlotImages[slotIndex - 1]" alt="Inventory item" class="inventory-item-image" />
                                    </div>
                                </div>
                            </div>
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
const INVENTORY_SLOT_COUNT = 24
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
const inventorySlotImages = ref(Array(INVENTORY_SLOT_COUNT).fill(null))

const EMPTY_ITEM_IMAGE = '/images/icons/buttons/btn_backpack.png'
const DOUBLE_CLICK_MS = 250

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

const refreshInventorySlotImages = () => {
    const nextSlotImages = Array(INVENTORY_SLOT_COUNT).fill(null)
    for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
        if (InventoryManager.inventory[i]) {
            nextSlotImages[i] = EMPTY_ITEM_IMAGE
        }
    }
    inventorySlotImages.value = nextSlotImages
}

const onclick = (slot) => {
    console.log('Display item details for slot:', slot)
}

const onDoubleClick = (slot) => {
    InventoryManager.unequipSlot(slot)
    refreshEquipSlotImages()
    refreshInventorySlotImages()
}

const onInventoryClick = (index) => {
    console.log('Display inventory item details for index:', index)
}

const onInventoryDoubleClick = (index) => {
    const item = InventoryManager.inventory[index]
    if (!item) {
        return
    }
    InventoryManager.equipItem(item)
    refreshEquipSlotImages()
    refreshInventorySlotImages()
}

const pointerClickHandlers = []

const createPointerDoubleClickHandler = (singleClick, doubleClick, interval) => {
    let lastTime = 0
    let lastKey = null
    let singleTimer = null

    const handler = (key, event) => {
        if (event) {
            event.preventDefault()
        }

        const now = Date.now()
        const isDoubleClick = lastKey === key && (now - lastTime) <= interval

        if (isDoubleClick) {
            if (singleTimer) {
                clearTimeout(singleTimer)
                singleTimer = null
            }
            lastKey = null
            lastTime = 0
            doubleClick(key)
            return
        }

        lastKey = key
        lastTime = now

        if (singleTimer) {
            clearTimeout(singleTimer)
        }
        singleTimer = setTimeout(() => {
            singleClick(key)
            singleTimer = null
        }, interval)
    }

    handler.dispose = () => {
        if (singleTimer) {
            clearTimeout(singleTimer)
            singleTimer = null
        }
    }

    pointerClickHandlers.push(handler)
    return handler
}

const handleSlotPointerDown = createPointerDoubleClickHandler(onclick, onDoubleClick, DOUBLE_CLICK_MS)
const handleInventorySlotPointerDown = createPointerDoubleClickHandler(onInventoryClick, onInventoryDoubleClick, DOUBLE_CLICK_MS)

onMounted(() => {

})

onUnmounted(() => {
    for (const handler of pointerClickHandlers) {
        handler.dispose()
    }
})

const openDialog = () => {
    refreshEquipSlotImages()
    refreshInventorySlotImages()
}

const closeDialog = () => {
    emit('close');
}

defineExpose({
    openDialog
})

</script>

<style scoped>

</style>
