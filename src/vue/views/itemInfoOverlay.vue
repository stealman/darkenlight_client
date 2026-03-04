<template>
    <div ref="overlayRootRef" class="inventory-item-overlay"
         :style="{
             left: `${x}px`,
             top: `${y}px`,
             '--inventory-action-btn-size': `${actionButtonSize}px`,
         }"
         @click="onOverlayClick"
    >
        <div class="inventory-item-overlay-name">{{ itemInfo.name }}</div>
        <div class="inventory-item-overlay-id">ID: {{ itemInfo.id }}</div>
        <div class="inventory-item-overlay-qual">Kvalita: {{ itemInfo.quality }}</div>
        <div class="inventory-item-overlay-dur">Stav: {{ itemInfo.durability }} / {{ itemInfo.durabilityMax }}</div>

        <button v-if="shouldShowDropButton" class="action-button inventory-action-button inventory-drop-button" type="button"
            :style="{ backgroundImage: `url('/images/icons/buttons/btn_background.png')` }"
            @pointerdown.prevent.stop
            @click.stop="onDropItemClick">
            <img class="action-icon" src="/images/icons/buttons/btn_drop.png" alt="Drop item" />
        </button>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Item } from '@/data/items/item'

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

const emit = defineEmits(['close', 'drop-item'])
const overlayRootRef = ref(null)

const shouldShowDropButton = computed(() => {
    return props.context === 'INVENTORY' && props.itemInfo.showDropButton === true
})

const onDropItemClick = () => {
    emit('drop-item')
}

const onOverlayClick = (event) => {
    const clickedButton = event?.target?.closest?.('button')
    if (clickedButton) {
        return
    }
    emit('close')
}

defineExpose({
    getBoundingClientRect: () => overlayRootRef.value?.getBoundingClientRect?.(),
})
</script>

<style scoped>

</style>
