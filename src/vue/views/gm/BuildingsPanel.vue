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
