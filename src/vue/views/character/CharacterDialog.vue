<template>
    <GameDialog
        backdrop-id="character-dialog-backdrop"
        backdrop-class="inventory-dialog-backdrop"
        window-class="adaptive inventory-dialog-window character-dialog-window"
        @close="closeDialog"
    >
        <template #header>
            <div
                v-for="tab in tabs"
                :key="tab.id"
                class="tab-item"
                :class="tab.id === activeTabId ? 'active' : ''"
                @click="activeTabId = tab.id"
            >
                <label class="noselect">{{ tab.name }}</label>
            </div>
        </template>

        <div class="inventory-content-shell character-content-shell">
            <CharacterOverviewTab v-if="activeTabId === 'character'" />
            <CharacterActionsTab v-else-if="activeTabId === 'actions'" ref="characterActionsTabRef" />
            <CharacterSkillsTab v-else-if="activeTabId === 'skills'" />
            <CharacterChatTab v-else-if="activeTabId === 'chat'" />
        </div>
    </GameDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import GameDialog from '@/vue/views/GameDialog.vue'
import CharacterOverviewTab from '@/vue/views/character/CharacterOverviewTab.vue'
import CharacterActionsTab from '@/vue/views/character/CharacterActionsTab.vue'
import CharacterSkillsTab from '@/vue/views/character/CharacterSkillsTab.vue'
import CharacterChatTab from '@/vue/views/character/CharacterChatTab.vue'
import { useI18n } from '@/i18n'

const emit = defineEmits(['close'])
const { t } = useI18n()

const tabs = computed(() => [
    { id: 'character', name: t('character.tabs.character') },
    { id: 'actions', name: t('character.tabs.actions') },
    { id: 'skills', name: t('character.tabs.skills') },
    { id: 'chat', name: t('character.tabs.chat') },
])

const activeTabId = ref('character')
const characterActionsTabRef = ref()

const openDialog = () => {
    characterActionsTabRef.value?.closeActionSelectionDialog?.()
}

const closeDialog = () => {
    emit('close')
}

defineExpose({
    openDialog
})
</script>

<style scoped>
.character-dialog-window .dialog-content {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
}

.character-content-shell {
    width: 100%;
    aspect-ratio: 16 / 10;
    max-height: min(calc(600px - 48px), calc(85vh - 48px));
    overflow: visible;
    padding: 8px 4px 4px;
    box-sizing: border-box;
}
</style>
