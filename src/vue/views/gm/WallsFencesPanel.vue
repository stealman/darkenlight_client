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

    <!-- WALLS AND FENCES -->
    <div style="margin-top: 1vh">
        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'WALL2' === selectedObjectType }" @click="selectObjectType('WALL2')">Wall 2</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'WALL2'" :disabled="isEditing" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type ==='WALL2')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'WALL3' === selectedObjectType }" @click="selectObjectType('WALL3')">Wall 3</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'WALL3'" :disabled="isEditing" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type ==='WALL3')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'PALISADE' === selectedObjectType }" @click="selectObjectType('PALISADE')">Palisade</label>
            <label v-if="selectedObjectType === 'PALISADE'">
                &nbsp;&nbsp;dir.
                <select v-model="palisadeOrientation">
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                </select>
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'PALISADE_SMALL' === selectedObjectType }" @click="selectObjectType('PALISADE_SMALL')">Palisade-S</label>
            <label v-if="selectedObjectType === 'PALISADE_SMALL'">
                &nbsp;&nbsp;dir.
                <select v-model="palisadeOrientation">
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                </select>
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'PALISADE_SPIKED' === selectedObjectType }" @click="selectObjectType('PALISADE_SPIKED')">Palisade-Spiked</label>
            <label v-if="selectedObjectType === 'PALISADE_SPIKED'">
                &nbsp;&nbsp;dir.
                <select v-model="spikedPalisadeFacing">
                    <option value="-X">-X</option>
                    <option value="+X">+X</option>
                    <option value="-Z">-Z</option>
                    <option value="+Z">+Z</option>
                </select>
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'CAMP_FENCE' === selectedObjectType }" @click="selectObjectType('CAMP_FENCE')">Camp Fence</label>
            <label v-if="selectedObjectType === 'CAMP_FENCE'">
                &nbsp;&nbsp;dir.
                <select v-model="palisadeOrientation">
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                </select>
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'CEMETERY_FENCE' === selectedObjectType }" @click="selectObjectType('CEMETERY_FENCE')">Cemetery Iron Fence</label>
            <label v-if="selectedObjectType === 'CEMETERY_FENCE'">
                &nbsp;&nbsp;dir.
                <select v-model="palisadeOrientation">
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                </select>
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'CEMETERY_WALL' === selectedObjectType }" @click="selectObjectType('CEMETERY_WALL')">Ruined Cemetery Wall</label>
            <label v-if="selectedObjectType === 'CEMETERY_WALL'">
                &nbsp;&nbsp;dir.
                <select v-model="palisadeOrientation">
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                </select>
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'CEMETERY_STONE_WALL' === selectedObjectType }" @click="selectObjectType('CEMETERY_STONE_WALL')">Cemetery Stone Wall</label>
            <label v-if="selectedObjectType === 'CEMETERY_STONE_WALL'">
                &nbsp;&nbsp;dir.
                <select v-model="palisadeOrientation">
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                </select>
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'WALKABLE_BLOCK' === selectedObjectType }" @click="selectObjectType('WALKABLE_BLOCK')">Walkable Block</label>
            <label v-if="selectedObjectType === 'WALKABLE_BLOCK'">
                &nbsp;&nbsp;height
                <select v-model.number="walkableBlockHeight">
                    <option :value="0.5">0.5</option>
                    <option :value="1">1</option>
                </select>
                &nbsp;&nbsp;material
                <select v-model="walkableBlockMaterial">
                    <option value="WOOD">Wood</option>
                    <option value="STONE_GRAY">Stone Gray</option>
                    <option value="STONE_RED">Stone Red</option>
                </select>
            </label>
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

// Biome edit constants
const selectedObjectType = ref("")
const selectedObject = GMManager.selectedWallFence
const palisadeOrientation = GMManager.palisadeOrientation
const spikedPalisadeFacing = GMManager.spikedPalisadeFacing
const walkableBlockHeight = GMManager.walkableBlockHeight
const walkableBlockMaterial = GMManager.walkableBlockMaterial
const isEditing = computed(() => GMManager.editingStatic.value !== null)

const objects = [
    { type: "WALL2", name: "Wall2_GRAY", id: 201 },
    { type: "WALL2", name: "Wall2_RED", id: 202 },
    { type: "PALISADE", name: "PalisadeWall2", id: 203 },
    { type: "PALISADE_SMALL", name: "PalisadeSmall", id: 204 },
    { type: "PALISADE_SPIKED", name: "PalisadeSpiked", id: 205 },
    { type: "WALKABLE_BLOCK", name: "WalkableBlock", id: 206 },
    { type: "CAMP_FENCE", name: "CampFence", id: 207 },
    { type: "CEMETERY_FENCE", name: "CemeteryIronFence", id: 208 },
    { type: "CEMETERY_WALL", name: "RuinedCemeteryWall", id: 209 },
    { type: "CEMETERY_STONE_WALL", name: "CemeteryStoneWall", id: 210 },

    { type: "WALL3", name: "Wall3_GRAY", id: 221 },
    { type: "WALL3", name: "Wall3_RED", id: 222 },
]

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
