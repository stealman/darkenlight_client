<template>
    <section class="inventory-skin-preview">
        <div v-if="storage" class="inventory-skin-preview-storage">
            <div v-for="(title, column) in ['Inventář', 'Úložiště · 8/24']" :key="title">
                <p>{{ title }}</p>
                <Backpack :slot-count="slotCount" :column-count="4" :slot-images="images" :get-markers="noMarkers" :get-stack-count="stackCount" :get-durability-status="durability" :get-durability-percent="durabilityPercent" :tooltip-active-slot-index="selectedColumn === column ? selected : null" @slot-pointerdown="index => select(index, column)" />
            </div>
        </div>
        <div v-else class="inventory-layout inventory-skin-preview-layout">
            <EquipSet :equip-slots="equipSlots" :show-weapon-setups="false" />
            <Backpack :slot-count="slotCount" :column-count="6" :slot-images="images" :get-markers="noMarkers" :get-stack-count="stackCount" :get-durability-status="durability" :get-durability-percent="durabilityPercent" :tooltip-active-slot-index="selected" @slot-pointerdown="index => select(index, 0)" />
        </div>
        <div v-if="selected !== null && images[selected]" class="inventory-item-overlay inventory-skin-preview-tooltip">
            <div class="inventory-item-overlay-name">Náhled předmětu</div>
            <div class="inventory-item-overlay-dur item-durability--warning">Stav: 35 %</div>
            <button class="dialog-button" @click="selected = null"><span class="ui-text-gradient--button-state">Zavřít detail</span></button>
        </div>
    </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Backpack from '../vue/views/inventory/backpack.vue'
import EquipSet from '../vue/views/inventory/equipSet.vue'
import { getEquipSetNecklaceSvg, getEquipSetArmsSvg, getEquipSetHandSvg, getEquipSetLegsSvg, getEquipSetArmorSvg, getEquipSetRingSvg } from '../vue/icons/icons'
defineProps<{ storage: boolean, slotCount: number }>()
const selected = ref<number | null>(null)
const selectedColumn = ref(0)
const images = [
    '/images/items/armor/adamantium-plate-helmet.png',
    '/images/items/weapons/geonite-broadsword.png',
    '/images/items/resources/bandage.png',
    '/images/items/resources/wool.png',
    '/images/items/armor/adamantium-plate-armor.png',
    '/images/items/resources/steak.png',
    '/images/items/resources/cloth.png',
    '/images/items/resources/leather_pouch.png',
]
const noMarkers = () => []
const stackCount = (index: number) => index === 2 ? 12 : null
const durability = (index: number) => index === 0 ? 'warning' : index === 1 ? 'danger' : index === 4 ? 'critical' : null
const durabilityPercent = (index: number) => index === 0 ? 35 : index === 1 ? 15 : index === 4 ? 5 : null
const select = (index: number, column: number) => { selected.value = index; selectedColumn.value = column }
const equipSlots = [
    { key: 'head', className: 'slot-helmet', image: images[0], emptyHtml: '', markers: [], durabilityStatus: null, durabilityPercent: null },
    { key: 'neck', className: 'slot-necklace', image: null, emptyHtml: getEquipSetNecklaceSvg('icon-equipset icon-equipset-slot', 'preview-neck'), markers: [], durabilityStatus: null, durabilityPercent: null },
    { key: 'arms', className: 'slot-arms-armor', image: null, emptyHtml: getEquipSetArmsSvg('icon-equipset icon-equipset-slot', 'preview-arms'), markers: [], durabilityStatus: null, durabilityPercent: null },
    { key: 'body', className: 'slot-body', image: null, emptyHtml: getEquipSetArmorSvg('icon-equipset icon-equipset-slot', 'preview-body'), markers: [], durabilityStatus: null, durabilityPercent: null },
    { key: 'ring', className: 'slot-left-ring', image: null, emptyHtml: getEquipSetRingSvg('icon-equipset icon-equipset-slot', 'preview-ring'), markers: [], durabilityStatus: null, durabilityPercent: null },
    { key: 'ring2', className: 'slot-right-ring', image: null, emptyHtml: getEquipSetRingSvg('icon-equipset icon-equipset-slot', 'preview-ring2'), markers: [], durabilityStatus: null, durabilityPercent: null },
    { key: 'left', className: 'slot-left-hand', image: null, emptyHtml: getEquipSetHandSvg('icon-equipset icon-equipset-slot', 'preview-left'), markers: [], durabilityStatus: null, durabilityPercent: null },
    { key: 'right', className: 'slot-right-hand', image: images[1], emptyHtml: '', markers: [], durabilityStatus: null, durabilityPercent: null },
    { key: 'legs', className: 'slot-legs', image: null, emptyHtml: getEquipSetLegsSvg('icon-equipset icon-equipset-slot', 'preview-legs'), markers: [], durabilityStatus: null, durabilityPercent: null },
]
</script>

<style>
.inventory-skin-preview { position: relative; padding: 8px; }
.inventory-layout.inventory-skin-preview-layout { height: 340px; }
.inventory-skin-preview-storage { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.inventory-skin-preview-storage > div { min-width: 0; }
.inventory-skin-preview-storage .inventory-panel { width: 100%; padding: 0; height: 340px; }
.inventory-skin-preview-storage .inventory-grid-wrapper { height: 100%; aspect-ratio: auto; }
.inventory-skin-preview-storage .inventory-grid { height: 100%; }
.inventory-skin-preview-tooltip { position: absolute; inset: 50px 12px auto auto; z-index: 5; }
</style>
