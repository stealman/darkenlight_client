import { Vector2 } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import type { TransformNode } from '@babylonjs/core'
import { Lights } from '@/babylon/scene/lights'
import type { MapBlock } from '@/data/worldDataManager'
import { Settings } from '@/settings/settings'
import { OutdoorInstanceBatch } from './outdoorInstanceBatch'
import type { OutdoorInstance } from './outdoorInstanceBatch'
import { appendPavingAttributes, createSimpleStonePathMesh, createStonePathRenderer, pavingColorRow, pavingStoneMatrix, PAVING_INSTANCE_ATTRIBUTE } from './stonePathRenderer'
import type { PavingStone, StonePathBounds } from './stonePathLayout'
import type { TerrainContactShadow } from './terrainContactShadow'
import type { TerrainStepField } from './terrainStepField'

const SURFACE_RESERVE_TILES = 4

export function createOutdoorPaving(terrain: TransformNode, detailed: boolean,
    registerBatch: (batch: OutdoorInstanceBatch) => void, contactShadow?: TerrainContactShadow, terrainSteps?: TerrainStepField) {
    const uv = Vector2.Zero()
    let batch: OutdoorInstanceBatch | undefined
    let detailedRenderer: ReturnType<typeof createStonePathRenderer> | undefined
    let surfaceBounds: StonePathBounds | undefined
    let surfaceRevision: number | undefined
    let surfaceSnowRevision: number | undefined

    const getBatch = () => {
        if (batch) return batch
        const scene = terrain.getScene()
        if (detailed) {
            detailedRenderer = createStonePathRenderer(scene, terrain, false, !Settings.isDetalLevelHigh())
            terrainSteps?.configure(detailedRenderer.material)
            contactShadow?.configure(detailedRenderer.material, false, !!terrainSteps)
        }
        const mesh = detailedRenderer?.mesh ?? createSimpleStonePathMesh(scene, terrain)
        if (!detailed && mesh.material instanceof PBRCustomMaterial) contactShadow?.configure(mesh.material)
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
                    ({batch: getBatch(), matrix: pavingStoneMatrix(stone), uv: new Vector2(stone.variant, pavingColorRow(stone)), slot: -1})
            }
            const values: number[] = []
            const attributes = [{kind: PAVING_INSTANCE_ATTRIBUTE, stride: 4, values}]
            return (stone: PavingStone): OutdoorInstance => {
                const index = values.length / 4
                appendPavingAttributes(values, stone)
                return {batch: getBatch(), matrix: pavingStoneMatrix(stone), uv, attributes, index, slot: -1}
            }
        },
        resetSurface() { surfaceBounds = undefined },
        updateSurface(map: MapBlock[][], minX: number, minZ: number, maxX: number, maxZ: number,
            snowCoverMask: ReadonlySet<number>, snowRevision: number, revision?: number) {
            if (!detailedRenderer?.mesh.thinInstanceCount) return
            const bounds = {minX: Math.max(0, minX - 1), minZ: Math.max(0, minZ - 1),
                maxX: Math.min(map.length - 1, maxX + 1), maxZ: Math.min((map[0]?.length ?? 0) - 1, maxZ + 1)}
            if (revision !== undefined) {
                if (surfaceBounds && surfaceRevision === revision && surfaceSnowRevision === snowRevision
                    && bounds.minX >= surfaceBounds.minX && bounds.minZ >= surfaceBounds.minZ
                    && bounds.maxX <= surfaceBounds.maxX && bounds.maxZ <= surfaceBounds.maxZ) return

                // Preserve the sampling border and keep the field stationary for several tile crossings.
                bounds.minX = Math.max(0, bounds.minX - SURFACE_RESERVE_TILES)
                bounds.minZ = Math.max(0, bounds.minZ - SURFACE_RESERVE_TILES)
                bounds.maxX = Math.min(map.length - 1, bounds.maxX + SURFACE_RESERVE_TILES)
                bounds.maxZ = Math.min((map[0]?.length ?? 0) - 1, bounds.maxZ + SURFACE_RESERVE_TILES)
            }
            detailedRenderer.updateSurfaceField(map, bounds, (x, z) => snowCoverMask.has(x * map.length + z))
            surfaceBounds = bounds
            surfaceRevision = revision
            surfaceSnowRevision = snowRevision
        },
    }
}
