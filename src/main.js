import { initializeDiagnostics } from './diagnostics'

initializeDiagnostics()

const isAdminUtilsPath = window.location.pathname === '/adminUtils' || window.location.pathname.startsWith('/adminUtils/')
const showBootError = (label, error) => {
    console.error(`${label} failed to start:`, error)
    const root = document.querySelector('#appWrapper')
    if (root) {
        root.textContent = `${label} se nepodařilo spustit: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
        root.style.cssText = 'padding:24px;background:#160e0e;color:#ffb4a7;font:14px/1.5 monospace;white-space:pre-wrap;min-height:100vh'
    }
}

async function boot() {
    if ('__TAURI_INTERNALS__' in window) {
        const {invoke} = await import('@tauri-apps/api/core')
        if (await invoke('runtime_smoke_test_enabled')) {
            const {runDesktopRuntimeSmoke} = await import('./local/runtimeSmoke')
            await runDesktopRuntimeSmoke()
            return
        }
    }
    if (window.location.pathname === '/adminUtils/gui') {
        import('./adminUtils/guiPreview')
            .then(({ mountGuiPreview }) => mountGuiPreview())
            .catch((error) => showBootError('GUI preview', error))
    } else if (isAdminUtilsPath) {
        import('./adminUtils/adminUtils')
            .then(({ mountAdminUtils }) => mountAdminUtils())
            .catch((error) => showBootError('Admin utils', error))
    } else {
        import('./gameMain')
            .then(({ mountGame }) => mountGame())
            .catch((error) => showBootError('Hru', error))
    }

}
boot().catch(error => showBootError('Hru', error))
