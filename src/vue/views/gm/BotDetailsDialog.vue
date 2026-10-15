<template>
    <GameDialog v-if="dialogVisible" window-class="adaptive inventory-dialog-window bot-details-dialog-window" @close="closeDialog">
        <template #header>Bot details</template>

        <div class="bot-details-dialog-content">
            <label class="bot-details-control">
                <span>Name</span>
                <input v-model="botName" type="text" maxlength="32" placeholder="Bot name" @keyup.enter="saveDetails" />
            </label>

            <div class="dialog-actions">
                <button class="dialog-button" :disabled="!botName.trim()" @click="saveDetails"><span class="ui-text-gradient--button-state">Save</span></button>
                <button class="dialog-button" @click="closeDialog"><span class="ui-text-gradient--button-state">Cancel</span></button>
            </div>
        </div>
    </GameDialog>
</template>

<script setup>
import { ref } from 'vue'
import { GMManager } from '@/gm/GM'
import GameDialog from '@/vue/views/GameDialog.vue'

const dialogVisible = ref(false)
const botName = ref('')

const openDialog = () => {
    const bot = GMManager.selectedBot.value
    if (!bot) {
        return
    }
    botName.value = bot.name ?? 'BOT'
    dialogVisible.value = true
}

const closeDialog = () => {
    dialogVisible.value = false
    GMManager.cancelSelectedBot()
}

const saveDetails = () => {
    const name = botName.value.trim()
    if (!name) {
        return
    }
    GMManager.saveSelectedBot(name)
    dialogVisible.value = false
}

defineExpose({openDialog})
</script>

<style scoped>
.bot-details-dialog-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
}

.bot-details-control {
    display: grid;
    grid-template-columns: 70px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
}
</style>
