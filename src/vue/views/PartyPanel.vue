<template>
    <Teleport to="#party-panel-host">
        <section v-if="state" class="party-panel" :aria-label="t('party.title')" @pointerdown.stop @pointerup.stop>
            <button v-for="member in otherMembers" :key="member.id" class="party-member"
                :class="{'party-member--away': !member.nearby, 'party-member--selected': selectedCharacterId === member.id}"
                :aria-pressed="selectedCharacterId === member.id"
                :aria-label="member.name + (member.nearby ? '' : ' — ' + t('party.away'))"
                @click="PartyManager.selectMember(member.id)">
                <span class="party-name"><span v-if="member.id === state.leaderId" class="party-leader" :title="t('party.leader')">♛</span>{{ member.name }}</span>
                <span v-if="member.nearby" class="party-resources">
                    <span v-for="resource in resources.filter(resource => resource.key !== 'mp' || (member.maxMp || 0) > 0)" :key="resource.key" class="party-bar" :class="'party-bar--' + resource.key"
                        role="progressbar" :aria-label="resource.label" :aria-valuenow="member[resource.key] || 0" :aria-valuemax="member[resource.max] || 0" aria-valuemin="0">
                        <span :style="{width: percent(member[resource.key], member[resource.max]) + '%'}"></span>
                    </span>
                </span>
                <span v-else class="party-away-mark" aria-hidden="true">· · ·</span>
            </button>
            <div ref="actionsMenu" class="party-actions">
                <button class="party-menu-button" :aria-label="t('party.actions')" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">⋯</button>
                <button v-if="menuOpen" class="party-leave dialog-button" @click="leave">{{ t('party.leave') }}</button>
            </div>
        </section>
    </Teleport>
    <GameDialog v-if="pendingInviteTarget !== null" window-class="party-invite-window adaptive dialog-themed-fields"
        :close-on-backdrop="false" @backdrop-click="onSettingsBackdropClick" @close="PartyManager.cancelInvite()">
        <template #header>{{ t('party.settings') }}</template>
        <div class="party-invite-content" @pointerdown.stop @pointerup.stop>
            <div class="party-loot-setting" role="group" :aria-label="t('party.items')">
                <span class="ui-text-gradient">{{ t('party.items') }}</span>
                <button type="button" class="party-loot-choice party-loot-choice--random"
                    :aria-pressed="inviteLootMode === 'random'" :disabled="!!state" @click="selectLootMode('random')">
                    <span class="ui-text-gradient ui-text-gradient--accent ui-text-gradient--no-shadow">{{ t('party.lootRandomChoice') }}</span>
                </button>
                <button type="button" class="party-loot-choice party-loot-choice--finder"
                    :aria-pressed="inviteLootMode === 'finder'" :disabled="!!state" @click="selectLootMode('finder')">
                    <span class="ui-text-gradient ui-text-gradient--accent ui-text-gradient--no-shadow">{{ t('party.lootFinderChoice') }}</span>
                </button>
            </div>
            <p>{{ t('party.emeraldSharing') }}</p>
            <div class="party-invite-buttons">
                <button class="dialog-button" @click="PartyManager.sendInvite()">{{ t('party.sendInvite') }}</button>
                <button class="dialog-button" @click="PartyManager.cancelInvite()">{{ t('party.cancel') }}</button>
            </div>
        </div>
    </GameDialog>
    <GameDialog v-if="invitation && remaining > 0" backdrop-class="party-invite-backdrop" window-class="party-invite-window party-invitation-window adaptive"
        :close-on-backdrop="false" @close="PartyManager.respond(false)">
        <template #header><span>{{ t('party.invitation') }}</span></template>
        <div class="party-invite-content" @pointerdown.stop @pointerup.stop>
            <img src="/images/icons/buttons/btn_party_invite.png" alt="" class="party-invite-icon" />
            <p>{{ invitationText[0] }}<span class="party-inviter-name">{{ invitation.name }}</span><span v-if="inviterClass"> ({{ inviterClass }})</span>{{ invitationText[1] }}</p>
            <p>{{ t('party.items') }} <span :class="invitation.lootMode === 'random' ? 'party-loot-random' : 'party-loot-finder'">{{ t(invitation.lootMode === 'random' ? 'party.lootRandom' : 'party.lootFinder') }}</span></p>
            <p>{{ t('party.emeraldSharing') }}</p>
            <div class="party-invite-progress loading-progress-track" role="progressbar" :aria-valuenow="remaining" aria-valuemin="0" :aria-valuemax="invitation.remainingMs" :aria-label="t('party.invitation')">
                <div class="loading-progress-fill" :style="{width: percent(remaining, invitation.remainingMs) + '%'}"></div>
            </div>
            <div class="party-invite-buttons">
                <button class="dialog-button" type="button" @pointerdown.prevent.stop @click="PartyManager.respond(true)">
                    {{ t('party.accept') }}
                </button>
                <button class="dialog-button party-invite-decline" type="button" @pointerdown.prevent.stop @click="PartyManager.respond(false)">
                    <span>{{ t('party.decline') }}</span>
                </button>
            </div>
        </div>
    </GameDialog>
</template>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {PartyManager} from '@/data/partyManager'
import {AudioManager} from '@/babylon/audio/audioManager'
import type {PartyLootMode} from '@/network/messageIfs'
import {MyPlayer} from '@/data/myPlayer'
import {TargetingManager} from '@/gui/targettingManager'
import {t} from '@/i18n'
import GameDialog from './GameDialog.vue'

const pendingInviteTarget = PartyManager.pendingInviteTarget
const IGNORE_BACKDROP_CLICK_AFTER_OPEN_MS = 350
const settingsOpenedAt = ref(0)
watch(pendingInviteTarget, (targetId) => {
    if (targetId !== null) settingsOpenedAt.value = Date.now()
})
const onSettingsBackdropClick = () => {
    if (Date.now() - settingsOpenedAt.value < IGNORE_BACKDROP_CLICK_AFTER_OPEN_MS) return
    PartyManager.cancelInvite()
}
const inviteLootMode = PartyManager.inviteLootMode
const selectLootMode = (mode: PartyLootMode) => {
    if (PartyManager.state.value) return
    inviteLootMode.value = mode
    AudioManager.playGuiButtonClick()
}
const state = PartyManager.state
const selectedCharacterId = TargetingManager.selectedCharacterId
const invitation = PartyManager.invitation
const invitationText = computed(() => t('party.invitedBy', {name: '{name}'}).split('{name}'))
const inviterClass = computed(() => {
    const classKey = invitation.value?.classKey
    if (!classKey) return ''
    const localizationKey = `classes.${classKey.toLowerCase()}`
    const localized = t(localizationKey)
    return localized === localizationKey ? classKey : localized
})
const menuOpen = ref(false)
const actionsMenu = ref<HTMLElement | null>(null)
const closeMenuOutside = (event: Event) => {
    if (!(event.target instanceof Node) || !actionsMenu.value?.contains(event.target)) menuOpen.value = false
}
onMounted(() => {
    document.addEventListener('pointerdown', closeMenuOutside, true)
    document.addEventListener('click', closeMenuOutside, true)
})
const now = ref(Date.now())
const timer = window.setInterval(() => {
    now.value = Date.now()
    if (invitation.value && now.value >= invitation.value.deadline) PartyManager.respond(false)
}, 100)
onUnmounted(() => {
    window.clearInterval(timer)
    document.removeEventListener('pointerdown', closeMenuOutside, true)
    document.removeEventListener('click', closeMenuOutside, true)
})
const remaining = computed(() => invitation.value ? Math.max(0, invitation.value.deadline - now.value) : 0)
const otherMembers = computed(() => state.value?.members.filter(member => member.id !== MyPlayer.myChar?.id) || [])
const resources = [
    {key: 'hp', max: 'maxHp', label: 'HP'},
    {key: 'st', max: 'maxSt', label: 'ST'},
    {key: 'mp', max: 'maxMp', label: 'MP'},
] as const
const percent = (value = 0, maximum = 0) => maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0
const leave = () => { menuOpen.value = false; PartyManager.leave() }
</script>

<style>
.party-loot-random { color: rgb(var(--ui-success)); }
.party-loot-finder { color: rgb(var(--ui-danger)); }
.party-loot-setting { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: center; gap: 8px; margin: 6px 0 12px; font-size: 15px; text-align: left; }
.party-loot-setting > span { text-align: right; }
.party-loot-choice { min-width: 0; min-height: 44px; padding: 6px 2px; border: 0; background: none; color: rgb(var(--ui-darker)); font: inherit; cursor: pointer; text-align: center; touch-action: manipulation; }
.party-loot-choice--random { --ui-text-gradient-accent: var(--ui-success); color: rgb(var(--ui-success)); }
.party-loot-choice--finder { --ui-text-gradient-accent: var(--ui-danger); color: rgb(var(--ui-danger)); }
.party-loot-choice[aria-pressed="false"] { opacity: 0.55; }
.party-loot-choice[aria-pressed="true"] { font-weight: 700; text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px; }
.party-loot-choice:focus-visible { outline: 1px solid rgb(var(--ui-base)); outline-offset: -2px; }
.party-loot-choice:disabled { cursor: default; }
.party-invite-backdrop { --party-invite-top: max(65px, 12dvh); pointer-events: none; align-items: flex-start; padding-top: var(--party-invite-top); box-sizing: border-box; }
.party-invite-window { pointer-events: auto; width: 310px; max-width: calc(100vw - 24px); }
.party-invite-window .dialog-header { display: flex; align-items: center; justify-content: center; }
.dialog-window.party-invitation-window { width: 600px; max-width: calc(100vw - 24px); max-height: calc(100dvh - var(--party-invite-top) - 12px); box-sizing: border-box; display: flex; flex-direction: column; }
.party-invitation-window > .dialog-surface { display: flex; flex-direction: column; min-height: 0; }
.party-invitation-window .dialog-header { flex-shrink: 0; }
.party-invitation-window .dialog-content { min-height: 0; overflow-y: auto; }
.party-invite-content { padding: 6px 10px 10px; }
.party-invite-content p { font-size: 13px; line-height: 1.5; margin: 5px 0 12px; overflow-wrap: anywhere; }
.party-inviter-name { color: rgb(var(--ui-character-name)); }
.party-invite-icon { width: 48px; height: 48px; object-fit: contain; }
.party-invite-progress { margin-bottom: 12px; }
.party-invite-buttons { display: flex; gap: 8px; justify-content: center; }
.party-invite-buttons button { flex: 1; min-height: 38px; }
.party-invite-decline span { color: rgb(var(--ui-attention)); text-shadow: 0 0 4px rgba(var(--ui-attention), .45); }
</style>
