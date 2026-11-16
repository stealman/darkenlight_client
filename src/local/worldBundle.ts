import {decodeCompiledMap, type CompiledMap} from '@game/runtime/compiledMap'

export interface LocalWorldBundle {
    contentId: string
    worldJson: string
    maps: Array<{worldId: number, map: CompiledMap}>
}

/** Main-thread map templates are independent of the simulation and save slot. */
export const localWorldMaps = new Map<number, CompiledMap>()

export async function loadWorldBundle(baseUrl: string): Promise<LocalWorldBundle> {
    const base = new URL('./world/', baseUrl)
    const response = await fetch(new URL('manifest.json', base))
    if (!response.ok) throw new Error('World bundle is missing. Run yarn export:world.')
    const manifest = await response.json()
    if (manifest.schemaVersion !== 1 || typeof manifest.contentId !== 'string' || !manifest.files || !manifest.terrainMaps) {
        throw new Error('World bundle needs compiled terrain. Run yarn export:world and rebuild the game.')
    }
    const read = async (path: string) => {
        if (!manifest.files[path] || path.includes('..') || path.startsWith('/')) throw new Error('Invalid world asset path')
        const response = await fetch(new URL(path, base))
        if (!response.ok) throw new Error(`Missing world asset: ${path}`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (crypto.subtle) {
            const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('')
            if (hash !== manifest.files[path]) throw new Error(`World asset checksum mismatch: ${path}`)
        }
        return bytes
    }
    const worldJson = new TextDecoder().decode(await read('world.json'))
    const maps: LocalWorldBundle['maps'] = []
    // Sequential decoding bounds temporary memory on mobile devices.
    for (const [id, path] of Object.entries(manifest.terrainMaps)) {
        const worldId = Number(id)
        if (!Number.isSafeInteger(worldId) || worldId <= 0) throw new Error('Invalid compiled world ID')
        maps.push({worldId, map: decodeCompiledMap(await read(path as string))})
    }
    return {contentId: manifest.contentId, worldJson, maps}
}
