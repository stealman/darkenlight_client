<template>
    <section class="chat-panel" :class="[`chat-tab--${state.active}`, {'chat-panel--phone': phoneLayout, 'chat-panel--hud': desktopHud}]" @keydown="onKeyDown" @keyup.stop @pointerdown.stop @wheel.stop>
        <div class="chat-window">
        <nav class="chat-tabs" role="tablist" :aria-label="t('character.tabs.chat')">
            <button v-for="channel in channels" :key="channel" role="tab" :aria-selected="state.active === channel"
                :class="[`chat-tab--${channel}`, {selected: state.active === channel, 'chat-tab--unread': channel !== 'public' && state.unread[channel] > 0}]" @click="select(channel)">
                <span class="ui-text-gradient ui-text-gradient--accent ui-text-gradient--no-shadow">{{ t(`chat.${channel}`) }}</span>
            </button>
        </nav>
        <div class="chat-history">
        <div ref="log" class="chat-log" role="log" aria-live="polite" @scroll="onScroll">
            <div v-if="!messages.length" class="chat-empty">{{ t(`chat.empty.${state.active}`) }}</div>
            <div v-for="message in messages" :key="message.id" class="chat-message" :class="{mine: message.from === ChatManager.characterName}">
                <div class="message-content">
                    <template v-if="message.channel === 'private' && message.from === ChatManager.characterName && message.to">→ <button class="chat-name" @click="reply(message.to)">{{ message.to }}</button></template>
                    <button v-else class="chat-name" @click="reply(message.from)">{{ message.from }}</button>
                    <span class="message-text">: {{ message.text }}</span>
                </div>
            </div>
        </div>
        <div v-if="state.error" :key="state.errorVersion" class="chat-error" role="alert">{{ t(`chat.errors.${state.error}`, {name: state.errorName}) }}</div>
        </div>
        <form class="chat-compose" @submit.prevent="send">
            <input ref="input" v-model="drafts[state.active]" :maxlength="state.active === 'public' ? 100 : 605" @beforeinput="onBeforeInput"
                :placeholder="t(state.active === 'private' ? 'chat.privatePlaceholder' : 'chat.placeholder')"
                :aria-label="t(`chat.${state.active}`)" autocomplete="off" enterkeyhint="send" @focus="stopMovement"
                @keydown.up="cyclePerson($event, 1)" @keydown.down="cyclePerson($event, -1)" />
            <button v-if="!desktopHud" type="submit" :disabled="!drafts[state.active].trim()">{{ t('chat.send') }}</button>
        </form>
        </div>
    </section>
</template>
<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, reactive, ref, watch} from 'vue'
import {ChatManager, type ChatChannel} from '@/data/chatManager'
import {Connector} from '@/network/connector'
import {ChatSendMsg, SayMsg} from '@/network/messages'
import {Controller} from '@/controlls/controller'
import {MyPlayer} from '@/data/myPlayer'
import {useI18n} from '@/i18n'
import {Settings} from '@/settings/settings'
import {TargetingManager} from '@/gui/targettingManager'
const {t} = useI18n()
const props = defineProps<{visible?: boolean, desktopHud?: boolean}>()
const phoneLayout = ref(Settings.getDeviceType() === 'PHONE')
const channels: ChatChannel[] = ['public', 'private', 'party']
const state = ChatManager.state
const drafts = reactive({public: '', private: '', party: ''})
const input = ref<HTMLInputElement | null>(null)
const log = ref<HTMLElement | null>(null)
const messages = computed(() => state.messages.filter(message => message.channel === state.active))
let recentIndex = -1
let stickToBottom = true
let errorTimer: ReturnType<typeof setTimeout> | undefined
watch(() => state.errorVersion, () => {
    clearTimeout(errorTimer)
    if (!state.error) return
    errorTimer = setTimeout(() => { state.error = '' }, 3000)
}, {immediate: true})
function scrollBottom() { nextTick(() => { if (log.value) log.value.scrollTop = log.value.scrollHeight }) }
function onScroll() { const el = log.value; if (el) stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }
function select(channel: ChatChannel) {
    state.active = channel; state.unread[channel] = 0; state.error = ''; recentIndex = -1
    stickToBottom = true; scrollBottom()
    if (!Settings.isPhoneOrTablet()) nextTick(() => input.value?.focus())
}
function stopMovement() { Controller.cancelHeldMovement(); MyPlayer.stopMove() }
function focusInput() { stopMovement(); input.value?.focus({preventScroll: true}) }
function cycle(event: Event) {
    if (props.desktopHud || !props.visible) return
    const direction = (event as CustomEvent<number>).detail || 1
    select(channels[(channels.indexOf(state.active) + direction + channels.length) % channels.length])
}
function onKeyDown(event: KeyboardEvent) {
    if (props.desktopHud && event.key === 'Escape') {
        event.stopPropagation(); event.preventDefault(); input.value?.blur(); return
    }
    if (event.key === 'Escape') return
    event.stopPropagation()
    if (event.key === 'Tab') {
        event.preventDefault()
        if (props.desktopHud) {
            input.value?.blur()
            TargetingManager.cycleThroughClosestTargets()
        } else cycle(new CustomEvent('ui:cycle-chat', {detail: event.shiftKey ? -1 : 1}))
    }
    if ((event.isComposing || event.repeat) && event.key === 'Enter') event.preventDefault()
}
function reply(name: string) { select('private'); drafts.private = `${name}: ` }
defineExpose({reply, focusInput})
function onBeforeInput(event: InputEvent) {
    if (state.active !== 'private' || event.isComposing || !event.inputType.startsWith('delete')) return
    const field = event.target as HTMLInputElement
    const colon = field.value.indexOf(':')
    if (colon < 0 || field.selectionStart === null || field.selectionEnd === null) return
    let start = field.selectionStart
    let end = field.selectionEnd
    if (start === end) {
        if (event.inputType.endsWith('Backward')) start--
        else if (event.inputType.endsWith('Forward')) end++
    }
    if (start <= colon && end > colon) {
        event.preventDefault()
        drafts.private = ''
        recentIndex = -1
    }
}
function cyclePerson(event: KeyboardEvent, direction: number) {
    if (state.active !== 'private' || !state.recent.length || event.isComposing) return
    event.preventDefault()
    const count = state.recent.length
    recentIndex = recentIndex < 0 ? (direction > 0 ? 0 : count - 1) : (recentIndex + direction + count) % count
    const colon = drafts.private.indexOf(':')
    const body = colon >= 0 ? drafts.private.slice(colon + 1).trimStart() : ''
    drafts.private = `${state.recent[recentIndex]}: ${body}`
}
function send() {
    const channel = state.active
    const text = drafts[channel].trim()
    if (!text) { if (props.desktopHud) input.value?.blur(); return }
    state.error = ''
    if (channel === 'public') Connector.sendMessage(new SayMsg({text: text.slice(0, 100)}))
    else if (channel === 'party') Connector.sendMessage(new ChatSendMsg({channel, text: text.slice(0, 500)}))
    else {
        const colon = text.indexOf(':')
        if (colon <= 0 || !text.slice(colon + 1).trim()) { state.error = 'format'; state.errorVersion++; return }
        const to = text.slice(0, colon).trim()
        Connector.sendMessage(new ChatSendMsg({channel, to, text: text.slice(colon + 1).trim().slice(0, 500)}))
        drafts.private = `${to}: `
    }
    if (channel !== 'private') drafts[channel] = ''
    stickToBottom = true; scrollBottom()
    if (props.desktopHud) input.value?.blur()
}
watch(() => [messages.value.length, messages.value[messages.value.length - 1]?.id], () => {
    if (props.visible) state.unread[state.active] = 0
    if (stickToBottom) scrollBottom()
})
watch(() => props.visible, visible => {
    if (props.desktopHud) ChatManager.hudVisible = !!visible
    else ChatManager.visible = !!visible
    phoneLayout.value = Settings.getDeviceType() === 'PHONE'
    if (visible) { state.unread[state.active] = 0; scrollBottom() }
}, {immediate: true})
onMounted(() => { window.addEventListener('ui:cycle-chat', cycle); scrollBottom() })
onUnmounted(() => {
    clearTimeout(errorTimer)
    if (props.desktopHud) ChatManager.hudVisible = false
    else ChatManager.visible = false
    window.removeEventListener('ui:cycle-chat', cycle)
})
</script>
<style scoped>
.chat-panel { width: 100%; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px; box-sizing: border-box; color: rgb(var(--ui-base)); }
.chat-window { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; border: 1px solid rgba(var(--ui-base), .15); border-radius: 8px; background: rgba(var(--ui-darkest), .3); }
.chat-tabs { display: flex; flex-shrink: 0; }
.chat-tabs button { font-family: inherit; font-size: .75rem; font-weight: 700; text-transform: uppercase; }
.chat-tabs button, .chat-compose button { color: inherit; background: rgba(var(--ui-darkest), .5); border: 1px solid rgba(var(--ui-base), .2); border-radius: 7px; padding: 9px 16px; cursor: pointer; }
.chat-tabs button { flex: 1; --ui-text-gradient-accent: var(--chat-accent); color: rgb(var(--chat-accent)); border: 0; border-radius: 0; padding: 6px 12px; background: rgba(var(--chat-accent), .06); }
.chat-tab--public { --chat-accent: var(--ui-base); }
.chat-tab--private { --chat-accent: var(--ui-accent-purple); }
.chat-tab--party { --chat-accent: var(--ui-attribute-agility); }
.chat-tabs button.selected, .chat-tabs button:hover { background: rgba(var(--chat-accent), .16); }
.chat-tabs button.chat-tab--unread { animation: chat-unread-pulse 1.2s ease-in-out infinite alternate; }
@keyframes chat-unread-pulse {
    from { background: rgba(var(--chat-accent), .06); }
    to { background: rgba(var(--chat-accent), .35); }
}
@media (prefers-reduced-motion: reduce) {
    .chat-tabs button.chat-tab--unread { animation: none; background: rgba(var(--chat-accent), .35); }
}
.chat-history { position: relative; display: flex; flex: 1; min-height: 0; }
.chat-log { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 8px 12px; }
@supports selector(::-webkit-scrollbar) {
    .chat-log { scrollbar-width: auto; scrollbar-color: auto; }
    .chat-log::-webkit-scrollbar { width: 4px; }
}
.chat-empty { opacity: .55; text-align: center; padding: 32px 10px; font-size: 13px; }
.chat-message { padding: 3px 0; border-bottom: 1px solid rgba(var(--ui-base), .06); font-size: 13px; line-height: 1.4; }
.message-content { min-width: 0; overflow-wrap: anywhere; text-align: left; }
.chat-name { color: rgb(var(--chat-accent)); font: inherit; font-weight: 600; border: 0; padding: 0; background: transparent; cursor: pointer; }
.chat-name:hover { text-decoration: underline; }
.message-text { white-space: pre-wrap; font-weight: 400; color: rgba(var(--chat-accent), .75); }
.chat-compose { display: flex; flex-shrink: 0; border-top: 1px solid rgba(var(--ui-base), .15); background: rgba(var(--ui-darkest), .4); }
.chat-compose input { flex: 1; min-width: 0; font: inherit; font-size: 16px; padding: 10px 12px; color: inherit; background: transparent; border: 0; border-radius: 0; }
.chat-compose input:focus { outline: none; box-shadow: none; }
.chat-compose button { border: 0; border-left: 1px solid rgba(var(--chat-accent), .2); border-radius: 0; color: rgb(var(--chat-accent)); background: rgba(var(--chat-accent), .1); }
.chat-compose button:not(:disabled):hover { background: rgba(var(--chat-accent), .16); }
.chat-compose button:disabled { opacity: .4; cursor: default; }
.chat-error { position: absolute; bottom: 8px; left: 8px; right: 8px; z-index: 1; background: rgba(var(--ui-darkest), .95); border-left: 3px solid rgb(var(--ui-accent-blue)); border-radius: 4px; padding: 7px 10px; font-size: 12px; overflow-wrap: anywhere; animation: chat-flash .35s ease-in-out 4 alternate; }
@keyframes chat-flash { to { background: rgba(var(--ui-accent-blue), .3); } }
.chat-panel--phone { padding: 6px; gap: 6px; }
.chat-panel--phone .chat-tabs button, .chat-panel--phone .chat-compose button { padding: 4px 10px; line-height: 18px; min-height: 28px; }
.chat-panel--phone .chat-compose input { padding: 4px 8px; line-height: 20px; min-height: 30px; box-sizing: border-box; }
.chat-panel--phone .chat-log { min-height: 0; padding: 4px 8px; }
.chat-panel--phone .chat-empty { padding: 12px 6px; }
.chat-panel--hud {
    position: fixed;
    left: 0;
    bottom: 0;
    width: 25%;
    max-width: var(--hud-status-max-width, 260px);
    height: calc(3 * var(--hud-player-panel-height, clamp(42px, 5.1vh, 54px)));
    padding: 0;
    gap: 0;
    z-index: 1000;
    opacity: .5;
    transition: opacity .25s ease 3s;
}
.chat-panel--hud:hover, .chat-panel--hud:focus-within { opacity: 1; transition-delay: 0s; }
@media (prefers-reduced-motion: reduce) {
    .chat-panel--hud { transition: none; }
}
.chat-panel--hud .chat-window { position: relative; isolation: isolate; background: transparent; }
.chat-panel--hud .chat-window::before { content: ''; position: absolute; inset: 0; z-index: -1; background: var(--gui-surface) repeat; opacity: var(--gui-status-background-opacity); pointer-events: none; }
.chat-panel--hud .chat-tabs button { padding: 3px 5px; font-size: .65rem; line-height: 16px; }
.chat-panel--hud .chat-log { padding: 3px 6px; }
.chat-panel--hud .chat-message { padding: 1px 0; font-size: 12px; }
.chat-panel--hud .chat-empty { padding: 8px 2px; font-size: 11px; }
.chat-panel--hud .chat-compose input { padding: 3px 6px; font-size: 13px; line-height: 18px; }
</style>
