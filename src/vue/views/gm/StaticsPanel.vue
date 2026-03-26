<template>
    <div>
        <label class="tree-item" :class="{ selected: selectedObject === 0 }" @click="selectNone()">
            None
        </label>
        <label style='color: red; font-weight: bold' class="tree-item" :class="{ selected: selectedObject === -1 }" @click="selectDelete()">
            Delete
        </label>
    </div>

    <div style="margin-top: 1vh">
        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'FIREPLACE' === selectedObjectType }" @click="selectObjectType('FIREPLACE')">Fireplace</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'FIREPLACE'" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type === 'FIREPLACE')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>
    </div>
</template>

<script setup>
import { GMManager } from '@/gm/GM'
import { ref } from 'vue'

const selectedObjectType = ref("")
const selectedObject = GMManager.selectedStatic

const objects = [
    { type: "FIREPLACE", name: "Fireplace Small", id: 241 },
    { type: "FIREPLACE", name: "Fireplace Large", id: 242 },
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
