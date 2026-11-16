import {WorkerTransport} from './workerTransport'
import {invoke} from '@tauri-apps/api/core'

/** Explicit --runtime-smoke-test mode; never runs during ordinary game startup. */
export async function runDesktopRuntimeSmoke() {
    const startedAt = Date.now()
    const checks: string[] = []
    let transport: WorkerTransport | undefined
    const slot = `smoke-${Date.now()}`
    const name = `Runtime${Date.now()}`
    try {
        let messages: any[] = []
        let failure: Error | undefined
        const connect = async () => {
            messages = []
            failure = undefined
            const connection = new WorkerTransport('play', slot)
            transport = connection
            connection.onFrame = frame => messages.push(...frame)
            connection.onClose = error => { failure = error || new Error('Worker closed unexpectedly') }
            await connection.ready
            return connection
        }
        const waitFor = async (predicate: (message: any) => boolean) => {
            const until = Date.now() + 30000
            while (Date.now() < until) {
                if (failure) throw failure
                const found = messages.find(predicate)
                if (found) return found
                await new Promise(resolve => setTimeout(resolve, 20))
            }
            throw new Error('Expected game response did not arrive')
        }
        const first = await connect()
        checks.push('packaged-worker-started-and-loaded-compiled-world')
        first.send({t: 35, d: {name, classKey: 'FIGHTER'}})
        const login = await waitFor(message => message.t === 2)
        if (!login.d.char) throw new Error(login.d.message || 'Character creation failed')
        if (messages.findIndex(message => message.t === 7) < 0
            || messages.findIndex(message => message.t === 7) > messages.findIndex(message => message.t === 2)) throw new Error('World data did not precede login')
        checks.push('real-character-creation-and-map-before-login')
        const {getCurrentWindow} = await import('@tauri-apps/api/window')
        const nativeWindow = getCurrentWindow()
        const beforeMinimize = await first.inspectTick()
        await nativeWindow.minimize()
        await new Promise(resolve => setTimeout(resolve, 1000))
        await nativeWindow.unminimize()
        if (await first.inspectTick() <= beforeMinimize) throw new Error('Simulation stopped while minimized')
        checks.push('simulation-ticked-during-minimize-and-restore')
        first.send({t: 49, d: {types: [1]}})
        // Save is also a barrier for preceding asynchronous game commands.
        await first.save()
        checks.push('native-save-written')
        const originalId = login.d.char.id
        await first.close()
        const second = await connect()
        second.send({t: 1, login: '', password: '', guestName: name})
        const restored = await waitFor(message => message.t === 2)
        if (restored.d.char?.id !== originalId || restored.d.char?.name !== name) throw new Error('Native save did not restore the same character')
        checks.push('fresh-worker-restored-native-save')
        await second.close()
        transport = undefined
        checks.push('orderly-runtime-shutdown')
        await invoke('finish_runtime_smoke_test', {success: true, report: JSON.stringify({success: true, checks, durationMs: Date.now() - startedAt})})
    } catch (error) {
        await transport?.close().catch(() => {})
        await invoke('finish_runtime_smoke_test', {success: false, report: JSON.stringify({success: false, checks, error: String(error), durationMs: Date.now() - startedAt})})
    }
}
