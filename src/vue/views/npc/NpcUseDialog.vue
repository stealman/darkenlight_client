<template>
    <GameDialog
        v-if="dialogVisible"
        backdrop-class="inventory-dialog-backdrop"
        window-class="adaptive inventory-dialog-window npc-use-dialog-window"
        :close-on-backdrop="false"
        @backdrop-click="onBackdropClick"
        @close="closeDialog"
    >
        <template #header>
            <div class="npc-use-header">
                <div class="npc-use-feature-tabs">
                    <div
                        v-for="(feature, index) in features"
                        :key="feature.type"
                        class="tab-item"
                        :class="{ active: selectedFeatureIndex === index }"
                        @click="selectFeature(index)"
                    >
                        <label class="noselect">{{ getFeatureLabel(feature.type) }}</label>
                    </div>
                </div>
                <div class="npc-use-emeralds">
                    <img src="/images/icons/emerald.png" alt="Emerald" />
                    <span>{{ formattedEmeralds }}</span>
                </div>
            </div>
        </template>

        <div class="npc-use-content-shell" @click="detailItem = null">
            <template v-if="selectedFeature?.type === 'vendor'">
                <div v-if="vendorCategories.length" class="npc-use-category-tabs">
                    <button
                        v-for="category in vendorCategories"
                        :key="category.key"
                        class="dialog-button npc-use-tab"
                        :class="{ 'npc-use-tab-active': selectedCategory === category.key }"
                        @click="selectCategory(category.key)"
                    >
                        {{ getCategoryLabel(category.key) }}
                    </button>
                </div>

                <div v-if="selectedCategoryItems.length" class="npc-vendor-item-list">
                    <div
                        v-for="item in selectedCategoryItems"
                        :key="`${item.tp}:${item.cb}`"
                        class="npc-vendor-item-row"
                        role="button"
                        tabindex="0"
                        @click.stop="showItemDetails(item, $event)"
                        @keydown.enter="showItemDetails(item, $event)"
                    >
                        <img class="npc-vendor-item-icon" :src="getItemImage(item)" :alt="getItemName(item)" />
                        <span class="npc-vendor-item-name">
                            {{ getItemName(item) }}
                            <span v-if="item.tp === 'R'" class="npc-vendor-item-owned">({{ getOwnedResourceCount(item) }})</span>
                        </span>
                        <span class="npc-vendor-item-price">
                            {{ getTotalPrice(item) }}
                            <img src="/images/icons/emerald.png" alt="Emerald" />
                        </span>
                        <div class="npc-vendor-buy-actions">
                            <button class="dialog-button npc-vendor-buy-button" @click.stop="buyItem(item, 1, $event)">{{ item.tp === 'R' ? '×1' : t('vendor.buy') }}</button>
                            <template v-if="item.tp === 'R'">
                                <button class="dialog-button npc-vendor-quick-buy-button" @click.stop="buyItem(item, 5, $event)">×5</button>
                                <button class="dialog-button npc-vendor-quick-buy-button" @click.stop="buyItem(item, 25, $event)">×25</button>
                            </template>
                        </div>
                    </div>
                </div>
                <div v-else class="npc-use-empty-state">{{ t('vendor.emptyCategory') }}</div>
            </template>

            <div v-else-if="selectedFeature" class="npc-use-empty-state">{{ t('vendor.featureNotAvailable') }}</div>
            <div v-else class="npc-use-empty-state">{{ t('vendor.noFeatures') }}</div>
        </div>

        <template #overlay>
            <div
                v-for="effect in purchaseEffects"
                :key="effect.id"
                class="npc-purchase-effect"
                :class="{ 'npc-purchase-effect-error': effect.error }"
                :style="{ left: `${effect.x}px`, top: `${effect.y}px` }"
            >
                {{ effect.text }}
            </div>
            <div v-if="detailItem" class="npc-vendor-item-overlay" :style="detailOverlayStyle" @click="detailItem = null">
                <div class="npc-vendor-overlay-name">{{ getItemName(detailItem) }}</div>
                <div v-if="detailItem.tp === 'W'" class="npc-vendor-overlay-stats">
                    <span>{{ t('vendor.attack') }} <strong>{{ detailItem.atts?.patk }}</strong></span>
                    <span>{{ t('vendor.attackType') }} <strong>{{ formatDamageTypes(detailItem) }}</strong></span>
                    <span>{{ t('vendor.speed') }} <strong>{{ formatSpeed(detailItem.atts?.speed) }}</strong></span>
                    <span>{{ t('vendor.range') }} <strong>{{ detailItem.atts?.range }}</strong></span>
                </div>
                <div v-else class="npc-vendor-overlay-muted">{{ t('vendor.detailsSoon') }}</div>
            </div>
        </template>
    </GameDialog>
</template>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import GameDialog from '@/vue/views/GameDialog.vue'
import {NpcInteractionManager} from '@/data/npcInteractionManager'
import type {NpcUseData, NpcUseFeatureData, NpcVendorCatalogItem} from '@/network/messageIfs'
import {t} from '@/i18n'
import {EmeraldsManager} from '@/gui/emeraldsManager'
import {InventoryManager} from '@/data/inventoryManager'
import {NpcManager} from '@/babylon/npc/npcManager'

const emit = defineEmits(['close'])

const featureLabels: Record<string, string> = {vendor: 'vendor.vendor', banker: 'vendor.banker', healer: 'vendor.healer', trainer: 'vendor.trainer'}
const categoryLabels: Record<string, string> = {weapons: 'vendor.weapons', bows: 'vendor.bows', metalArmor: 'vendor.metalArmor', leatherArmor: 'vendor.leatherArmor', jewels: 'vendor.jewels', resources: 'vendor.resources', trinkets: 'vendor.trinkets'}
const itemTypeLocalizationSections: Record<string, string> = {W: 'weapons', A: 'armors', J: 'jewels', T: 'trinkets', R: 'resources'}
const damageTypeLabels: Record<string, string> = {PHYSICAL_SLASH: 'vendor.damageSlash', PHYSICAL_PIERCE: 'vendor.damagePierce', PHYSICAL_BLUNT: 'vendor.damageBlunt'}
const IGNORE_BACKDROP_CLICK_AFTER_OPEN_MS = 350
const NPC_PURCHASE_DISTANCE = 4
const NPC_FEATURE_TAB_STORAGE_KEY = 'DARKENLIGHT_NPC_FEATURE_TAB'
const NPC_VENDOR_CATEGORY_TAB_STORAGE_KEY = 'DARKENLIGHT_NPC_VENDOR_CATEGORY_TAB'

type PurchaseEffect = {
    id: number
    text: string
    x: number
    y: number
    error: boolean
}

const dialogVisible = ref(false)
const npcData = ref<NpcUseData | null>(null)
const selectedFeatureIndex = ref(0)
const selectedCategory = ref('')
const detailItem = ref<NpcVendorCatalogItem | null>(null)
const detailOverlayPosition = ref({x: 0, y: 0})
const resourceInventoryVersion = ref(0)
const openedAt = ref(0)
const purchaseEffects = ref<PurchaseEffect[]>([])
let nextPurchaseEffectId = 0

const features = computed(() => npcData.value?.features ?? [])
const selectedFeature = computed<NpcUseFeatureData | null>(() => features.value[selectedFeatureIndex.value] ?? null)
const vendorCategories = computed(() => Object.entries(selectedFeature.value?.categories ?? {}).map(([key, items]) => ({key, items})).filter((category) => category.items.length > 0))
const selectedCategoryItems = computed(() => [...(selectedFeature.value?.categories?.[selectedCategory.value] ?? [])]
    .sort((first, second) => first.price - second.price || first.name.localeCompare(second.name)))
const detailOverlayStyle = computed(() => ({left: `${detailOverlayPosition.value.x}px`, top: `${detailOverlayPosition.value.y}px`}))
const formattedEmeralds = computed(() => EmeraldsManager.formatEmeraldAmount(EmeraldsManager.emeralds.value))

const getFeatureLabel = (type: string) => t(featureLabels[type] ?? type)
const getCategoryLabel = (category: string) => t(categoryLabels[category] ?? category)
const getItemName = (item: NpcVendorCatalogItem) => {
    const section = itemTypeLocalizationSections[item.tp]
    const key = section ? `items.${section}.${item.name}` : item.name
    const localized = t(key)
    const name = localized === key ? item.name : localized
    return item.bundleSize && item.bundleSize > 1 ? `${item.bundleSize}× ${name}` : name
}
const getItemImage = (item: NpcVendorCatalogItem) => item.img ? `/images/items/${item.img}.png` : '/images/icons/buttons/btn_backpack.png'
const formatDamageTypes = (item: NpcVendorCatalogItem) => (item.dmgTypes ?? []).map((type) => t(damageTypeLabels[type] ?? type)).join(' / ')
const formatSpeed = (speed: number | string | undefined) => {
    const milliseconds = Number(speed)
    return Number.isFinite(milliseconds) ? `${(milliseconds / 1000).toFixed(2)}s` : '-'
}
const getTotalPrice = (item: NpcVendorCatalogItem) => item.price
const getOwnedResourceCount = (item: NpcVendorCatalogItem) => {
    resourceInventoryVersion.value
    return InventoryManager.getTotalResourceItemCountByType(item.cb)
}

const getPreferredVendorCategory = (feature: NpcUseFeatureData | undefined) => {
    const categories = Object.entries(feature?.categories ?? {}).filter(([, items]) => items.length > 0)
    const storedCategory = localStorage.getItem(NPC_VENDOR_CATEGORY_TAB_STORAGE_KEY)
    return categories.some(([category]) => category === storedCategory)
        ? storedCategory!
        : categories[0]?.[0] ?? ''
}

const selectFeature = (index: number, remember: boolean = true) => {
    const feature = features.value[index]
    if (!feature) {
        return
    }

    selectedFeatureIndex.value = index
    selectedCategory.value = getPreferredVendorCategory(feature)
    if (remember) {
        localStorage.setItem(NPC_FEATURE_TAB_STORAGE_KEY, feature.type)
    }
    detailItem.value = null
}

const selectCategory = (category: string) => {
    selectedCategory.value = category
    localStorage.setItem(NPC_VENDOR_CATEGORY_TAB_STORAGE_KEY, category)
    detailItem.value = null
}

const addPurchaseEffect = (text: string, event: MouseEvent, error: boolean = false) => {
    const effectId = nextPurchaseEffectId++
    purchaseEffects.value.push({
        id: effectId,
        text,
        x: event.clientX,
        y: event.clientY,
        error,
    })
    window.setTimeout(() => {
        purchaseEffects.value = purchaseEffects.value.filter((effect) => effect.id !== effectId)
    }, 750)
}

const buyItem = (item: NpcVendorCatalogItem, quantity: number, event: MouseEvent) => {
    detailItem.value = null
    const npc = npcData.value ? NpcManager.npcs.get(npcData.value.id) : null
    if (!npc || npc.getDistanceFromMyPlayer() > NPC_PURCHASE_DISTANCE) {
        addPurchaseEffect(t('messages.npcUseOutOfRange'), event, true)
        return
    }

    const totalPrice = item.price * quantity
    if (EmeraldsManager.myEmeralds < totalPrice) {
        addPurchaseEffect(t('vendor.notEnoughEmeralds'), event, true)
        return
    }

    addPurchaseEffect(`-${EmeraldsManager.formatEmeraldAmount(totalPrice)}`, event)
    if (npcData.value) {
        NpcInteractionManager.purchase(npcData.value.id, item, quantity)
    }
}

const showItemDetails = (item: NpcVendorCatalogItem, event: MouseEvent | KeyboardEvent) => {
    if (detailItem.value?.tp === item.tp && detailItem.value.cb === item.cb) {
        detailItem.value = null
        return
    }
    detailItem.value = item
    detailOverlayPosition.value = event instanceof MouseEvent
        ? {x: Math.max(8, Math.min(event.clientX + 8, window.innerWidth - 280)), y: Math.max(8, Math.min(event.clientY + 8, window.innerHeight - 160))}
        : {x: Math.max(12, window.innerWidth / 2 - 135), y: Math.max(12, window.innerHeight / 2 - 80)}
}

const openDialog = (data: NpcUseData) => {
    npcData.value = data
    const storedFeature = localStorage.getItem(NPC_FEATURE_TAB_STORAGE_KEY)
    const storedFeatureIndex = data.features.findIndex((feature) => feature.type === storedFeature)
    selectFeature(storedFeatureIndex >= 0 ? storedFeatureIndex : 0, false)
    openedAt.value = Date.now()
    dialogVisible.value = true
}

const closeDialog = () => {
    detailItem.value = null
    dialogVisible.value = false
    emit('close')
}

const onBackdropClick = () => {
    if ((Date.now() - openedAt.value) < IGNORE_BACKDROP_CLICK_AFTER_OPEN_MS) {
        return
    }

    closeDialog()
}

const refreshResourceInventoryCounts = () => {
    resourceInventoryVersion.value++
}

onMounted(() => {
    window.addEventListener('ui:inventory-updated', refreshResourceInventoryCounts)
})

onUnmounted(() => {
    window.removeEventListener('ui:inventory-updated', refreshResourceInventoryCounts)
})

defineExpose({openDialog})
</script>

<style scoped>
.npc-use-dialog-window .dialog-content { display: block; }
.npc-use-header { display: flex; align-items: center; gap: 8px; min-width: 0; }
.npc-use-feature-tabs { display: flex; min-width: 0; overflow-x: auto; }
.npc-use-emeralds { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; margin-left: auto; padding: 0 6px; color: #7ef58e; font-size: 14px; text-shadow: 0 0 3px #000; white-space: nowrap; }
.npc-use-emeralds img { width: 18px; height: 18px; object-fit: contain; }
.npc-use-content-shell { display: flex; flex-direction: column; width: 100%; height: min(600px, calc(85vh - 48px)); box-sizing: border-box; padding: 10px; gap: 10px; overflow: hidden; }
.npc-use-category-tabs { display: flex; flex-wrap: wrap; gap: 6px; flex: 0 0 auto; }
.npc-use-tab { min-width: 82px; }
.npc-use-tab, .npc-vendor-buy-button, .npc-vendor-quick-buy-button { padding: 5px 10px; font-size: 0.9rem; line-height: 1; }
.npc-use-tab-active { color: rgb(var(--ui-base)); border-color: rgb(var(--ui-base)); background: rgba(255, 255, 255, 0.09); }
.npc-vendor-item-list { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; overflow-y: auto; border-top: 1px solid rgba(var(--ui-darker), 0.8); border-bottom: 1px solid rgba(var(--ui-darker), 0.8); }
.npc-vendor-item-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) max-content auto; align-items: center; gap: 12px; min-height: 46px; padding: 3px 8px; border-bottom: 1px solid rgba(var(--ui-darker), 0.65); color: rgb(var(--ui-base)); cursor: url('/images/cursor-pointer.png'), pointer; }
.npc-vendor-item-row:hover { background: rgba(255, 255, 255, 0.06); }
.npc-vendor-item-icon { width: 40px; height: 40px; object-fit: contain; }
.npc-vendor-item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; text-align: left; font-size: 14px; font-weight: 700; }
.npc-vendor-item-owned { color: rgb(var(--ui-dark)); font-weight: 400; white-space: nowrap; }
.npc-vendor-item-price { display: inline-flex; align-items: center; gap: 4px; color: #7ef58e; white-space: nowrap; font-size: 13px; }
.npc-vendor-item-price img { width: 15px; height: 15px; object-fit: contain; }
.npc-vendor-buy-actions { display: flex; justify-content: flex-end; gap: 5px; }
.npc-vendor-buy-button, .npc-vendor-quick-buy-button { min-width: 0; white-space: nowrap; }
.npc-vendor-quick-buy-button { min-width: 42px; }
.npc-use-empty-state { display: flex; flex: 1 1 auto; align-items: center; justify-content: center; color: rgb(var(--ui-dark)); font-size: 14px; }
.npc-vendor-item-overlay { position: fixed; z-index: 2100; width: 270px; box-sizing: border-box; padding: 10px; border: 1px solid rgb(var(--ui-dark)); background: rgba(15, 11, 8, 0.96); color: rgb(var(--ui-base)); text-align: left; box-shadow: 0 10px 22px rgba(0, 0, 0, 0.65); }
.npc-vendor-overlay-name { font-size: 14px; font-weight: 700; }
.npc-vendor-overlay-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 10px; margin-top: 9px; font-size: 12px; color: rgb(var(--ui-dark)); }
.npc-vendor-overlay-stats strong { color: rgb(var(--ui-base)); }
.npc-vendor-overlay-muted { margin-top: 8px; color: rgb(var(--ui-dark)); font-size: 12px; }
.npc-purchase-effect { position: fixed; z-index: 2101; pointer-events: none; color: #ff6262; font-size: 21px; font-weight: 700; line-height: 1; text-shadow: 0 2px 3px #000; animation: npc-purchase-float 750ms ease-out forwards; }
.npc-purchase-effect-error { color: #ff8a63; font-size: 14px; }
@keyframes npc-purchase-float { from { transform: translate(-50%, -50%); opacity: 1; } to { transform: translate(-50%, calc(-50% - 42px)); opacity: 0; } }

@media (min-height: 700px) {
    .npc-vendor-item-row { grid-template-columns: 54px minmax(0, 1fr) max-content auto; min-height: 58px; padding-block: 5px; }
    .npc-vendor-item-icon { width: 48px; height: 48px; }
}
</style>
