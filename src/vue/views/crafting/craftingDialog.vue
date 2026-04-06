<template>
    <div class="dialog-backdrop inventory-dialog-backdrop" @click.self="onBackdropClick">
        <div ref="dialogWindowRef" class="dialog-window adaptive inventory-dialog-window crafting-dialog-window">
            <div class="dialog-content crafting-dialog-content">
                <div class="inventory-content-shell crafting-content-shell">
                    <div v-if="recipes.length === 0" class="crafting-empty-state">
                        {{ t('crafting.noRecipes') }}
                    </div>

                    <div v-else class="crafting-recipe-list">
                        <div
                            v-for="(recipe, index) in recipes"
                            :key="getRecipeKey(recipe, index)"
                            class="crafting-recipe-row"
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
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { CraftingInitMenuData, CraftingRecipe, ItemTO } from '@/network/messageIfs'
import { t } from '@/i18n'
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
const openedAt = ref(0)

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
    const sourceKey = `recipe-${recipeIndex}`
    if (itemInfoOverlay.value.visible && itemInfoOverlay.value.sourceKey === sourceKey) {
        hideItemInfoOverlay()
        return
    }

    showItemInfoOverlay(item, sourceKey, event)
}

const openDialog = (data: CraftingInitMenuData) => {
    craftingMenuData.value = data
    openedAt.value = Date.now()
    hideItemInfoOverlay()
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

defineExpose({
    openDialog,
})
</script>

<style scoped>
.crafting-dialog-window {
    min-height: auto;
}

.crafting-dialog-content {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
}

.crafting-content-shell {
    width: 100%;
    aspect-ratio: 16 / 10;
    max-height: min(600px, 85vh);
    overflow: auto;
    box-sizing: border-box;
    padding: 8px;
}

.crafting-empty-state {
    padding: 28px 12px;
    text-align: center;
    color: rgba(235, 230, 214, 0.78);
}

.crafting-recipe-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: min(640px, calc(100vh - 180px));
    overflow-y: auto;
    padding-right: 4px;
}

.crafting-recipe-row {
    display: grid;
    grid-template-columns: 46px 150px minmax(0, 1fr);
    column-gap: 16px;
    row-gap: 8px;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid rgba(213, 192, 153, 0.18);
    border-radius: 0;
    background: rgba(29, 24, 19, 0.92);
}

.crafting-result-icon-button {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    padding: 0;
    border: 1px solid rgba(213, 192, 153, 0.3);
    border-radius: 0;
    background: rgba(0, 0, 0, 0.22);
    cursor: pointer;
}

.crafting-result-icon-button:hover {
    border-color: rgba(239, 219, 174, 0.7);
    background: rgba(255, 255, 255, 0.05);
}

.crafting-result-icon {
    width: 36px;
    height: 36px;
    object-fit: contain;
}

.crafting-result-name {
    min-width: 0;
    font-size: 16px;
    font-weight: 700;
    color: #f3e2bc;
    line-height: 1.25;
    word-break: break-word;
    text-align: left;
}

.crafting-result-summary {
    min-width: 0;
}

.crafting-result-name-disabled {
    color: rgba(175, 175, 175, 0.86);
}

.crafting-result-note {
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.15;
    text-align: left;
    color: rgba(191, 191, 191, 0.9);
}

.crafting-result-note-missing {
    color: #d26a6a;
}

.crafting-ingredients {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    min-width: 0;
}

.crafting-ingredient-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 0;
    color: rgba(243, 233, 209, 0.88);
}

.crafting-ingredient-icon {
    width: 22px;
    height: 22px;
    object-fit: contain;
    flex: 0 0 auto;
}

.crafting-ingredient-name {
    font-size: 13px;
    line-height: 1.15;
}

.crafting-ingredient-name-missing {
    color: #d26a6a;
}

.crafting-ingredient-qty {
    font-size: 12px;
    font-weight: 700;
    color: #d4b574;
}

.crafting-ingredient-owned {
    font-size: 12px;
    color: rgba(191, 191, 191, 0.9);
}

.crafting-ingredient-owned-missing {
    color: #d26a6a;
}

@media (max-width: 700px) {
    .crafting-dialog-content {
        padding: 0;
    }

    .crafting-content-shell {
        padding: 6px;
    }

    .crafting-recipe-row {
        grid-template-columns: 46px 130px minmax(0, 1fr);
        column-gap: 14px;
        row-gap: 8px;
        padding: 10px;
    }

    .crafting-result-name {
        font-size: 15px;
    }
}
</style>
