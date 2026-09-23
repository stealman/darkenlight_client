<template>
    <div>
        <label class="tree-item" :class="{ selected: selectedObject === 0 }" @click="selectNone()">
            None
        </label>
        <label style='color: red; font-weight: bold' class="tree-item" :class="{ selected: selectedObject === -1 }" @click="selectDelete()">
            Delete
        </label>
    </div>

    <!-- WALLS AND FENCES -->
    <div style="margin-top: 1vh">
        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'WALL2' === selectedObjectType }" @click="selectObjectType('WALL2')">Wall 2</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'WALL2'" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type ==='WALL2')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'WALL3' === selectedObjectType }" @click="selectObjectType('WALL3')">Wall 3</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'WALL3'" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type ==='WALL3')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>
    </div>
</template>

<script setup>

import { GMManager } from '@/gm/GM'
import { ref, onMounted } from 'vue'

// Biome edit constants
const selectedObjectType = ref("")
const selectedObject = GMManager.selectedWallFence

const objects = [
    { type: "WALL2", name: "Wall2_GRAY", id: 201 },
    { type: "WALL2", name: "Wall2_RED", id: 202 },

    { type: "WALL3", name: "Wall3_GRAY", id: 221 },
    { type: "WALL3", name: "Wall3_RED", id: 222 },
]

const selectObjectType = (type) => {
    selectedObjectType.value = type

    const firstObject = objects.find(s => s.type === type)
    if (firstObject) {
        selectedObject.value = firstObject.id
    }
}

const selectObject = (id) => {
    selectedObject.value = parseInt(id)
}

const selectNone = () => {
    selectedObject.value = 0
    selectedObjectType.value = ""
}

const selectDelete = () => {
    selectedObject.value = -1
    selectedObjectType.value = ""
}
</script>
