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

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'ENTRANCE' === selectedObjectType }" @click="selectObjectType('ENTRANCE')">Entrance</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'ENTRANCE'" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type === 'ENTRANCE')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'TORCH' === selectedObjectType }" @click="selectObjectType('TORCH')">Torch</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'TORCH'" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type === 'TORCH')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div v-if="selectedObjectType === 'TORCH'" style="margin-top: 1vh">
            <label>Wall direction</label>
            &nbsp;&nbsp;
            <select v-model="torchFacing">
                <option value="-X">-X</option>
                <option value="+X">+X</option>
                <option value="-Z">-Z</option>
                <option value="+Z">+Z</option>
            </select>
            &nbsp;&nbsp;
            <label>Height above floor</label>
            &nbsp;&nbsp;
            <input v-model.number="torchMountHeight" type="number" min="-10" max="10" step="0.1">
        </div>

        <div v-if="selectedObjectType === 'ENTRANCE'" style="margin-top: 1vh; display: grid; gap: 6px">
            <label>Wall direction
                <select v-model="entranceFacing">
                    <option value="-X">-X</option>
                    <option value="+X">+X</option>
                    <option value="-Z">-Z</option>
                    <option value="+Z">+Z</option>
                </select>
            </label>
            <label>Destination world
                <select v-model.number="entranceDestinationWorld">
                    <option v-for="world in teleportWorlds" :key="world.id" :value="world.id">{{ world.name }} ({{ world.id }})</option>
                </select>
            </label>
            <label>Destination X <input v-model.number="entranceDestinationX" type="number" step="1"></label>
            <label>Destination Z <input v-model.number="entranceDestinationZ" type="number" step="1"></label>
        </div>
    </div>
</template>

<script setup>
import { GMManager } from '@/gm/GM'
import { computed, ref } from 'vue'

const selectedObjectType = ref("")
const selectedObject = GMManager.selectedStatic
const torchFacing = GMManager.torchFacing
const torchMountHeight = GMManager.torchMountHeight
const entranceFacing = GMManager.entranceFacing
const entranceDestinationWorld = GMManager.entranceDestinationWorld
const entranceDestinationX = GMManager.entranceDestinationX
const entranceDestinationZ = GMManager.entranceDestinationZ
const teleportWorlds = computed(() => GMManager.teleportWorlds.value)

const objects = [
    { type: "FIREPLACE", name: "Fireplace Small", id: 241 },
    { type: "FIREPLACE", name: "Fireplace Large", id: 242 },
    { type: "TORCH", name: "Wall Torch", id: 261 },
    { type: "ENTRANCE", name: "Stone Entrance", id: 281 },
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
