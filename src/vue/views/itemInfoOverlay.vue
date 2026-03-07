<template>
    <div ref="overlayRootRef" class="inventory-item-overlay"
         :style="{
             left: `${x}px`,
             top: `${y}px`,
             '--inventory-action-btn-size': `${actionButtonSize}px`,
         }"
         @click="onOverlayClick"
    >
        <div class="inventory-item-overlay-name">
            <span>{{ displayItemName }}</span>
            <span v-if="displayItemQuantity" class="inventory-item-overlay-name-quantity">({{ displayItemQuantity }})</span>
        </div>

        <template v-if="itemInfo.quality">
            <div class="inventory-item-overlay-qual">Kvalita: {{ itemInfo.quality }}</div>
            <div class="inventory-item-overlay-dur">Stav: {{ itemInfo.durability }} / {{ itemInfo.durabilityMax }}</div>
        </template>

        <div class="inventory-item-overlay-interactive inventory-item-overlay-actions">
            <button v-if="shouldShowDropButton" class="action-button inventory-action-button inventory-drop-button" type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onDropItemClick">
                <img class="action-icon" src="/images/icons/buttons/btn_drop.png" alt="Drop item" />
            </button>

            <button v-if="shouldShowSplitButton" class="action-button inventory-action-button inventory-split-button" type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onSplitItemClick">
                <img class="action-icon" src="/images/icons/buttons/btn_split.png" alt="Split item" />
            </button>

            <button v-if="shouldShowMergeButton" class="action-button inventory-action-button inventory-merge-button" type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onMergeItemClick">
                <img class="action-icon" src="/images/icons/buttons/btn_stack.png" alt="Merge item" />
            </button>

            <button v-if="showSplitControls" class="action-button inventory-action-button inventory-text-action-button" type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onSplitConfirmClick">
                <img class="action-icon" src="/images/icons/buttons/btn_ok.png" alt="Split item" />
            </button>

            <button v-if="showSplitControls" class="action-button inventory-action-button inventory-text-action-button" type="button"
                :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
                @pointerdown.prevent.stop
                @click.stop="onSplitCancelClick">
                <img class="action-icon" src="/images/icons/buttons/btn_stop.png" alt="Split item" />
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
                    style="zoom: 1.5;"
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

const emit = defineEmits(['close', 'drop-item', 'split-item', 'merge-item', 'content-resized'])
const overlayRootRef = ref(null)
const showSplitControls = ref(false)

const shouldShowDropButton = computed(() => {
    return props.context === 'INVENTORY' && props.itemInfo.showDropButton === true && !showSplitControls.value
})

const displayItemName = computed(() => {
    return props.itemInfo?.name ?? 'Unknown item'
})

const displayItemQuantity = computed(() => {
    const quantity = Number(props.itemInfo?.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return null
    }
    return quantity
})

const splitMaxQuantity = computed(() => {
    const quantity = Number(props.itemInfo.quantity)
    if (!Number.isFinite(quantity) || quantity <= 1) {
        return 1
    }
    return quantity - 1
})

const canSplitItem = computed(() => {
    return props.context === 'INVENTORY'
        && props.itemInfo.showDropButton === true
        && splitMaxQuantity.value > 1
})

const shouldShowSplitButton = computed(() => {
    return canSplitItem.value && !showSplitControls.value
})

const shouldShowMergeButton = computed(() => {
    return props.context === 'INVENTORY'
        && props.itemInfo.showMergeButton === true
        && !showSplitControls.value
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

const onSplitCancelClick = () => {
    AudioManager.playGuiButtonClick()
    resetSplitControls()
    emit('close')
}

const onSplitSliderInput = () => {
    const now = Date.now()
    if ((now - lastSplitSliderTickAt.value) < 100) {
        return
    }
    lastSplitSliderTickAt.value = now
    AudioManager.playGuiTick()
}

const onOverlayClick = (event) => {
    const clickedInteractiveElement = event?.target?.closest?.('.inventory-item-overlay-interactive')
    if (clickedInteractiveElement) {
        return
    }
    const clickedButton = event?.target?.closest?.('button')
    if (clickedButton) {
        return
    }
    emit('close')
}

watch(
    () => [props.itemInfo.id, props.itemInfo.quantity],
    () => {
        resetSplitControls()
    }
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

<style scoped>


</style>
