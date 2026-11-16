<template>
    <Teleport to="#party-panel-host">
        <section v-if="state" class="party-panel" :aria-label="t('party.title')" @pointerdown.stop @pointerup.stop>
            <button v-for="member in otherMembers" :key="member.id" class="party-member"
                :class="{'party-member--selected': selectedCharacterId === member.id}"
                :aria-pressed="selectedCharacterId === member.id"
                :aria-label="member.name"
                @click="PartyManager.selectMember(member.id)">
                <span class="party-name"><span v-if="member.id === state.leaderId" class="party-leader" :title="t('party.leader')">♛</span>{{ member.name }}</span>
                <span class="party-resources">
                    <span v-for="resource in resources.filter(resource => resource.key !== 'mp' || (member.maxMp || 0) > 0)" :key="resource.key" class="party-bar" :class="'party-bar--' + resource.key"
                        role="progressbar" :aria-label="resource.label" :aria-valuenow="member[resource.key] || 0" :aria-valuemax="member[resource.max] || 0" aria-valuemin="0">
                        <span :style="{width: percent(member[resource.key], member[resource.max]) + '%'}"></span>
                    </span>
                </span>
            </button>
            <div ref="actionsMenu" class="party-actions">
                <button class="party-menu-button" :aria-label="t('party.actions')" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 5h12M4 10h12M4 15h12" /></svg></button>
                <button v-if="menuOpen" class="party-leave dialog-button" @click="leave"><span class="ui-text-gradient--button-state">{{ t('party.leave') }}</span></button>
            </div>
        </section>
    </Teleport>
</template>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {PartyManager} from '@/data/partyManager'
import {MyPlayer} from '@/data/myPlayer'
import {TargetingManager} from '@/gui/targettingManager'
import {t} from '@/i18n'

const state = PartyManager.state
const selectedCharacterId = TargetingManager.selectedCharacterId
const menuOpen = ref(false)
const actionsMenu = ref<HTMLElement | null>(null)
const closeMenuOutside = (event: Event) => {
    if (!(event.target instanceof Node) || !actionsMenu.value?.contains(event.target)) menuOpen.value = false
}
onMounted(() => {
    document.addEventListener('pointerdown', closeMenuOutside, true)
    document.addEventListener('click', closeMenuOutside, true)
})
onUnmounted(() => {
    document.removeEventListener('pointerdown', closeMenuOutside, true)
    document.removeEventListener('click', closeMenuOutside, true)
})
const otherMembers = computed(() => state.value?.members.filter(member => member.id !== MyPlayer.myChar?.id) || [])
const resources = [
    {key: 'hp', max: 'maxHp', label: 'HP'},
    {key: 'st', max: 'maxSt', label: 'ST'},
    {key: 'mp', max: 'maxMp', label: 'MP'},
] as const
const percent = (value = 0, maximum = 0) => maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0
const leave = () => { menuOpen.value = false; PartyManager.leave() }
</script>
