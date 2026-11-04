<template>
    <GameDialog v-if="dialogVisible" window-class="adaptive inventory-dialog-window bot-details-dialog-window dialog-themed-fields" @close="closeDialog">
        <template #header>Bot details</template>

        <div class="bot-details-dialog-content">
            <label class="bot-details-control">
                <span>Name</span>
                <input v-model="botName" type="text" maxlength="32" placeholder="Bot name" @keyup.enter="saveDetails" />
            </label>

            <div class="bot-details-spawn-row">
                <label class="bot-details-control">
                    <span>Spawn X</span>
                    <input v-model.number="botX" type="number" min="1" step="1" />
                </label>
                <label class="bot-details-control">
                    <span>Spawn Z</span>
                    <input v-model.number="botZ" type="number" min="1" step="1" />
                </label>
                <button class="dialog-button" @click="respawn"><span class="ui-text-gradient--button-state">Respawn</span></button>
            </div>

            <div class="dialog-actions">
                <button class="dialog-button" :disabled="!botName.trim() || !validPosition" @click="saveDetails"><span class="ui-text-gradient--button-state">Save</span></button>
                <button class="dialog-button" @click="closeDialog"><span class="ui-text-gradient--button-state">Cancel</span></button>
            </div>
        </div>
    </GameDialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { GMManager } from '@/gm/GM'
import GameDialog from '@/vue/views/GameDialog.vue'

const dialogVisible = ref(false)
const botName = ref('')
const botX = ref(1)
const botZ = ref(1)
const validPosition = computed(() => Number.isInteger(botX.value) && botX.value >= 1
    && Number.isInteger(botZ.value) && botZ.value >= 1)

const openDialog = () => {
    const bot = GMManager.selectedBot.value
    if (!bot) {
        return
    }
    botName.value = bot.name ?? 'BOT'
    botX.value = bot.origin.x
    botZ.value = bot.origin.z
    dialogVisible.value = true
}

const closeDialog = () => {
    dialogVisible.value = false
    GMManager.cancelSelectedBot()
}

const saveDetails = () => {
    const name = botName.value.trim()
    if (!name || !validPosition.value) {
        return
    }
    GMManager.saveSelectedBot(name, botX.value, botZ.value)
    dialogVisible.value = false
}

const respawn = () => {
    GMManager.respawnSelectedBot()
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

.bot-details-spawn-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.bot-details-spawn-row .bot-details-control {
    grid-template-columns: auto minmax(0, 1fr);
    flex: 1;
    min-width: 0;
    white-space: nowrap;
}

.bot-details-control input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
}
</style>
