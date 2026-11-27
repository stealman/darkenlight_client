<template>
    <div>
        <label class="tree-item" :class="{ selected: !grassTool && selectedTree === 0 && selectedShrub === 0 }" @click="selectNone()">
            None
        </label>
        <button type="button" class="tree-item" :class="{ selected: grassTool === 'exclude' }"
                :aria-pressed="grassTool === 'exclude'" @click="toggleGrassTool('exclude')">No grass</button>
        <button type="button" class="tree-item" :class="{ selected: grassTool === 'force' }"
                :aria-pressed="grassTool === 'force'" @click="toggleGrassTool('force')">Force grass</button>
        <label style='color: red; font-weight: bold' class="tree-item" :class="{ selected: selectedTree === -1 && selectedShrub === -1 }" @click="selectDelete()">
            Delete
        </label>
        <div v-if="grassTool === 'exclude'">Click a ground tile to mark it or clear its mark.</div>
        <div v-if="grassTool === 'force'">Click a tile to cycle through small, medium, large, 3 tufts, 5 tufts, and back to automatic.</div>
    </div>

    <div>
        <label>Tree level (1-5) <input ref="treeLevelInput" @change="GMManager.saveTreeLevel()" v-model.number="GMManager.treeLevel.value" type="number" min="1" max="5" step="1"></label>
        <div v-if="GMManager.editingTree.value">
            Tree {{ GMManager.editingTree.value.x }}, {{ GMManager.editingTree.value.z }}
        </div>
    </div>

    <div style="margin-top: 2vh">
        <label>Terrain fragments</label>
        <div style="margin-top: 1vh">
            <button v-for="(type, index) in [151, 152, 154, 153, 155]" :key="type"
                :class="{ selected: selectedShrub === type }" @click="selectDebris(type)">
                {{ index + 1 }}
            </button>
        </div>
    </div>

    <div style="margin-top: 2vh">
        <button v-for="(types, species) in WORLD_TREE_TYPES" :key="species" type="button"
                class="tree-item" :class="{ selected: selectedTree === types.ids[0] }"
                :aria-pressed="selectedTree === types.ids[0]" @click="selectTree(types.ids[0])">
            {{ TREE_SPECIES[species].name }}
        </button>
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

import { GMManager } from '@/gm/GM'
import { TREE_SPECIES, WORLD_TREE_TYPES } from '@/babylon/world/trees/treeSpecies'
import { ref, watch, nextTick } from 'vue'

const treeLevelInput = ref(null)
watch(GMManager.editingTree, async (tree) => {
    if (!tree) return
    await nextTick()
    treeLevelInput.value?.focus()
    treeLevelInput.value?.select()
})

// Biome edit constants
const selectedTree = GMManager.selectedTree
const selectedShrubType = ref("")
const selectedShrub = GMManager.selectedShrub
const grassTool = GMManager.grassTool

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

const selectTree = (id) => {
    grassTool.value = null
    GMManager.editingTree.value = null
    selectedTree.value = id
    selectedShrub.value = 0
    selectedShrubType.value = ""
}
const selectShrubType = (type) => {
    grassTool.value = null
    selectedTree.value = 0
    GMManager.editingTree.value = null
    selectedShrubType.value = type

    // Preselect first shrub of that type
    const firstShrub = shrubs.find(s => s.type === type)
    if (firstShrub) {
        selectedShrub.value = firstShrub.id
    }
}

const selectShrub = (id) => {
    GMManager.editingTree.value = null
    selectedShrub.value = parseInt(id)
    selectedTree.value = 0
}

const selectNone = () => {
    grassTool.value = null
    GMManager.editingTree.value = null
    selectedTree.value = 0
    selectedShrub.value = 0
    selectedShrubType.value = ""
}

const toggleGrassTool = (tool) => {
    const next = grassTool.value === tool ? null : tool
    selectNone()
    grassTool.value = next
}

const selectDebris = (type) => {
    selectNone()
    selectedShrub.value = type
}

const selectDelete = () => {
    grassTool.value = null
    GMManager.editingTree.value = null
    selectedTree.value = -1
    selectedShrub.value = -1
    selectedShrubType.value = ""
}
</script>
