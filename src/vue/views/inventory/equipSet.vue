<template>
    <div class="equipment-panel">
        <div class="equipment-layout">
            <div
                v-for="slot in equipSlots"
                :key="slot.key"
                :class="['equip-slot', slot.className, slot.durabilityStatus ? `item-durability--${slot.durabilityStatus}` : null]"
                @pointerdown="emit('slot-pointerdown', slot.key, $event)"
            >
                <div v-if="!slot.image" v-html="slot.emptyHtml"></div>
                <template v-if="slot.image">
                    <img :src="slot.image" :alt="`${slot.key} item`" class="equip-item-image" />
                    <span
                        v-if="slot.durabilityStatus"
                        class="item-durability-indicator"
                        :style="{ width: `${slot.durabilityPercent}%` }"
                    ></span>
                    <img
                        v-for="marker in slot.markers"
                        :key="`${slot.key}-${marker}`"
                        :src="getWeaponSetupMarkerImage(marker)"
                        :alt="`${marker} weapon setup marker`"
                        :class="['weapon-setup-marker', `weapon-setup-marker-${marker}`]"
                    />
                </template>
            </div>

            <div
                :class="['equip-slot', 'equip-slot-weapon-setup', 'slot-weapon-setup-primary', { pressed: weaponSetupPressed.primary }]"
                @mouseenter="emit('weapon-setup-hover', 'primary', true)"
                @mouseleave="emit('weapon-setup-hover', 'primary', false)"
                @pointerdown.prevent="emit('weapon-setup-pointerdown', 'primary', $event)"
                @pointerup.prevent="emit('weapon-setup-pointerup', 'primary', $event)"
                @pointercancel.prevent="emit('weapon-setup-pointercancel', 'primary')"
                @pointerleave.prevent="emit('weapon-setup-pointercancel', 'primary')"
            >
                <img :src="weaponSetupImages.primary" alt="Primary weapon setup" class="equip-item-image weapon-setup-image" />
            </div>

            <div
                :class="['equip-slot', 'equip-slot-weapon-setup', 'slot-weapon-setup-secondary', { pressed: weaponSetupPressed.secondary }]"
                @mouseenter="emit('weapon-setup-hover', 'secondary', true)"
                @mouseleave="emit('weapon-setup-hover', 'secondary', false)"
                @pointerdown.prevent="emit('weapon-setup-pointerdown', 'secondary', $event)"
                @pointerup.prevent="emit('weapon-setup-pointerup', 'secondary', $event)"
                @pointercancel.prevent="emit('weapon-setup-pointercancel', 'secondary')"
                @pointerleave.prevent="emit('weapon-setup-pointercancel', 'secondary')"
            >
                <img :src="weaponSetupImages.secondary" alt="Secondary weapon setup" class="equip-item-image weapon-setup-image" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
type WeaponSetupType = 'primary' | 'secondary'
type WeaponMarker = WeaponSetupType

type EquipSlotView = {
    key: string
    className: string
    image: string | null
    emptyHtml: string
    markers: WeaponMarker[]
    durabilityStatus: string | null
    durabilityPercent: number | null
}

defineProps<{
    equipSlots: EquipSlotView[]
    weaponSetupImages: Record<WeaponSetupType, string>
    weaponSetupPressed: Record<WeaponSetupType, boolean>
}>()

const emit = defineEmits([
    'slot-pointerdown',
    'weapon-setup-hover',
    'weapon-setup-pointerdown',
    'weapon-setup-pointerup',
    'weapon-setup-pointercancel',
])

const getWeaponSetupMarkerImage = (setupType: WeaponMarker) => {
    return setupType === 'primary'
        ? '/images/icons/buttons/btn_romanian1.png'
        : '/images/icons/buttons/btn_romanian2.png'
}
</script>

<style scoped>
.equip-slot-weapon-setup {
    width: calc(var(--slot-size-factor) * 65%);
}

.weapon-setup-image {
    transition: none;
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

.slot-weapon-setup-primary {
    left: -3%;
    top: 37.5%;
}

.slot-weapon-setup-secondary {
    right: -3%;
    top: 37.5%;
}
</style>
