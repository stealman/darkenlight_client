<template>
    <GameDialog v-if="dialogVisible" window-class="adaptive npc-details-dialog-window" @close="closeDialog">
        <template #header>NPC details</template>

        <div class="npc-details-dialog-content">
            <label class="npc-details-control">
                <span>Title</span>
                <select v-model="titleSelection">
                    <option value="">No title</option>
                    <option v-for="title in presetTitles" :key="title" :value="title">{{ title }}</option>
                    <option value="__custom__">Custom title</option>
                </select>
            </label>

            <label v-if="titleSelection === '__custom__'" class="npc-details-control">
                <span>Custom title</span>
                <input v-model="customTitle" type="text" maxlength="48" placeholder="NPC title" />
            </label>

            <div class="dialog-actions">
                <button class="dialog-button" @click="saveDetails">Save</button>
                <button class="dialog-button" @click="closeDialog">Cancel</button>
            </div>
        </div>
    </GameDialog>
</template>

<script setup>
import { ref } from 'vue'
import { GMManager } from '@/gm/GM'
import GameDialog from '@/vue/views/GameDialog.vue'

const presetTitles = ['Blacksmith', 'Jeweler', 'Bowcraft', 'Shopkeeper', 'Banker', 'Healer', 'Vendor', 'Skill Trainer', 'Common']
const npcTypeTitles = {
    banker: 'Banker',
    vendor: 'Vendor',
    healer: 'Healer',
    skillTrainer: 'Skill Trainer',
    common: 'Common',
}
const dialogVisible = ref(false)
const titleSelection = ref('')
const customTitle = ref('')

const openDialog = () => {
    const npc = GMManager.selectedNpc.value
    const title = npc?.title ?? ''
    if (presetTitles.includes(title)) {
        titleSelection.value = title
        customTitle.value = ''
    } else if (title === '') {
        titleSelection.value = npcTypeTitles[npc?.type] ?? ''
        customTitle.value = ''
    } else {
        titleSelection.value = '__custom__'
        customTitle.value = title
    }
    dialogVisible.value = true
}

const closeDialog = () => {
    dialogVisible.value = false
}

const saveDetails = () => {
    const title = titleSelection.value === '__custom__' ? customTitle.value.trim() : titleSelection.value
    GMManager.setSelectedNpcTitle(title)
    closeDialog()
}

defineExpose({
    openDialog,
})
</script>

<style scoped>
.npc-details-dialog-window {
    width: 340px;
    max-width: min(340px, 94vw);
}

.npc-details-dialog-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
}

.npc-details-control {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
}

.npc-details-control input,
.npc-details-control select {
    width: 100%;
}
</style>
