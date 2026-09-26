<template>
    <div
        ref="overlayRootRef"
        class="inventory-item-overlay"
        :class="{
            'inventory-item-overlay--equipment': equipmentCategoryLabel || itemInfo.armorStats,
        }"
        :style="{
            left: `${x}px`,
            top: `${y}px`,
            '--inventory-action-btn-size': `${actionButtonSize}px`,
        }"
        @click="onOverlayClick"
    >
        <div class="inventory-item-overlay-name">
            <span class="inventory-item-overlay-name-text ui-text-gradient">{{ displayItemName }}</span>
            <span v-if="displayItemQuantity" class="inventory-item-overlay-name-quantity">({{ displayItemQuantity }})</span>
        </div>

        <div v-if="itemInfo.quality || equipmentCategoryLabel" class="inventory-item-overlay-status-row">
            <div v-if="itemInfo.quality" :class="['inventory-item-overlay-dur', durabilityStatusClass]">{{ t('inventory.durability') }}: <strong>{{ itemInfo.durabilityDisplay ?? `${itemInfo.durability} / ${itemInfo.durabilityMax}` }}</strong></div>
            <span v-if="equipmentCategoryLabel" class="inventory-item-overlay-weapon-category">{{ equipmentCategoryLabel }}</span>
        </div>

        <div v-if="itemInfo.weaponAttack !== null" class="inventory-item-overlay-stats">
            <span
                >{{ t('vendor.attack') }} <strong class="ui-text-gradient">{{ itemInfo.weaponAttack }}</strong></span
            >
            <span
                >{{ t('vendor.attackType') }} <strong class="ui-text-gradient">{{ formatDamageTypes(itemInfo.weaponDamageTypes) }}</strong></span
            >
            <span
                >{{ t('vendor.speed') }} <strong class="ui-text-gradient">{{ formatSpeed(itemInfo.weaponSpeed) }}</strong></span
            >
            <span
                >{{ t('vendor.range') }} <strong class="ui-text-gradient">{{ itemInfo.weaponRange }}</strong></span
            >
            <span v-if="isNonZero(itemInfo.weaponArmorPen)"
                >{{ t('inventory.armorPenetration') }} <strong class="ui-text-gradient">{{ itemInfo.weaponArmorPen }}</strong></span
            >
            <span v-if="isNonZero(itemInfo.weaponDefense)"
                >{{ t('inventory.defense') }} <strong class="ui-text-gradient">{{ formatModifier(itemInfo.weaponDefense) }}</strong></span
            >
        </div>

        <div v-if="itemInfo.armorStats" class="inventory-item-overlay-stats">
            <span
                >{{ t('inventory.armor') }} <strong class="ui-text-gradient">{{ itemInfo.armorStats.pdef }}</strong></span
            >
            <span
                >{{ t('inventory.magicInterference') }} <strong class="ui-text-gradient">{{ itemInfo.armorStats.arcaneInterference }}%</strong></span
            >
            <span v-if="isNonZero(itemInfo.armorStats.defense)"
                >{{ t('inventory.defense') }} <strong class="ui-text-gradient">{{ formatModifier(itemInfo.armorStats.defense) }}</strong></span
            >
            <span v-if="isNonZero(itemInfo.armorStats.str)"
                >{{ t('character.strength') }} <strong class="ui-text-gradient">{{ formatModifier(itemInfo.armorStats.str) }}</strong></span
            >
            <span v-if="isNonZero(itemInfo.armorStats.agi)"
                >{{ t('character.agility') }} <strong class="ui-text-gradient">{{ formatModifier(itemInfo.armorStats.agi) }}</strong></span
            >
            <span v-if="isNonZero(itemInfo.armorStats.int)"
                >{{ t('character.intelligence') }} <strong class="ui-text-gradient">{{ formatModifier(itemInfo.armorStats.int) }}</strong></span
            >
            <span v-if="isNonZero(itemInfo.armorStats.wis)"
                >{{ t('character.wisdom') }} <strong class="ui-text-gradient">{{ formatModifier(itemInfo.armorStats.wis) }}</strong></span
            >
            <span v-if="isNonZero(itemInfo.armorStats.maxHp)"
                >{{ t('inventory.maxHealth') }} <strong class="ui-text-gradient">{{ formatModifier(itemInfo.armorStats.maxHp) }}</strong></span
            >
        </div>

        <div v-if="hasVisibleActions" class="inventory-item-overlay-interactive inventory-item-overlay-actions">
            <button
                v-if="shouldShowDropButton"
                class="action-button inventory-action-button inventory-drop-button"
                type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onDropItemClick"
            >
                <img class="action-icon" src="/images/icons/buttons/btn_drop.png" :alt="t('inventory.dropItem')" />
            </button>

            <button
                v-if="shouldShowSplitButton"
                class="action-button inventory-action-button inventory-split-button"
                type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onSplitItemClick"
            >
                <img class="action-icon" src="/images/icons/buttons/btn_split.png" :alt="t('inventory.splitItem')" />
            </button>

            <button
                v-if="shouldShowMergeButton"
                class="action-button inventory-action-button inventory-merge-button"
                type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onMergeItemClick"
            >
                <img class="action-icon" src="/images/icons/buttons/btn_stack.png" :alt="t('inventory.mergeItem')" />
            </button>

            <button
                v-if="shouldShowCampButton"
                class="action-button inventory-action-button inventory-camp-button"
                type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onCreateCampClick"
            >
                <img class="action-icon" src="/images/icons/buttons/btn_camp.png" alt="Create camp" />
            </button>

            <button
                v-if="shouldShowBindButton"
                class="action-button inventory-action-button inventory-text-action-button"
                type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onBindConsumableClick"
            >
                <img class="action-icon" src="/images/icons/buttons/btn_keybind.png" />
            </button>

            <button
                v-if="showSplitControls"
                class="action-button inventory-action-button inventory-text-action-button"
                type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onSplitConfirmClick"
            >
                <img class="action-icon" src="/images/icons/buttons/btn_ok.png" :alt="t('inventory.confirmSplit')" />
            </button>

            <button
                v-if="showSplitControls"
                class="action-button inventory-action-button inventory-text-action-button"
                type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onSplitCancelClick"
            >
                <img class="action-icon" src="/images/icons/buttons/btn_stop.png" :alt="t('inventory.cancelSplit')" />
            </button>
        </div>

        <div v-if="showSplitControls" class="inventory-item-overlay-interactive inventory-item-overlay-split-panel">
            <div class="inventory-item-overlay-split-controls">
                <span class="inventory-item-overlay-split-value">{{ splitMinQuantity }}</span>
                <input
                    v-model.number="splitQuantity"
                    class="range-slider inventory-item-overlay-split-slider"
                    type="range"
                    :min="splitMinQuantity"
                    :max="splitMaxQuantity"
                    :step="splitStep"
                    style="zoom: 1.5"
                    @pointerdown.stop
                    @click.stop
                    @input="onSplitSliderInput"
                />
                <span class="inventory-item-overlay-split-value">{{ splitMaxQuantity }}</span>
            </div>
            <div class="inventory-item-overlay-split-current">{{ splitQuantity }}</div>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { AudioManager } from '@/babylon/audio/audioManager'
import { useI18n } from '@/i18n'
import {getArmorCategoryLabel, getWeaponCategoryLabel} from '@/vue/views/inventory/itemTooltip'

const props = defineProps({
    itemInfo: {
        type: Object,
        required: true,
    },
    context: {
        type: String,
        required: true,
    },
    x: {
        type: Number,
        required: true,
    },
    y: {
        type: Number,
        required: true,
    },
    actionButtonSize: {
        type: Number,
        required: true,
    },
})

const emit = defineEmits(['close', 'drop-item', 'split-item', 'merge-item', 'create-camp', 'bind-consumable', 'content-resized'])
const overlayRootRef = ref(null)
const showSplitControls = ref(false)
const { t } = useI18n()
const damageTypeLabels = { PHYSICAL_SLASH: 'vendor.damageSlash', PHYSICAL_PIERCE: 'vendor.damagePierce', PHYSICAL_BLUNT: 'vendor.damageBlunt' }

const formatDamageTypes = (damageTypes) => {
    const values = Array.isArray(damageTypes) ? damageTypes : []
    return values.length ? values.map((type) => t(damageTypeLabels[type] ?? type)).join(' / ') : '-'
}

const formatSpeed = (speed) => {
    const milliseconds = Number(speed)
    return Number.isFinite(milliseconds) ? `${(milliseconds / 1000).toFixed(2)}s` : '-'
}

const isNonZero = (value) => Number(value) !== 0

const formatModifier = (value) => {
    const number = Number(value)
    return `${number > 0 ? '+' : ''}${number}`
}

const durabilityStatusClass = computed(() => {
    const value = props.itemInfo?.durability
    if (value === null || value === undefined || value === '') {
        return props.itemInfo?.durabilityDisplay ? 'item-durability--worn' : ''
    }

    const durability = Number(value)
    if (!Number.isFinite(durability)) {
        return ''
    }
    if (durability < 5) return 'item-durability--critical'
    if (durability < 15) return 'item-durability--danger'
    if (durability < 25) return 'item-durability--warning'
    return 'item-durability--worn'
})

const shouldShowDropButton = computed(() => {
    return props.itemInfo.showDropButton === true && !showSplitControls.value
})

const displayItemName = computed(() => {
    return props.itemInfo?.name ?? t('inventory.unknownItem')
})

const displayItemQuantity = computed(() => {
    const quantity = Number(props.itemInfo?.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return null
    }
    return quantity
})

const weaponCategoryLabel = computed(() => {
    return getWeaponCategoryLabel(props.itemInfo?.weaponCategory)
})
const armorCategoryLabel = computed(() => {
    return getArmorCategoryLabel(props.itemInfo?.armorCategory)
})
const equipmentCategoryLabel = computed(() => weaponCategoryLabel.value || armorCategoryLabel.value)

const splitMaxQuantity = computed(() => {
    const quantity = Number(props.itemInfo.quantity)
    if (!Number.isFinite(quantity) || quantity <= 1) {
        return 0
    }
    return quantity - 1
})

const canSplitItem = computed(() => {
    return (props.itemInfo.showDropButton === true || props.itemInfo.showSplitButton === true) && splitMaxQuantity.value >= 1
})

const shouldShowSplitButton = computed(() => {
    return canSplitItem.value && !showSplitControls.value
})

const shouldShowMergeButton = computed(() => {
    return props.itemInfo.showMergeButton === true && !showSplitControls.value
})

const shouldShowCampButton = computed(() => {
    return props.itemInfo.showCampButton === true && !showSplitControls.value
})

const shouldShowBindButton = computed(() => {
    return props.itemInfo.showBindButton === true && !showSplitControls.value
})

const hasVisibleActions = computed(() => {
    return shouldShowDropButton.value
        || shouldShowSplitButton.value
        || shouldShowMergeButton.value
        || shouldShowCampButton.value
        || shouldShowBindButton.value
        || showSplitControls.value
})

const splitStep = computed(() => {
    const quantity = Number(props.itemInfo.quantity)
    if (!Number.isFinite(quantity) || quantity <= 100) {
        return 1
    }
    if (quantity <= 1000) {
        return 5
    }
    return 25
})

const splitMinQuantity = computed(() => {
    return splitStep.value
})

const splitQuantity = ref(splitMinQuantity.value)
const lastSplitSliderTickAt = ref(0)

const resetSplitControls = () => {
    showSplitControls.value = false
    splitQuantity.value = splitMinQuantity.value
}

const onDropItemClick = () => {
    emit('drop-item')
}

const onSplitItemClick = () => {
    if (!shouldShowSplitButton.value) {
        return
    }
    AudioManager.playGuiButtonClick()
    showSplitControls.value = !showSplitControls.value
    if (splitQuantity.value < splitMinQuantity.value) {
        splitQuantity.value = splitMinQuantity.value
    }
    if (splitQuantity.value > splitMaxQuantity.value) {
        splitQuantity.value = splitMaxQuantity.value
    }
}

const onMergeItemClick = () => {
    const itemId = Number(props.itemInfo.id)
    if (!Number.isFinite(itemId)) {
        return
    }
    AudioManager.playGuiButtonClick()
    emit('merge-item', { itemId })
    emit('close')
}

const onSplitConfirmClick = () => {
    const itemId = Number(props.itemInfo.id)
    if (!Number.isFinite(itemId)) {
        return
    }
    AudioManager.playGuiButtonClick()
    emit('split-item', { itemId, splitCount: splitQuantity.value })
    resetSplitControls()
    emit('close')
}

const onCreateCampClick = () => {
    AudioManager.playGuiButtonClick()
    emit('create-camp')
    emit('close')
}

const onBindConsumableClick = () => {
    AudioManager.playGuiButtonClick()
    emit('bind-consumable')
    emit('close')
}

const onSplitCancelClick = () => {
    AudioManager.playGuiButtonClick()
    resetSplitControls()
    emit('close')
}

const onSplitSliderInput = () => {
    const now = Date.now()
    if (now - lastSplitSliderTickAt.value < 100) {
        return
    }
    lastSplitSliderTickAt.value = now
    AudioManager.playGuiTick()
}

const onOverlayClick = (event) => {
    const clickedControl = event?.target?.closest?.('button, input, select, textarea, a, [role="button"]')
    if (clickedControl) {
        return
    }
    emit('close')
}

watch(
    () => [props.itemInfo.id, props.itemInfo.quantity],
    () => {
        resetSplitControls()
    },
)

watch(canSplitItem, (canSplit) => {
    if (!canSplit) {
        resetSplitControls()
    }
})

watch(showSplitControls, () => {
    nextTick(() => {
        emit('content-resized')
    })
})

defineExpose({
    getBoundingClientRect: () => overlayRootRef.value?.getBoundingClientRect?.(),
})
</script>

<style scoped></style>
