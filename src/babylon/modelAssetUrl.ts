const sceneModelLods = new WeakMap<object, 2 | 3>()

export function setSceneModelLod(scene: object, lod: 1 | 2 | 3) {
    if (lod === 1) sceneModelLods.delete(scene)
    else sceneModelLods.set(scene, lod)
}

// Stable legacy paths (including manual ?v= dates) resolve to immutable build
// files. Leave unrelated/external/data/blob URLs alone and allow repeated calls.
export function modelAssetUrl(url: string, scene?: object): string {
    const absolute = /^https?:\/\//i.test(url)
    if (absolute && !url.startsWith(`${location.origin}/`)) return url
    const local = absolute ? url.slice(location.origin.length) : url
    const path = local.split(/[?#]/, 1)[0]
    const lod = scene && sceneModelLods.get(scene)
    if (lod && path.startsWith('/models/') && /\.(glb|gltf)$/i.test(path) && !/_lod[23]\.(glb|gltf)$/i.test(path)) {
        const variantLod = lod === 3 && path.startsWith('/models/equip/') ? 2 : lod
        const variant = __MODEL_ASSET_URLS__[path.replace(/(\.(?:glb|gltf))$/i, `_lod${variantLod}$1`)]
        if (variant) return variant
    }
    return __MODEL_ASSET_URLS__[path] ?? url
}
