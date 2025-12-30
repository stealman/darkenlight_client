<template>
    <div class="gm-panel-content">
        <span>Game Master Panel</span>

        <!-- Action select buttons -->
        <div class="gm-action-selection" style="margin: 10px 0;">
            <button :disabled="actualTab === GMTabs.OVERVIEW" @click="selectTab(GMTabs.OVERVIEW)">Overview</button>
            <button :disabled="actualTab === GMTabs.TERRAIN_EDIT" @click="selectTab(GMTabs.TERRAIN_EDIT)">Terrain Edit</button>
            <button :disabled="actualTab === GMTabs.BIOME_EDIT" @click="selectTab(GMTabs.BIOME_EDIT)">Biome</button>
            <button :disabled="actualTab === GMTabs.WALLS_AND_FENCES_EDIT" @click="selectTab(GMTabs.WALLS_AND_FENCES_EDIT)">Walls & Fences</button>
            <button :disabled="actualTab === GMTabs.SPAWNS_EDIT" @click="selectTab(GMTabs.SPAWNS_EDIT)">Spawns</button>
        </div>

        <!-- Overview -->
        <div v-if="actualTab === GMTabs.OVERVIEW">
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

        <!-- Spawns -->
        <div v-if="actualTab === GMTabs.SPAWNS_EDIT">
            <SpawnPanel />
        </div>

    </div>
</template>

<script setup>

import { GMManager, GmTabs as GMTabs } from '@/gm/GM'
import { ref, onMounted } from 'vue'
import BiomePanel from '@/vue/views/gm/BiomePanel.vue'
import TerrainPanel from '@/vue/views/gm/TerrainPanel.vue'
import WallsFencesPanel from '@/vue/views/gm/WallsFencesPanel.vue'
import SpawnPanel from '@/vue/views/gm/SpawnPanel.vue'

const actualTab = ref(GMTabs.OVERVIEW)

const selectTab = (tab) => {
    actualTab.value = tab
    GMManager.openTab(tab)
}
</script>

<style scoped>
.gm-panel-content {
    color: #fff;
}
</style>
