<template>
    <div>
        <label class="tree-item" :class="{ selected: selectedBuildingType === 0 }" @click="selectNone">
            None
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
    </div>
</template>

<script setup>
import { GMManager } from '@/gm/GM'

const selectedBuildingType = GMManager.selectedBuildingType
const buildingFacing = GMManager.buildingFacing

const selectNone = () => {
    selectedBuildingType.value = 0
}

const selectDelete = () => {
    selectedBuildingType.value = -1
}

const selectBuilding = (type) => {
    selectedBuildingType.value = type
}
</script>
