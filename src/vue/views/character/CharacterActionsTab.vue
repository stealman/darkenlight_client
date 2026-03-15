<template>
    <div class="character-actions-tab" @click="closeActionSelectionDialog">
        <div class="action-slots-list">
            <div
                v-for="slotIndex in actionButtonIndexes"
                :key="slotIndex"
                class="action-slot-row"
            >
                <div class="action-slot-label">F{{ slotIndex }}</div>
                <button
                    type="button"
                    class="action-slot-icon-shell"
                    :class="selectedSlotIndex === slotIndex ? 'selected' : ''"
                    @click.stop="openActionSelectionDialog(slotIndex)"
                >
                    <img
                        v-if="getBindingIcon(slotIndex)"
                        :src="getBindingIcon(slotIndex)!"
                        :alt="`Action button ${slotIndex}`"
                        class="action-slot-icon"
                    />
                </button>
                <div class="action-slot-description">
                    <strong v-if="getBindingDescriptionParts(slotIndex).title">{{ getBindingDescriptionParts(slotIndex).title }}</strong>{{ getBindingDescriptionParts(slotIndex).rest }}
                </div>
            </div>
        </div>

        <div v-if="selectedSlotIndex !== null" class="action-selection-dialog-layer">
            <div class="dialog-window action-selection-dialog-window" @click.stop>
                <div ref="actionSelectionContentRef" class="dialog-content action-selection-dialog-content">
                    <div class="action-option-row">
                        <button
                            type="button"
                            class="action-option"
                            data-action-key="NONE"
                            :class="getSelectedActionName(selectedSlotIndex) === null ? 'selected' : ''"
                            @click="clearActionSelection"
                        >
                            <img
                                src="/images/icons/buttons/btn_stop.png"
                                alt="Nevybráno"
                                class="action-option-icon"
                            />
                            <div class="action-option-text">
                                <strong>Nevybráno</strong>
                                <span>Na tomto tlačítku nebude přiřazena žádná akce.</span>
                            </div>
                        </button>
                    </div>

                    <div
                        v-for="action in availableActions"
                        :key="action.name"
                        class="action-option-row"
                    >
                        <button
                            type="button"
                            class="action-option"
                            :data-action-key="action.name"
                            :class="getSelectedActionName(selectedSlotIndex) === action.name ? 'selected' : ''"
                            @click="selectAction(action.name)"
                        >
                            <img
                                :src="getActionImage(action.image)"
                                :alt="action.description"
                                class="action-option-icon"
                            />
                            <div class="action-option-text">
                                <strong>{{ action.description.split(':')[0] }}</strong>
                                <span>{{ action.description.split(':')[1] }}</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'

const actionButtonIndexes = Array.from({ length: 10 }, (_, index) => index + 1)
const selectedSlotIndex = ref<number | null>(null)
const availableActions = computed(() => ActionButtonsManager.getAvailableActionsForBindings())
const actionSelectionContentRef = ref<HTMLElement | null>(null)

const getBindingIcon = (index: number) => {
    return ActionButtonsManager.getBindingIconForIndex(index)
}

const getBindingDescription = (index: number) => {
    return ActionButtonsManager.getBindingDescriptionForIndex(index)
}

const getBindingDescriptionParts = (index: number) => {
    const description = getBindingDescription(index)
    const separatorIndex = description.indexOf(':')

    if (separatorIndex === -1) {
        return {
            title: '',
            rest: description,
        }
    }

    return {
        title: description.slice(0, separatorIndex + 1),
        rest: description.slice(separatorIndex + 1),
    }
}

const getSelectedActionName = (index: number) => {
    return ActionButtonsManager.getBindingActionNameForIndex(index)
}

const getActionImage = (imageName: string) => {
    const currentSlotIndex = selectedSlotIndex.value
    if (currentSlotIndex !== null) {
        const button = ActionButtonsManager.actionButtons.get(currentSlotIndex)
        if (button) {
            return button.resolveImagePath(imageName)
        }
    }

    return `/images/icons/buttons/${imageName}.png`
}

const openActionSelectionDialog = (index: number) => {
    if (selectedSlotIndex.value === index) {
        closeActionSelectionDialog()
        return
    }

    selectedSlotIndex.value = index
}

const closeActionSelectionDialog = () => {
    selectedSlotIndex.value = null
}

const selectAction = (actionName: string) => {
    if (selectedSlotIndex.value === null) {
        return
    }

    ActionButtonsManager.setBindingForIndex(selectedSlotIndex.value, actionName)
    closeActionSelectionDialog()
}

const clearActionSelection = () => {
    if (selectedSlotIndex.value === null) {
        return
    }

    ActionButtonsManager.clearBindingForIndex(selectedSlotIndex.value)
    closeActionSelectionDialog()
}

const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || selectedSlotIndex.value === null) {
        return
    }

    event.stopPropagation()
    closeActionSelectionDialog()
}

onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
})

watch(selectedSlotIndex, async (index) => {
    if (index === null) {
        return
    }

    await nextTick()

    const container = actionSelectionContentRef.value
    if (!container) {
        return
    }

    const selectedActionName = getSelectedActionName(index)
    const selectedKey = selectedActionName ?? 'NONE'
    const selectedElement = container.querySelector<HTMLElement>(`[data-action-key="${selectedKey}"]`)

    if (!selectedElement) {
        container.scrollTop = 0
        return
    }

    const targetScrollTop = Math.max(0, selectedElement.offsetTop - container.offsetTop)
    container.scrollTop = targetScrollTop
})

defineExpose({
    closeActionSelectionDialog
})
</script>

<style scoped>
.character-actions-tab {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 8px;
    box-sizing: border-box;
}

.action-slots-list {
    height: 100%;
    overflow-y: auto;
    padding-right: 4px;
    box-sizing: border-box;
}

.action-slot-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
}

.action-slot-label {
    width: 26px;
    color: var(--ui-text);
    font-size: 0.85rem;
    text-align: right;
    flex: 0 0 26px;
}

.action-slot-icon-shell {
    width: 48px;
    height: 48px;
    flex: 0 0 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 11, 8, 0.45);
    border: 1px solid rgba(176, 143, 86, 0.9);
    box-sizing: border-box;
    padding: 0;
    cursor: url('/images/cursor-pointer.png'), pointer;
}

.action-slot-icon-shell:hover {
    border-color: rgba(214, 184, 110, 0.95);
}

.action-slot-icon-shell.selected {
    border-color: rgba(214, 184, 110, 0.95);
    background: rgba(64, 47, 18, 0.55);
}

.action-slot-icon {
    width: 80%;
    height: 80%;
    object-fit: contain;
    display: block;
}

.action-slot-description {
    color: var(--ui-text);
    font-size: 0.8rem;
    line-height: 1.25;
    text-align: left;
}

.action-selection-dialog-layer {
    position: absolute;
    inset: -42px 0 0 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 0px;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 20;
}

.action-selection-dialog-window {
    width: 400px;
    height: min(500px, calc(100% - 4px));
    max-width: min(400px, 94vw);
    max-height: min(500px, calc(100% - 4px), 90vh);
    box-sizing: border-box;
    overflow: hidden;
    padding: 8px;
    padding-bottom: 12px;
    padding-top: 0px;
    pointer-events: auto;
}

.action-selection-dialog-window .action-selection-dialog-content {
    display: block;
    flex: none;
    height: 100%;
    margin-top: 8px;
    padding: 0;
    box-sizing: border-box;
    overflow-y: auto;
    align-items: initial;
    justify-content: initial;
}

.action-option-row {
    display: block;
    width: 100%;
    margin-bottom: 8px;
}

.action-option-row:last-child {
    margin-bottom: 0;
}

.action-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 60px;
    padding: 10px;
    border: 1px solid rgba(176, 143, 86, 0.9);
    background: rgba(15, 11, 8, 0.45);
    color: var(--ui-text);
    text-align: left;
    cursor: url('/images/cursor-pointer.png'), pointer;
    box-sizing: border-box;
    margin: 0;
}

.action-option.selected {
    border-color: rgba(214, 184, 110, 0.95);
    background: rgba(64, 47, 18, 0.55);
}

.action-option-icon {
    width: 40px;
    height: 40px;
    object-fit: contain;
    flex: 0 0 40px;
}

.action-option-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.action-option-text span {
    font-size: 0.78rem;
    line-height: 1.25;
    white-space: normal;
}
</style>
