<template>
    <div class="inventory-panel">
        <div class="inventory-grid-wrapper" @scroll="emit('scroll')">
            <div class="inventory-grid" :style="{'--inventory-grid-columns': columnCount}">
                <div
                    v-for="slotIndex in slotCount"
                    :key="slotIndex"
                    :class="[
                        'inventory-item-slot',
                        getDurabilityStatus(slotIndex - 1) ? `item-durability--${getDurabilityStatus(slotIndex - 1)}` : null,
                    ]"
                    @pointerdown="onSlotPointerDown(slotIndex - 1, $event)"
                    @pointermove="onSlotPointerMove($event)"
                    @pointerup="onSlotPointerUp(slotIndex - 1, $event)"
                    @pointercancel="cancelSlotPointer"
                >
                    <template v-if="slotImages[slotIndex - 1]">
                        <img :src="slotImages[slotIndex - 1]" alt="Inventory item" class="inventory-item-image" draggable="false" />
                        <span
                            v-if="getDurabilityStatus(slotIndex - 1)"
                            class="item-durability-indicator"
                            :style="{ width: `${getDurabilityPercent(slotIndex - 1)}%` }"
                        ></span>
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
    columnCount?: number
    slotImages: Array<string | null>
    getMarkers: (index: number) => WeaponMarker[]
    getStackCount: (index: number) => number | null
    getDurabilityStatus: (index: number) => string | null
    getDurabilityPercent: (index: number) => number | null
}>()

const TAP_MOVE_TOLERANCE = 8

const emit = defineEmits(['slot-pointerdown', 'scroll'])

let activePointerId: number | null = null
let activeSlotIndex: number | null = null
let touchStartX = 0
let touchStartY = 0
let touchMoved = false

const onSlotPointerDown = (slotIndex: number, event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
        emit('slot-pointerdown', slotIndex, event)
        return
    }

    activePointerId = event.pointerId
    activeSlotIndex = slotIndex
    touchStartX = event.clientX
    touchStartY = event.clientY
    touchMoved = false
}

const onSlotPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== activePointerId || touchMoved) {
        return
    }

    const movedX = event.clientX - touchStartX
    const movedY = event.clientY - touchStartY
    if (Math.hypot(movedX, movedY) < TAP_MOVE_TOLERANCE) {
        return
    }

    touchMoved = true
    emit('scroll')
}

const onSlotPointerUp = (slotIndex: number, event: PointerEvent) => {
    const isTap = event.pointerId === activePointerId
        && activeSlotIndex === slotIndex
        && !touchMoved

    cancelSlotPointer()
    if (!isTap) {
        return
    }

    event.preventDefault()
    emit('slot-pointerdown', slotIndex, event)
}

const cancelSlotPointer = () => {
    activePointerId = null
    activeSlotIndex = null
    touchMoved = false
}

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
