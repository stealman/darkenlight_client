declare const __AUTHORING_TOKEN__: string

export async function canAuthorLocalWorld(): Promise<boolean> {
    if (!import.meta.env.DEV || import.meta.env.VITE_GM_MODE !== 'true' || '__TAURI_INTERNALS__' in window) return false
    try {
        const response = await fetch(new URL('/__game_io', document.baseURI), {
            method: 'HEAD',
            headers: {'x-darkenlight-authoring': __AUTHORING_TOKEN__},
        })
        return response.status === 204
    } catch {
        return false
    }
}
