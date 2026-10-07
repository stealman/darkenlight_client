<template>
    <div>
        <template v-if="selectedNpc">
            <label>Selected NPC #{{ selectedNpc.id }}</label>

            <button style="margin-top: 1vh;" @click="openNpcDetailsDialog">Detailed settings</button>
            <button style="margin-top: 1vh;" @click="cancelSelectedNpc">Cancel</button>
        </template>

        <template v-else>
            <label>NPC type</label>
            <select v-model="selectedNpcType">
                <option value="common">Common</option>
                <option value="guard">Guard</option>
            </select>

            <label>NPC name</label>
            <input v-model="selectedNpcName" maxlength="32" placeholder="NPC name" />

            <p style="color: lightblue; font-size: 0.8rem;">Choose a name, then click a free tile to place the NPC. Guards default to "Guard". Click an existing NPC to edit it.</p>
        </template>
    </div>
</template>

<script setup>
import { watch } from 'vue'
import { GMManager } from '@/gm/GM'

const selectedNpcName = GMManager.selectedNpcName
const selectedNpcType = GMManager.selectedNpcType
const selectedNpc = GMManager.selectedNpc

watch(selectedNpcType, (type, previousType) => {
    if (type === 'guard' && !selectedNpcName.value.trim()) {
        selectedNpcName.value = 'Guard'
    } else if (previousType === 'guard' && type !== 'guard' && selectedNpcName.value === 'Guard') {
        selectedNpcName.value = ''
    }
})

const cancelSelectedNpc = () => {
    GMManager.cancelSelectedNpc()
}

const openNpcDetailsDialog = () => {
    GMManager.openNpcDetails()
}
</script>
