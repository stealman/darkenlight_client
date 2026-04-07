<template>
    <div class="dialog-backdrop inventory-dialog-backdrop" @click.self="onBackdropClick">
        <div ref="dialogWindowRef" class="dialog-window adaptive inventory-dialog-window crafting-dialog-window">
            <div class="dialog-content crafting-dialog-content">
                <div class="inventory-content-shell crafting-content-shell">
                    <div class="crafting-recipes-section">
                        <div v-if="recipes.length === 0" class="crafting-empty-state">
                            {{ t('crafting.noRecipes') }}
                        </div>

                        <div v-else class="crafting-recipe-list">
                            <template v-for="(recipe, index) in recipes" :key="getRecipeKey(recipe, index)">
                                <div
                                    class="crafting-recipe-row"
                                    :class="{ 'crafting-recipe-row-selected': selectedRecipeIndex === index }"
                                    @click="selectRecipe(index)"
                                >
                                    <button
                                        class="crafting-result-icon-button"
                                        type="button"
                                        @pointerdown.stop
                                        @click.stop="onResultIconClick(recipe.item, index, $event)"
                                    >
                                        <img class="crafting-result-icon" :src="resolveItemImage(recipe.item)" :alt="resolveItemName(recipe.item)" />
                                    </button>

                                    <div class="crafting-result-summary">
                                        <div
                                            class="crafting-result-name"
                                            :class="{ 'crafting-result-name-disabled': getRecipeCraftableQty(recipe) <= 0 }"
                                        >
                                            {{ resolveItemName(recipe.item) }}
                                        </div>
                                        <div v-if="getRecipeCraftableQty(recipe) > 0" class="crafting-result-note">
                                            {{ t('crafting.craftable') }}: {{ getRecipeCraftableQty(recipe) }}
                                        </div>
                                        <div v-else class="crafting-result-note crafting-result-note-missing">
                                            {{ t('crafting.noResources') }}
                                        </div>
                                    </div>

                                    <div class="crafting-ingredients">
                                        <div
                                            v-for="(ingredient, ingredientIndex) in recipe.ing"
                                            :key="getIngredientKey(ingredient, ingredientIndex)"
                                            class="crafting-ingredient-chip"
                                        >
                                            <img
                                                class="crafting-ingredient-icon"
                                                :src="resolveItemImage(ingredient.res)"
                                                :alt="resolveItemName(ingredient.res)"
                                            />
                                            <span
                                                class="crafting-ingredient-name"
                                                :class="{ 'crafting-ingredient-name-missing': Number(ingredient.inventoryQty ?? 0) < Number(ingredient.qty ?? 0) }"
                                            >
                                                {{ resolveItemName(ingredient.res) }}
                                            </span>
                                            <span class="crafting-ingredient-qty">x{{ ingredient.qty }}</span>
                                            <span
                                                class="crafting-ingredient-owned"
                                                :class="{ 'crafting-ingredient-owned-missing': Number(ingredient.inventoryQty ?? 0) < Number(ingredient.qty ?? 0) }"
                                            >
                                                ({{ ingredient.inventoryQty }})
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="index < recipes.length - 1" class="crafting-recipe-divider" />
                            </template>
                        </div>
                    </div>

                    <div
                        class="crafting-selection-row"
                        :class="{ 'crafting-selection-row-empty': !selectedRecipe }"
                        :style="{ '--inventory-action-btn-size': `${craftingActionButtonSize}px` }"
                    >
                        <div class="crafting-selection-summary">
                            <div class="crafting-selection-title">
                                {{ selectedRecipe ? resolveItemName(selectedRecipe.item) : '' }}
                            </div>
                            <div v-if="selectedRecipe" class="crafting-selection-note">
                                
                            </div>
                            <div v-else class="crafting-selection-note crafting-selection-note-muted">
                                {{ recipes.length > 0 ? t('crafting.selectRecipe') : t('crafting.noRecipes') }}
                            </div>
                        </div>

                        <div class="crafting-selection-controls">
                            <template v-if="selectedRecipe && selectedRecipeCraftableQty > 0">
                                <div class="crafting-selection-slider-panel">
                                    <div class="crafting-selection-slider-row">
                                        <span class="crafting-selection-boundary">{{ selectedRecipeMinQuantity }}</span>
                                        <input
                                            v-model.number="selectedRecipeQuantity"
                                            class="range-slider crafting-selection-slider"
                                            type="range"
                                            :min="selectedRecipeMinQuantity"
                                            :max="selectedRecipeCraftableQty"
                                            :step="selectedRecipeStep"
                                            style="zoom: 1.5;"
                                            @pointerdown.stop
                                            @click.stop
                                            @input="onSelectedRecipeSliderInput"
                                        />
                                        <span class="crafting-selection-boundary">{{ selectedRecipeCraftableQty }}</span>
                                    </div>
                                    <div class="crafting-selection-current">{{ selectedRecipeQuantity }}</div>
                                </div>
                                <button
                                    class="action-button inventory-action-button crafting-selection-action-button"
                                    type="button"
                                    :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                                    @pointerdown.prevent.stop
                                    @click.stop="onConfirmSelectedRecipe"
                                >
                                    <img class="action-icon" src="/images/icons/buttons/btn_ok.png" alt="OK" />
                                </button>
                                <button
                                    class="action-button inventory-action-button crafting-selection-action-button"
                                    type="button"
                                    :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                                    @pointerdown.prevent.stop
                                    @click.stop="onCancelSelectionAction"
                                >
                                    <img class="action-icon" src="/images/icons/buttons/btn_stop.png" alt="Cancel" />
                                </button>
                            </template>
                            <button
                                v-else
                                class="action-button inventory-action-button crafting-selection-action-button"
                                type="button"
                                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                                @pointerdown.prevent.stop
                                @click.stop="onCancelSelectionAction"
                            >
                                <img class="action-icon" src="/images/icons/buttons/btn_stop.png" alt="Cancel" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <CraftingItemOverlay
            v-if="itemInfoOverlay.visible"
            ref="itemInfoOverlayRef"
            :item-info="itemInfoOverlay"
            :x="itemInfoOverlay.x"
            :y="itemInfoOverlay.y"
            @close="hideItemInfoOverlay"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { CraftingInitMenuData, CraftingRecipe, ItemTO } from '@/network/messageIfs'
import { t } from '@/i18n'
import { AudioManager } from '@/babylon/audio/audioManager'
import { CraftingManager } from '@/data/crafting/craftingManager'
import { Settings } from '@/settings/settings'
import CraftingItemOverlay from '@/vue/views/crafting/craftingItemOverlay.vue'

const emit = defineEmits(['close'])

const EMPTY_ITEM_IMAGE = '/images/icons/buttons/btn_backpack.png'
const OVERLAY_PADDING = 4
const OVERLAY_CURSOR_OFFSET_X = 2
const IGNORE_BACKDROP_CLICK_AFTER_OPEN_MS = 350

type CraftingIngredientWithInventoryQty = CraftingRecipe['ing'][number] & {
    inventoryQty?: number
}

type CraftingRecipeWithCraftableQty = CraftingRecipe & {
    craftableQty?: number
}

const dialogWindowRef = ref<HTMLElement | null>(null)
const itemInfoOverlayRef = ref<{ getBoundingClientRect?: () => DOMRect } | null>(null)
const craftingMenuData = ref<CraftingInitMenuData | null>(null)
const craftingActionButtonSize = ref(Settings.actionButtonSize)
const openedAt = ref(0)
const selectedRecipeIndex = ref<number | null>(null)
const selectedRecipeQuantity = ref(1)
const lastSelectedRecipeSliderTickAt = ref(0)

const itemInfoOverlay = ref({
    visible: false,
    x: 0,
    y: 0,
    sourceKey: null as string | null,
    name: '',
    quality: null as number | null,
    durability: null as number | null,
    durabilityMax: null as number | null,
    quantity: null as number | null,
})

const recipes = computed(() => craftingMenuData.value?.recipes ?? [])
const selectedRecipe = computed(() => {
    if (selectedRecipeIndex.value === null) {
        return null
    }

    return recipes.value[selectedRecipeIndex.value] ?? null
})

const itemTypeLocalizationSections: Record<string, string> = {
    W: 'weapons',
    A: 'armors',
    J: 'jewels',
    T: 'trinkets',
    R: 'resources',
}

const hideItemInfoOverlay = () => {
    itemInfoOverlay.value.visible = false
    itemInfoOverlay.value.sourceKey = null
    itemInfoOverlay.value.name = ''
    itemInfoOverlay.value.quality = null
    itemInfoOverlay.value.durability = null
    itemInfoOverlay.value.durabilityMax = null
    itemInfoOverlay.value.quantity = null
}

const refreshCraftingActionButtonSize = () => {
    craftingActionButtonSize.value = Settings.actionButtonSize
}

const resolveItemName = (item: ItemTO | null | undefined) => {
    if (!item?.name) {
        return t('inventory.unknownItem')
    }

    const section = itemTypeLocalizationSections[item.tp]
    if (section) {
        const sectionKey = `items.${section}.${item.name}`
        const sectionName = t(sectionKey)
        if (sectionName !== sectionKey) {
            return sectionName
        }
    }

    const directName = t(item.name)
    return directName === item.name ? item.name : directName
}

const resolveItemImage = (item: Partial<ItemTO> & { imgUrl?: string | null } | null | undefined) => {
    const imagePath = item?.imgUrl || (item?.img ? `images/items/${item.img}.png` : null)
    if (!imagePath) {
        return EMPTY_ITEM_IMAGE
    }

    return imagePath.startsWith('/') ? imagePath : `/${imagePath}`
}

const getItemAttribute = (item: ItemTO | null | undefined, key: string) => {
    const atts = item?.atts as Map<string, number | string> | Record<string, number | string> | undefined
    if (!atts) {
        return null
    }
    if (atts instanceof Map) {
        return atts.get(key) ?? null
    }
    return atts[key] ?? null
}

const getRecipeKey = (recipe: CraftingRecipe, index: number) => `${recipe.item?.cb ?? 'item'}-${recipe.skill ?? 'skill'}-${index}`

const getIngredientKey = (ingredient: CraftingIngredientWithInventoryQty, index: number) => `${ingredient.res?.cb ?? 'res'}-${index}`

const getRecipeCraftableQty = (recipe: CraftingRecipeWithCraftableQty) => {
    const craftableQty = Number(recipe?.craftableQty)
    return Number.isFinite(craftableQty) && craftableQty >= 0 ? craftableQty : 0
}

const getQuantityStep = (quantity: number) => {
    if (!Number.isFinite(quantity) || quantity <= 100) {
        return 1
    }
    if (quantity <= 1000) {
        return 5
    }
    return 25
}

const selectedRecipeCraftableQty = computed(() => {
    if (!selectedRecipe.value) {
        return 0
    }

    return getRecipeCraftableQty(selectedRecipe.value)
})

const selectedRecipeStep = computed(() => getQuantityStep(selectedRecipeCraftableQty.value))

const selectedRecipeMinQuantity = computed(() => 1)

const selectRecipe = (recipeIndex: number) => {
    if (!recipes.value[recipeIndex]) {
        return
    }

    selectedRecipeIndex.value = recipeIndex
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

const showItemInfoOverlay = (item: ItemTO, sourceKey: string, pointer: PointerEvent | MouseEvent) => {
    itemInfoOverlay.value.visible = true
    itemInfoOverlay.value.sourceKey = sourceKey
    itemInfoOverlay.value.x = pointer.clientX + OVERLAY_CURSOR_OFFSET_X
    itemInfoOverlay.value.y = pointer.clientY
    itemInfoOverlay.value.name = resolveItemName(item)

    const quality = Number(getItemAttribute(item, 'qual'))
    const durability = Number(getItemAttribute(item, 'dur'))
    const durabilityMax = Number(getItemAttribute(item, 'durM'))
    const quantity = Number(getItemAttribute(item, 'qty'))

    itemInfoOverlay.value.quality = Number.isFinite(quality) ? quality : null
    itemInfoOverlay.value.durability = Number.isFinite(durability) ? durability : null
    itemInfoOverlay.value.durabilityMax = Number.isFinite(durabilityMax) ? durabilityMax : null
    itemInfoOverlay.value.quantity = Number.isFinite(quantity) ? quantity : null

    nextTick(() => {
        clampItemInfoOverlayPosition()
    })
}

const onResultIconClick = (item: ItemTO, recipeIndex: number, event: PointerEvent | MouseEvent) => {
    selectRecipe(recipeIndex)

    const sourceKey = `recipe-${recipeIndex}`
    if (itemInfoOverlay.value.visible && itemInfoOverlay.value.sourceKey === sourceKey) {
        hideItemInfoOverlay()
        return
    }

    showItemInfoOverlay(item, sourceKey, event)
}

const onSelectedRecipeSliderInput = () => {
    const now = Date.now()
    if ((now - lastSelectedRecipeSliderTickAt.value) < 100) {
        return
    }

    lastSelectedRecipeSliderTickAt.value = now
    AudioManager.playGuiTick()
}

const clearSelectedRecipe = () => {
    selectedRecipeIndex.value = null
    selectedRecipeQuantity.value = 1
    hideItemInfoOverlay()
}

const onConfirmSelectedRecipe = () => {
    if (!selectedRecipe.value || selectedRecipeCraftableQty.value <= 0 || selectedRecipeQuantity.value < 1) {
        return
    }

    AudioManager.playGuiButtonClick()
    CraftingManager.submitCraftRequest(selectedRecipe.value, selectedRecipeQuantity.value)
    closeDialog()
}

const onCancelSelectedRecipe = () => {
    if (!selectedRecipe.value) {
        return
    }

    AudioManager.playGuiButtonClick()
    clearSelectedRecipe()
}

const onCancelSelectionAction = () => {
    if (selectedRecipe.value) {
        onCancelSelectedRecipe()
        return
    }

    AudioManager.playGuiButtonClick()
    closeDialog()
}

const openDialog = (data: CraftingInitMenuData) => {
    craftingMenuData.value = data
    refreshCraftingActionButtonSize()
    openedAt.value = Date.now()
    clearSelectedRecipe()
}

const closeDialog = () => {
    hideItemInfoOverlay()
    emit('close')
}

const onBackdropClick = () => {
    if ((Date.now() - openedAt.value) < IGNORE_BACKDROP_CLICK_AFTER_OPEN_MS) {
        return
    }

    closeDialog()
}

const onDialogKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
        closeDialog()
    }
}

onMounted(() => {
    window.addEventListener('keydown', onDialogKeyDown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onDialogKeyDown)
})

watch(selectedRecipeCraftableQty, (craftableQty) => {
    if (craftableQty <= 0) {
        selectedRecipeQuantity.value = 0
        return
    }

    if (selectedRecipeQuantity.value < selectedRecipeMinQuantity.value) {
        selectedRecipeQuantity.value = selectedRecipeMinQuantity.value
        return
    }

    if (selectedRecipeQuantity.value > craftableQty) {
        selectedRecipeQuantity.value = craftableQty
    }
})

watch(selectedRecipeIndex, () => {
    selectedRecipeQuantity.value = selectedRecipeCraftableQty.value > 0 ? 1 : 0
})

defineExpose({
    openDialog,
})
</script>

<style scoped>
.crafting-dialog-window { min-height: auto; }
.crafting-dialog-content { display: flex; align-items: center; justify-content: center; padding: 0; }
.crafting-content-shell { display: flex; flex-direction: column; width: 100%; max-height: min(600px, 85vh); overflow: hidden; box-sizing: border-box; padding: 8px; gap: 10px; }
.crafting-recipes-section { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding-right: 4px; scrollbar-width: thin; scrollbar-color: var(--dialog-color) #111; }
.crafting-recipes-section::-webkit-scrollbar { width: 8px; }
.crafting-recipes-section::-webkit-scrollbar-track,
.crafting-recipes-section::-webkit-scrollbar-thumb { border-radius: 4px; }
.crafting-recipes-section::-webkit-scrollbar-track { background: var(--dialog-color-dark); }
.crafting-recipes-section::-webkit-scrollbar-thumb { background: var(--dialog-color); }
.crafting-empty-state { padding: 28px 12px; text-align: center; color: var(--ui-text-muted); }
.crafting-recipe-list { display: flex; flex-direction: column; }

.crafting-selection-row {
    border: 1px solid var(--dialog-border-subtle);
    border-radius: 0;
    background: var(--dialog-bg);
}

.crafting-recipe-row {
    display: grid;
    grid-template-columns: 46px 150px minmax(0, 1fr);
    column-gap: 16px;
    row-gap: 8px;
    align-items: center;
    padding: 1.5vh 0;
    cursor: url('/images/cursor-pointer.png'), pointer;
}

.crafting-recipe-divider { height: 1px; background: var(--dialog-border-subtle); }

.crafting-recipe-row-selected { background: var(--dialog-surface-selected); }
.crafting-result-summary,
.crafting-selection-summary,
.crafting-ingredients,
.crafting-ingredient-chip,
.crafting-selection-controls,
.crafting-selection-slider-row { min-width: 0; }

.crafting-result-name,
.crafting-selection-title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--dialog-text-strong);
    text-align: left;
    word-break: break-word;
}

.crafting-result-note,
.crafting-selection-note {
    font-size: 13px;
    line-height: 1.15;
    text-align: left;
    color: var(--ui-text-muted);
}

.crafting-result-note { margin-top: 2px; }
.crafting-selection-note { margin-top: 2px; white-space: nowrap; }
.crafting-result-name-disabled,
.crafting-selection-note-muted,
.crafting-selection-current-disabled { color: var(--ui-text-dark); }
.crafting-result-note-missing,
.crafting-ingredient-name-missing,
.crafting-ingredient-owned-missing { color: var(--dialog-danger); }

.crafting-result-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    margin-left: 2px;
    padding: 0;
    border: 1px solid var(--dialog-color);
    border-radius: 0;
    background: var(--dialog-surface-muted);
    cursor: url('/images/cursor-pointer.png'), pointer;
}

.crafting-result-icon-button:hover { border-color: var(--dialog-border-hover); background: rgba(255, 255, 255, 0.05); }
.crafting-result-icon { width: 36px; height: 36px; object-fit: contain; pointer-events: none; }
.crafting-ingredients { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.crafting-ingredient-chip { display: inline-flex; align-items: center; gap: 7px; color: var(--ui-text); }
.crafting-ingredient-icon { width: 22px; height: 22px; object-fit: contain; flex: 0 0 auto; }
.crafting-ingredient-name { font-size: 13px; line-height: 1.15; }
.crafting-ingredient-qty,
.crafting-selection-boundary,
.crafting-selection-current { font-weight: 700; color: var(--dialog-text-strong); text-align: center; }
.crafting-ingredient-qty,
.crafting-ingredient-owned,
.crafting-selection-boundary { font-size: 12px; }
.crafting-ingredient-owned { color: var(--ui-text-muted); }
.crafting-selection-boundary { min-width: 12px; }
.crafting-selection-current { min-width: 32px; font-size: 14px; }

.crafting-selection-row { display: flex; align-items: center; gap: 16px; flex-wrap: nowrap; padding: 10px 12px; flex: 0 0 auto; }
.crafting-selection-row-empty { opacity: 0.8; }
.crafting-selection-row-empty .crafting-selection-title { display: none; }
.crafting-selection-summary { flex: 1 1 0; display: flex; flex-direction: column; justify-content: center; align-self: stretch; }
.crafting-selection-note-muted { margin-top: 0; }
.crafting-selection-controls { display: flex; align-items: center; gap: 10px; flex: 0 1 auto; }
.crafting-selection-slider-panel { flex: 0 1 188px; min-width: 0; }
.crafting-selection-slider-row,
.crafting-selection-action-button { flex: 0 0 auto; }
.crafting-selection-slider-row { display: flex; align-items: center; gap: 10px; }
.crafting-selection-slider { flex: 1 1 auto; }
</style>
