<template>
    <GameDialog
        ref="dialogRef"
        backdrop-id="setting-dialog-backdrop"
        backdrop-class="inventory-dialog-backdrop"
        window-class="adaptive inventory-dialog-window"
        @close="closeDialog"
    >
        <div class="inventory-content-shell">
            <div class="inventory-layout">
                <EquipSet
                    :equip-slots="equipSlots"
                    :weapon-setup-images="weaponSetupImages"
                    :weapon-setup-pressed="weaponSetupPressed"
                    @slot-pointerdown="handleSlotPointerDown"
                    @weapon-setup-hover="setWeaponSetupHover"
                    @weapon-setup-pointerdown="onWeaponSetupPointerDown"
                    @weapon-setup-pointerup="onWeaponSetupPointerUp"
                    @weapon-setup-pointercancel="cancelWeaponSetupPointer"
                />

                <Backpack
                    :slot-count="inventorySlotCount"
                    :slot-images="inventorySlotImages"
                    :get-markers="getWeaponSetupMarkersForInventorySlot"
                    :get-stack-count="getStackCountForInventorySlot"
                    @slot-pointerdown="handleInventorySlotPointerDown"
                    @scroll="handleInventoryScroll"
                />
            </div>
        </div>

        <template #overlay>
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
                @create-camp="onCreateCampClick"
                @content-resized="onItemInfoOverlayContentResized"
            />
        </template>
    </GameDialog>
</template>

<script setup lang="ts">

import { computed, nextTick, onUnmounted, ref } from 'vue'
import { MyPlayer } from '@/data/myPlayer'
import GameDialog from '@/vue/views/GameDialog.vue'
import EquipSet from '@/vue/views/inventory/equipSet.vue'
import Backpack from '@/vue/views/inventory/backpack.vue'
import {
    getEquipSetArmorSvg,
    getEquipSetArmsSvg, getEquipSetHandSvg,
    getEquipSetHelmetSvg, getEquipSetLegsSvg,
    getEquipSetNecklaceSvg, getEquipSetRingSvg,
} from '@/vue/icons/icons'
import { InventoryManager } from '@/data/inventoryManager'
import { Settings } from '@/settings/settings'
import ItemInfoOverlay from '@/vue/views/inventory/itemInfoOverlay.vue'
import { t } from '@/i18n'
import { AudioManager } from '@/babylon/audio/audioManager'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { ConsumableHelper } from '@/data/items/consumableHelper'

type WeaponSetupType = 'primary' | 'secondary'
type WeaponSetupMarker = WeaponSetupType
type EquipSlotView = {
    key: string
    className: string
    image: string | null
    emptyHtml: string
    markers: WeaponSetupMarker[]
}

const emit = defineEmits(['close'])
const MIN_INVENTORY_SLOT_COUNT = 24
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
const inventorySlotImages = ref(Array(MIN_INVENTORY_SLOT_COUNT).fill(null))
const inventorySlotCount = computed(() => Math.max(MIN_INVENTORY_SLOT_COUNT, inventorySlotImages.value.length, InventoryManager.inventory.length))

const EMPTY_ITEM_IMAGE = '/images/icons/buttons/btn_backpack.png'
const DOUBLE_CLICK_MS = 250
const WEAPON_SETUP_HOLD_MS = 500
const OVERLAY_PADDING = 4
const OVERLAY_CURSOR_OFFSET_X = 2

const dialogRef = ref(null)
const itemInfoOverlayRef = ref(null)
const inventoryActionButtonSize = ref(Settings.actionButtonSize)
const storedWeaponSetups = ref(InventoryManager.getStoredWeaponSetups())
const equipSlots = ref<EquipSlotView[]>([])
const weaponSetupHover = ref({
    primary: false,
    secondary: false,
})
const weaponSetupPressed = ref({
    primary: false,
    secondary: false,
})
const weaponSetupPointerState = {
    primary: { holdTimer: null as ReturnType<typeof setTimeout> | null, held: false, pointerId: null as number | null },
    secondary: { holdTimer: null as ReturnType<typeof setTimeout> | null, held: false, pointerId: null as number | null },
}

const itemInfoOverlay = ref({
    visible: false,
    x: 0,
    y: 0,
    name: '',
    id: null,
    cbId: null,
    quality: null,
    durability: null,
    durabilityMax: null,
    quantity: null,
    weaponAttack: null,
    weaponDamageTypes: [],
    weaponSpeed: null,
    weaponRange: null,
    showDropButton: false,
    showMergeButton: false,
    showCampButton: false,
    inventoryIndex: null,
    sourceType: null,
    sourceKey: null,
})

const hideItemInfoOverlay = () => {
    itemInfoOverlay.value.visible = false
    itemInfoOverlay.value.id = null
    itemInfoOverlay.value.cbId = null
    itemInfoOverlay.value.showDropButton = false
    itemInfoOverlay.value.showMergeButton = false
    itemInfoOverlay.value.showCampButton = false
    itemInfoOverlay.value.inventoryIndex = null
    itemInfoOverlay.value.sourceType = null
    itemInfoOverlay.value.sourceKey = null
}

const refreshInventoryActionButtonSize = () => {
    inventoryActionButtonSize.value = Settings.actionButtonSize
}

const refreshStoredWeaponSetups = () => {
    storedWeaponSetups.value = InventoryManager.getStoredWeaponSetups()
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
    itemInfoOverlay.value.name = item.name || t('inventory.unknownItem')
    itemInfoOverlay.value.id = item.id ?? null
    itemInfoOverlay.value.cbId = item.cbId ?? null

    itemInfoOverlay.value.quality = item.atts.qual ?? null
    itemInfoOverlay.value.durability = item.atts.dur ?? null
    itemInfoOverlay.value.durabilityMax = item.atts.durM ?? null
    itemInfoOverlay.value.quantity = item.atts.qty ?? null
    itemInfoOverlay.value.weaponAttack = item.cbType === 'W' ? item.atts.patk ?? null : null
    itemInfoOverlay.value.weaponDamageTypes = item.cbType === 'W' ? item.damageTypes ?? [] : []
    itemInfoOverlay.value.weaponSpeed = item.cbType === 'W' ? item.atts.speed ?? null : null
    itemInfoOverlay.value.weaponRange = item.cbType === 'W' ? item.atts.range ?? null : null
    itemInfoOverlay.value.showDropButton = showDropButton
    itemInfoOverlay.value.showMergeButton = showMergeButton
    itemInfoOverlay.value.showCampButton = sourceType === 'inventory' && ConsumableHelper.isItemCampWood(item)
    itemInfoOverlay.value.inventoryIndex = inventoryIndex
    itemInfoOverlay.value.sourceType = sourceType
    itemInfoOverlay.value.sourceKey = sourceKey

    nextTick(() => {
        clampItemInfoOverlayPosition()
    })
}

const clampItemInfoOverlayPosition = () => {
    const dialogRect = dialogRef.value?.windowRef?.getBoundingClientRect?.()
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
    if (rightHandItem?.isTwoHanded()) {
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
    const isTwoHandedWeaponEquipped = rightHandItem?.isTwoHanded()
    equipSlotImages.value.R_HAND = rightHandImage
    equipSlotImages.value.L_HAND = isTwoHandedWeaponEquipped ? rightHandImage : resolveSlotImage('L_HAND')
    equipSlotImages.value.L_RING = resolveSlotImage('L_RING')
    equipSlotImages.value.R_RING = resolveSlotImage('R_RING')
    equipSlotImages.value.LEGS = resolveSlotImage('LEGS')
    equipSlots.value = buildEquipSlots()
}

const refreshInventorySlotImages = () => {
    InventoryManager.sortInventory()

    const nextSlotImages = Array(Math.max(MIN_INVENTORY_SLOT_COUNT, InventoryManager.inventory.length)).fill(null)
    for (let i = 0; i < nextSlotImages.length; i++) {
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
    itemInfoOverlay.value.name = item.name || t('inventory.unknownItem')
    itemInfoOverlay.value.id = item.id ?? null
    itemInfoOverlay.value.cbId = item.cbId ?? null
    itemInfoOverlay.value.quality = item.atts?.qual ?? null
    itemInfoOverlay.value.durability = item.atts?.dur ?? null
    itemInfoOverlay.value.durabilityMax = item.atts?.durM ?? null
    itemInfoOverlay.value.quantity = item.atts?.qty ?? null
    itemInfoOverlay.value.showDropButton = liveItemInfo.showDropButton
    itemInfoOverlay.value.showMergeButton = liveItemInfo.showMergeButton
    itemInfoOverlay.value.showCampButton = liveItemInfo.sourceType === 'inventory' && ConsumableHelper.isItemCampWood(item)
    itemInfoOverlay.value.inventoryIndex = liveItemInfo.inventoryIndex
    itemInfoOverlay.value.sourceType = liveItemInfo.sourceType
    itemInfoOverlay.value.sourceKey = liveItemInfo.sourceKey

    nextTick(() => {
        clampItemInfoOverlayPosition()
    })
}

const refreshDialogFromInventoryUpdate = (update = {}) => {
    refreshStoredWeaponSetups()
    refreshEquipSlotImages()
    refreshInventorySlotImages()
    refreshItemInfoOverlayFromLiveData(update.changedItemIds)
}

const getWeaponSetupMarkersForItem = (itemId): WeaponSetupMarker[] => {
    if (!Number.isFinite(Number(itemId))) {
        return []
    }

    const markers: WeaponSetupMarker[] = []
    const numericItemId = Number(itemId)
    const { primary, secondary } = storedWeaponSetups.value

    if (primary.rhand === numericItemId || primary.lhand === numericItemId) {
        markers.push('primary')
    }

    if (secondary.rhand === numericItemId || secondary.lhand === numericItemId) {
        markers.push('secondary')
    }

    return markers
}

const getWeaponSetupMarkersForEquipSlot = (slot) => {
    const effectiveSlot = resolveEffectiveEquipSlot(slot)
    const item = MyPlayer.myChar?.equipSet?.get(effectiveSlot)
    return getWeaponSetupMarkersForItem(item?.id)
}

const getWeaponSetupMarkersForInventorySlot = (index) => {
    const item = InventoryManager.inventory[index]
    return getWeaponSetupMarkersForItem(item?.id)
}

const getStackCountForInventorySlot = (index) => {
    const item = InventoryManager.inventory[index]
    if (!item?.isStackable?.()) {
        return null
    }

    const quantity = Number(item.atts?.qty)
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return null
    }

    return quantity
}

const buildEquipSlots = (): EquipSlotView[] => ([
    {
        key: 'HEAD',
        className: 'slot-helmet',
        image: equipSlotImages.value.HEAD,
        emptyHtml: getEquipSetHelmetSvg('icon-equipset icon-equipset-slot', 'icon-helmet'),
        markers: getWeaponSetupMarkersForEquipSlot('HEAD'),
    },
    {
        key: 'NECKLACE',
        className: 'slot-necklace',
        image: equipSlotImages.value.NECKLACE,
        emptyHtml: getEquipSetNecklaceSvg('icon-equipset icon-equipset-slot', 'icon-necklace'),
        markers: getWeaponSetupMarkersForEquipSlot('NECKLACE'),
    },
    {
        key: 'PAULDRONS',
        className: 'slot-arms-armor',
        image: equipSlotImages.value.PAULDRONS,
        emptyHtml: getEquipSetArmsSvg('icon-equipset icon-equipset-slot', 'icon-arms'),
        markers: getWeaponSetupMarkersForEquipSlot('PAULDRONS'),
    },
    {
        key: 'BODY',
        className: 'slot-body',
        image: equipSlotImages.value.BODY,
        emptyHtml: getEquipSetArmorSvg('icon-equipset icon-equipset-slot', 'icon-armor'),
        markers: getWeaponSetupMarkersForEquipSlot('BODY'),
    },
    {
        key: 'L_HAND',
        className: 'slot-left-hand',
        image: equipSlotImages.value.L_HAND,
        emptyHtml: getEquipSetHandSvg('icon-equipset icon-equipset-slot', 'icon-hand-left'),
        markers: getWeaponSetupMarkersForEquipSlot('L_HAND'),
    },
    {
        key: 'R_HAND',
        className: 'slot-right-hand',
        image: equipSlotImages.value.R_HAND,
        emptyHtml: getEquipSetHandSvg('icon-equipset icon-equipset-slot', 'icon-hand-right'),
        markers: getWeaponSetupMarkersForEquipSlot('R_HAND'),
    },
    {
        key: 'L_RING',
        className: 'slot-left-ring',
        image: equipSlotImages.value.L_RING,
        emptyHtml: getEquipSetRingSvg('icon-equipset icon-equipset-slot', 'icon-ring-left'),
        markers: getWeaponSetupMarkersForEquipSlot('L_RING'),
    },
    {
        key: 'R_RING',
        className: 'slot-right-ring',
        image: equipSlotImages.value.R_RING,
        emptyHtml: getEquipSetRingSvg('icon-equipset icon-equipset-slot', 'icon-ring-right'),
        markers: getWeaponSetupMarkersForEquipSlot('R_RING'),
    },
    {
        key: 'LEGS',
        className: 'slot-legs',
        image: equipSlotImages.value.LEGS,
        emptyHtml: getEquipSetLegsSvg('icon-equipset icon-equipset-slot', 'icon-legs'),
        markers: getWeaponSetupMarkersForEquipSlot('LEGS'),
    },
])

const weaponSetupImages = {
    get primary() {
        return getWeaponSetupImage('primary')
    },
    get secondary() {
        return getWeaponSetupImage('secondary')
    },
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

const onCreateCampClick = () => {
    const cbId = Number(itemInfoOverlay.value.cbId)
    if (!Number.isFinite(cbId)) {
        return
    }

    ConsumableHelper.clickOnCreateCamp(cbId)
    hideItemInfoOverlay()
}

const onInventoryDoubleClick = (index) => {
    hideItemInfoOverlay()
    InventoryManager.handleInventoryDoubleClick(index)
    refreshEquipSlotImages()
    refreshInventorySlotImages()
}

const storeWeaponSetup = (setupType) => {
    InventoryManager.updateWeaponSetup(setupType)
    refreshStoredWeaponSetups()
    AudioManager.playGuiButtonToggle(true)
    OnScreenMessageManager.addMessage(t('messages.weaponSet-' + setupType))
}

const equipWeaponSetup = (setupType) => {
    AudioManager.playGuiButtonClick()
    InventoryManager.equipStoredWeaponSetup(setupType)
}

const getWeaponSetupImage = (setupType) => {
    const isActive = weaponSetupHover.value[setupType] || weaponSetupPressed.value[setupType]
    if (setupType === 'primary') {
        return isActive ? '/images/icons/buttons/btn_romanian1_hover.png' : '/images/icons/buttons/btn_romanian1.png'
    }

    return isActive ? '/images/icons/buttons/btn_romanian2_hover.png' : '/images/icons/buttons/btn_romanian2.png'
}

const setWeaponSetupHover = (setupType, isHovered) => {
    weaponSetupHover.value[setupType] = isHovered
}

const clearWeaponSetupHoldTimer = (setupType) => {
    const state = weaponSetupPointerState[setupType]
    if (state.holdTimer) {
        clearTimeout(state.holdTimer)
        state.holdTimer = null
    }
}

const onWeaponSetupPointerDown = (setupType, event) => {
    const state = weaponSetupPointerState[setupType]
    clearWeaponSetupHoldTimer(setupType)
    state.held = false
    state.pointerId = event?.pointerId ?? null
    weaponSetupPressed.value[setupType] = true
    state.holdTimer = setTimeout(() => {
        state.holdTimer = null
        state.held = true
        storeWeaponSetup(setupType)
    }, WEAPON_SETUP_HOLD_MS)
}

const onWeaponSetupPointerUp = (setupType, event) => {
    const state = weaponSetupPointerState[setupType]
    if (state.pointerId !== null && event?.pointerId !== state.pointerId) {
        return
    }

    const wasHeld = state.held
    clearWeaponSetupHoldTimer(setupType)
    state.held = false
    state.pointerId = null
    weaponSetupPressed.value[setupType] = false

    if (!wasHeld) {
        equipWeaponSetup(setupType)
    }
}

const cancelWeaponSetupPointer = (setupType) => {
    const state = weaponSetupPointerState[setupType]
    clearWeaponSetupHoldTimer(setupType)
    state.held = false
    state.pointerId = null
    weaponSetupPressed.value[setupType] = false
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
        handler.cancel()
    }

    handler.cancel = () => {
        if (singleTimer) {
            clearTimeout(singleTimer)
            singleTimer = null
        }
        lastKey = null
        lastTime = 0
    }

    pointerClickHandlers.push(handler)
    return handler
}

const handleSlotPointerDown = createPointerDoubleClickHandler(onclick, onDoubleClick, DOUBLE_CLICK_MS)
const handleInventorySlotPointerDown = createPointerDoubleClickHandler(onInventoryClick, onInventoryDoubleClick, DOUBLE_CLICK_MS)

const handleInventoryScroll = () => {
    handleInventorySlotPointerDown.cancel()
    hideItemInfoOverlay()
}

onUnmounted(() => {
    for (const handler of pointerClickHandlers) {
        handler.dispose()
    }
    cancelWeaponSetupPointer('primary')
    cancelWeaponSetupPointer('secondary')
})

const openDialog = () => {
    hideItemInfoOverlay()
    refreshInventoryActionButtonSize()
    refreshStoredWeaponSetups()
    refreshEquipSlotImages()
    refreshInventorySlotImages()
}

const closeDialog = () => {
    hideItemInfoOverlay()
    emit('close');
}

defineExpose({
    openDialog,
    refreshDialogFromInventoryUpdate
})

</script>

<style scoped>
</style>
