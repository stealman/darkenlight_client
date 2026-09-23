<template>
    <div class="bank-panel" @click.self="hideItemInfoOverlay">
        <div class="bank-column">
            <div class="bank-column-title">
                <button class="dialog-button bank-mode-button" :class="{selected: leftMode === 'equipment'}" @click="setLeftMode('equipment')">{{ t('vendor.equipment') }}</button>
                <button class="dialog-button bank-mode-button" :class="{selected: leftMode === 'inventory'}" @click="setLeftMode('inventory')">{{ t('vendor.inventory') }}</button>
            </div>
            <Backpack
                v-if="leftMode === 'inventory'"
                :slot-count="inventorySlotCount"
                :column-count="4"
                :slot-images="inventorySlotImages"
                :get-markers="emptyMarkers"
                :get-stack-count="getInventoryStackCount"
                :get-durability-status="getInventoryDurabilityStatus"
                :get-durability-percent="getInventoryDurabilityPercent"
                @slot-pointerdown="onInventoryPointerDown"
                @scroll="hideItemInfoOverlay"
            />
            <EquipSet
                v-else
                :equip-slots="equipSlots"
                :show-weapon-setups="false"
                @slot-pointerdown="onEquipPointerDown"
            />
        </div>
        <div class="bank-column">
            <div class="bank-column-title">{{ t('vendor.banker') }} <span>{{ BankManager.items.length }}/{{ BankManager.capacity }}</span></div>
            <Backpack
                :slot-count="BankManager.capacity"
                :column-count="4"
                :slot-images="bankSlotImages"
                :get-markers="emptyMarkers"
                :get-stack-count="getBankStackCount"
                :get-durability-status="getBankDurabilityStatus"
                :get-durability-percent="getBankDurabilityPercent"
                @slot-pointerdown="onBankPointerDown"
                @scroll="hideItemInfoOverlay"
            />
        </div>

        <item-info-overlay
            v-if="itemInfoOverlay.visible"
            ref="itemInfoOverlayRef"
            :item-info="itemInfoOverlay"
            context="BANK"
            :x="itemInfoOverlay.x"
            :y="itemInfoOverlay.y"
            :action-button-size="actionButtonSize"
            @close="hideItemInfoOverlay"
            @drop-item="dropInventoryItem"
            @split-item="splitItem"
            @merge-item="mergeItem"
            @create-camp="createCamp"
        />
    </div>
</template>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import Backpack from '@/vue/views/inventory/backpack.vue'
import ItemInfoOverlay from '@/vue/views/inventory/itemInfoOverlay.vue'
import {BankManager} from '@/data/bankManager'
import {InventoryManager} from '@/data/inventoryManager'
import {NpcInteractionManager} from '@/data/npcInteractionManager'
import {ConsumableHelper} from '@/data/items/consumableHelper'
import {Settings} from '@/settings/settings'
import {t} from '@/i18n'
import {getItemDurabilityPercent, getItemDurabilityStatus, getItemImage, getItemStackCount, getItemTooltipData} from '@/vue/views/inventory/itemTooltip'
import {createPointerDoubleClickHandler} from '@/vue/views/inventory/usePointerDoubleClick'
import EquipSet from '@/vue/views/inventory/equipSet.vue'
import {MyPlayer} from '@/data/myPlayer'
import {getEquipSetArmorSvg, getEquipSetArmsSvg, getEquipSetHandSvg, getEquipSetHelmetSvg, getEquipSetLegsSvg, getEquipSetNecklaceSvg, getEquipSetRingSvg} from '@/vue/icons/icons'

const props = defineProps<{npcId: number}>()
const MIN_INVENTORY_SLOT_COUNT = 24
const BANK_LEFT_MODE_STORAGE_KEY = 'DARKENLIGHT_BANK_LEFT_MODE'
const actionButtonSize = ref(Settings.actionButtonSize)
const itemInfoOverlayRef = ref()
const itemInfoOverlay = ref<any>({visible: false})
const version = ref(0)
const getStoredLeftMode = (): 'inventory' | 'equipment' => {
    try {
        return localStorage.getItem(BANK_LEFT_MODE_STORAGE_KEY) === 'equipment' ? 'equipment' : 'inventory'
    } catch {
        return 'inventory'
    }
}
const leftMode = ref<'inventory' | 'equipment'>(getStoredLeftMode())

const inventorySlotCount = computed(() => {
    version.value
    return Math.max(MIN_INVENTORY_SLOT_COUNT, InventoryManager.inventory.length)
})
const inventorySlotImages = computed(() => {
    version.value
    return Array.from({length: inventorySlotCount.value}, (_, index) => InventoryManager.inventory[index] ? getItemImage(InventoryManager.inventory[index]) : null)
})
const bankSlotImages = computed(() => {
    version.value
    return Array.from({length: BankManager.capacity}, (_, index) => BankManager.items[index] ? getItemImage(BankManager.items[index]) : null)
})

const emptyMarkers = () => []
const getInventoryStackCount = (index: number) => getItemStackCount(InventoryManager.inventory[index])
const getBankStackCount = (index: number) => getItemStackCount(BankManager.items[index])
const getInventoryDurabilityStatus = (index: number) => getItemDurabilityStatus(InventoryManager.inventory[index])
const getInventoryDurabilityPercent = (index: number) => getItemDurabilityPercent(InventoryManager.inventory[index])
const getBankDurabilityStatus = (index: number) => getItemDurabilityStatus(BankManager.items[index])
const getBankDurabilityPercent = (index: number) => getItemDurabilityPercent(BankManager.items[index])

const equipSlots = computed(() => {
    version.value
    const getEquipItem = (slot: string) => MyPlayer.myChar?.equipSet?.get(slot)
    const createSlot = (key: string, className: string, emptyHtml: string) => {
        const item = getEquipItem(key)
        return {key, className, image: item ? getItemImage(item) : null, emptyHtml, markers: [], durabilityStatus: getItemDurabilityStatus(item), durabilityPercent: getItemDurabilityPercent(item)}
    }
    return [
        createSlot('HEAD', 'slot-helmet', getEquipSetHelmetSvg('icon-equipset icon-equipset-slot', 'icon-helmet')),
        createSlot('NECKLACE', 'slot-necklace', getEquipSetNecklaceSvg('icon-equipset icon-equipset-slot', 'icon-necklace')),
        createSlot('PAULDRONS', 'slot-arms-armor', getEquipSetArmsSvg('icon-equipset icon-equipset-slot', 'icon-arms')),
        createSlot('BODY', 'slot-body', getEquipSetArmorSvg('icon-equipset icon-equipset-slot', 'icon-armor')),
        createSlot('L_HAND', 'slot-left-hand', getEquipSetHandSvg('icon-equipset icon-equipset-slot', 'icon-hand-left')),
        createSlot('R_HAND', 'slot-right-hand', getEquipSetHandSvg('icon-equipset icon-equipset-slot', 'icon-hand-right')),
        createSlot('L_RING', 'slot-left-ring', getEquipSetRingSvg('icon-equipset icon-equipset-slot', 'icon-ring-left')),
        createSlot('R_RING', 'slot-right-ring', getEquipSetRingSvg('icon-equipset icon-equipset-slot', 'icon-ring-right')),
        createSlot('LEGS', 'slot-legs', getEquipSetLegsSvg('icon-equipset icon-equipset-slot', 'icon-legs')),
    ]
})

const hideItemInfoOverlay = () => {
    itemInfoOverlay.value.visible = false
}

const setLeftMode = (mode: 'inventory' | 'equipment') => {
    if (leftMode.value === mode) return
    leftMode.value = mode
    hideItemInfoOverlay()
    try {
        localStorage.setItem(BANK_LEFT_MODE_STORAGE_KEY, mode)
    } catch {
        // Bank remains usable when browser storage is unavailable.
    }
}

const showItemInfoOverlay = (item: any, pointer: {clientX: number, clientY: number}, source: 'inventory' | 'bank', index: number) => {
    if (!item) {
        hideItemInfoOverlay()
        return
    }
    if (itemInfoOverlay.value.visible && itemInfoOverlay.value.source === source && itemInfoOverlay.value.id === item.id) {
        hideItemInfoOverlay()
        return
    }
    Object.assign(itemInfoOverlay.value, getItemTooltipData(item), {
        visible: true,
        x: pointer.clientX + 4,
        y: pointer.clientY,
        source,
        index,
        showDropButton: false,
        showSplitButton: item.cbType === 'R',
        showMergeButton: source === 'inventory'
            ? InventoryManager.canMergeResourceItem(item)
            : BankManager.canMergeResourceItem(item),
        showCampButton: source === 'inventory' && ConsumableHelper.isItemCampWood(item),
    })
}

const onInventoryClick = (index: number, pointer: {clientX: number, clientY: number}) => showItemInfoOverlay(InventoryManager.inventory[index], pointer, 'inventory', index)
const onBankClick = (index: number, pointer: {clientX: number, clientY: number}) => showItemInfoOverlay(BankManager.items[index], pointer, 'bank', index)
const onInventoryDoubleClick = (index: number) => {
    const item = InventoryManager.inventory[index]
    if (item) NpcInteractionManager.bankAction(props.npcId, 'DEPOSIT', item.id)
    hideItemInfoOverlay()
}
const onBankDoubleClick = (index: number) => {
    const item = BankManager.items[index]
    if (item) NpcInteractionManager.bankAction(props.npcId, leftMode.value === 'equipment' && item.isEquippable() ? 'EQUIP_FROM_BANK' : 'WITHDRAW', item.id)
    hideItemInfoOverlay()
}
const onInventoryPointerDown = createPointerDoubleClickHandler(onInventoryClick, onInventoryDoubleClick)
const onBankPointerDown = createPointerDoubleClickHandler(onBankClick, onBankDoubleClick)
const onEquipClick = (slot: string, pointer: {clientX: number, clientY: number}) => showItemInfoOverlay(MyPlayer.myChar?.equipSet?.get(slot), pointer, 'equip' as any, -1)
const onEquipDoubleClick = (slot: string) => {
    const item = MyPlayer.myChar?.equipSet?.get(slot)
    if (item) NpcInteractionManager.bankAction(props.npcId, 'UNEQUIP_TO_BANK', item.id)
    hideItemInfoOverlay()
}
const onEquipPointerDown = createPointerDoubleClickHandler(onEquipClick, onEquipDoubleClick)

const dropInventoryItem = () => {
    const item = InventoryManager.inventory[itemInfoOverlay.value.index]
    if (item) InventoryManager.dropItem(item)
    hideItemInfoOverlay()
}
const splitItem = (payload: any) => {
    const itemId = Number(payload?.itemId)
    const splitCount = Number(payload?.splitCount)
    if (!Number.isInteger(itemId) || !Number.isInteger(splitCount)) return
    if (itemInfoOverlay.value.source === 'bank') {
        NpcInteractionManager.bankAction(props.npcId, 'BANK_SPLIT', itemId, splitCount)
    } else {
        InventoryManager.splitInventoryItem(itemId, splitCount)
    }
}
const mergeItem = (payload: any) => {
    const itemId = Number(payload?.itemId)
    if (!Number.isInteger(itemId)) return
    if (itemInfoOverlay.value.source === 'bank') {
        NpcInteractionManager.bankAction(props.npcId, 'BANK_STACK', itemId)
    } else {
        InventoryManager.mergeInventoryItem(itemId)
    }
}
const createCamp = () => {
    const cbId = Number(itemInfoOverlay.value.cbId)
    if (Number.isInteger(cbId)) ConsumableHelper.clickOnCreateCamp(cbId)
    hideItemInfoOverlay()
}

const refresh = () => {
    version.value++
    actionButtonSize.value = Settings.actionButtonSize
    if (itemInfoOverlay.value.visible) hideItemInfoOverlay()
}

onMounted(() => {
    window.addEventListener('ui:bank-updated', refresh)
    window.addEventListener('ui:inventory-updated', refresh)
})
onUnmounted(() => {
    onInventoryPointerDown.cancel()
    onBankPointerDown.cancel()
    onEquipPointerDown.cancel()
    window.removeEventListener('ui:bank-updated', refresh)
    window.removeEventListener('ui:inventory-updated', refresh)
})
</script>

<style scoped>
.bank-panel { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; width: 100%; height: 100%; min-height: 0; }
.bank-column { display: flex; min-width: 0; min-height: 0; flex-direction: column; }
.bank-column-title { display: flex; justify-content: space-between; margin: 0 2px 6px; color: rgb(var(--ui-base)); font-size: 13px; font-weight: 700; text-transform: uppercase; }
.bank-column-title span { color: rgb(var(--ui-dark)); }
.bank-mode-button { min-width: 0; flex: 1 1 50%; padding: 4px 2px; font-size: 11px; }
.bank-column :deep(.inventory-panel) { width: 100%; flex: 1 1 auto; min-height: 0; padding: 0; }
.bank-column :deep(.inventory-grid-wrapper) { height: 100%; max-height: none; aspect-ratio: auto; }
.bank-column :deep(.inventory-grid) { height: 100%; }
.bank-column :deep(.equipment-panel) { width: 50%; height: auto; flex: 1 1 auto; min-height: 0; align-self: center; border-right: none; --slot-size-factor: 0.4; }
.bank-panel :deep(.inventory-item-overlay) { text-align: left; }
@media (max-width: 700px) { .bank-panel { gap: 6px; } }
@media (max-height: 600px) and (min-aspect-ratio: 8 / 5) {
    .bank-column :deep(.equipment-panel) { width: 100%; --slot-size-factor: 0.17; }
    .bank-column :deep(.slot-helmet), .bank-column :deep(.slot-left-hand), .bank-column :deep(.slot-left-ring) { left: 8% !important; }
    .bank-column :deep(.slot-necklace), .bank-column :deep(.slot-right-hand), .bank-column :deep(.slot-right-ring) { right: 8% !important; }
    .bank-column :deep(.slot-arms-armor) { top: 13.5%; }
    .bank-column :deep(.slot-body) { top: 34.5%; }
    .bank-column :deep(.slot-left-hand), .bank-column :deep(.slot-right-hand) { top: 45.5%; }
    .bank-column :deep(.slot-left-ring), .bank-column :deep(.slot-right-ring) { top: 66.5%; }
    .bank-column :deep(.slot-legs) { top: 80%; }
}
</style>
