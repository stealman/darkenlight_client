<template>
    <div>
        <label class="tree-item" :class="{ selected: selectedBuildingType === 0 }" @click="selectNone">
            None
        </label>
        <label
            class="tree-item"
            style="color: deepskyblue; font-weight: bold"
            :class="{ selected: selectedBuildingType === -2 }"
            @click="selectEdit"
        >
            Edit
        </label>
        <label
            class="tree-item"
            style="color: red; font-weight: bold"
            :class="{ selected: selectedBuildingType === -1 }"
            @click="selectDelete"
        >
            Delete
        </label>
    </div>

    <div style="margin-top: 1vh">
        <label class="tree-item" :class="{ selected: selectedBuildingType === 1 }" @click="selectBuilding(1)">
            Human House 5x3
        </label>
        <label v-if="selectedBuildingType === 1">
            Door facing
            <select v-model="buildingFacing">
                <option value="+Z">+Z</option>
                <option value="-Z">-Z</option>
                <option value="+X">+X</option>
                <option value="-X">-X</option>
            </select>
        </label>
        <label class="tree-item" :class="{ selected: selectedBuildingType === 2 }" @click="selectBuilding(2)">
            Shed
        </label>
        <div v-if="selectedBuildingType === 2" style="display: flex; gap: 6px; align-items: center">
            <label>
                Width
                <input v-model.number="buildingWidth" type="number" min="2" step="1">
            </label>
            <label>
                Depth
                <input v-model.number="buildingDepth" type="number" min="2" step="1">
            </label>
        </div>
        <div v-if="selectedBuildingType === 2" style="margin-top: 4px">
            <label>
                Higher side
                <select v-model="shedHighSide">
                    <option value="+Z">+Z</option>
                    <option value="-Z">-Z</option>
                    <option value="+X">+X</option>
                    <option value="-X">-X</option>
                </select>
            </label>
        </div>
        <div v-if="selectedBuildingType === 2" style="display: grid; grid-template-columns: repeat(2, auto); gap: 4px 8px; margin-top: 4px">
            <label v-for="side in ['-X', '+X', '-Z', '+Z']" :key="side">
                {{ side }} fill
                <select v-model="shedSideFills[side]">
                    <option value="">None</option>
                    <option value="CAMP_FENCE">Camp fence</option>
                </select>
            </label>
        </div>
        <label class="tree-item" :class="{ selected: selectedBuildingType === 3 }" @click="selectBuilding(3)">
            Stone Mausoleum 4x4
        </label>
        <label v-if="selectedBuildingType === 3">
            Entrance facing
            <select v-model="buildingFacing">
                <option value="+Z">+Z</option>
                <option value="-Z">-Z</option>
                <option value="+X">+X</option>
                <option value="-X">-X</option>
            </select>
        </label>
        <div v-if="isEditing" style="margin-top: 1vh; display: flex; gap: 6px">
            <button @click="saveEdit">Save</button>
            <button @click="cancelEdit">Cancel</button>
        </div>
    </div>
</template>

<script setup>
import { GMManager } from '@/gm/GM'
import { computed } from 'vue'

const selectedBuildingType = GMManager.selectedBuildingType
const buildingFacing = GMManager.buildingFacing
const buildingWidth = GMManager.buildingWidth
const buildingDepth = GMManager.buildingDepth
const shedHighSide = GMManager.shedHighSide
const shedSideFills = GMManager.shedSideFills
const isEditing = computed(() => GMManager.editingBuilding.value !== null)

const selectNone = () => {
    GMManager.cancelBuildingEdit()
    selectedBuildingType.value = 0
}

const selectEdit = () => {
    GMManager.cancelBuildingEdit()
    selectedBuildingType.value = -2
}

const selectDelete = () => {
    GMManager.cancelBuildingEdit()
    selectedBuildingType.value = -1
}

const selectBuilding = (type) => {
    if (isEditing.value) return
    selectedBuildingType.value = type
}

const saveEdit = () => GMManager.saveBuildingEdit()
const cancelEdit = () => GMManager.cancelBuildingEdit()
</script>
