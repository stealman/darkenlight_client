import { Vector2 } from '@babylonjs/core'
import type { TransformNode } from '@babylonjs/core'
import { Lights } from '@/babylon/scene/lights'
import type { MapBlock } from '@/data/worldDataManager'
import { Settings } from '@/settings/settings'
import { OutdoorInstanceBatch } from './outdoorInstanceBatch'
import type { OutdoorInstance } from './outdoorInstanceBatch'
import { appendPavingAttributes, createSimpleStonePathMesh, createStonePathRenderer, pavingStoneMatrix, PAVING_INSTANCE_ATTRIBUTE } from './stonePathRenderer'
import type { PavingStone } from './stonePathLayout'
import type { TerrainContactShadow } from './terrainContactShadow'
import type { TerrainStepField } from './terrainStepField'

export function createOutdoorPaving(terrain: TransformNode, detailed: boolean,
    registerBatch: (batch: OutdoorInstanceBatch) => void, contactShadow?: TerrainContactShadow, terrainSteps?: TerrainStepField) {
    const uv = Vector2.Zero()
    let batch: OutdoorInstanceBatch | undefined
    let detailedRenderer: ReturnType<typeof createStonePathRenderer> | undefined
    let surfaceKey = ''

    const getBatch = () => {
        if (batch) return batch
        const scene = terrain.getScene()
        if (detailed) {
            detailedRenderer = createStonePathRenderer(scene, terrain, false, !Settings.isDetalLevelHigh())
            terrainSteps?.configure(detailedRenderer.material)
            contactShadow?.configure(detailedRenderer.material, false, !!terrainSteps)
        }
        const mesh = detailedRenderer?.mesh ?? createSimpleStonePathMesh(scene, terrain)
        Lights.registerSharedLightMesh(mesh)
        mesh.onDisposeObservable.addOnce(() => Lights.unregisterSharedLightMesh(mesh))
        batch = new OutdoorInstanceBatch(mesh)
        registerBatch(batch)
        return batch
    }

    return {
        createRegionInstanceFactory() {
            if (!detailed) {
                return (stone: PavingStone): OutdoorInstance =>
                    ({batch: getBatch(), matrix: pavingStoneMatrix(stone), uv, slot: -1})
            }
            const values: number[] = []
            const attributes = [{kind: PAVING_INSTANCE_ATTRIBUTE, stride: 4, values}]
            return (stone: PavingStone): OutdoorInstance => {
                const index = values.length / 4
                appendPavingAttributes(values, stone)
                return {batch: getBatch(), matrix: pavingStoneMatrix(stone), uv, attributes, index, slot: -1}
            }
        },
        resetSurface() { surfaceKey = '' },
        updateSurface(map: MapBlock[][], minX: number, minZ: number, maxX: number, maxZ: number,
            snowCoverMask: ReadonlySet<number>, snowRevision: number, revision?: number) {
            if (!detailedRenderer?.mesh.thinInstanceCount) return
            const bounds = {minX: Math.max(0, minX - 1), minZ: Math.max(0, minZ - 1),
                maxX: Math.min(map.length - 1, maxX + 1), maxZ: Math.min((map[0]?.length ?? 0) - 1, maxZ + 1)}
            const key = `${bounds.minX}:${bounds.minZ}:${bounds.maxX}:${bounds.maxZ}:${revision}:${snowRevision}`
            if (revision !== undefined && surfaceKey === key) return
            detailedRenderer.updateSurfaceField(map, bounds, (x, z) => snowCoverMask.has(x * map.length + z))
            surfaceKey = key
        },
    }
}
