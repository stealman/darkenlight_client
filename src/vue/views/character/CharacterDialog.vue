<template>
    <div id="character-dialog-backdrop" class="dialog-backdrop inventory-dialog-backdrop" @click.self="closeDialog">
        <div class="dialog-window adaptive inventory-dialog-window character-dialog-window">
            <div class="dialog-header">
                <div
                    v-for="tab in tabs"
                    :key="tab.id"
                    class="tab-item"
                    :class="tab.id === activeTabId ? 'active' : ''"
                    @click="activeTabId = tab.id"
                >
                    <label class="noselect">{{ tab.name }}</label>
                </div>
            </div>
            <div class="dialog-content">
                <div class="inventory-content-shell character-content-shell">
                    <CharacterOverviewTab v-if="activeTabId === 'character'" />
                    <CharacterSkillsTab v-else-if="activeTabId === 'skills'" />
                    <CharacterChatTab v-else-if="activeTabId === 'chat'" />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import CharacterOverviewTab from '@/vue/views/character/CharacterOverviewTab.vue'
import CharacterSkillsTab from '@/vue/views/character/CharacterSkillsTab.vue'
import CharacterChatTab from '@/vue/views/character/CharacterChatTab.vue'

const emit = defineEmits(['close'])

const tabs = [
    { id: 'character', name: 'Postava' },
    { id: 'skills', name: 'Dovednosti' },
    { id: 'chat', name: 'Chat' },
]

const activeTabId = ref(tabs[0].id)

const openDialog = () => {
}

const closeDialog = () => {
    emit('close')
}

const onDialogKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
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
    openDialog
})
</script>

<style scoped>
.character-dialog-window .dialog-content {
    display: flex;
    align-items: center;
    justify-content: center;
}

.character-content-shell {
    width: 100%;
    aspect-ratio: 16 / 10;
    max-height: min(calc(600px - 48px), calc(85vh - 48px));
    overflow-y: auto;
    padding: 8px 4px 4px;
    box-sizing: border-box;
}
</style>
