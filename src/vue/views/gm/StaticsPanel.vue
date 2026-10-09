<template>
    <div>
        <label class="tree-item" :class="{ selected: selectedObject === 0 }" @click="selectNone()">
            None
        </label>
        <label style='color: deepskyblue; font-weight: bold' class="tree-item" :class="{ selected: selectedObject === -2 }" @click="selectEdit()">
            Edit
        </label>
        <label style='color: red; font-weight: bold' class="tree-item" :class="{ selected: selectedObject === -1 }" @click="selectDelete()">
            Delete
        </label>
    </div>

    <div style="margin-top: 1vh">
        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'FIREPLACE' === selectedObjectType }" @click="selectObjectType('FIREPLACE')">Fireplace</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'FIREPLACE'" :disabled="isEditing" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type === 'FIREPLACE')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'ENTRANCE' === selectedObjectType }" @click="selectObjectType('ENTRANCE')">Entrance</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'ENTRANCE'" :disabled="isEditing" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type === 'ENTRANCE')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'TORCH' === selectedObjectType }" @click="selectObjectType('TORCH')">Torch</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'TORCH'" :disabled="isEditing" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type === 'TORCH')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'CAMP' === selectedObjectType }" @click="selectObjectType('CAMP')">Camp Props</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'CAMP'" :disabled="isEditing" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type === 'CAMP')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'CEMETERY' === selectedObjectType }" @click="selectObjectType('CEMETERY')">Cemetery</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'CEMETERY'" :disabled="isEditing" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type === 'CEMETERY')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div v-if="(selectedObjectType === 'CAMP' && selectedObject !== 308 && selectedObject !== 310) || (selectedObjectType === 'CEMETERY' && selectedObject !== 335 && selectedObject !== 336 && selectedObject !== 337)" style="margin-top: 1vh">
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

        <div v-if="selectedObjectType === 'TORCH'" style="margin-top: 1vh; display: grid; gap: 6px">
            <label style="display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px">
                Direction
                <select v-model="torchFacing">
                    <option value="-X">-X</option>
                    <option value="+X">+X</option>
                    <option value="-Z">-Z</option>
                    <option value="+Z">+Z</option>
                </select>
            </label>
            <label v-if="selectedObject === 261" style="display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px">
                Height above floor
                <input v-model.number="torchMountHeight" type="number" min="-10" max="10" step="0.1" style="width: 64px">
            </label>
        </div>

        <div v-if="hasLightSettings" style="margin-top: 1vh; display: grid; gap: 6px">
            <label style="display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px">
                Light intensity
                <select v-model.number="lightIntensity">
                    <option v-for="level in lightLevels" :key="level" :value="level">{{ level }}</option>
                </select>
            </label>
            <label style="display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px">
                Light range
                <select v-model.number="lightRange">
                    <option v-for="level in lightLevels" :key="level" :value="level">{{ level }}</option>
                </select>
            </label>
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

        <div v-if="isEditing" style="margin-top: 1vh; display: flex; gap: 6px">
            <button @click="saveEdit">Save</button>
            <button @click="cancelEdit">Cancel</button>
        </div>

    </div>
</template>

<script setup>
import { GMManager } from '@/gm/GM'
import { computed, ref, watch } from 'vue'

const selectedObjectType = ref("")
const selectedObject = GMManager.selectedStatic
const torchFacing = GMManager.torchFacing
const torchMountHeight = GMManager.torchMountHeight
const lightIntensity = GMManager.lightIntensity
const lightRange = GMManager.lightRange
const campObjectFacing = GMManager.campObjectFacing
const logPileLength = GMManager.logPileLength
const entranceFacing = GMManager.entranceFacing
const entranceDestinationWorld = GMManager.entranceDestinationWorld
const entranceDestinationX = GMManager.entranceDestinationX
const entranceDestinationZ = GMManager.entranceDestinationZ
const teleportWorlds = computed(() => GMManager.teleportWorlds.value)
const isEditing = computed(() => GMManager.editingStatic.value !== null)
const lightLevels = Array.from({length: 10}, (_, index) => index + 1)
const hasLightSettings = computed(() => selectedObject.value === 241 || selectedObject.value === 242
    || selectedObject.value === 261 || selectedObject.value === 262 || selectedObject.value === 263
    || selectedObject.value === 281 || selectedObject.value === 337)

const objects = [
    { type: "FIREPLACE", name: "Fireplace Small", id: 241 },
    { type: "FIREPLACE", name: "Fireplace Large", id: 242 },
    { type: "TORCH", name: "Wall Torch", id: 261 },
    { type: "TORCH", name: "Torch Stand", id: 262 },
    { type: "TORCH", name: "Lantern Stand", id: 263 },
    { type: "ENTRANCE", name: "Stone Entrance", id: 281 },
    { type: "CAMP", name: "Bench 2x1", id: 301 },
    { type: "CAMP", name: "Plank Pile", id: 302 },
    { type: "CAMP", name: "Log Pile", id: 303 },
    { type: "CAMP", name: "Supply Crate", id: 304 },
    { type: "CAMP", name: "Barrel", id: 305 },
    { type: "CAMP", name: "Hay Stack", id: 306 },
    { type: "CAMP", name: "Stump with Axe", id: 307 },
    { type: "CAMP", name: "Water Trough 1x1", id: 308 },
    { type: "CAMP", name: "Water Trough 2x1", id: 309 },
    { type: "CAMP", name: "Stone Well", id: 310 },
    { type: "CEMETERY", name: "Headstone", id: 321 },
    { type: "CEMETERY", name: "Stone Cross", id: 322 },
    { type: "CEMETERY", name: "Stone Tomb 1x2", id: 323 },
    { type: "CEMETERY", name: "Obelisk", id: 324 },
    { type: "CEMETERY", name: "Gargoyle", id: 325 },
    { type: "CEMETERY", name: "Gargoyle on Pedestal", id: 328 },
    { type: "CEMETERY", name: "Stone Frame Grave", id: 329 },
    { type: "CEMETERY", name: "Stone Frame Grave (shifted slab)", id: 330 },
    { type: "CEMETERY", name: "Headstone 2 (flat cap)", id: 331 },
    { type: "CEMETERY", name: "Headstone 3 (small cross)", id: 332 },
    { type: "CEMETERY", name: "Empty Pedestal", id: 333 },
    { type: "CEMETERY", name: "Stone Cross Pedestal", id: 334 },
    { type: "CEMETERY", name: "Fallen Stone Cross", id: 335 },
    { type: "CEMETERY", name: "Fallen Headstone", id: 336 },
    { type: "CEMETERY", name: "Ember Bowl", id: 337 },
]

const previouslySelectedObject = objects.find(obj => obj.id === selectedObject.value)
if (previouslySelectedObject) {
    selectedObjectType.value = previouslySelectedObject.type
}

const selectObjectType = (type) => {
    if (isEditing.value) return
    selectedObjectType.value = type

    const firstObject = objects.find(s => s.type === type)
    if (firstObject) {
        selectedObject.value = firstObject.id
    }
}

const selectObject = (id) => {
    if (isEditing.value) return
    selectedObject.value = parseInt(id)
}

const selectNone = () => {
    GMManager.cancelStaticEdit()
    selectedObject.value = 0
    selectedObjectType.value = ""
}

const selectEdit = () => {
    GMManager.cancelStaticEdit()
    selectedObject.value = -2
    selectedObjectType.value = ""
}

const selectDelete = () => {
    GMManager.cancelStaticEdit()
    selectedObject.value = -1
    selectedObjectType.value = ""
}


const saveEdit = () => GMManager.saveStaticEdit()
const cancelEdit = () => GMManager.cancelStaticEdit()

watch(selectedObject, (id) => {
    selectedObjectType.value = objects.find((obj) => obj.id === id)?.type ?? ""
})
</script>
