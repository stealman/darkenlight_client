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
                    <span>Codebook Id</span>
                    <input v-model.number="codebookId" type="number" min="0" @focus="selectInputContent" @click="selectInputContent">
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

                <button class="dialog-button item-creation-create-button" @click="createItem">CREATE</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { GMManager } from '@/gm/GM'

const dialogVisible = ref(false)
const itemType = ref('WEAPON')
const codebookId = ref(1)
const quantity = ref(1)
const quality = ref(25)

const isResource = computed(() => itemType.value === 'RESOURCE')

const openDialog = () => {
    dialogVisible.value = true
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

const selectInputContent = (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) {
        return
    }

    target.select()
}

const createItem = () => {
    const safeCodebookId = Math.max(0, toSafeNumber(codebookId.value, 0))

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
