<template>
    <div>
        Size:&nbsp;&nbsp;&nbsp;
        <label style='cursor: var(--ui-cursor-pointer);' :style="affectedSize == 1 ? 'border: 2px solid #4caf50' : ''" @click="GMManager.affectedSizeChanged(1)">1x1</label>&nbsp;&nbsp;&nbsp;
        <label style='cursor: var(--ui-cursor-pointer);' :style="affectedSize == 3 ? 'border: 2px solid #4caf50' : ''" @click="GMManager.affectedSizeChanged(3)">3x3</label>&nbsp;&nbsp;&nbsp;
        <label style='cursor: var(--ui-cursor-pointer);' :style="affectedSize == 5 ? 'border: 2px solid #4caf50' : ''" @click="GMManager.affectedSizeChanged(5)">5x5</label>
    </div>

    <!-- Elevation control -->
    <div style="margin-top: 2vh">
        <label style='cursor: var(--ui-cursor-pointer);' :style="terrainEditMode === 'terrain' && selectedTerrain == 0 ? 'border: 2px solid #4caf50' : ''" @click="selectTerrain(0)">Elevation</label>&nbsp;&nbsp;&nbsp;
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
            class="terrain-tile stone-path-tile"
            :class="{ selected: terrainEditMode === 'terrain' && stonePath.id === selectedTerrain }"
            title="Stone path"
            @click="selectTerrain(stonePath.id)"
        />
        <div
            class="terrain-tile beige-stone-path-tile"
            :class="{ selected: terrainEditMode === 'terrain' && beigeStonePath.id === selectedTerrain }"
            title="Beige stone path"
            @click="selectTerrain(beigeStonePath.id)"
        />
        <div
            class="terrain-tile"
            :class="{ selected: terrainEditMode === 'terrain' && unsnow.id === selectedTerrain }"
            style="text-align: center;"
            :style="getTerrainStyle(snow)"
            title="Clear surface"
            @click="selectTerrain(unsnow.id)">
            <span style="color: red; font-size: 2rem; position: relative; top: 0.75rem;">X</span>
        </div>
        <div
            class="terrain-tile void-tile"
            :class="{ selected: terrainEditMode === 'terrain' && voidTerrain.id === selectedTerrain }"
            :style="{ backgroundColor: '#000000' }"
            title="Void"
            @click="selectTerrain(voidTerrain.id)"
        />
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

import { BEIGE_STONE_PATH_TERRAIN_SELECTION, GMManager, STONE_PATH_TERRAIN_SELECTION, VOID_TERRAIN_SELECTION } from '@/gm/GM'
import { muddyDirtPatterns, terrainCoverPatterns, TERRAIN_ATLAS_TILES } from '@/babylon/world/terrainAtlasPlacement'
import dirtAtlas from '@/adminUtils/assets/dirt-atlas.png'
import grassAtlas from '@/adminUtils/assets/grass-atlas.png'
import rockAtlas from '@/adminUtils/assets/rock-atlas.png'
import muddyDirtAtlas from '@/adminUtils/assets/muddy-dirt-atlas.png'
import winterGrassAtlas from '@/adminUtils/assets/winter-grass-atlas.png'
import snowAtlas from '@/adminUtils/assets/snow-atlas.png'

// Terrrain edit constants
const affectedSize = GMManager.affectedSize
const shiftKeyPressed = GMManager.shiftKeyPressed
const selectedTerrain = GMManager.selectedTerrain
const terrainEditMode = GMManager.terrainEditMode
const selectedMinable = GMManager.selectedMinable
const minableOptions = Array.from({ length: 5 }, (_, index) => ({
    value: `M${index + 1}`,
    label: `Ore ${index + 1}`
}))
const terrains = [
    { id: 2, atlas: grassAtlas },
    { id: 1, atlas: dirtAtlas, soil: true },
    { id: 3, atlas: rockAtlas },
    { id: 4, atlas: muddyDirtAtlas, soil: true },
    { id: 50 },
    { id: 5, atlas: winterGrassAtlas },
]
const snow = { id: 100, atlas: snowAtlas }
const unsnow = { id: 101 }
const stonePath = { id: STONE_PATH_TERRAIN_SELECTION }
const beigeStonePath = { id: BEIGE_STONE_PATH_TERRAIN_SELECTION }
const voidTerrain = { id: VOID_TERRAIN_SELECTION }

const getTerrainStyle = (terrain) => {
    if (!terrain.atlas) return {backgroundColor: '#40565b'}
    const patterns = terrain.soil ? muddyDirtPatterns : terrainCoverPatterns
    const [x, y] = patterns.find(pattern => pattern.size === 1).origins[0]
    const percent = 100 / (TERRAIN_ATLAS_TILES - 1)
    const size = `${100 * TERRAIN_ATLAS_TILES}%`
    return {
        backgroundImage: `url("${terrain.atlas}")`,
        backgroundSize: `${size} ${size}`,
        backgroundPosition: `${x * percent}% ${y * percent}%`,
    }
}

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

.stone-path-tile {
    background: #777;
    box-shadow: inset 0 0 0 2px #aaa;
}

.beige-stone-path-tile {
    background: rgb(var(--ui-surface-beige-path));
    box-shadow: inset 0 0 0 2px #ead3a2;
}
</style>
