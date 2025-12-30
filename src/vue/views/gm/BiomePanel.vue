<template>
    <div>
        <label class="tree-item" :class="{ selected: selectedTree === 0 && selectedShrub === 0 }" @click="selectNone()">
            None
        </label>
        <label style='color: red; font-weight: bold' class="tree-item" :class="{ selected: selectedTree === -1 && selectedShrub === -1 }" @click="selectDelete()">
            Delete
        </label>
    </div>

    <!-- TREES -->
    <div style="margin-top: 2vh">
        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'OAK' === selectedTreeType }" @click="selectTreeType('OAK')">Oak</label>
            &nbsp;&nbsp;
            <select v-if="selectedTreeType === 'OAK'" @change="selectTree($event.target.value)">
                <option v-for="tree in trees.filter(t => t.type ==='OAK')" :key="tree.id" :value="tree.id" :selected="tree.id === selectedTree">
                    {{ tree.name }}
                </option>
            </select>
        </div>
        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'PINE' === selectedTreeType }" @click="selectTreeType('PINE')">Pine</label>
            &nbsp;&nbsp;
            <select v-if="selectedTreeType === 'PINE'" @change="selectTree($event.target.value)">
                <option v-for="tree in trees.filter(t => t.type ==='PINE')" :key="tree.id" :value="tree.id" :selected="tree.id === selectedTree">
                    {{ tree.name }}
                </option>
            </select>
        </div>
    </div>

    <!-- SHRUBS -->
    <div style="margin-top: 1vh">
        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'SHRUB2x2' === selectedShrubType }" @click="selectShrubType('SHRUB2x2')">Shrub 2x2</label>
            &nbsp;&nbsp;
            <select v-if="selectedShrubType === 'SHRUB2x2'" @change="selectShrub($event.target.value)">
                <option v-for="shrub in shrubs.filter(s => s.type ==='SHRUB2x2')" :key="shrub.id" :value="shrub.id" :selected="shrub.id === selectedShrub">
                    {{ shrub.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'SHRUB1x1_TALL' === selectedShrubType }" @click="selectShrubType('SHRUB1x1_TALL')">Shrub 1x1-T</label>
            &nbsp;&nbsp;
            <select v-if="selectedShrubType === 'SHRUB1x1_TALL'" @change="selectShrub($event.target.value)">
                <option v-for="shrub in shrubs.filter(s => s.type ==='SHRUB1x1_TALL')" :key="shrub.id" :value="shrub.id" :selected="shrub.id === selectedShrub">
                    {{ shrub.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'SHRUB1x1_SMALL' === selectedShrubType }" @click="selectShrubType('SHRUB1x1_SMALL')">Shrub 1x1-S</label>
            &nbsp;&nbsp;
            <select v-if="selectedShrubType === 'SHRUB1x1_SMALL'" @change="selectShrub($event.target.value)">
                <option v-for="shrub in shrubs.filter(s => s.type ==='SHRUB1x1_SMALL')" :key="shrub.id" :value="shrub.id" :selected="shrub.id === selectedShrub">
                    {{ shrub.name }}
                </option>
            </select>
        </div>
    </div>
</template>

<script setup>

import { GMManager, GmTabs as GMTabs } from '@/gm/GM'
import { ref, onMounted } from 'vue'

// Biome edit constants
const selectedTreeType = ref("")
const selectedTree = GMManager.selectedTree
const selectedShrubType = ref("")
const selectedShrub = GMManager.selectedShrub

const trees = [
    { type: "OAK", name: "Oak_1", id: 1 },
    { type: "OAK", name: "Oak_2", id: 2 },
    { type: "OAK", name: "Oak_3", id: 3 },
    { type: "OAK", name: "Oak_4", id: 4 },
    { type: "PINE", name: "Pine_1", id: 5 },
    { type: "PINE", name: "Pine_2", id: 6 },
    { type: "PINE", name: "Pine_3", id: 7 },
    { type: "PINE", name: "Pine_4", id: 8 }
]

const shrubs = [
    { type: "SHRUB2x2", name: "Shrub2x2_1", id: 101 },
    { type: "SHRUB2x2", name: "Shrub2x2_2", id: 102 },
    { type: "SHRUB2x2", name: "Shrub2x2_3", id: 103 },
    { type: "SHRUB2x2", name: "Shrub2x2_4", id: 104 },

    { type: "SHRUB1x1_TALL", name: "Shrub1x1_T_1", id: 121 },
    { type: "SHRUB1x1_TALL", name: "Shrub1x1_T_2", id: 122 },
    { type: "SHRUB1x1_TALL", name: "Shrub1x1_T_3", id: 123 },
    { type: "SHRUB1x1_TALL", name: "Shrub1x1_T_4", id: 124 },

    { type: "SHRUB1x1_SMALL", name: "Shrub1x1_S_1", id: 141 },
    { type: "SHRUB1x1_SMALL", name: "Shrub1x1_S_2", id: 142 },
    { type: "SHRUB1x1_SMALL", name: "Shrub1x1_S_3", id: 143 },
    { type: "SHRUB1x1_SMALL", name: "Shrub1x1_S_4", id: 144 },
]

const selectTreeType = (type) => {
    selectedTreeType.value = type
    selectedShrubType.value = ""

    // Preselect first tree of that type
    const firstTree = trees.find(t => t.type === type)
    if (firstTree) {
        selectedTree.value = firstTree.id
    }
}

const selectTree = (id) => {
    selectedTree.value = parseInt(id)
    selectedShrub.value = 0
}

const selectShrubType = (type) => {
    selectedShrubType.value = type
    selectedTreeType.value = ""

    // Preselect first shrub of that type
    const firstShrub = shrubs.find(s => s.type === type)
    if (firstShrub) {
        selectedShrub.value = firstShrub.id
    }
}

const selectShrub = (id) => {
    selectedShrub.value = parseInt(id)
    selectedTree.value = 0
}

const selectNone = () => {
    selectedTree.value = 0
    selectedShrub.value = 0
    selectedTreeType.value = ""
    selectedShrubType.value = ""
}

const selectDelete = () => {
    selectedTree.value = -1
    selectedShrub.value = -1
    selectedTreeType.value = ""
    selectedShrubType.value = ""
}
</script>
