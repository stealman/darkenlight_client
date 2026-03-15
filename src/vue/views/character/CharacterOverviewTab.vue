<template>
    <div class="character-tab-panel">
        <div class="character-tab-actions">
            <button class="dialog-button hotkeys-button" @click="openHotkeysDialog">Akce</button>
        </div>

        <CharacterHotkeysDialog
            v-if="displayHotkeysDialog"
            @close="displayHotkeysDialog = false"
        />
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { AudioManager } from '@/babylon/audio/audioManager'
import CharacterHotkeysDialog from '@/vue/views/character/CharacterHotkeysDialog.vue'

const displayHotkeysDialog = ref(false)

const openHotkeysDialog = () => {
    AudioManager.playGuiButtonClick()
    displayHotkeysDialog.value = true
}
</script>

<style scoped>
.character-tab-panel {
    width: 100%;
    min-height: 100%;
    position: relative;
}

.character-tab-actions {
    display: flex;
    justify-content: flex-end;
    padding: 4px;
}

.hotkeys-button {
    padding: 8px 16px;
}
</style>
