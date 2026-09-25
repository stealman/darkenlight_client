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
                :class="{
                    active: tab.id === activeTabId,
                    'tab-item--training-available': tab.id === 'skills' && hasAvailableSkillTraining,
                }"
                @click="selectTab(tab.id)"
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
import { AudioManager } from '@/babylon/audio/audioManager'
import { MyPlayer } from '@/data/myPlayer'
import type {SkillKey} from '@/network/messageIfs'

const emit = defineEmits(['close'])
const { t } = useI18n()
const myChar = MyPlayer.myCharRef

const tabs = computed(() => [
    { id: 'character', name: t('character.tabs.character') },
    { id: 'actions', name: t('character.tabs.actions') },
    { id: 'skills', name: t('character.tabs.skills') },
    { id: 'chat', name: t('character.tabs.chat') },
])

const activeTabId = ref('character')
const characterActionsTabRef = ref()

const hasAvailableSkillTraining = computed(() => {
    const skillSet = myChar.value?.skillSet
    const skillCaps = myChar.value?.skillCaps

    if (!skillSet || !skillCaps || skillSet.activeTrainingSkill) {
        return false
    }

    return Object.keys(skillCaps).some((key) => {
        const skill = skillSet[key as SkillKey]

        if (!skill || skill.nextExperienceRequired == null || skill.nextTrainingRequired == null) {
            return false
        }

        const timeTrainingIsComplete = skill.trainingPoints >= skill.nextTrainingRequired
        const practicalExperienceIsMissing = skill.experience < skill.nextExperienceRequired
        return !timeTrainingIsComplete || !practicalExperienceIsMissing
    })
})

const selectTab = (tabId: string) => {
    if (activeTabId.value === tabId) {
        return
    }

    AudioManager.playGuiButtonClick()
    activeTabId.value = tabId
}

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
:global(.inventory-dialog-window.character-dialog-window > .dialog-surface > .dialog-content) {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
}

.character-content-shell {
    width: 100%;
    aspect-ratio: 16 / 10;
    max-height: min(calc(650px - 48px), calc(85vh - 48px));
    overflow: visible;
    padding: 0 4px 4px;
    box-sizing: border-box;
}

.tab-item.active label {
    display: inline-block;
    background: linear-gradient(to top, rgb(var(--ui-dark)), rgb(var(--ui-base)));
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
    text-shadow: none;
}

.tab-item--training-available label {
    animation: character-skill-training-available-pulse 1.8s ease-in-out infinite;
}

@keyframes character-skill-training-available-pulse {
    0%, 100% {
        color: inherit;
        text-shadow: inherit;
    }

    50% {
        color: rgb(var(--ui-attention));
        text-shadow: 0 0 4px rgba(var(--ui-attention), 0.45);
    }
}

@media (prefers-reduced-motion: reduce) {
    .tab-item--training-available label {
        animation: none;
    }
}

</style>
