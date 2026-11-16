import {Connector} from '@/network/connector'

export async function initializeLocalGameLifecycle() {
    if ('__TAURI_INTERNALS__' in window) {
        const {getCurrentWindow} = await import('@tauri-apps/api/window')
        const nativeWindow = getCurrentWindow()
        let closing = false
        await nativeWindow.onCloseRequested(async event => {
            event.preventDefault()
            if (closing) return
            closing = true
            try {
                await Connector.closeConnection()
                await nativeWindow.destroy()
            } catch (error) {
                closing = false
                window.dispatchEvent(new CustomEvent('game:application-error', {detail: {message: `Unable to save game: ${error}`}}))
            }
        })
    } else {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') void Connector.save().catch(console.error)
        })
        window.addEventListener('pagehide', () => { void Connector.closeConnection().catch(console.error) })
    }
}
