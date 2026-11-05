// Installed before the lazy game import so boot failures are captured as well.
// Nothing is recorded or changed unless explicitly enabled in the URL.
export function initializeDiagnostics() {
    if (new URLSearchParams(location.search).get('debug') !== '1') return

    const lines = []
    let pending = false
    const panel = document.createElement('section')
    panel.id = 'darkenlight-diagnostics'
    panel.setAttribute('aria-label', 'Diagnostika hry')
    panel.style.cssText = 'position:fixed;z-index:2147483647;bottom:8px;left:8px;right:8px;max-width:800px;padding:10px;background:var(--ui-field-bg,#282620);color:rgb(var(--ui-base,233,218,190));border:1px solid var(--ui-field-border,#aaa);font:14px/1.4 monospace;pointer-events:auto'
    const header = document.createElement('div')
    header.textContent = 'Diagnostika · build ' + __CLIENT_BUILD_ID__
    const equipmentError = document.createElement('div')
    equipmentError.hidden = true
    equipmentError.setAttribute('role', 'alert')
    equipmentError.style.cssText = 'font: bold 17px/1.5 sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;max-height:30vh;overflow:auto;color:rgb(var(--ui-danger,210,106,106))'
    const controls = document.createElement('div')
    controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:8px 0'
    const output = document.createElement('textarea')
    output.readOnly = true
    output.setAttribute('aria-label', 'Diagnostický výpis')
    output.style.cssText = 'display:block;box-sizing:border-box;width:100%;height:30vh;min-height:100px;overflow:auto;user-select:text;font:12px/1.4 monospace;background:inherit;color:inherit;border:1px solid var(--ui-field-border,#aaa)'

    function button(label, action) {
        const element = document.createElement('button')
        element.type = 'button'
        element.textContent = label
        element.style.cssText = 'min-height:44px;padding:8px 12px;background:inherit;color:inherit;border:1px solid var(--ui-field-border,#aaa);font:inherit;touch-action:manipulation'
        element.onclick = action
        controls.append(element)
        return element
    }

    // Only strings and errors: never serialize arbitrary game/account objects.
    function format(value) {
        if (value instanceof Error) return value.stack || value.message
        return typeof value === 'string' || typeof value === 'number' ? String(value) : '[object omitted]'
    }
    function record(label, ...values) {
        const message = values.map(format).join(' ').slice(0, 6000)
            .replace(/([?&](?:token|password|secret|authorization|code)=)[^&\s]+/gi, '$1[redacted]')
        lines.push(`${new Date().toISOString()} ${label} ${message}`)
        if (lines.length > 150) lines.shift()
        if (!pending) {
            pending = true
            setTimeout(() => {
                pending = false
                output.value = lines.join('\n')
                output.scrollTop = output.scrollHeight
            }, 200)
        }
    }

    const copy = button('Kopírovat výpis', async () => {
        output.value = lines.join('\n')
        try {
            await navigator.clipboard.writeText(output.value)
            copy.textContent = 'Zkopírováno'
        } catch {
            output.hidden = false
            output.style.display = 'block'
            output.focus()
            output.select()
            output.setSelectionRange(0, output.value.length)
            copy.textContent = 'Podrž text a zkopíruj'
        }
    })
    button('Stav PWA', () => void snapshot())
    button('Vymazat výpis', () => { lines.length = 0; record('LOG', 'Výpis vymazán') })
    const toggle = button('Sbalit', () => {
        const collapsed = output.style.display !== 'none'
        output.style.display = collapsed ? 'none' : 'block'
        toggle.textContent = collapsed ? 'Rozbalit' : 'Sbalit'
    })
    panel.append(header, equipmentError, controls, output)
    document.body.append(panel)

    window.addEventListener('game:equipment-bone-error', event => {
        // Preserve the first culprit even if subsequent render errors flood the log.
        if (equipmentError.hidden) {
            equipmentError.textContent = event.detail.message
            equipmentError.hidden = false
        }
        record('EQUIPMENT', event.detail.message)
    })

    for (const level of ['warn', 'error']) {
        const original = console[level].bind(console)
        console[level] = (...args) => { original(...args); record(level.toUpperCase(), ...args) }
    }
    window.addEventListener('error', event => {
        if (event instanceof ErrorEvent) {
            record('JS ERROR', event.error || event.message, `${event.filename}:${event.lineno}:${event.colno}`)
        } else {
            const target = event.target
            record('RESOURCE ERROR', target?.src || target?.href || target?.tagName || 'unknown')
        }
    }, true)
    window.addEventListener('unhandledrejection', event => record('PROMISE ERROR', event.reason))
    document.addEventListener('webglcontextlost', () => record('WEBGL', 'Context lost'), true)
    document.addEventListener('webglcontextrestored', () => record('WEBGL', 'Context restored'), true)
    window.addEventListener('game:loading-progress', event => {
        record('LOADING', event.detail?.phaseKey, event.detail?.progress)
    })
    for (const type of ['game:started', 'game:session-ended', 'game:login-failed']) {
        window.addEventListener(type, () => record('GAME', type))
    }
    window.addEventListener('game:application-error', event => record('APP ERROR', event.detail?.message))
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => { record('PWA', 'controllerchange'); void snapshot() })
    }

    async function snapshot() {
        record('BUILD', __CLIENT_BUILD_ID__)
        record('BROWSER', navigator.userAgent)
        record('DISPLAY', `${innerWidth}x${innerHeight}, DPR=${devicePixelRatio}, standalone=${matchMedia('(display-mode: standalone)').matches}`)
        try {
            const settings = JSON.parse(localStorage.getItem('DARKENLIGHT_STORED_SETTINGS') || '{}')
            record('SETTINGS', `detail=${settings.detailLevelName}, device=${settings.deviceType}`)
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.getRegistration()
                record('PWA', `controller=${navigator.serviceWorker.controller?.scriptURL || 'none'}`)
                record('PWA', `active=${registration?.active?.state || 'none'}, waiting=${registration?.waiting?.state || 'none'}, installing=${registration?.installing?.state || 'none'}`)
            }
            if ('caches' in window) record('CACHES', (await caches.keys()).join(', '))
        } catch (error) {
            record('STATUS ERROR', error)
        }
    }
    void snapshot()
}
