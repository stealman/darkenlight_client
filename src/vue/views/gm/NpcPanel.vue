<template>
    <div>
        <template v-if="selectedNpc">
            <label>Selected NPC #{{ selectedNpc.id }}</label>

            <button style="margin-top: 1vh;" @click="openNpcDetailsDialog">Detailed settings</button>
            <button style="margin-top: 1vh;" @click="cancelSelectedNpc">Cancel</button>
        </template>

        <template v-else>
            <label>NPC name</label>
            <input v-model="selectedNpcName" maxlength="32" placeholder="NPC name" />

            <p style="color: lightblue; font-size: 0.8rem;">Choose a name, then click a free tile to place the NPC. Click an existing NPC to edit it.</p>
        </template>
    </div>
</template>

<script setup>
import { GMManager } from '@/gm/GM'

const selectedNpcName = GMManager.selectedNpcName
const selectedNpc = GMManager.selectedNpc

const cancelSelectedNpc = () => {
    GMManager.cancelSelectedNpc()
}

const openNpcDetailsDialog = () => {
    GMManager.openNpcDetails()
}
</script>
