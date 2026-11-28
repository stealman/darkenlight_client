import {EJSON} from 'bson'
import {startGameRuntime} from '@game/runtime/gameRuntime'
import {Connector, type Connection} from '@game/network/connector'
import {LocalGameStorage, parseSave, restoreCharacterSave, type GameCollections} from '@game/db/localStorage'
import type {GameStorage, StorageRequest} from '@game/db/storage'
import {browserPlatform} from './browserPlatform'
import type {HostMessage, WorkerMessage, WorkerStart} from './workerProtocol'
import {characterGameMode} from './workerProtocol'
import {GameProcessor} from '@game/processor/gameProcessor'
import {CharactersManager} from '@game/character/charManager'
import {CharacterRepo} from '@game/db/repositories/characters'
import {GameManager} from '@game/game/game'
import {loadWorldBundle} from './worldBundle'
import type {RuntimePlatform} from '@game/runtime/platform'

const scope = globalThis as unknown as {
    postMessage(message: WorkerMessage): void
    onmessage: ((event: MessageEvent<HostMessage>) => void) | null
    addEventListener(type: string, listener: (event: any) => void): void
}
const emit = (message: WorkerMessage) => scope.postMessage(message)
const peers = new Map<string, Connection>()
const ioPending = new Map<number, {resolve: (value: string | null) => void, reject: (error: Error) => void}>()
let ioSequence = 0
let runtime: Awaited<ReturnType<typeof startGameRuntime>> | undefined
let started = false
let stopping = false
let staticMaps = false
let storageTimer: ReturnType<typeof setInterval> | undefined
let controls: Promise<void> = Promise.resolve()

function hostIO(operation: 'load-save' | 'write-save', slot: string, value?: string): Promise<string | null> {
    const requestId = ++ioSequence
    return new Promise((resolve, reject) => {
        ioPending.set(requestId, {resolve, reject})
        emit({kind: 'io', requestId, operation, slot, value})
    })
}

async function start(options: WorkerStart) {
    if (started) throw new Error('Local game has already started')
    started = true
    staticMaps = options.mode === 'play'
    if (options.profile && (options.profile.id !== options.slot || characterGameMode(options.profile) !== options.mode)) {
        throw new Error('Character profile does not match its save or game mode')
    }
    let storage: GameStorage
    let readFile: (path: string) => Promise<Uint8Array>
    let writeFile: (path: string, bytes: Uint8Array) => Promise<void>
    let loadWorldMap: RuntimePlatform['loadWorldMap']
    let loadWorldNavigation: RuntimePlatform['loadWorldNavigation']

    if (options.mode === 'authoring') {
        if (!import.meta.env.DEV || import.meta.env.VITE_GM_MODE !== 'true') {
            throw new Error('GM authoring requires VITE_GM_MODE=true with yarn dev')
        }
        const endpoint = new URL('/__game_io', options.baseUrl)
        let session: string | undefined
        const request = async (operation: string, value?: unknown) => {
            const response = await fetch(endpoint, {
                method: 'POST', headers: {'content-type': 'application/json', 'x-darkenlight-authoring': options.authoringToken},
                body: EJSON.stringify({operation, value, session}),
            })
            const body = EJSON.parse(await response.text())
            if (!response.ok || body.error) throw new Error(body.error || 'Authoring IO failed')
            return body.result
        }
        for (let attempt = 0; ; attempt++) {
            try { session = await request('open'); break }
            catch (error) {
                if (!String(error).includes('GM_SESSION_ACTIVE') || attempt >= 35) throw error
                await new Promise(resolve => setTimeout(resolve, 500))
            }
        }
        const pending = new Set<Promise<unknown>>()
        const saved = await hostIO('load-save', options.slot)
        const characterStorage = new LocalGameStorage('gm-character-v1', saved ? parseSave(saved, 'gm-character-v1') : {},
            async value => { await hostIO('write-save', options.slot, value) })
        storage = {
            execute: (value: StorageRequest) => {
                if (['characters', 'players'].includes(value.collection) && value.method !== 'nextId') {
                    return characterStorage.execute(value)
                }
                const operation = request('storage', value.method === 'nextId' ? {...value, collection: 'counters'} : value)
                pending.add(operation)
                void operation.finally(() => pending.delete(operation)).catch(() => {})
                return operation
            },
            flush: async () => { await Promise.all([...pending]); await characterStorage.flush(); await request('heartbeat') },
            close: async () => { await characterStorage.close(); await request('close') },
        }
        readFile = async path => new Uint8Array(await request('read-map', path))
        writeFile = async (path, bytes) => { await request('write-map', {path, bytes: Array.from(bytes)}) }
    } else {
        const bundle = options.bundle ?? await loadWorldBundle(options.baseUrl)
        const initial = EJSON.parse(bundle.worldJson) as GameCollections
        const saved = await hostIO('load-save', options.slot)
        storage = new LocalGameStorage(bundle.contentId, restoreCharacterSave(initial, saved, bundle.contentId),
            async value => { await hostIO('write-save', options.slot, value) })
        const maps = new Map(bundle.maps.map(entry => [entry.worldId, entry.map]))
        if (!import.meta.env.DEV) {
            const navigation = new Map(bundle.navigation.map(graph => [graph.worldId, graph]))
            loadWorldNavigation = async world => {
                const graph = navigation.get(world.id)
                if (!graph || graph.worldSize !== world.size) throw new Error(`Missing compiled navigation for world ${world.id}`)
                navigation.delete(world.id)
                return graph
            }
        }
        loadWorldMap = async world => {
            const map = maps.get(world.id)
            if (!map || map.width < world.size || map.depth < world.size) throw new Error(`Missing compiled terrain for world ${world.id}`)
            maps.delete(world.id)
            return map
        }
        readFile = async () => { throw new Error('Ordinary play loads compiled terrain, not authoring PNG files') }
        writeFile = async () => { throw new Error('World authoring requires GM mode with yarn dev') }
    }

    try {
        storageTimer = setInterval(() => { void storage.flush().catch(error => emit({kind: 'save-error', error: String(error)})) }, 2000)
        const platform = browserPlatform({readFile, writeFile})
        if (loadWorldMap) platform.loadWorldMap = loadWorldMap
        if (loadWorldNavigation) platform.loadWorldNavigation = loadWorldNavigation
        runtime = await startGameRuntime(platform, storage)
        if (options.profile) {
            const existing = await CharacterRepo.repo!.findAll()
            if (existing.length > 1 || (existing.length === 1 && (existing[0].name !== options.profile.name
                || (existing[0].class === 'GM') !== options.profile.gm))) throw new Error('Save contains a different character')
            if (!existing.length) {
                await CharactersManager.createCharacter(options.profile.name, null, GameManager.worlds.get(1)!,
                    options.profile.gm ? 'GM' : options.profile.classKey, options.profile.gender ?? 'M')
                await storage.flush()
            }
        }
        emit({kind: 'ready'})
    } catch (error) {
        clearInterval(storageTimer)
        await storage.close().catch(() => {})
        throw error
    }
}

function fail(error: unknown) { emit({kind: 'error', error: error instanceof Error ? error.stack || error.message : String(error)}) }

scope.onmessage = ({data}) => {
    if (data.kind === 'io-result') {
        const pending = ioPending.get(data.requestId)
        ioPending.delete(data.requestId)
        if (data.error) pending?.reject(new Error(data.error))
        else pending?.resolve(data.value ?? null)
        return
    }
    if (data.kind === 'start') { void start(data).catch(fail); return }
    if (!runtime || (stopping && data.kind !== 'save' && data.kind !== 'stop')) return
    try {
        if (data.kind === 'connect') {
            if (peers.has(data.connectionId)) throw new Error('Connection already exists')
            let open = true
            peers.set(data.connectionId, Connector.createConnection({
                staticWorldMaps: staticMaps,
                get open() { return open && !stopping },
                sendMessages: frame => emit({kind: 'frame', connectionId: data.connectionId, frame}),
                close: () => { open = false },
            }))
        } else if (data.kind === 'frame') {
            const conn = peers.get(data.connectionId)
            if (!conn) throw new Error('Unknown local connection')
            Connector.receiveMessage(conn, data.frame as import('@game/network/messages').Message)
        } else if (data.kind === 'disconnect') {
            const conn = peers.get(data.connectionId)
            peers.delete(data.connectionId)
            if (conn) { conn.peer.close(); void Connector.closeConnection(conn).catch(fail) }
        } else if (data.kind === 'inspect') {
            emit({kind: 'done', requestId: data.requestId, value: GameProcessor.tickCounter})
        } else if (data.kind === 'save' || data.kind === 'stop') {
            if (data.kind === 'stop') { stopping = true; clearInterval(storageTimer) }
            controls = controls.then(async () => {
                try {
                    if (data.kind === 'stop') await runtime!.stop()
                    else await runtime!.save()
                    emit({kind: 'done', requestId: data.requestId})
                } catch (error) { emit({kind: 'done', requestId: data.requestId, error: String(error)}) }
            })
        }
    } catch (error) { fail(error) }
}
scope.addEventListener('unhandledrejection', event => { event.preventDefault(); fail(event.reason) })
