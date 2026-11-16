import type {GameTransport} from '@/network/transport'
import type {HostMessage, LocalGameMode, WorkerMessage} from './workerProtocol'
import {loadSave, writeSave, type CharacterProfile} from './saveStore'
import {loadWorldBundle, localWorldMaps} from './worldBundle'

declare const __AUTHORING_TOKEN__: string

export class WorkerTransport implements GameTransport {
    readonly ready: Promise<void>
    onFrame: ((frame: string) => void) | null = null
    onClose: ((error?: Error) => void) | null = null
    onError: ((error: Error) => void) | null = null
    private worker: Worker
    private active = false
    private closing = false
    private sequence = 0
    private pending = new Map<number, {resolve: (value: unknown) => void, reject: (error: Error) => void, timeout: ReturnType<typeof setTimeout>}>()
    private ioQueue = Promise.resolve()
    private readonly connectionId = 'local-player'

    constructor(mode: LocalGameMode, slot = 'default', profile?: CharacterProfile) {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(slot)) throw new Error('Invalid save slot')
        this.worker = new Worker(new URL('./game.worker.ts', import.meta.url), {type: 'module'})
        this.ready = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { this.fail(new Error('Local game initialization timed out')); reject(new Error('Local game initialization timed out')) }, 120000)
            this.worker.onerror = event => { clearTimeout(timeout); const error = new Error(event.message || 'Local game worker failed'); reject(error); this.fail(error) }
            this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
                const message = event.data
                if (message.kind === 'ready') {
                    clearTimeout(timeout)
                    this.active = true
                    this.post({kind: 'connect', connectionId: this.connectionId})
                    resolve()
                } else if (message.kind === 'frame' && message.connectionId === this.connectionId) {
                    this.onFrame?.(message.frame)
                } else if (message.kind === 'error') {
                    clearTimeout(timeout)
                    const error = new Error(message.error)
                    reject(error)
                    this.fail(error)
                } else if (message.kind === 'save-error') {
                    this.onError?.(new Error(message.error))
                } else if (message.kind === 'done') {
                    const request = this.pending.get(message.requestId)
                    if (!request) return
                    this.pending.delete(message.requestId)
                    clearTimeout(request.timeout)
                    if (message.error) request.reject(new Error(message.error))
                    else request.resolve(message.value)
                } else if (message.kind === 'io') {
                    // Serialize native writes so an older snapshot cannot replace a newer one.
                    this.ioQueue = this.ioQueue.then(async () => {
                        try {
                            const value = await this.saveIO(message.operation, message.slot, message.value)
                            this.post({kind: 'io-result', requestId: message.requestId, value})
                        } catch (error) {
                            this.post({kind: 'io-result', requestId: message.requestId, error: String(error)})
                        }
                    })
                }
            }
            void (async () => {
                localWorldMaps.clear()
                const bundle = mode === 'play' ? await loadWorldBundle(document.baseURI) : undefined
                if (this.closing) return
                for (const entry of bundle?.maps ?? []) localWorldMaps.set(entry.worldId, entry.map)
                this.post({kind: 'start', mode, slot, profile: profile ? {...profile} : undefined, bundle,
                    baseUrl: document.baseURI, authoringToken: import.meta.env.DEV ? __AUTHORING_TOKEN__ : ''})
            })().catch(error => { clearTimeout(timeout); reject(error); this.fail(error instanceof Error ? error : new Error(String(error))) })
        })
    }

    private post(message: HostMessage) { this.worker.postMessage(message) }
    get open() { return this.active && !this.closing }
    send(frame: string) {
        if (!this.open) throw new Error('Local game is not ready')
        this.post({kind: 'frame', frame, connectionId: this.connectionId})
    }

    private request<T = void>(kind: 'save' | 'stop' | 'inspect'): Promise<T> {
        const requestId = ++this.sequence
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { this.pending.delete(requestId); reject(new Error('Local save timed out')) }, 30000)
            this.pending.set(requestId, {resolve: value => resolve(value as T), reject, timeout})
            this.post({kind, requestId})
        })
    }
    async save() { await this.ready; await this.request('save') }
    async inspectTick(): Promise<number> { await this.ready; return this.request<number>('inspect') }
    async close() {
        if (this.closing) return
        this.closing = true
        try { if (this.active) await this.request('stop') }
        catch (error) { this.closing = false; throw error }
        this.active = false
        this.worker.terminate()
        localWorldMaps.clear()
    }
    private fail(error: Error) {
        this.active = false
        this.worker.terminate()
        for (const request of this.pending.values()) { clearTimeout(request.timeout); request.reject(error) }
        this.pending.clear()
        this.onClose?.(error)
    }

    private async saveIO(operation: string, slot: string, value?: string): Promise<string | null> {
        if (operation === 'load-save') return loadSave(slot)
        await writeSave(slot, value!)
        return null
    }
}
