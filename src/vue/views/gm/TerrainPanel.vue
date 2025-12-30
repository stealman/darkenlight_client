<template>
    <div>
        Size:&nbsp;&nbsp;&nbsp;
        <label style='cursor: pointer;' :style="affectedSize == 1 ? 'border: 2px solid #4caf50' : ''" @click="GMManager.affectedSizeChanged(1)">1x1</label>&nbsp;&nbsp;&nbsp;
        <label style='cursor: pointer;' :style="affectedSize == 3 ? 'border: 2px solid #4caf50' : ''" @click="GMManager.affectedSizeChanged(3)">3x3</label>&nbsp;&nbsp;&nbsp;
        <label style='cursor: pointer;' :style="affectedSize == 5 ? 'border: 2px solid #4caf50' : ''" @click="GMManager.affectedSizeChanged(5)">5x5</label>
    </div>

    <!-- Elevation control -->
    <div style="margin-top: 2vh">
        <label style='cursor: pointer;' :style="selectedTerrain == 0 ? 'border: 2px solid #4caf50' : ''" @click="selectTerrain(0)">Elevation</label>&nbsp;&nbsp;&nbsp;
        <span v-if="!shiftKeyPressed">UP</span>
        <span v-else>DOWN</span>
    </div>

    <!-- Terrain selection -->
    <div style="margin-top: 2vh" class="terrain-picker">
        <div
            v-for="terrain in terrains"
            :key="terrain.id"
            class="terrain-tile"
            :class="{ selected: terrain.id === selectedTerrain }"
            :style="getTerrainStyle(terrain)"
            @click="selectTerrain(terrain.id)"
        />
        <div
            class="terrain-tile"
            :class="{ selected: snow.id === selectedTerrain }"
            :style="getTerrainStyle(snow)"
            @click="selectTerrain(snow.id)"
        />
        <div
            class="terrain-tile"
            :class="{ selected: unsnow.id === selectedTerrain }"
            style="text-align: center;"
            :style="getTerrainStyle(snow)"
            @click="selectTerrain(unsnow.id)">
            <span style="color: red; font-size: 2rem; position: relative; top: 0.75rem;">X</span>
        </div>
    </div>

    <div style="margin-top: 2vh">
        <button @click="saveMapData">Save Data</button>
    </div>
</template>

<script setup>

import { GMManager, GmTabs as GMTabs } from '@/gm/GM'
import { ref, onMounted } from 'vue'

// Terrrain edit constants
const TERRAIN_TILE_SIZE = 128
const affectedSize = GMManager.affectedSize
const shiftKeyPressed = GMManager.shiftKeyPressed
const selectedTerrain = GMManager.selectedTerrain
const terrains = [
    { id: 2, x: 0.5, y: 0.5 },
    { id: 1,  x: 2.5, y: 0.5 },
    { id: 3, x: 6.5, y: 0.5 },
    { id: 4, x: 0.5, y: 2.5 }
]
const snow = { id: 100, x: 4.5, y: 0.5 }
const unsnow = { id: 101, x: 4.5, y: 0.5 }

const getTerrainStyle = (t) => ({
    backgroundImage: 'url(/images/materials/plane_materials1.png)',
    backgroundPosition: `-${t.x * TERRAIN_TILE_SIZE}px -${t.y * TERRAIN_TILE_SIZE}px`
})

const selectTerrain = (id) => {
    selectedTerrain.value = id
}

const saveMapData = () => {
    GMManager.saveMapData()
}
</script>
