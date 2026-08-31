<template>
    <div v-if="dialogVisible" class="dialog-backdrop" @click.self="closeDialog">
        <div class="dialog-window adaptive npc-details-dialog-window">
            <div class="dialog-header">NPC details</div>
            <div class="dialog-content npc-details-dialog-content">
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
        </div>
    </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { GMManager } from '@/gm/GM'

const presetTitles = ['Blacksmith', 'Jeweler', 'Bowcraft', 'Shopkeeper', 'Banker', 'Healer']
const dialogVisible = ref(false)
const titleSelection = ref('')
const customTitle = ref('')

const openDialog = () => {
    const title = GMManager.selectedNpc.value?.title ?? ''
    if (presetTitles.includes(title) || title === '') {
        titleSelection.value = title
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

const onDialogKeyDown = (event) => {
    if (dialogVisible.value && event.key === 'Escape') {
        closeDialog()
    }
}

onMounted(() => {
    window.addEventListener('keydown', onDialogKeyDown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onDialogKeyDown)
})

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
