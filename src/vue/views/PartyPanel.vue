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
    <GameDialog v-if="invitation && remaining > 0" backdrop-class="party-invite-backdrop" window-class="party-invite-window adaptive"
        :close-on-backdrop="false" @close="PartyManager.respond(false)">
        <template #header><span>{{ t('party.invitation') }}</span></template>
        <div class="party-invite-content" @pointerdown.stop @pointerup.stop>
            <img src="/images/icons/buttons/btn_party_invite.png" alt="" class="party-invite-icon" />
            <p>{{ invitationText[0] }}<span class="party-inviter-name">{{ invitation.name }}</span><span v-if="inviterClass"> ({{ inviterClass }})</span>{{ invitationText[1] }}</p>
            <div class="party-invite-progress"><span :style="{width: percent(remaining, invitation.remainingMs) + '%'}"></span></div>
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
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {PartyManager} from '@/data/partyManager'
import {MyPlayer} from '@/data/myPlayer'
import {TargetingManager} from '@/gui/targettingManager'
import {t} from '@/i18n'
import GameDialog from './GameDialog.vue'

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
.party-panel { width: clamp(134px, 18vw, 220px); max-width: 42vw; margin: 4px 0 0 3px; color: rgb(var(--ui-base)); pointer-events: auto; text-align: left; font-size: 11px; text-shadow: 0 1px 2px rgb(var(--ui-darkest)); }
.party-actions { position: relative; display: flex; justify-content: flex-start; margin-top: 3px; }
.party-menu-button { color: rgb(var(--ui-base)); background: rgba(var(--ui-darkest), .7); border: 1px solid rgba(var(--ui-dark), .25); border-radius: 3px; width: 32px; height: 24px; font-size: 20px; line-height: 16px; cursor: pointer; }
.party-leave { position: absolute; top: calc(100% + 2px); left: 0; z-index: 2; white-space: nowrap; min-height: 36px; }
.party-member { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 29px; padding: 4px 6px; margin: 2px 0; background: rgba(var(--ui-darkest), .65); border: 1px solid rgba(var(--ui-dark), .15); border-radius: 3px; color: inherit; font: inherit; cursor: pointer; text-align: left; }
.party-member:hover, .party-member:focus-visible, .party-member--selected { border-color: var(--ui-ally-target-border); background: rgba(var(--ui-darkest), .9); }
.party-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.party-leader { color: rgb(var(--ui-durability-warning)); margin-right: 3px; }
.party-member--away { color: rgb(var(--ui-darker)); }
.party-away-mark { color: rgb(var(--ui-darker)); width: 45px; text-align: center; }
.party-resources { display: flex; flex-direction: column; gap: 2px; width: 45px; flex-shrink: 0; }
.party-bar { display: block; height: 3px; background: rgba(var(--ui-dark), .18); overflow: hidden; border-radius: 1px; }
.party-bar > span { display: block; height: 100%; transition: width .2s linear; }
.party-bar--hp > span { background: var(--ui-hp-fill); }
.party-bar--st > span { background: var(--ui-stamina-fill); }
.party-bar--mp > span { background: var(--ui-mana-fill); }
.party-invite-backdrop { pointer-events: none; align-items: flex-start; padding-top: max(65px, 12vh); box-sizing: border-box; }
.party-invite-window { pointer-events: auto; width: 310px; max-width: calc(100vw - 24px); }
.party-invite-window .dialog-header { display: flex; align-items: center; justify-content: center; }
.party-invite-content { padding: 6px 10px 10px; }
.party-invite-content p { font-size: 13px; line-height: 1.5; margin: 5px 0 12px; overflow-wrap: anywhere; }
.party-inviter-name { color: rgb(var(--ui-character-name)); }
.party-invite-icon { width: 48px; height: 48px; object-fit: contain; }
.party-invite-progress { height: 3px; background: rgba(var(--ui-dark), .2); margin-bottom: 12px; }
.party-invite-progress span { display: block; height: 100%; background: rgb(var(--ui-durability-warning)); transition: width .1s linear; }
.party-invite-buttons { display: flex; gap: 8px; justify-content: center; }
.party-invite-buttons button { flex: 1; min-height: 38px; }
.party-invite-decline span { color: rgb(var(--ui-attention)); text-shadow: 0 0 4px rgba(var(--ui-attention), .45); }
@media (pointer: coarse) { .party-member { min-height: 32px; } .party-menu-button { height: 28px; width: 36px; } }
</style>
