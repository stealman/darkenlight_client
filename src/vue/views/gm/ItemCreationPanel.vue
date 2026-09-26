<template>
    <div v-if="dialogVisible" class="dialog-backdrop" @click.self="closeDialog">
        <div class="dialog-window adaptive item-creation-dialog-window">
            <div class="dialog-header">Item Creation</div>
            <div class="dialog-content item-creation-dialog-content">
                <label class="item-creation-control">
                    <span>Type</span>
                    <select v-model="itemType">
                        <option value="WEAPON">WEAPON</option>
                        <option value="ARMOR">ARMOR</option>
                        <option value="JEWEL">JEWEL</option>
                        <option value="TRINKET">TRINKET</option>
                        <option value="RESOURCE">RESOURCE</option>
                    </select>
                </label>

                <label class="item-creation-control">
                    <span>Item</span>
                    <select v-model.number="codebookId" :disabled="availableCodebookItems.length === 0">
                        <option v-for="item in availableCodebookItems" :key="`${item.type}-${item.id}`" :value="item.id">
                            {{ item.id }} — {{ getItemName(item) }}
                        </option>
                    </select>
                </label>

                <label v-if="isResource" class="item-creation-control">
                    <span>Quantity</span>
                    <input v-model.number="quantity" type="number" min="1" @focus="selectInputContent" @click="selectInputContent">
                </label>

                <template v-else>
                    <label class="item-creation-control">
                        <span>Quality</span>
                        <input v-model.number="quality" type="number" min="0" @focus="selectInputContent" @click="selectInputContent">
                    </label>
                </template>

                <button class="dialog-button item-creation-create-button" :disabled="availableCodebookItems.length === 0" @click="createItem"><span class="ui-text-gradient--button-state">CREATE</span></button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { GMManager } from '@/gm/GM'
import { t } from '@/i18n'

const dialogVisible = ref(false)
const itemType = ref('WEAPON')
const codebookId = ref(0)
const quantity = ref(1)
const quality = ref(25)

const isResource = computed(() => itemType.value === 'RESOURCE')
const itemTypeLocalizationSections = {
    WEAPON: 'weapons',
    ARMOR: 'armors',
    JEWEL: 'jewels',
    TRINKET: 'trinkets',
    RESOURCE: 'resources',
}
const availableCodebookItems = computed(() => GMManager.itemCodebook.value.filter((item) => item.type === itemType.value))

const openDialog = () => {
    dialogVisible.value = true
    GMManager.loadItemCodebook()
}

const closeDialog = () => {
    dialogVisible.value = false
}

const toSafeNumber = (value, fallback = 0) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
        return fallback
    }
    return Math.floor(parsed)
}

const getItemName = (item) => {
    const section = itemTypeLocalizationSections[item.type]
    const localizationKey = section ? `items.${section}.${item.name}` : item.name
    const localizedName = t(localizationKey)
    return localizedName === localizationKey ? item.name : localizedName
}

watch(availableCodebookItems, (items) => {
    if (!items.some((item) => item.id === codebookId.value)) {
        codebookId.value = items[0]?.id ?? 0
    }
}, {immediate: true})

const createItem = () => {
    const selectedItem = availableCodebookItems.value.find((item) => item.id === codebookId.value)
    if (!selectedItem) {
        return
    }

    const safeCodebookId = selectedItem.id

    if (isResource.value) {
        const safeQuantity = Math.max(1, toSafeNumber(quantity.value, 1))
        GMManager.createItem(itemType.value, safeCodebookId, safeQuantity, null)
    } else {
        const safeQuality = Math.max(0, toSafeNumber(quality.value, 0))
        GMManager.createItem(itemType.value, safeCodebookId, null, safeQuality)
    }

    closeDialog()
}

const onDialogKeyDown = (event) => {
    if (!dialogVisible.value) {
        return
    }
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
    openDialog,
})
</script>

<style scoped>
.item-creation-dialog-window {
    width: 340px;
    max-width: min(340px, 94vw);
}

.item-creation-dialog-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
}

.item-creation-control {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
}

.item-creation-control input,
.item-creation-control select {
    width: 100%;
}

.item-creation-create-button {
    width: 100%;
    margin-top: 4px;
}
</style>
