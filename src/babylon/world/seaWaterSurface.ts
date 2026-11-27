import { Matrix, Vector3 } from '@babylonjs/core'
import type { Mesh, Scene, TransformNode } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import type { MapBlock } from '@/data/worldDataManager'
import { WATER_BLOCK_TYPE } from './terrainRoofShape'
import { configureTerrainWater } from './terrainWaterMaterial'
import { updateWorldInstanceBuffers } from './worldInstanceBuffers'

type SeaBounds = {minX: number, minZ: number, maxX: number, maxZ: number}
type SeaTile = Pick<MapBlock, 'type' | 'height'>
const WINDOW_PADDING = 8

export function seaRectangles(map: readonly (readonly SeaTile[])[], level: number, bounds: SeaBounds) {
    const rectangles: SeaBounds[] = []
    let previous = new Map<number, SeaBounds>()
    let current = new Map<number, SeaBounds>()
    const width = bounds.maxZ - bounds.minZ + 1
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const row = map[x]
        current.clear()
        const isSea = (z: number) => {
            const tile = row?.[z]
            if (!tile || tile.type <= 0) return true
            return tile.type === WATER_BLOCK_TYPE ? tile.height <= level : tile.height < level
        }
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
            if (!isSea(z)) continue
            const minZ = z
            if (!row) z = bounds.maxZ
            else while (z < bounds.maxZ && isSea(z + 1)) z++
            const key = (minZ - bounds.minZ) * width + (z - bounds.minZ)
            let rectangle = previous.get(key)
            if (rectangle) rectangle.maxX = x
            else {
                rectangle = {minX: x, maxX: x, minZ, maxZ: z}
                rectangles.push(rectangle)
            }
            current.set(key, rectangle)
        }
        const next = previous
        previous = current
        current = next
    }
    return rectangles
}

export class SeaWaterSurface {
    readonly mesh: Mesh
    private bounds?: SeaBounds
    private map?: MapBlock[][]
    private level?: number
    private revision?: number

    constructor(scene: Scene, parent: TransformNode) {
        this.mesh = Builder.createHorizontalPlane(scene, parent, 1, 0)
        this.mesh.name = 'seaWater'
        configureTerrainWater(this.mesh, 'seaWater')
        this.mesh.isPickable = false
        this.mesh.setEnabled(false)
    }

    reset() {
        this.bounds = undefined
        this.mesh.setEnabled(false)
    }

    private includeCameraView(bounds: SeaBounds, level: number, limit: number) {
        const camera = this.mesh.getScene().activeCamera
        if (!camera) return
        const view = camera.getViewMatrix()
        const projection = camera.getProjectionMatrix()
        const eye = camera.globalPosition
        // The terrain viewport only includes a few height layers below the
        // player. The sea can still be seen much farther down from a cliff.
        for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const near = Vector3.Unproject(new Vector3(x, y, 0), 1, 1, Matrix.IdentityReadOnly, view, projection)
            const distance = (level - eye.y) / (near.y - eye.y)
            if (!Number.isFinite(distance) || distance < 0) continue
            const hitX = Math.max(-limit, Math.min(limit, eye.x + (near.x - eye.x) * distance))
            const hitZ = Math.max(-limit, Math.min(limit, eye.z + (near.z - eye.z) * distance))
            bounds.minX = Math.min(bounds.minX, Math.floor(hitX))
            bounds.minZ = Math.min(bounds.minZ, Math.floor(hitZ))
            bounds.maxX = Math.max(bounds.maxX, Math.ceil(hitX))
            bounds.maxZ = Math.max(bounds.maxZ, Math.ceil(hitZ))
        }
    }

    render(map: MapBlock[][], level: number, revision: number | undefined, view: SeaBounds) {
        this.includeCameraView(view, level, Math.max(1024, map.length, map[0]?.length ?? 0))
        const previous = this.bounds
        if (map === this.map && revision === this.revision && level === this.level && previous
            && view.minX >= previous.minX && view.minZ >= previous.minZ && view.maxX <= previous.maxX && view.maxZ <= previous.maxZ) return
        const bounds = {minX: view.minX - WINDOW_PADDING, minZ: view.minZ - WINDOW_PADDING,
            maxX: view.maxX + WINDOW_PADDING, maxZ: view.maxZ + WINDOW_PADDING}
        this.bounds = bounds
        this.map = map
        this.level = level
        this.revision = revision
        const matrices = seaRectangles(map, level, bounds).map(({minX, minZ, maxX, maxZ}) => {
            const matrix = Matrix.Scaling(maxX - minX + 1, 1, maxZ - minZ + 1)
            matrix.setTranslationFromFloats((minX + maxX) / 2, level, (minZ + maxZ) / 2)
            return matrix
        })
        updateWorldInstanceBuffers(this.mesh, matrices, [], false)
        this.mesh.setEnabled(matrices.length > 0)
    }
}
