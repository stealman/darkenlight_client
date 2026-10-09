<template>
    <div class="equipment-decorations-panel">
        <label>
            Action
            <select v-model="action">
                <option value="ADD">Place</option>
                <option value="EDIT">Edit</option>
                <option value="REMOVE_ON_TILE">Delete all on tile</option>
            </select>
        </label>

        <template v-if="action !== 'REMOVE_ON_TILE'">
            <label>
                Category
                <select v-model="category">
                    <option value="WEAPON">Weapon</option>
                    <option value="ARMOR">Armor</option>
                </select>
            </label>
            <label>
                Item
                <select v-model.number="codebookId" :disabled="availableItems.length === 0">
                    <option v-for="item in availableItems" :key="`${item.type}-${item.id}`" :value="item.id">
                        {{ item.id }} - {{ getItemName(item) }}
                    </option>
                </select>
            </label>

            <fieldset>
                <legend>Position offset</legend>
                <label v-for="axis in axes" :key="`offset-${axis}`">
                    {{ axis.toUpperCase() }}
                    <input v-model.number="offset[axis]" type="number" step="0.05" min="-16" max="16" @focus="selectInputContent">
                </label>
            </fieldset>

            <fieldset>
                <legend>Rotation (degrees)</legend>
                <label v-for="axis in axes" :key="`rotation-${axis}`">
                    {{ axis.toUpperCase() }}
                    <input v-model.number="rotation[axis]" type="number" step="5" @focus="selectInputContent">
                </label>
            </fieldset>
        </template>

        <template v-if="action !== 'REMOVE_ON_TILE' && draftTile">
            <p>Editing tile {{ draftTile.x }}, {{ draftTile.z }}. Changes are shown immediately.</p>
            <div class="equipment-decoration-actions">
                <button @click="saveDraft">SAVE</button>
                <button @click="cancelDraft">CANCEL</button>
            </div>
        </template>
        <p v-else>Click a world tile to {{ action === 'ADD' ? 'start placement' : action === 'EDIT' ? 'edit its first equipment decoration' : 'remove its equipment decorations' }}.</p>
    </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { GMManager } from '@/gm/GM'
import { t } from '@/i18n'
import { EquipManager } from '@/babylon/item/equipManager'

const axes = ['x', 'y', 'z']
const action = GMManager.equipmentDecorationAction
const category = GMManager.equipmentDecorationCategory
const codebookId = GMManager.equipmentDecorationCodebookId
const offset = GMManager.equipmentDecorationOffset
const rotation = GMManager.equipmentDecorationRotation
const draftTile = GMManager.equipmentDecorationDraftTile
const availableItems = computed(() => GMManager.itemCodebook.value.filter((item) =>
    item.type === category.value && item.modelId !== undefined && EquipManager.itemTypes.has(item.modelId),
))

const getItemName = (item) => {
    const section = item.type === 'WEAPON' ? 'weapons' : 'armors'
    const key = `items.${section}.${item.name}`
    const localized = t(key)
    return localized === key ? item.name : localized
}

const selectInputContent = (event) => event.target.select()

watch(availableItems, (items) => {
    if (items.length > 0 && !items.some((item) => item.id === codebookId.value)) {
        codebookId.value = items[0].id
    }
}, {immediate: true})

watch([category, codebookId, offset, rotation], () => {
    GMManager.refreshEquipmentDecorationPreview()
}, {deep: true})

watch(action, () => {
    GMManager.cancelEquipmentDecorationDraft()
})

const saveDraft = () => GMManager.saveEquipmentDecorationDraft()
const cancelDraft = () => GMManager.cancelEquipmentDecorationDraft()
</script>

<style scoped>
.equipment-decorations-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 430px;
}

.equipment-decorations-panel > label,
fieldset label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

fieldset {
    display: grid;
    grid-template-columns: repeat(3, 72px);
    gap: 8px;
    width: max-content;
    max-width: 100%;
}

fieldset label {
    flex-direction: column;
    align-items: stretch;
}

fieldset input {
    width: 72px;
}

input,
select {
    min-width: 0;
}

.equipment-decoration-actions {
    display: flex;
    gap: 8px;
}
</style>
