<template>
    <GameDialog
        backdrop-class="inventory-dialog-backdrop"
        window-class="adaptive inventory-dialog-window container-dialog-window"
        content-class="container-dialog-content"
        :close-on-backdrop="false"
        @backdrop-click="onBackdropClick"
        @close="closeDialog"
    >
        <template #header>{{ t('container.barrel') }}</template>
        <BankPanel storage="container" />
    </GameDialog>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue'
import GameDialog from '@/vue/views/GameDialog.vue'
import BankPanel from '@/vue/views/npc/BankPanel.vue'
import {ContainerManager} from '@/data/containerManager'
import {t} from '@/i18n'

const emit = defineEmits(['close'])
const props = defineProps<{visible: boolean}>()
const IGNORE_BACKDROP_CLICK_AFTER_OPEN_MS = 350
const openedAt = ref(0)

watch(() => props.visible, (visible) => {
    if (visible) openedAt.value = Date.now()
})

const closeDialog = () => {
    ContainerManager.close()
    emit('close')
}

const onBackdropClick = () => {
    if ((Date.now() - openedAt.value) < IGNORE_BACKDROP_CLICK_AFTER_OPEN_MS) return
    closeDialog()
}
</script>

<style scoped>
:deep(.container-dialog-content) {
    width: 100%;
    height: min(600px, calc(85vh - 48px));
    box-sizing: border-box;
    padding: 10px;
    overflow: hidden;
}
</style>
