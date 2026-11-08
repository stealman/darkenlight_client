import type { Scene, TransformNode } from '@babylonjs/core'
import type { MapBlock } from '@/data/worldDataManager'

type SmoothRenderer = typeof import('./experiments/smoothTerrain/smoothTerrainPoc')['SmoothTerrainPoc']

// The original renderer only sees a null hook unless explicitly enabled.
// Keep the experiment (including its imports and caches) out of normal startup.
function createSmoothTerrainExperiment() {
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('terrain') !== 'smooth') return null
    let renderer: SmoothRenderer | null = null
    let initialization = 0
    return {
        initialize(scene: Scene, parent: TransformNode | null, onReady: () => void) {
            const request = ++initialization
            renderer = null
            void import('./experiments/smoothTerrain/smoothTerrainPoc').then(({ SmoothTerrainPoc }) => {
                if (request !== initialization || scene.isDisposed) return
                SmoothTerrainPoc.initialize(scene, parent)
                renderer = SmoothTerrainPoc
                onReady()
            }).catch(error => {
                console.error('Unable to initialize smooth terrain experiment; keeping block terrain.', error)
            })
        },
        // While loading, fall through to the ordinary block renderer.
        begin() { renderer?.begin() },
        accepts(block: MapBlock, x: number, z: number) { return renderer?.accepts(block, x, z) ?? false },
        requestTile(x: number, z: number) { renderer?.requestTile(x, z) },
        finish(map: MapBlock[][], snowMask: Set<number>) { renderer?.finish(map, snowMask) },
    }
}

export const smoothTerrainExperiment = createSmoothTerrainExperiment()
