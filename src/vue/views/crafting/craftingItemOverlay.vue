<template>
    <div
        ref="overlayRootRef"
        class="crafting-item-overlay"
        :style="{
            left: `${x}px`,
            top: `${y}px`,
        }"
        @click="emit('close')"
    >
        <div class="crafting-item-overlay-name">
            <span>{{ displayName }}</span>
            <span v-if="displayQuantity" class="crafting-item-overlay-name-quantity">({{ displayQuantity }})</span>
        </div>

        <div v-if="displayQuality" class="crafting-item-overlay-line">
            {{ t('inventory.quality') }}: {{ displayQuality }}
        </div>

        <div v-if="displayDurabilityCurrent !== null || displayDurabilityMax !== null" class="crafting-item-overlay-line">
            {{ t('inventory.durability') }}: {{ displayDurabilityCurrent ?? '-' }} / {{ displayDurabilityMax ?? '-' }}
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@/i18n'

const props = defineProps({
    itemInfo: {
        type: Object,
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
})

const emit = defineEmits(['close'])
const overlayRootRef = ref<HTMLElement | null>(null)
const { t } = useI18n()

const displayName = computed(() => props.itemInfo?.name ?? t('inventory.unknownItem'))
const displayQuantity = computed(() => {
    const quantity = Number(props.itemInfo?.quantity)
    return Number.isFinite(quantity) && quantity > 0 ? quantity : null
})
const displayQuality = computed(() => {
    const quality = Number(props.itemInfo?.quality)
    return Number.isFinite(quality) && quality > 0 ? quality : null
})
const displayDurabilityCurrent = computed(() => {
    const durability = Number(props.itemInfo?.durability)
    return Number.isFinite(durability) ? durability : null
})
const displayDurabilityMax = computed(() => {
    const durabilityMax = Number(props.itemInfo?.durabilityMax)
    return Number.isFinite(durabilityMax) ? durabilityMax : null
})

defineExpose({
    getBoundingClientRect: () => overlayRootRef.value?.getBoundingClientRect?.(),
})
</script>

<style scoped>
.crafting-item-overlay {
    position: fixed;
    z-index: 1000;
    min-width: 180px;
    max-width: min(320px, calc(100vw - 24px));
    padding: 10px 12px;
    border: 1px solid rgba(216, 196, 156, 0.85);
    border-radius: 8px;
    background: rgba(17, 14, 11, 0.97);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
    color: #f1e3c2;
    pointer-events: auto;
}

.crafting-item-overlay-name {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.25;
}

.crafting-item-overlay-name-quantity {
    margin-left: 6px;
    font-weight: 400;
    color: rgba(241, 227, 194, 0.8);
}

.crafting-item-overlay-line {
    margin-top: 6px;
    font-size: 13px;
    line-height: 1.2;
    color: rgba(241, 227, 194, 0.86);
}
</style>
