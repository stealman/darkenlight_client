<template>
    <div id="setting-dialog-backdrop" class="dialog-backdrop inventory-dialog-backdrop" @click.self="closeDialog" >
        <div ref="dialogWindowRef" class="dialog-window adaptive inventory-dialog-window">
            <div class="dialog-content">
                <div class="inventory-content-shell">
                    <div class="inventory-layout">
                        <div class="equipment-panel">
                            <div class="equipment-layout">
                                <div class="equip-slot slot-helmet" @pointerdown="handleSlotPointerDown('HEAD', $event)">
                                    <div v-if="!equipSlotImages.HEAD" v-html="getEquipSetHelmetSvg('icon-equipset icon-equipset-slot', 'icon-helmet')"></div>
                                    <img v-if="equipSlotImages.HEAD" :src="equipSlotImages.HEAD" alt="HEAD item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-necklace" @pointerdown="handleSlotPointerDown('NECKLACE', $event)">
                                    <div v-if="!equipSlotImages.NECKLACE" v-html="getEquipSetNecklaceSvg('icon-equipset icon-equipset-slot', 'icon-necklace')"></div>
                                    <img v-if="equipSlotImages.NECKLACE" :src="equipSlotImages.NECKLACE" alt="NECKLACE item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-arms-armor" @pointerdown="handleSlotPointerDown('PAULDRONS', $event)">
                                    <div v-if="!equipSlotImages.PAULDRONS" v-html="getEquipSetArmsSvg('icon-equipset icon-equipset-slot', 'icon-arms')"></div>
                                    <img v-if="equipSlotImages.PAULDRONS" :src="equipSlotImages.PAULDRONS" alt="PAULDRONS item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-body" @pointerdown="handleSlotPointerDown('BODY', $event)">
                                    <div v-if="!equipSlotImages.BODY" v-html="getEquipSetArmorSvg('icon-equipset icon-equipset-slot', 'icon-armor')"></div>
                                    <img v-if="equipSlotImages.BODY" :src="equipSlotImages.BODY" alt="BODY item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-left-hand" @pointerdown="handleSlotPointerDown('L_HAND', $event)">
                                    <div v-if="!equipSlotImages.L_HAND" v-html="getEquipSetHandSvg('icon-equipset icon-equipset-slot', 'icon-hand-left')"></div>
                                    <img v-if="equipSlotImages.L_HAND" :src="equipSlotImages.L_HAND" alt="L_HAND item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-right-hand" @pointerdown="handleSlotPointerDown('R_HAND', $event)">
                                    <div v-if="!equipSlotImages.R_HAND" v-html="getEquipSetHandSvg('icon-equipset icon-equipset-slot', 'icon-hand-right')"></div>
                                    <img v-if="equipSlotImages.R_HAND" :src="equipSlotImages.R_HAND" alt="R_HAND item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-left-ring" @pointerdown="handleSlotPointerDown('L_RING', $event)">
                                    <div v-if="!equipSlotImages.L_RING" v-html="getEquipSetRingSvg('icon-equipset icon-equipset-slot', 'icon-ring-left')"></div>
                                    <img v-if="equipSlotImages.L_RING" :src="equipSlotImages.L_RING" alt="L_RING item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-right-ring" @pointerdown="handleSlotPointerDown('R_RING', $event)">
                                    <div v-if="!equipSlotImages.R_RING" v-html="getEquipSetRingSvg('icon-equipset icon-equipset-slot', 'icon-ring-right')"></div>
                                    <img v-if="equipSlotImages.R_RING" :src="equipSlotImages.R_RING" alt="R_RING item" class="equip-item-image" />
                                </div>
                                <div class="equip-slot slot-legs" @pointerdown="handleSlotPointerDown('LEGS', $event)">
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

        <!-- Item info overlay -->
        <item-info-overlay
            v-if="itemInfoOverlay.visible"
            ref="itemInfoOverlayRef"
            :item-info="itemInfoOverlay"
            context="INVENTORY"
            :x="itemInfoOverlay.x"
            :y="itemInfoOverlay.y"
            :action-button-size="inventoryActionButtonSize"
            @close="hideItemInfoOverlay"
            @drop-item="onDropItemClick"
            @split-item="onSplitItemClick"
            @merge-item="onMergeItemClick"
            @content-resized="onItemInfoOverlayContentResized"
        />
    </div>
</template>

<script setup>

import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { MyPlayer } from '@/data/myPlayer'
import {
    getEquipSetArmorSvg,
    getEquipSetArmsSvg, getEquipSetHandSvg,
    getEquipSetHelmetSvg, getEquipSetLegsSvg,
    getEquipSetNecklaceSvg, getEquipSetRingSvg,
} from '@/vue/icons/icons'
import { InventoryManager } from '@/data/InventoryManager'
import { WeaponTypes } from '@/data/items/item'
import { Settings } from '@/settings/settings'
import ItemInfoOverlay from '@/vue/views/itemInfoOverlay.vue'

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
const OVERLAY_PADDING = 4
const OVERLAY_CURSOR_OFFSET_X = 2

const dialogWindowRef = ref(null)
const itemInfoOverlayRef = ref(null)
const inventoryActionButtonSize = ref(Settings.actionButtonSize)

const itemInfoOverlay = ref({
    visible: false,
    x: 0,
    y: 0,
    name: '',
    id: null,
    quality: null,
    durability: null,
    durabilityMax: null,
    quantity: null,
    showDropButton: false,
    showMergeButton: false,
    inventoryIndex: null,
    sourceType: null,
    sourceKey: null,
})

const hideItemInfoOverlay = () => {
    itemInfoOverlay.value.visible = false
    itemInfoOverlay.value.id = null
    itemInfoOverlay.value.showDropButton = false
    itemInfoOverlay.value.showMergeButton = false
    itemInfoOverlay.value.inventoryIndex = null
    itemInfoOverlay.value.sourceType = null
    itemInfoOverlay.value.sourceKey = null
}

const refreshInventoryActionButtonSize = () => {
    inventoryActionButtonSize.value = Settings.actionButtonSize
}

const showItemInfoOverlay = (item, pointer, options = {}) => {
    if (!item) {
        hideItemInfoOverlay()
        return
    }

    const showDropButton = options.showDropButton === true
    const showMergeButton = options.showMergeButton === true
    const inventoryIndex = Number.isInteger(options.inventoryIndex) ? options.inventoryIndex : null
    const sourceType = options.sourceType ?? null
    const sourceKey = options.sourceKey ?? null

    itemInfoOverlay.value.visible = true
    itemInfoOverlay.value.x = pointer.clientX + OVERLAY_CURSOR_OFFSET_X
    itemInfoOverlay.value.y = pointer.clientY
    itemInfoOverlay.value.name = item.name || 'Unknown item'
    itemInfoOverlay.value.id = item.id ?? null

    itemInfoOverlay.value.quality = item.atts.qual ?? null
    itemInfoOverlay.value.durability = item.atts.dur ?? null
    itemInfoOverlay.value.durabilityMax = item.atts.durM ?? null
    itemInfoOverlay.value.quantity = item.atts.qty ?? null
    itemInfoOverlay.value.showDropButton = showDropButton
    itemInfoOverlay.value.showMergeButton = showMergeButton
    itemInfoOverlay.value.inventoryIndex = inventoryIndex
    itemInfoOverlay.value.sourceType = sourceType
    itemInfoOverlay.value.sourceKey = sourceKey

    nextTick(() => {
        clampItemInfoOverlayPosition()
    })
}

const clampItemInfoOverlayPosition = () => {
    const dialogRect = dialogWindowRef.value?.getBoundingClientRect?.()
    const overlayRect = itemInfoOverlayRef.value?.getBoundingClientRect?.()
    if (!dialogRect || !overlayRect) {
        return
    }

    const minX = dialogRect.left + OVERLAY_PADDING
    const minY = dialogRect.top + OVERLAY_PADDING
    const maxX = dialogRect.right - overlayRect.width - OVERLAY_PADDING
    const maxY = dialogRect.bottom - overlayRect.height - OVERLAY_PADDING

    itemInfoOverlay.value.x = Math.max(minX, Math.min(itemInfoOverlay.value.x, maxX))
    itemInfoOverlay.value.y = Math.max(minY, Math.min(itemInfoOverlay.value.y, maxY))
}

const onItemInfoOverlayContentResized = () => {
    if (!itemInfoOverlay.value.visible) {
        return
    }
    nextTick(() => {
        clampItemInfoOverlayPosition()
    })
}

const shouldToggleItemInfoOverlayOff = (sourceType, sourceKey) => {
    if (!itemInfoOverlay.value.visible) {
        return false
    }
    return itemInfoOverlay.value.sourceType === sourceType
        && itemInfoOverlay.value.sourceKey === sourceKey
}

const resolveItemImage = (item) => {
    if (!item?.imgUrl) {
        return EMPTY_ITEM_IMAGE
    }

    return item.imgUrl.startsWith('/') ? item.imgUrl : `/${item.imgUrl}`
}

const resolveSlotImage = (slot) => {
    const item = MyPlayer.myChar?.equipSet?.get(slot)
    if (!item) {
        return null
    }
    return resolveItemImage(item)
}

const resolveEffectiveEquipSlot = (slot) => {
    if (slot !== 'L_HAND') {
        return slot
    }
    const rightHandItem = MyPlayer.myChar?.equipSet?.get('R_HAND')
    if (rightHandItem?.slotInfo?.isTwoHanded()) {
        return 'R_HAND'
    }
    return slot
}

const refreshEquipSlotImages = () => {
    equipSlotImages.value.HEAD = resolveSlotImage('HEAD')
    equipSlotImages.value.NECKLACE = resolveSlotImage('NECKLACE')
    equipSlotImages.value.PAULDRONS = resolveSlotImage('PAULDRONS')
    equipSlotImages.value.BODY = resolveSlotImage('BODY')
    const rightHandItem = MyPlayer.myChar?.equipSet?.get('R_HAND')
    const rightHandImage = resolveSlotImage('R_HAND')
    const isTwoHandedWeaponEquipped = rightHandItem?.slotInfo?.isTwoHanded()
    equipSlotImages.value.R_HAND = rightHandImage
    equipSlotImages.value.L_HAND = isTwoHandedWeaponEquipped ? rightHandImage : resolveSlotImage('L_HAND')
    equipSlotImages.value.L_RING = resolveSlotImage('L_RING')
    equipSlotImages.value.R_RING = resolveSlotImage('R_RING')
    equipSlotImages.value.LEGS = resolveSlotImage('LEGS')
}

const refreshInventorySlotImages = () => {
    InventoryManager.sortInventory()

    const nextSlotImages = Array(INVENTORY_SLOT_COUNT).fill(null)
    for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
        const item = InventoryManager.inventory[i]
        if (item) {
            nextSlotImages[i] = resolveItemImage(item)
        }
    }
    inventorySlotImages.value = nextSlotImages
}

const getLiveItemInfoForOverlay = () => {
    const overlayItemId = Number(itemInfoOverlay.value.id)
    if (!Number.isFinite(overlayItemId)) {
        return null
    }

    const inventoryIndex = InventoryManager.inventory.findIndex(item => item?.id === overlayItemId)
    if (inventoryIndex >= 0) {
        return {
            item: InventoryManager.inventory[inventoryIndex],
            sourceType: 'inventory',
            sourceKey: inventoryIndex,
            inventoryIndex,
            showDropButton: true,
            showMergeButton: InventoryManager.canMergeResourceItem(InventoryManager.inventory[inventoryIndex]),
        }
    }

    for (const [slotKey, equippedItem] of MyPlayer.myChar?.equipSet?.entries?.() ?? []) {
        if (equippedItem?.id === overlayItemId) {
            return {
                item: equippedItem,
                sourceType: 'equip',
                sourceKey: slotKey,
                inventoryIndex: null,
                showDropButton: false,
                showMergeButton: false,
            }
        }
    }

    return null
}

const refreshItemInfoOverlayFromLiveData = (changedItemIds = null) => {
    if (!itemInfoOverlay.value.visible) {
        return
    }

    const overlayItemId = Number(itemInfoOverlay.value.id)
    if (!Number.isFinite(overlayItemId)) {
        hideItemInfoOverlay()
        return
    }

    if (Array.isArray(changedItemIds) && changedItemIds.length > 0 && !changedItemIds.includes(overlayItemId)) {
        return
    }

    const liveItemInfo = getLiveItemInfoForOverlay()
    if (!liveItemInfo?.item) {
        hideItemInfoOverlay()
        return
    }

    const item = liveItemInfo.item
    itemInfoOverlay.value.name = item.name || 'Unknown item'
    itemInfoOverlay.value.id = item.id ?? null
    itemInfoOverlay.value.quality = item.atts?.qual ?? null
    itemInfoOverlay.value.durability = item.atts?.dur ?? null
    itemInfoOverlay.value.durabilityMax = item.atts?.durM ?? null
    itemInfoOverlay.value.quantity = item.atts?.qty ?? null
    itemInfoOverlay.value.showDropButton = liveItemInfo.showDropButton
    itemInfoOverlay.value.showMergeButton = liveItemInfo.showMergeButton
    itemInfoOverlay.value.inventoryIndex = liveItemInfo.inventoryIndex
    itemInfoOverlay.value.sourceType = liveItemInfo.sourceType
    itemInfoOverlay.value.sourceKey = liveItemInfo.sourceKey

    nextTick(() => {
        clampItemInfoOverlayPosition()
    })
}

const refreshDialogFromInventoryUpdate = (update = {}) => {
    refreshEquipSlotImages()
    refreshInventorySlotImages()
    refreshItemInfoOverlayFromLiveData(update.changedItemIds)
}

const onclick = (slot, pointer) => {
    const effectiveSlot = resolveEffectiveEquipSlot(slot)
    const item = MyPlayer.myChar?.equipSet?.get(effectiveSlot)
    if (shouldToggleItemInfoOverlayOff('equip', effectiveSlot)) {
        hideItemInfoOverlay()
        return
    }
    showItemInfoOverlay(item, pointer, { showDropButton: false, sourceType: 'equip', sourceKey: effectiveSlot })
}

const onDoubleClick = (slot) => {
    const effectiveSlot = resolveEffectiveEquipSlot(slot)
    hideItemInfoOverlay()
    InventoryManager.unequipSlot(effectiveSlot)
    refreshEquipSlotImages()
    refreshInventorySlotImages()
}

const onInventoryClick = (index, pointer) => {
    const item = InventoryManager.inventory[index]
    if (shouldToggleItemInfoOverlayOff('inventory', index)) {
        hideItemInfoOverlay()
        return
    }
    showItemInfoOverlay(item, pointer, {
        showDropButton: true,
        showMergeButton: InventoryManager.canMergeResourceItem(item),
        inventoryIndex: index,
        sourceType: 'inventory',
        sourceKey: index
    })
}

const onDropItemClick = () => {
    const index = itemInfoOverlay.value.inventoryIndex
    if (index === null) {
        return
    }
    const item = InventoryManager.inventory[index]
    if (!item) {
        return
    }
    InventoryManager.dropItem(item)
    hideItemInfoOverlay()
    refreshInventorySlotImages()
}

const onSplitItemClick = (payload) => {
    const itemId = Number(payload?.itemId)
    const splitCount = Number(payload?.splitCount)
    if (!Number.isFinite(itemId) || !Number.isFinite(splitCount) || splitCount < 1) {
        return
    }
    InventoryManager.splitInventoryItem(itemId, splitCount)
}

const onMergeItemClick = (payload) => {
    const itemId = Number(payload?.itemId ?? itemInfoOverlay.value.id)
    if (!Number.isFinite(itemId)) {
        return
    }
    InventoryManager.mergeInventoryItem(itemId)
}

const onInventoryDoubleClick = (index) => {
    hideItemInfoOverlay()
    InventoryManager.handleInventoryDoubleClick(index)
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
        const pointer = {
            clientX: event?.clientX ?? 0,
            clientY: event?.clientY ?? 0,
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
            doubleClick(key, pointer)
            return
        }

        lastKey = key
        lastTime = now

        if (singleTimer) {
            clearTimeout(singleTimer)
        }
        singleTimer = setTimeout(() => {
            singleClick(key, pointer)
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
    window.addEventListener('keydown', onDialogKeyDown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onDialogKeyDown)
    for (const handler of pointerClickHandlers) {
        handler.dispose()
    }
})

const openDialog = () => {
    hideItemInfoOverlay()
    refreshInventoryActionButtonSize()
    refreshEquipSlotImages()
    refreshInventorySlotImages()
}

const closeDialog = () => {
    hideItemInfoOverlay()
    emit('close');
}

const onDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
        closeDialog()
    }
}

defineExpose({
    openDialog,
    refreshDialogFromInventoryUpdate
})

</script>

<style scoped>

</style>
