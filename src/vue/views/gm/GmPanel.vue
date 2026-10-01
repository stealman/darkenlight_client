<template>
    <div class="gm-panel-content">
        <span>Game Master Panel</span>

        <!-- Action select buttons -->
        <div class="gm-action-selection" style="margin: 10px 0;">
            <button :disabled="actualTab === GMTabs.OVERVIEW" @click="selectTab(GMTabs.OVERVIEW)">Overview</button>
            <button :disabled="actualTab === GMTabs.WORLDS" @click="openWorldsDialog">Worlds</button>
            <button :disabled="actualTab === GMTabs.TERRAIN_EDIT" @click="selectTab(GMTabs.TERRAIN_EDIT)">Terrain Edit</button>
            <button :disabled="actualTab === GMTabs.BIOME_EDIT" @click="selectTab(GMTabs.BIOME_EDIT)">Biome</button>
            <button :disabled="actualTab === GMTabs.WALLS_AND_FENCES_EDIT" @click="selectTab(GMTabs.WALLS_AND_FENCES_EDIT)">Walls & Fences</button>
            <button :disabled="actualTab === GMTabs.STATICS_EDIT" @click="selectTab(GMTabs.STATICS_EDIT)">Statics</button>
            <button :disabled="actualTab === GMTabs.SPAWNS_EDIT" @click="selectTab(GMTabs.SPAWNS_EDIT)">Spawns</button>
            <button :disabled="actualTab === GMTabs.NPCS_EDIT" @click="selectTab(GMTabs.NPCS_EDIT)">NPCs</button>
            <button @click="openModelRenderDialog">Model Render</button>
            <button @click="openItemCreationDialog">Item Creation</button>
            <button @click="forceSaveData">Force Save Data</button>
        </div>

        <!-- Overview -->
        <div v-if="actualTab === GMTabs.OVERVIEW">
            <div class="gm-teleport-controls">
                <label>
                    World
                    <select v-model.number="teleportWorldId">
                        <option v-for="world in teleportWorlds" :key="world.id" :value="world.id">{{ world.name }} ({{ world.id }})</option>
                    </select>
                </label>
                <div class="gm-teleport-coordinates">
                    <label class="gm-teleport-coordinate">
                        X
                        <input v-model.number="teleportX" type="number" step="1" @keyup.enter="teleport" />
                    </label>
                    <label class="gm-teleport-coordinate">
                        Z
                        <input v-model.number="teleportZ" type="number" step="1" @keyup.enter="teleport" />
                    </label>
                </div>
                <button @click="teleport">TELEPORT</button>
            </div>

            <details class="gm-day-night-section">
                <summary>World time controls</summary>
                <div class="gm-day-night-controls">
                    <label>
                        World time
                        <input v-model="dayNightTime" type="time" step="60" @keyup.enter="setDayNightTime()" />
                    </label>
                    <button @click="setDayNightTime()">SET &amp; FREEZE</button>
                    <button @click="setDayNightTime('07:00')">SUNRISE</button>
                    <button @click="setDayNightTime('12:00')">DAY</button>
                    <button @click="setDayNightTime('19:00')">SUNSET</button>
                    <button @click="setDayNightTime('00:00')">NIGHT</button>
                    <button @click="resumeDayNightCycle">NATURAL CYCLE</button>
                    <button @click="triggerLightning">LIGHTNING</button>
                </div>
            </details>
        </div>

        <!-- Terrain -->
        <div v-if="actualTab === GMTabs.TERRAIN_EDIT">
            <TerrainPanel />
        </div>

        <!-- Biome -->
        <div v-if="actualTab === GMTabs.BIOME_EDIT">
            <BiomePanel />
         </div>

        <!-- Walls and Fences -->
        <div v-if="actualTab === GMTabs.WALLS_AND_FENCES_EDIT">
            <WallsFencesPanel />
        </div>

        <div v-if="actualTab === GMTabs.STATICS_EDIT">
            <StaticsPanel />
        </div>

        <!-- Spawns -->
        <div v-if="actualTab === GMTabs.SPAWNS_EDIT">
            <SpawnPanel />
        </div>

        <div v-if="actualTab === GMTabs.NPCS_EDIT">
            <NpcPanel />
        </div>

        <ModelRenderPanel ref="modelRenderPanel" />
        <WorldsPanel ref="worldsPanel" @close="worldsDialogClosed" />
        <ItemCreationPanel ref="itemCreationPanel" />

    </div>
</template>

<script setup>

import { GMManager, GmTabs as GMTabs } from '@/gm/GM'
import { computed, ref } from 'vue'
import BiomePanel from '@/vue/views/gm/BiomePanel.vue'
import TerrainPanel from '@/vue/views/gm/TerrainPanel.vue'
import WallsFencesPanel from '@/vue/views/gm/WallsFencesPanel.vue'
import StaticsPanel from '@/vue/views/gm/StaticsPanel.vue'
import SpawnPanel from '@/vue/views/gm/SpawnPanel.vue'
import NpcPanel from '@/vue/views/gm/NpcPanel.vue'
import ModelRenderPanel from '@/vue/views/gm/ModelRenderPanel.vue'
import WorldsPanel from '@/vue/views/gm/WorldsPanel.vue'
import ItemCreationPanel from '@/vue/views/gm/ItemCreationPanel.vue'
import { Lights } from '@/babylon/scene/lights'
import { LightningEffect } from '@/babylon/scene/lighting/lightningEffect'

const actualTab = ref(GMTabs.OVERVIEW)
const modelRenderPanel = ref(null)
const worldsPanel = ref(null)
const itemCreationPanel = ref(null)
const teleportX = ref(99)
const teleportZ = ref(80)
const teleportWorlds = computed(() => GMManager.teleportWorlds.value)
const teleportWorldId = computed({
    get: () => GMManager.selectedTeleportWorld.value,
    set: (worldId) => { GMManager.selectedTeleportWorld.value = worldId }
})
const dayNightTime = ref(Lights.getGameTimeInfo().time)

const selectTab = (tab) => {
    if (actualTab.value === GMTabs.WORLDS) {
        worldsPanel.value?.closeDialog()
    }
    actualTab.value = tab
    GMManager.openTab(tab)
}

const openModelRenderDialog = () => {
    if (actualTab.value === GMTabs.WORLDS) {
        worldsPanel.value?.closeDialog()
    }
    modelRenderPanel.value?.openDialog()
}

const openWorldsDialog = () => {
    actualTab.value = GMTabs.WORLDS
    GMManager.openTab(GMTabs.WORLDS)
    worldsPanel.value?.openDialog()
}

const worldsDialogClosed = () => {
    if (actualTab.value !== GMTabs.WORLDS) {
        return
    }
    actualTab.value = GMTabs.OVERVIEW
    GMManager.openTab(GMTabs.OVERVIEW)
}

const openItemCreationDialog = () => {
    if (actualTab.value === GMTabs.WORLDS) {
        worldsPanel.value?.closeDialog()
    }
    itemCreationPanel.value?.openDialog()
}

const forceSaveData = () => {
    if (actualTab.value === GMTabs.WORLDS) {
        worldsPanel.value?.closeDialog()
    }
    GMManager.forceSaveData()
}

const teleport = () => {
    if (Number.isFinite(teleportWorldId.value) && Number.isFinite(teleportX.value) && Number.isFinite(teleportZ.value)) {
        GMManager.teleport(teleportWorldId.value, teleportX.value, teleportZ.value)
    }
}

const setDayNightTime = (time = dayNightTime.value) => {
    dayNightTime.value = time
    GMManager.setDayNightTime(time)
}

const resumeDayNightCycle = () => {
    GMManager.resumeDayNightCycle()
}

const triggerLightning = () => {
    LightningEffect.trigger()
}
</script>

<style scoped>
.gm-panel-content {
    color: #fff;
}

.gm-teleport-controls {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
}

.gm-teleport-controls label {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.gm-teleport-coordinates {
    display: flex;
    gap: 8px;
}

.gm-teleport-controls .gm-teleport-coordinate {
    flex-direction: row;
    align-items: center;
    gap: 6px;
}

.gm-teleport-coordinate input {
    width: 5rem;
}

.gm-day-night-section {
    margin-top: 12px;
}

.gm-day-night-section summary {
    cursor: pointer;
    user-select: none;
}

.gm-day-night-controls {
    display: flex;
    align-items: end;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
}
</style>
