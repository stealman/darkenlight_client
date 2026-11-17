<template>
    <GameDialog
        backdrop-class="login-screen-backdrop"
        :window-class="['login-dialog-window', 'guest-character-creation-dialog-window', { 'login-dialog-window--mobile': useMobileLoginLayout }]"
        content-class="login-dialog-content guest-character-creation-dialog-content"
        :close-on-backdrop="false"
        :close-on-escape="true"
        @close="goBack"
    >
        <template #header>
            <span class="guest-character-creation-dialog-title ui-text-gradient">{{ t('login.guestCreationTitle') }}</span>
        </template>

        <div class="guest-character-creation-identity">
            <span class="guest-character-creation-name ui-text-gradient ui-text-gradient--no-shadow">{{ name }}</span>
            <span v-if="selectedClass" :class="['guest-character-creation-class', 'ui-text-gradient', 'ui-text-gradient--accent', 'ui-text-gradient--no-shadow', `guest-character-creation-class--${selectedClass.toLowerCase()}`]">{{ t(`classes.${selectedClass.toLowerCase()}`) }}</span>
        </div>
        <div class="dialog-actions guest-character-creation-actions">
            <div v-for="classKey in ['FIGHTER', 'MYSTIC'] as const" :key="classKey" class="guest-character-class-option"
                :class="{ 'guest-character-class-option--active': activePreview === classKey }"
                @pointerenter="event => { if (event.pointerType !== 'touch') hoveredClass = classKey }"
                @pointerleave="event => { if (event.pointerType !== 'touch') hoveredClass = null }"
                @focusin="focusedClass = classKey" @focusout="focusedClass = null">
                <div class="guest-character-preview" :aria-busy="previewsLoading">
                    <canvas :ref="element => { if (element) previewCanvases[classKey] = element as HTMLCanvasElement }" :aria-label="t(`classes.${classKey.toLowerCase()}`)"
                        role="button" tabindex="0" :aria-pressed="selectedClass === classKey" :aria-disabled="previewsLoading"
                        @click="activatePreview(classKey)" @keydown.enter.prevent="activatePreview(classKey)" @keydown.space.prevent="activatePreview(classKey)" />
                    <span v-if="previewsLoading">{{ t('common.loading') }}</span>
                </div>
                <button type="button" class="guest-character-class-label" :disabled="previewsLoading" :aria-pressed="selectedClass === classKey" @click="activatePreview(classKey)">
                    <span :class="['ui-text-gradient', 'ui-text-gradient--accent', 'ui-text-gradient--no-shadow', `guest-character-creation-class--${classKey.toLowerCase()}`]">{{ t(`classes.${classKey.toLowerCase()}`) }}</span>
                </button>
            </div>
            <button class="dialog-button guest-character-creation-back-action" @click="goBack">
                <span class="ui-text-gradient--button-state">{{ t('login.guestCreationBack') }}</span>
            </button>
            <button v-if="selectedClass" class="dialog-button guest-character-creation-continue-action" :disabled="creating" @click="selectClass">
                <span class="ui-text-gradient--button-state">{{ t('localCharacters.continue') }}</span>
            </button>
        </div>
    </GameDialog>
</template>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {startStarterPreviews} from '@/babylon/character/starterPreviews'
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
const previewCanvases: Record<string, HTMLCanvasElement> = {}
const previewsLoading = ref(true)
type StarterClass = 'FIGHTER' | 'MYSTIC'
const selectedClass = ref<StarterClass | null>(null)
const hoveredClass = ref<StarterClass | null>(null)
const focusedClass = ref<StarterClass | null>(null)
const activePreview = computed(() => hoveredClass.value ?? focusedClass.value ?? selectedClass.value)
const creating = ref(false)
function activatePreview(classKey: 'FIGHTER' | 'MYSTIC') {
    if (previewsLoading.value) return
    AudioManager.playGuiButtonClick()
    selectedClass.value = classKey
}
const previewAbort = new AbortController()
onMounted(async () => {
    try { await startStarterPreviews([previewCanvases.FIGHTER, previewCanvases.MYSTIC], previewAbort.signal, () => activePreview.value) }
    catch (error) { console.error('Could not render starter previews', error) }
    finally { previewsLoading.value = false }
})
onUnmounted(() => previewAbort.abort())

const selectClass = () => {
    if (!selectedClass.value || creating.value) return
    creating.value = true
    AudioManager.playGuiButtonClick()
    emit('create', selectedClass.value)
}

const goBack = () => {
    if (creating.value) return
    AudioManager.playGuiButtonClick()
    emit('back')
}
</script>

<style>
.dialog-window.guest-character-creation-dialog-window {
    width: 720px;
    max-width: calc(100vw - 32px);
    max-height: calc(100dvh - 24px);
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

.guest-character-creation-identity { display: flex; justify-content: center; align-items: center; gap: 0.4em; margin: 16px 0 4px; font-size: 1.4rem; line-height: 1.2; min-height: 1.2em; }
.guest-character-creation-class { flex-shrink: 0; font-size: inherit; line-height: inherit; font-weight: 700; }
.guest-character-creation-class--fighter { --ui-text-gradient-accent: var(--ui-accent-red); }
.guest-character-creation-class--mystic { --ui-text-gradient-accent: var(--ui-accent-purple); }
.guest-character-creation-name {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: inherit;
    font-weight: 400;
    line-height: inherit;
    text-align: center;
    text-transform: uppercase;
}

.guest-character-creation-actions {
    position: relative;
    margin-top: -16px;
    display: flex;
    justify-content: center;
    gap: clamp(64px, 10vw, 80px);
}
.guest-character-class-option { position: relative; flex: 1; min-width: 0; max-width: 280px; padding-bottom: 42px; }
.guest-character-class-label { position: absolute; top: 24px; left: 0; width: 100%; padding: 4px; border: 0; background: none; font: inherit; font-weight: 700; cursor: var(--ui-cursor-pointer); }
.guest-character-class-label > span {
    filter: grayscale(1);
    transform: scale(1);
    transition: filter 200ms ease, transform 260ms cubic-bezier(0.2, 1.5, 0.5, 1);
}
.guest-character-class-option--active .guest-character-class-label > span {
    filter: grayscale(0);
    transform: scale(1.16);
}
@media (prefers-reduced-motion: reduce) {
    .guest-character-class-label > span { transition: none; }
}
.guest-character-preview { position: relative; transform: translateY(clamp(18px, 3.5vh, 28px)); height: clamp(120px, 42vh, 340px); display: flex; justify-content: center; align-items: center; }
.guest-character-preview canvas { width: 100%; height: 100%; display: block; cursor: var(--ui-cursor-pointer); filter: grayscale(1); transition: filter 200ms ease; }
.guest-character-class-option--active .guest-character-preview canvas { filter: grayscale(0); }
.guest-character-preview > span { position: absolute; }


:root .guest-character-creation-actions .dialog-button {
    position: relative;
    z-index: 1;
    min-width: 120px;
    box-shadow: 0 0 16px 5px rgba(var(--ui-darkest), 0.9), 0 6px 12px rgba(var(--ui-darkest), 0.8);
}

:root .guest-character-creation-actions .guest-character-creation-back-action {
    position: absolute;
    bottom: 0;
    left: 0;
    min-width: 96px;
}
:root .guest-character-creation-actions .guest-character-creation-continue-action {
    position: absolute;
    bottom: 0;
    right: 0;
}
@media (max-width: 480px) {
    :root .guest-character-creation-actions .dialog-button { min-width: 0; padding: 10px 8px; font-size: 0.8rem; }
    :root .guest-character-creation-actions .guest-character-creation-back-action { min-width: 76px; }
}
</style>
