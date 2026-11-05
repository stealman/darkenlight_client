// Stable legacy paths (including manual ?v= dates) resolve to immutable build
// files. Leave unrelated/external/data/blob URLs alone and allow repeated calls.
export function modelAssetUrl(url: string): string {
    const absolute = /^https?:\/\//i.test(url)
    if (absolute && !url.startsWith(`${location.origin}/`)) return url
    const local = absolute ? url.slice(location.origin.length) : url
    const path = local.split(/[?#]/, 1)[0]
    return __MODEL_ASSET_URLS__[path] ?? url
}
