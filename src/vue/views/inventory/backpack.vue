<template>
    <div class="inventory-panel">
        <div class="inventory-grid-wrapper">
            <div class="inventory-grid">
                <div
                    v-for="slotIndex in slotCount"
                    :key="slotIndex"
                    class="inventory-item-slot"
                    @pointerdown.prevent="emit('slot-pointerdown', slotIndex - 1, $event)"
                >
                    <template v-if="slotImages[slotIndex - 1]">
                        <img :src="slotImages[slotIndex - 1]" alt="Inventory item" class="inventory-item-image" />
                        <span
                            v-if="getStackCount(slotIndex - 1) !== null"
                            class="stack-count-label"
                        >
                            {{ getStackCount(slotIndex - 1) }}
                        </span>
                        <img
                            v-for="marker in getMarkers(slotIndex - 1)"
                            :key="`inventory-${slotIndex - 1}-${marker}`"
                            :src="getWeaponSetupMarkerImage(marker)"
                            :alt="`${marker} weapon setup marker`"
                            :class="['weapon-setup-marker', `weapon-setup-marker-${marker}`]"
                        />
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
type WeaponMarker = 'primary' | 'secondary'

defineProps<{
    slotCount: number
    slotImages: Array<string | null>
    getMarkers: (index: number) => WeaponMarker[]
    getStackCount: (index: number) => number | null
}>()

const emit = defineEmits(['slot-pointerdown'])

const getWeaponSetupMarkerImage = (setupType: WeaponMarker) => {
    return setupType === 'primary'
        ? '/images/icons/buttons/btn_romanian1.png'
        : '/images/icons/buttons/btn_romanian2.png'
}
</script>

<style scoped>
.inventory-item-slot {
    position: relative;
}

.weapon-setup-marker {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    object-fit: contain;
    pointer-events: none;
    z-index: 2;
}

.weapon-setup-marker-secondary {
    left: 3px;
    transform: translateX(-3px);
}

.stack-count-label {
    position: absolute;
    top: 2px;
    left: 4px;
    font-size: 10px;
    line-height: 1;
    font-weight: 700;
    color: #f4ead2;
    text-shadow:
        -1px 0 0 #000,
        1px 0 0 #000,
        0 -1px 0 #000,
        0 1px 0 #000;
    pointer-events: none;
    z-index: 2;
}
</style>
