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

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'CAMP' === selectedObjectType }" @click="selectObjectType('CAMP')">Camp Props</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'CAMP'" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type === 'CAMP')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div v-if="selectedObjectType === 'CAMP'" style="margin-top: 1vh">
            <label>Direction</label>
            &nbsp;&nbsp;
            <select v-model="campObjectFacing">
                <option value="-X">-X</option>
                <option value="+X">+X</option>
                <option value="-Z">-Z</option>
                <option value="+Z">+Z</option>
            </select>
            <template v-if="selectedObject === 303">
                &nbsp;&nbsp;
                <label>Log length</label>
                &nbsp;&nbsp;
                <select v-model.number="logPileLength">
                    <option :value="1">1</option>
                    <option :value="2">2</option>
                    <option :value="3">3</option>
                </select>
            </template>
        </div>

        <div v-if="selectedObjectType === 'TORCH'" style="margin-top: 1vh">
            <label>Direction</label>
            &nbsp;&nbsp;
            <select v-model="torchFacing">
                <option value="-X">-X</option>
                <option value="+X">+X</option>
                <option value="-Z">-Z</option>
                <option value="+Z">+Z</option>
            </select>
            &nbsp;&nbsp;
            <template v-if="selectedObject === 261">
                &nbsp;&nbsp;
                <label>Height above floor</label>
                &nbsp;&nbsp;
                <input v-model.number="torchMountHeight" type="number" min="-10" max="10" step="0.1">
            </template>
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

        <div style="margin-top: 2vh; font-weight: bold">Buildings</div>
        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: selectedBuildingType === 1 }" @click="selectBuilding(1)">
                Human House 5x3 (no roof)
            </label>
            <label v-if="selectedBuildingType === 1">Door facing
                <select v-model="buildingFacing">
                    <option value="+Z">+Z</option>
                    <option value="-Z">-Z</option>
                    <option value="+X">+X</option>
                    <option value="-X">-X</option>
                </select>
            </label>
        </div>
    </div>
</template>

<script setup>
import { GMManager } from '@/gm/GM'
import { computed, ref } from 'vue'

const selectedObjectType = ref("")
const selectedObject = GMManager.selectedStatic
const selectedBuildingType = GMManager.selectedBuildingType
const buildingFacing = GMManager.buildingFacing
const torchFacing = GMManager.torchFacing
const torchMountHeight = GMManager.torchMountHeight
const campObjectFacing = GMManager.campObjectFacing
const logPileLength = GMManager.logPileLength
const entranceFacing = GMManager.entranceFacing
const entranceDestinationWorld = GMManager.entranceDestinationWorld
const entranceDestinationX = GMManager.entranceDestinationX
const entranceDestinationZ = GMManager.entranceDestinationZ
const teleportWorlds = computed(() => GMManager.teleportWorlds.value)

const objects = [
    { type: "FIREPLACE", name: "Fireplace Small", id: 241 },
    { type: "FIREPLACE", name: "Fireplace Large", id: 242 },
    { type: "TORCH", name: "Wall Torch", id: 261 },
    { type: "TORCH", name: "Torch Stand", id: 262 },
    { type: "ENTRANCE", name: "Stone Entrance", id: 281 },
    { type: "CAMP", name: "Bench 2x1", id: 301 },
    { type: "CAMP", name: "Plank Pile", id: 302 },
    { type: "CAMP", name: "Log Pile", id: 303 },
    { type: "CAMP", name: "Supply Crate", id: 304 },
    { type: "CAMP", name: "Barrel", id: 305 },
]

const selectObjectType = (type) => {
    selectedBuildingType.value = 0
    selectedObjectType.value = type

    const firstObject = objects.find(s => s.type === type)
    if (firstObject) {
        selectedObject.value = firstObject.id
    }
}

const selectObject = (id) => {
    selectedBuildingType.value = 0
    selectedObject.value = parseInt(id)
}

const selectBuilding = (type) => {
    selectedObject.value = 0
    selectedObjectType.value = 'BUILDING'
    selectedBuildingType.value = type
}

const selectNone = () => {
    selectedObject.value = 0
    selectedBuildingType.value = 0
    selectedObjectType.value = ""
}

const selectDelete = () => {
    selectedObject.value = -1
    selectedBuildingType.value = 0
    selectedObjectType.value = ""
}
</script>
