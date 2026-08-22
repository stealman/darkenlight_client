<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useI18n } from '@/i18n'

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

defineProps<{
    visible: boolean
}>()

const deferredInstallPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isInstallAvailable = ref(false)
const isAppleMobile = ref(false)
const isInstallHelpOpen = ref(false)
const { needRefresh, updateServiceWorker } = useRegisterSW()
const { t } = useI18n()

const showUpdate = computed(() => needRefresh.value)

function isStandalone(): boolean {
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
    return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

function handleBeforeInstallPrompt(event: Event): void {
    event.preventDefault()
    deferredInstallPrompt.value = event as BeforeInstallPromptEvent
    isInstallAvailable.value = true
}

function handleAppInstalled(): void {
    deferredInstallPrompt.value = null
    isInstallAvailable.value = false
    isInstallHelpOpen.value = false
}

async function install(): Promise<void> {
    const prompt = deferredInstallPrompt.value
    if (!prompt) {
        isInstallHelpOpen.value = true
        return
    }

    await prompt.prompt()
    const result = await prompt.userChoice
    if (result.outcome === 'accepted') handleAppInstalled()
    else {
        deferredInstallPrompt.value = null
        isInstallAvailable.value = false
    }
}

function refresh(): void {
    void updateServiceWorker()
}

onMounted(() => {
    isAppleMobile.value = /iPad|iPhone|iPod/.test(navigator.userAgent) && !isStandalone()
    isInstallAvailable.value = isAppleMobile.value
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
})

onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.removeEventListener('appinstalled', handleAppInstalled)
})
</script>

<template>
    <button v-if="visible && isInstallAvailable" class="pwa-install-button" type="button" @click="install">
        {{ t('pwa.install') }}
    </button>

    <aside v-if="showUpdate" class="pwa-update-prompt" role="dialog" aria-live="polite">
        <strong>{{ t('pwa.updateTitle') }}</strong>
        <p>{{ t('pwa.updateText') }}</p>
        <button type="button" @click="refresh">{{ t('pwa.update') }}</button>
    </aside>

    <div v-if="isInstallHelpOpen" class="pwa-install-backdrop" role="presentation" @click.self="isInstallHelpOpen = false">
        <section class="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
            <h2 id="pwa-install-title">{{ t('pwa.installTitle') }}</h2>
            <p>{{ isAppleMobile ? t('pwa.installApple') : t('pwa.installBrowser') }}</p>
            <button type="button" @click="isInstallHelpOpen = false">{{ t('pwa.close') }}</button>
        </section>
    </div>
</template>

<style scoped>
.pwa-install-button,
.pwa-update-prompt button,
.pwa-install-dialog button {
    border: 1px solid #e5b454;
    border-radius: 6px;
    background: linear-gradient(180deg, #3b5a67, #1d303a);
    color: #fff4d0;
    font: 600 13px Montserrat, sans-serif;
    cursor: pointer;
}

.pwa-install-button {
    position: fixed;
    z-index: 9000;
    right: 18px;
    bottom: 18px;
    padding: 11px 14px;
    box-shadow: 0 4px 18px #000a;
}

.pwa-update-prompt {
    position: fixed;
    z-index: 9001;
    right: 18px;
    top: 18px;
    width: min(310px, calc(100vw - 36px));
    padding: 14px;
    border: 1px solid #5d8e9d;
    border-radius: 8px;
    background: #10202beF;
    color: #edf7f7;
    box-shadow: 0 6px 24px #000b;
    font: 14px Montserrat, sans-serif;
}

.pwa-update-prompt strong,
.pwa-update-prompt p {
    display: block;
    margin: 0 0 9px;
}

.pwa-update-prompt button,
.pwa-install-dialog button {
    padding: 8px 12px;
}

.pwa-install-backdrop {
    position: fixed;
    z-index: 9002;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: #000a;
}

.pwa-install-dialog {
    width: min(390px, 100%);
    padding: 22px;
    border: 1px solid #5d8e9d;
    border-radius: 8px;
    background: #10202b;
    color: #edf7f7;
    box-shadow: 0 10px 40px #000c;
    font: 15px Montserrat, sans-serif;
}

.pwa-install-dialog h2,
.pwa-install-dialog p {
    margin: 0 0 14px;
}
</style>
