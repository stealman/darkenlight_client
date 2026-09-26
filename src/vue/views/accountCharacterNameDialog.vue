<template>
    <GameDialog
        backdrop-class="inventory-dialog-backdrop"
        :window-class="['login-dialog-window', 'account-character-name-dialog-window', { 'login-dialog-window--mobile': useMobileLoginLayout }]"
        content-class="login-dialog-content account-character-name-dialog-content"
        :close-on-backdrop="false"
        :close-on-escape="false"
    >
        <template #header>
            <span class="account-character-name-dialog-title ui-text-gradient">{{ t('login.accountCharacterNameTitle') }}</span>
        </template>

        <section class="account-character-name-section">
            <div class="account-character-name-description">{{ t('login.accountCharacterNameDescription') }}</div>
            <label class="login-field" for="account-character-name">
                <span :class="{ 'login-field-label--ready': nameReady }">{{ t('login.name') }}</span>
                <input id="account-character-name" v-model="name" type="text" autocomplete="off" @input="clearError" @keyup.enter="submit" />
            </label>
            <div v-if="error" class="account-character-name-error">{{ error }}</div>
        </section>

        <div class="dialog-actions account-character-name-actions">
            <button class="dialog-button" :disabled="!nameReady" @click="submit">
                <span class="ui-text-gradient--button-state">{{ t('login.accountCharacterNameContinue') }}</span>
            </button>
            <button class="dialog-button" @click="goBack">
                <span class="ui-text-gradient--button-state">{{ t('login.guestCreationBack') }}</span>
            </button>
        </div>
    </GameDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import GameDialog from '@/vue/views/GameDialog.vue'
import { useI18n } from '@/i18n'
import { Settings } from '@/settings/settings'
import { AudioManager } from '@/babylon/audio/audioManager'

const props = defineProps<{error: string, initialName: string}>()
const emit = defineEmits<{
    submit: [name: string]
    back: []
    input: []
}>()
const name = ref(props.initialName)
const useMobileLoginLayout = Settings.isPhoneOrTablet()
const nameReady = computed(() => name.value.trim().length >= 3)
const { t } = useI18n()

const clearError = () => emit('input')

const submit = () => {
    if (!nameReady.value) {
        return
    }
    AudioManager.playGuiButtonClick()
    emit('submit', name.value.trim())
}

const goBack = () => {
    AudioManager.playGuiButtonClick()
    emit('back')
}
</script>

<style>
.dialog-window.account-character-name-dialog-window {
    width: 600px;
    max-width: calc(100vw - 32px);
}

.login-dialog-window.account-character-name-dialog-window:not(.login-dialog-window--mobile) > .dialog-surface {
    min-height: var(--login-dialog-desktop-height, 0px);
}

.account-character-name-dialog-window > .dialog-surface > .dialog-header {
    padding: 5px;
    font-size: 1.28rem;
}

.account-character-name-dialog-title {
    letter-spacing: 0.04em;
    text-shadow: none;
}

.account-character-name-dialog-content {
    padding: 0 18px 14px;
}

.account-character-name-section {
    max-width: 420px;
    margin: 24px auto 0;
}

.account-character-name-description {
    margin-bottom: 16px;
    color: rgb(var(--ui-base));
    text-align: center;
}

.account-character-name-error {
    margin-top: 12px;
    color: rgb(var(--ui-accent-red));
    font-size: 0.9rem;
    text-align: center;
}

.account-character-name-actions {
    margin-top: 22px;
    padding-bottom: 4px;
}
</style>
