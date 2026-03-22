<template>
    <div>
        Size:&nbsp;&nbsp;&nbsp;
        <label style='cursor: pointer;' :style="affectedSize == 1 ? 'border: 2px solid #4caf50' : ''" @click="GMManager.affectedSizeChanged(1)">1x1</label>&nbsp;&nbsp;&nbsp;
        <label style='cursor: pointer;' :style="affectedSize == 3 ? 'border: 2px solid #4caf50' : ''" @click="GMManager.affectedSizeChanged(3)">3x3</label>&nbsp;&nbsp;&nbsp;
        <label style='cursor: pointer;' :style="affectedSize == 5 ? 'border: 2px solid #4caf50' : ''" @click="GMManager.affectedSizeChanged(5)">5x5</label>
    </div>

    <!-- Elevation control -->
    <div style="margin-top: 2vh">
        <label style='cursor: pointer;' :style="terrainEditMode === 'terrain' && selectedTerrain == 0 ? 'border: 2px solid #4caf50' : ''" @click="selectTerrain(0)">Elevation</label>&nbsp;&nbsp;&nbsp;
        <span v-if="!shiftKeyPressed">UP</span>
        <span v-else>DOWN</span>
    </div>

    <!-- Terrain selection -->
    <div style="margin-top: 2vh" class="terrain-picker">
        <div
            v-for="terrain in terrains"
            :key="terrain.id"
            class="terrain-tile"
            :class="{ selected: terrainEditMode === 'terrain' && terrain.id === selectedTerrain }"
            :style="getTerrainStyle(terrain)"
            @click="selectTerrain(terrain.id)"
        />
        <div
            class="terrain-tile"
            :class="{ selected: terrainEditMode === 'terrain' && snow.id === selectedTerrain }"
            :style="getTerrainStyle(snow)"
            @click="selectTerrain(snow.id)"
        />
        <div
            class="terrain-tile"
            :class="{ selected: terrainEditMode === 'terrain' && unsnow.id === selectedTerrain }"
            style="text-align: center;"
            :style="getTerrainStyle(snow)"
            @click="selectTerrain(unsnow.id)">
            <span style="color: red; font-size: 2rem; position: relative; top: 0.75rem;">X</span>
        </div>
    </div>

    <div style="margin-top: 2vh; display: flex; align-items: center; gap: 0.75rem;">
        <label
            class="terrain-tile mining-tile"
            :class="{ selected: terrainEditMode === 'minable' }"
            @click="selectMinableMode()"
        >
            <img src="/images/icons/buttons/btn_pickaxe.png" alt="Mining" class="mining-icon">
        </label>
        <select
            v-model="selectedMinable"
            class="minable-input"
            @focus="selectMinableMode()"
        >
            <option value="">None</option>
            <option value="C">Coal</option>
            <option
                v-for="option in minableOptions"
                :key="option.value"
                :value="option.value"
            >
                {{ option.label }}
            </option>
        </select>
    </div>

    <div style="margin-top: 2vh">
        <button @click="saveMapData">Save Data</button>
    </div>
</template>

<script setup>

import { GMManager } from '@/gm/GM'

// Terrrain edit constants
const TERRAIN_TILE_SIZE = 128
const affectedSize = GMManager.affectedSize
const shiftKeyPressed = GMManager.shiftKeyPressed
const selectedTerrain = GMManager.selectedTerrain
const terrainEditMode = GMManager.terrainEditMode
const selectedMinable = GMManager.selectedMinable
const minableOptions = Array.from({ length: 10 }, (_, index) => ({
    value: `M${index + 1}`,
    label: `Ore ${index + 1}`
}))
const terrains = [
    { id: 2, x: 0.5, y: 0.5 },
    { id: 1,  x: 2.5, y: 0.5 },
    { id: 3, x: 6.5, y: 0.5 },
    { id: 4, x: 0.5, y: 2.5 },
    { id: 50, x: 2.5, y: 2.5 }
]
const snow = { id: 100, x: 4.5, y: 0.5 }
const unsnow = { id: 101, x: 4.5, y: 0.5 }

const getTerrainStyle = (t) => ({
    backgroundImage: 'url(/images/materials/plane_materials1.png)',
    backgroundPosition: `-${t.x * TERRAIN_TILE_SIZE}px -${t.y * TERRAIN_TILE_SIZE}px`
})

const selectTerrain = (id) => {
    terrainEditMode.value = 'terrain'
    selectedTerrain.value = id
}

const selectMinableMode = () => {
    terrainEditMode.value = 'minable'
}

const saveMapData = () => {
    GMManager.saveMapData()
}
</script>

<style scoped>
.mining-tile {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.25);
}

.mining-icon {
    width: 2rem;
    height: 2rem;
    image-rendering: pixelated;
}

.minable-input {
    width: 7rem;
    padding: 0.25rem 0.4rem;
}
</style>
