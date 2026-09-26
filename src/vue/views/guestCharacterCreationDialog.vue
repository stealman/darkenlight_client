<template>
    <GameDialog
        backdrop-class="inventory-dialog-backdrop"
        :window-class="['login-dialog-window', 'guest-character-creation-dialog-window', { 'login-dialog-window--mobile': useMobileLoginLayout }]"
        content-class="login-dialog-content guest-character-creation-dialog-content"
        :close-on-backdrop="false"
        :close-on-escape="false"
    >
        <template #header>
            <span class="guest-character-creation-dialog-title ui-text-gradient">{{ t('login.guestCreationTitle') }}</span>
        </template>

        <div class="guest-character-creation-copy">
            <div>{{ t('login.guestCreationNameAvailable') }}</div>
            <div class="guest-character-creation-name ui-text-gradient ui-text-gradient--accent">{{ name }}</div>
            <div>{{ t('login.guestCreationDescriptionEnd') }}</div>
        </div>
        <div class="guest-character-creation-choice">{{ t('login.guestCreationChooseClass') }}</div>
        <div class="dialog-actions guest-character-creation-actions">
            <button class="dialog-button" @click="selectClass('FIGHTER')">
                <span class="ui-text-gradient--button-state">FIGHTER</span>
            </button>
            <button class="dialog-button" @click="selectClass('MYSTIC')">
                <span class="ui-text-gradient--button-state">MYSTIC</span>
            </button>
        </div>
        <div class="dialog-actions guest-character-creation-back-action">
            <button class="dialog-button" @click="goBack">
                <span class="ui-text-gradient--button-state">{{ t('login.guestCreationBack') }}</span>
            </button>
        </div>
    </GameDialog>
</template>

<script setup lang="ts">
import GameDialog from '@/vue/views/GameDialog.vue'
import { useI18n } from '@/i18n'
import { Settings } from '@/settings/settings'
import { AudioManager } from '@/babylon/audio/audioManager'

defineProps<{name: string}>()
const useMobileLoginLayout = Settings.isPhoneOrTablet()
const emit = defineEmits<{
    create: [classKey: 'FIGHTER' | 'MYSTIC']
    back: []
}>()
const { t } = useI18n()

const selectClass = (classKey: 'FIGHTER' | 'MYSTIC') => {
    AudioManager.playGuiButtonClick()
    emit('create', classKey)
}

const goBack = () => {
    AudioManager.playGuiButtonClick()
    emit('back')
}
</script>

<style>
.dialog-window.guest-character-creation-dialog-window {
    width: 600px;
    max-width: calc(100vw - 32px);
}

.login-dialog-window.guest-character-creation-dialog-window:not(.login-dialog-window--mobile) > .dialog-surface {
    min-height: var(--login-dialog-desktop-height, 0px);
}

.guest-character-creation-dialog-window > .dialog-surface > .dialog-header {
    padding: 5px;
    font-size: 1.28rem;
}

.guest-character-creation-dialog-title {
    letter-spacing: 0.04em;
    text-shadow: none;
}

.guest-character-creation-dialog-content {
    padding: 0 18px 14px;
    text-align: center;
}

.guest-character-creation-copy {
    color: rgb(var(--ui-base));
    line-height: 1.4;
}

.guest-character-creation-name {
    --ui-text-gradient-accent: var(--ui-attribute-agility);
    margin: 4px 0;
    font-size: 1.4rem;
    font-weight: 700;
    line-height: 1.2;
    text-align: center;
}

.guest-character-creation-choice {
    margin-top: 14px;
    color: rgb(var(--ui-dark));
    font-size: 0.9rem;
    font-style: italic;
}

.guest-character-creation-actions {
    margin-top: 12px;
}

.guest-character-creation-actions .dialog-button {
    min-width: 120px;
}

.guest-character-creation-back-action {
    margin-top: 26px;
}
</style>
