<template>
    <div>
        <label>Server bot</label>
        <p style="color: lightblue; font-size: 0.8rem;">
            Click a free tile to place a Fighter named BOT. Its name and origin persist; gameplay state resets after a server restart.
        </p>
        <button @click="existingBotsDialog?.openDialog()">Existing Bots</button>
        <ExistingBotsDialog ref="existingBotsDialog" />
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ExistingBotsDialog from '@/vue/views/gm/ExistingBotsDialog.vue'

const existingBotsDialog = ref<InstanceType<typeof ExistingBotsDialog> | null>(null)
</script>
