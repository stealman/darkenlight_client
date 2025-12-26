<template>
    <div class="gm-panel-content">
        <span>Game Master Panel</span>

        <!-- Action select buttons -->
        <div class="gm-action-selection" style="margin: 10px 0;">
            <button :disabled="actualTab === GMTabs.OVERVIEW" @click="selectTab(GMTabs.OVERVIEW)">Overview</button>
            <button :disabled="actualTab === GMTabs.TERRAIN_EDIT" @click="selectTab(GMTabs.TERRAIN_EDIT)">Terrain Edit</button>
        </div>

        <!-- Overview Action -->
        <div v-if="actualTab === GMTabs.OVERVIEW">
        </div>

        <!-- Terrain Edit Action -->
        <div v-if="actualTab === GMTabs.TERRAIN_EDIT">
            <div>
                <span v-if="!shiftKeyPressed">UP</span>
                <span v-else>DOWN</span>
            </div>

            <button @click="saveMapData">Save Data</button>
        </div>


    </div>
</template>

<script setup>

import { GMManager, GmTabs as GMTabs } from '@/gm/GM'
import { ref, onMounted } from 'vue'

const actualTab = ref(GMTabs.OVERVIEW)
const shiftKeyPressed = GMManager.shiftKeyPressed

const saveMapData = () => {
    GMManager.saveMapData()
}

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
