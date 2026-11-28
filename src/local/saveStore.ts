import {invoke} from '@tauri-apps/api/core'

export interface CharacterProfile {
    id: string
    name: string
    gm: boolean
    authoring?: boolean
    gender?: 'M' | 'F'
    classKey: 'FIGHTER' | 'MYSTIC'
    createdAt: number
}

async function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('darkenlight-saves', 2)
        request.onupgradeneeded = () => {
            for (const name of ['saves', 'profiles']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

async function stored<T>(store: string, write: boolean, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await database()
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(store, write ? 'readwrite' : 'readonly')
            const request = action(tx.objectStore(store))
            tx.oncomplete = () => resolve(request.result)
            tx.onerror = () => reject(tx.error)
            tx.onabort = () => reject(tx.error || new Error('Save transaction aborted'))
        })
    } finally { db.close() }
}

export async function loadSave(slot: string): Promise<string | null> {
    if ('__TAURI_INTERNALS__' in window) return invoke('load_game_save', {slot})
    return (await stored<string | undefined>('saves', false, store => store.get(slot))) ?? null
}

export async function writeSave(slot: string, contents: string): Promise<void> {
    if ('__TAURI_INTERNALS__' in window) await invoke('write_game_save', {slot, contents})
    else await stored('saves', true, store => store.put(contents, slot))
}

export async function listProfiles(): Promise<CharacterProfile[]> {
    const profiles: CharacterProfile[] = '__TAURI_INTERNALS__' in window
        ? await invoke('list_character_profiles') : await stored('profiles', false, store => store.getAll())
    return profiles.sort((a, b) => a.createdAt - b.createdAt)
}

export async function deleteProfile(id: string): Promise<void> {
    if (!/^char-[a-zA-Z0-9_-]{1,59}$/.test(id)) throw new Error('Invalid character profile ID')
    if ('__TAURI_INTERNALS__' in window) {
        await invoke('delete_character_profile', {id})
        return
    }
    const db = await database()
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(['profiles', 'saves'], 'readwrite')
            tx.objectStore('saves').delete(id)
            tx.objectStore('profiles').delete(id)
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
            tx.onabort = () => reject(tx.error || new Error('Character deletion aborted'))
        })
    } finally { db.close() }
}

export async function createProfile(name: string, gm: boolean, classKey: CharacterProfile['classKey'],
    gender: 'M' | 'F' = 'M', authoring = false): Promise<CharacterProfile> {
    if (gender !== 'M' && gender !== 'F') throw new Error('Invalid character gender')
    name = name.trim()
    if (name.length < 3 || name.length > 40) throw new Error('Character name must contain 3–40 characters')
    if (authoring && (!gm || !import.meta.env.DEV || import.meta.env.VITE_GM_MODE !== 'true')) {
        throw new Error('World authoring requires a GM profile and VITE_GM_MODE=true')
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    const profile = {id: 'char-' + Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''),
        name, gm, ...(gm ? {authoring} : {}), classKey, gender, createdAt: Date.now()}
    if ('__TAURI_INTERNALS__' in window) await invoke('write_character_profile', {profile})
    else await stored('profiles', true, store => store.add(profile, profile.id))
    return profile
}
