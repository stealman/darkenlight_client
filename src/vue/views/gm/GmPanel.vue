<template>
    <div class="gm-panel-content">
        <span>Game Master Panel</span>

        <!-- Action select buttons -->
        <div class="gm-action-selection" style="margin: 10px 0;">
            <button :disabled="actualTab === GMTabs.OVERVIEW" @click="selectTab(GMTabs.OVERVIEW)">Overview</button>
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
            <div style="display: flex; align-items: end; gap: 8px;">
                <label>
                    World
                    <select v-model.number="teleportWorldId">
                        <option v-for="world in teleportWorlds" :key="world.id" :value="world.id">{{ world.name }} ({{ world.id }})</option>
                    </select>
                </label>
                <label>
                    X
                    <input v-model.number="teleportX" type="number" step="1" @keyup.enter="teleport" />
                </label>
                <label>
                    Z
                    <input v-model.number="teleportZ" type="number" step="1" @keyup.enter="teleport" />
                </label>
                <button @click="teleport">TELEPORT</button>
            </div>
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
import ItemCreationPanel from '@/vue/views/gm/ItemCreationPanel.vue'

const actualTab = ref(GMTabs.OVERVIEW)
const modelRenderPanel = ref(null)
const itemCreationPanel = ref(null)
const teleportX = ref(99)
const teleportZ = ref(80)
const teleportWorlds = computed(() => GMManager.teleportWorlds.value)
const teleportWorldId = computed({
    get: () => GMManager.selectedTeleportWorld.value,
    set: (worldId) => { GMManager.selectedTeleportWorld.value = worldId }
})

const selectTab = (tab) => {
    actualTab.value = tab
    GMManager.openTab(tab)
}

const openModelRenderDialog = () => {
    modelRenderPanel.value?.openDialog()
}

const openItemCreationDialog = () => {
    itemCreationPanel.value?.openDialog()
}

const forceSaveData = () => {
    GMManager.forceSaveData()
}

const teleport = () => {
    if (Number.isFinite(teleportWorldId.value) && Number.isFinite(teleportX.value) && Number.isFinite(teleportZ.value)) {
        GMManager.teleport(teleportWorldId.value, teleportX.value, teleportZ.value)
    }
}
</script>

<style scoped>
.gm-panel-content {
    color: #fff;
}
</style>
