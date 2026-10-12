const isAdminUtilsPath = window.location.pathname === '/adminUtils' || window.location.pathname.startsWith('/adminUtils/')
const showBootError = (label, error) => {
    console.error(`${label} failed to start:`, error)
    const root = document.querySelector('#appWrapper')
    if (root) {
        root.textContent = `${label} se nepodařilo spustit: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
        root.style.cssText = 'padding:24px;background:#160e0e;color:#ffb4a7;font:14px/1.5 monospace;white-space:pre-wrap;min-height:100vh'
    }
}

if (isAdminUtilsPath) {
    import('./adminUtils/adminUtils')
        .then(({ mountAdminUtils }) => mountAdminUtils())
        .catch((error) => showBootError('Admin utils', error))
} else {
    import('./gameMain')
        .then(({ mountGame }) => mountGame())
        .catch((error) => showBootError('Hru', error))
}
