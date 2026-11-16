<template>
    <GuestCharacterCreationDialog v-if="chooseClass" :name="name.trim()" @create="create" @back="chooseClass = false" />
    <GameDialog v-else backdrop-class="login-screen-backdrop" window-class="adaptive" :close-on-backdrop="false" :close-on-escape="false">
        <template #header><span class="ui-text-gradient">Darkenlight</span></template>
        <div class="local-characters">
            <template v-if="pendingDelete">
                <h3>{{ t('localCharacters.deleteTitle') }}</h3>
                <p>{{ t('localCharacters.deleteDescription', {name: pendingDelete.name}) }}</p>
                <div class="dialog-actions">
                    <button type="button" class="dialog-button" :disabled="busy" @click="pendingDelete = null">
                        <span class="ui-text-gradient--button-state">{{ t('localCharacters.cancel') }}</span>
                    </button>
                    <button type="button" class="dialog-button" :disabled="busy" @click="removeCharacter">
                        <span class="local-character-delete ui-text-gradient ui-text-gradient--accent ui-text-gradient--no-shadow">{{ t('localCharacters.delete') }}</span>
                    </button>
                </div>
            </template>
            <template v-else>
                <p v-if="!visibleProfiles.length">{{ t('localCharacters.empty') }}</p>
                <div v-for="profile in visibleProfiles" :key="profile.id" class="local-character-row">
                    <button type="button" class="dialog-button local-character-continue"
                        :data-profile-id="profile.id" :disabled="busy" @click="start(profile)">
                        <span class="local-character-details">
                            <span class="local-character-title">
                                <span class="ui-text-gradient--button-state">{{ profile.name }}</span>
                                <span :class="['local-character-class', 'ui-text-gradient', 'ui-text-gradient--no-shadow', 'ui-text-gradient--accent', `local-character-class--${characterClass(profile).toLowerCase()}`]">{{ t(`classes.${characterClass(profile).toLowerCase()}`) }}</span>
                            </span>
                            <small v-if="!profile.gm && summaries[profile.id]" class="local-character-time">{{ characterTime(profile) }}</small>
                        </span>
                        <span>{{ t('localCharacters.continue') }}</span>
                    </button>
                    <button type="button" class="dialog-button" :data-delete-profile-id="profile.id" :disabled="busy"
                        :aria-label="t('localCharacters.deleteNamed', {name: profile.name})" @click="error = ''; pendingDelete = profile">
                        <span class="local-character-delete ui-text-gradient ui-text-gradient--accent ui-text-gradient--no-shadow">{{ t('localCharacters.delete') }}</span>
                    </button>
                </div>
                <form @submit.prevent="beginCreation">
                    <label class="login-field" for="local-character-name">
                        <span class="local-character-new-label">{{ t('localCharacters.new') }}</span>
                        <input id="local-character-name" v-model="name" type="text" :disabled="busy" maxlength="40" autocomplete="off" />
                    </label>
                    <label v-if="gmAllowed" class="local-character-gm" for="local-character-gm">
                        <Checkbox input-id="local-character-gm" v-model="gm" binary :disabled="busy" /> {{ t('localCharacters.gm') }}
                    </label>
                    <p v-if="gm">{{ t('localCharacters.gmHint') }}</p>
                    <div class="dialog-actions"><button class="dialog-button" :disabled="busy || name.trim().length < 3">
                        <span class="ui-text-gradient--button-state">{{ t('localCharacters.create') }}</span>
                    </button></div>
                </form>
            </template>
            <p v-if="error" role="alert">{{ error }}</p>
        </div>
    </GameDialog>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import Checkbox from 'primevue/checkbox'
import GameDialog from './GameDialog.vue'
import GuestCharacterCreationDialog from './guestCharacterCreationDialog.vue'
import {createProfile, deleteProfile, listProfiles, loadSave, type CharacterProfile} from '@/local/saveStore'
import {useI18n} from '@/i18n'
import {EJSON} from 'bson'
import {OUTDOOR_DAY_NIGHT_CYCLE_DURATION_MS} from '@game/world/dayNightCycle'

const emit = defineEmits<{start: [profile: CharacterProfile], enter: []}>()
const {t} = useI18n()
const gmAllowed = import.meta.env.DEV && import.meta.env.VITE_GM_MODE === 'true'
const profiles = ref<CharacterProfile[]>([])
const visibleProfiles = computed(() => profiles.value.filter(profile => !profile.gm || gmAllowed))
const summaries = ref<Record<string, {classKey: string, gameTimeMs: number}>>({})
function characterClass(profile: CharacterProfile) {
    return profile.gm ? 'GM' : summaries.value[profile.id]?.classKey ?? profile.classKey
}
function characterTime(profile: CharacterProfile) {
    const cycles = summaries.value[profile.id].gameTimeMs / OUTDOOR_DAY_NIGHT_CYCLE_DURATION_MS
    const minutes = Math.floor((cycles % 1) * 24 * 60)
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    return t('dayNight.dateTime', {day: Math.floor(cycles) + 1, time})
}
const name = ref('')
const gm = ref(false)
const chooseClass = ref(false)
const busy = ref(false)
const error = ref('')
const pendingDelete = ref<CharacterProfile | null>(null)
onMounted(async () => {
    try {
        profiles.value = await listProfiles()
        await Promise.all(visibleProfiles.value.map(async profile => {
            try {
                const contents = await loadSave(profile.id)
                const character = contents ? EJSON.parse(contents).collections?.characters?.[0] : undefined
                summaries.value[profile.id] = {
                    classKey: character?.class ?? profile.classKey,
                    gameTimeMs: Number.isFinite(character?.gameTimeMs) && character.gameTimeMs >= 0 ? character.gameTimeMs : 0,
                }
            } catch (value) { error.value = String(value) }
        }))
    } catch (value) { error.value = String(value) }
})
function start(profile: CharacterProfile) {
    if (busy.value) return
    busy.value = true
    emit('enter')
    emit('start', profile)
}
async function removeCharacter() {
    if (busy.value || !pendingDelete.value) return
    busy.value = true
    error.value = ''
    try {
        const id = pendingDelete.value.id
        await deleteProfile(id)
        profiles.value = profiles.value.filter(profile => profile.id !== id)
        pendingDelete.value = null
    } catch (value) { error.value = String(value) }
    finally { busy.value = false }
}
async function create(classKey: 'FIGHTER' | 'MYSTIC') {
    busy.value = true
    // Fullscreen must be requested by the click, before IndexedDB yields.
    emit('enter')
    try {
        const profile = await createProfile(name.value, gm.value, classKey)
        chooseClass.value = false
        emit('start', profile)
    } catch (value) { error.value = String(value); chooseClass.value = false; busy.value = false }
}
function beginCreation() {
    error.value = ''
    if (gm.value) void create('FIGHTER')
    else chooseClass.value = true
}
</script>

<style scoped>
.local-characters { width: 100%; max-width: 520px; margin-inline: auto; padding: 8px 16px 16px; box-sizing: border-box; }
.local-characters h3 { text-align: center; margin: 12px 0 16px; }
.local-characters form { margin-top: 24px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.login-field { display: flex; align-items: center; gap: 12px; width: min(100%, 400px); text-align: left; color: rgb(var(--ui-base)); }
.local-character-new-label { flex-shrink: 0; font-size: 1.17em; font-weight: 700; }
.login-field input { box-sizing: border-box; flex: 1; min-width: 0; width: 100%; min-height: 40px; }
.local-characters .dialog-actions { display: flex; justify-content: center; gap: 8px; }
.local-characters form p { margin: 0; }
.local-character-row { display: flex; gap: 8px; width: 100%; margin-bottom: 8px; }
.local-character-continue { display: flex; flex: 1; min-width: 0; justify-content: space-between; align-items: center; gap: 16px; overflow-wrap: anywhere; }
.local-character-details { display: flex; flex-direction: column; gap: 4px; text-align: left; min-width: 0; }
.local-character-title { line-height: 1.15; }
.local-character-class { margin-left: 0.4em; font-weight: 700; --ui-text-gradient-accent: var(--ui-base); }
.local-character-delete { --ui-text-gradient-accent: var(--ui-accent-red); }
.local-character-class--fighter { --ui-text-gradient-accent: var(--ui-accent-red); }
.local-character-class--mystic { --ui-text-gradient-accent: var(--ui-accent-purple); }
.local-character-time { font-size: 0.75em; color: rgb(var(--ui-dark)); }
.local-character-gm { display: flex; align-items: center; gap: 10px; min-height: 32px; cursor: var(--ui-cursor-pointer); }
</style>
