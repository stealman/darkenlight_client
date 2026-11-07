<template>
    <input v-if="opened" ref="input" v-model="text" class="speech-input" maxlength="100"
        :aria-label="label" :placeholder="label" enterkeyhint="send" autocomplete="off"
        @keydown.stop="onKeyDown" @keyup.stop @pointerdown.stop @blur="cancel" />
</template>

<script setup lang="ts">
import {ref, computed, nextTick, onMounted, onUnmounted} from 'vue'
import {Connector} from '@/network/connector'
import {SayMsg} from '@/network/messages'
import {MyPlayer} from '@/data/myPlayer'
import {Controller} from '@/controlls/controller'
import {useI18n} from '@/i18n'
import {Settings} from '@/settings/settings'
const {t} = useI18n()
const label = computed(() => t('speech.placeholder'))
const opened = ref(false)
const text = ref('')
const input = ref<HTMLInputElement | null>(null)
function unlockViewport() { document.getElementById('appWrapper')?.classList.remove('speech-viewport-locked') }
function cancel() { opened.value = false; text.value = ''; unlockViewport() }
function open() {
    if (MyPlayer.isDead.value) return
    Controller.cancelHeldMovement()
    MyPlayer.stopMove()
    if (Settings.isPhoneOrTablet()) document.getElementById('appWrapper')?.classList.add('speech-viewport-locked')
    opened.value = true
    nextTick(() => input.value?.focus({preventScroll: true}))
}
function onKeyDown(event: KeyboardEvent) {
    if (event.isComposing || event.repeat) return
    if (event.key === 'Escape') { event.preventDefault(); cancel() }
    if (event.key === 'Enter') {
        event.preventDefault()
        const message = text.value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100)
        if (message) Connector.sendMessage(new SayMsg({text: message}))
        cancel()
    }
}
onMounted(() => window.addEventListener('ui:open-speech', open))
onUnmounted(() => { unlockViewport(); window.removeEventListener('ui:open-speech', open) })
</script>

<style scoped>
:global(#appWrapper.speech-viewport-locked) {
    position: fixed;
    top: var(--app-viewport-top, 0px);
    left: 0;
    overflow: hidden;
}
.speech-input {
    position: fixed;
    top: calc(var(--app-viewport-top, 0px) + var(--app-viewport-height, 100vh));
    transform: translateY(-100%);
    left: 0;
    width: 100%;
    box-sizing: border-box;
    z-index: 1900;
    border: 0;
    border-top: 1px solid rgba(var(--ui-accent-blue), .45);
    outline: none;
    background: rgba(var(--ui-darkest), .72);
    color: rgb(var(--ui-base));
    caret-color: rgb(var(--ui-accent-blue));
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    font: 16px 'Roboto', Arial, sans-serif;
}
.speech-input::placeholder { color: rgba(var(--ui-base), .55); }
</style>
