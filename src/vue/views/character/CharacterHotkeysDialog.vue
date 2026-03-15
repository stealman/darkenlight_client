<template>
    <div class="character-subdialog-backdrop" @click.self="closeDialog">
        <div class="character-subdialog-window">
            <div
                v-for="slotIndex in actionButtonIndexes"
                :key="slotIndex"
                class="action-slot-row"
            >
                <div class="action-slot-label">{{ slotIndex }}</div>
                <div class="action-slot-icon-shell">
                    <img
                        v-if="getBindingIcon(slotIndex)"
                        :src="getBindingIcon(slotIndex)!"
                        :alt="`Action button ${slotIndex}`"
                        class="action-slot-icon"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ActionButtonsManager } from '@/gui/actionButtonsManager'

const emit = defineEmits(['close'])
const actionButtonIndexes = Array.from({ length: 10 }, (_, index) => index + 1)

const closeDialog = () => {
    emit('close')
}

const getBindingIcon = (index: number) => {
    return ActionButtonsManager.getBindingIconForIndex(index)
}
</script>

<style scoped>
.character-subdialog-backdrop {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.2);
    z-index: 10;
}

.character-subdialog-window {
    width: 400px;
    height: 300px;
    max-width: calc(100% - 24px);
    max-height: calc(100% - 24px);
    background: var(--dialog-bg);
    border: 1px solid var(--dialog-color-dark);
    box-shadow: 0 0 20px var(--dialog-glow), 0 0 40px rgba(0, 0, 0, 0.4);
    border-radius: 6px;
    padding: 12px;
    box-sizing: border-box;
    overflow-y: auto;
}

.action-slot-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
}

.action-slot-label {
    width: 18px;
    color: var(--ui-text);
    font-size: 0.85rem;
    text-align: right;
}

.action-slot-icon-shell {
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 11, 8, 0.45);
    border: 1px solid rgba(176, 143, 86, 0.9);
    box-sizing: border-box;
}

.action-slot-icon {
    width: 80%;
    height: 80%;
    object-fit: contain;
    display: block;
}
</style>
