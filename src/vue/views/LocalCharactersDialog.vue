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
                        <span class="ui-text-gradient--button-state">{{ t('localCharacters.delete') }}</span>
                    </button>
                </div>
            </template>
            <template v-else>
                <h3>{{ t('localCharacters.saved') }}</h3>
                <p v-if="!visibleProfiles.length">{{ t('localCharacters.empty') }}</p>
                <div v-for="profile in visibleProfiles" :key="profile.id" class="local-character-row">
                    <button type="button" class="dialog-button local-character-continue"
                        :data-profile-id="profile.id" :disabled="busy" @click="start(profile)">
                        <span class="ui-text-gradient--button-state">{{ profile.name }}{{ profile.gm ? ' · GM' : '' }}</span>
                        <span>{{ t('localCharacters.continue') }}</span>
                    </button>
                    <button type="button" class="dialog-button" :data-delete-profile-id="profile.id" :disabled="busy"
                        :aria-label="t('localCharacters.deleteNamed', {name: profile.name})" @click="error = ''; pendingDelete = profile">
                        <span class="ui-text-gradient--button-state">{{ t('localCharacters.delete') }}</span>
                    </button>
                </div>
                <h3>{{ t('localCharacters.new') }}</h3>
                <form @submit.prevent="beginCreation">
                    <label class="login-field" for="local-character-name">
                        <span>{{ t('login.name') }}</span>
                        <input id="local-character-name" v-model="name" maxlength="40" autocomplete="off" />
                    </label>
                    <label v-if="gmAllowed" class="local-character-gm">
                        <input id="local-character-gm" v-model="gm" type="checkbox" /> {{ t('localCharacters.gm') }}
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
import GameDialog from './GameDialog.vue'
import GuestCharacterCreationDialog from './guestCharacterCreationDialog.vue'
import {createProfile, deleteProfile, listProfiles, type CharacterProfile} from '@/local/saveStore'
import {useI18n} from '@/i18n'

const emit = defineEmits<{start: [profile: CharacterProfile], enter: []}>()
const {t} = useI18n()
const gmAllowed = import.meta.env.DEV && import.meta.env.VITE_GM_MODE === 'true'
const profiles = ref<CharacterProfile[]>([])
const visibleProfiles = computed(() => profiles.value.filter(profile => !profile.gm || gmAllowed))
const name = ref('')
const gm = ref(false)
const chooseClass = ref(false)
const busy = ref(false)
const error = ref('')
const pendingDelete = ref<CharacterProfile | null>(null)
onMounted(async () => {
    try { profiles.value = await listProfiles() } catch (value) { error.value = String(value) }
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
.local-characters { min-width: 260px; max-width: 520px; }
.local-character-row { display: flex; gap: 8px; width: 100%; margin-bottom: 8px; }
.local-character-continue { display: flex; flex: 1; min-width: 0; justify-content: space-between; gap: 16px; overflow-wrap: anywhere; }
.local-character-gm { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
</style>
