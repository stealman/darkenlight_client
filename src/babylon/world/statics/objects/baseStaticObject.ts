import { Matrix, Mesh, Vector2, Vector3 } from '@babylonjs/core'
import { Prefab, WorldRenderer } from '@/babylon/world/worldRenderer'
import { StaticObjectInfo, StaticObjectsCodebook } from '@/babylon/world/statics/staticsCodebook'
import { TerrainManager } from '@/babylon/world/terrainManager'

export interface StaticObject {
    type: number
    position: Vector3
    renderPosition: Vector3
    prefab: Prefab | null

    render(): void
    renderTerrain?(terrainMatrices: Matrix[], terrainUvData: Vector2[]): void
    onVisible(): void
    onHidden(): void
    dispose(): void
    getSize(): number
    getSizeX(): number
    getSizeZ(): number
    isBlocking(): boolean
    isObjectInCollision(tgtX: number, tgtZ: number, size: number): boolean
    getCollisionTolerance(): number
    getWalkableHeight(): number | null
    getPlacementSurfaceHeight(): number | null
    shouldPlaceOnStatic(): boolean
    clearRenderMatrixCapture(): void
    captureRenderMatrices(blockStart: number, prefabStart: number, translucentStart: number): void
    applyDeleteBounceOffset(offset: number): Mesh[]
    captureTerrainMatrices(start: number, matrices: Matrix[]): void
}

export abstract class BaseStaticObject implements StaticObject {
    type: number
    position: Vector3
    renderPosition: Vector3
    rotation: number
    material: Vector2
    prefab: Prefab | null
    objectInfo: StaticObjectInfo
    status: any
    private blockMatrixIndices: number[] = []
    private blockMatrixBaseY: number[] = []
    private prefabMatrixIndices: number[] = []
    private prefabMatrixBaseY: number[] = []
    private translucentMatrixIndices: number[] = []
    private translucentMatrixBaseY: number[] = []
    private terrainMatrixIndices: number[] = []
    private terrainMatrixBaseY: number[] = []

    protected constructor(type: number, position: Vector3, rotation: number, material: Vector2, prefab: Prefab | null) {
        this.type = type
        this.position = position
        this.rotation = rotation
        this.material = material
        this.prefab = prefab
        this.objectInfo = StaticObjectsCodebook.get(type)!
        this.renderPosition = new Vector3(position.x - 0.5 + this.getSizeX() / 2, position.y, position.z - 0.5 + this.getSizeZ() / 2)
    }

    getSize(): number {
        return Math.max(this.getSizeX(), this.getSizeZ())
    }

    getSizeX(): number {
        return this.isRotatedFootprint() ? this.objectInfo.sizeZ : this.objectInfo.sizeX
    }

    getSizeZ(): number {
        return this.isRotatedFootprint() ? this.objectInfo.sizeX : this.objectInfo.sizeZ
    }

    private isRotatedFootprint(): boolean {
        return this.status?.facing === '-X' || this.status?.facing === '+X'
    }

    isBlocking(): boolean {
        return this.objectInfo.blocking
    }

    getCollisionTolerance(): number {
        return this.objectInfo.collisionTolerance
    }

    getWalkableHeight(): number | null {
        return null
    }

    getPlacementSurfaceHeight(): number | null {
        return this.getWalkableHeight()
    }

    shouldPlaceOnStatic(): boolean {
        return false
    }

    clearRenderMatrixCapture() {
        this.blockMatrixIndices = []
        this.blockMatrixBaseY = []
        this.prefabMatrixIndices = []
        this.prefabMatrixBaseY = []
        this.translucentMatrixIndices = []
        this.translucentMatrixBaseY = []
        this.terrainMatrixIndices = []
        this.terrainMatrixBaseY = []
    }

    captureRenderMatrices(blockStart: number, prefabStart: number, translucentStart: number) {
        this.blockMatrixIndices = Array.from(
            {length: WorldRenderer.block1!.matrices.length - blockStart},
            (_, index) => blockStart + index,
        )
        this.blockMatrixBaseY = this.blockMatrixIndices.map((index) => WorldRenderer.block1!.matrices[index].m[13])
        if (this.prefab) {
            this.prefabMatrixIndices = Array.from(
                {length: this.prefab.matrices.length - prefabStart},
                (_, index) => prefabStart + index,
            )
            this.prefabMatrixBaseY = this.prefabMatrixIndices.map((index) => this.prefab!.matrices[index].m[13])
        }
        this.translucentMatrixIndices = Array.from(
            {length: WorldRenderer.translucentPlane!.matrices.length - translucentStart},
            (_, index) => translucentStart + index,
        )
        this.translucentMatrixBaseY = this.translucentMatrixIndices.map((index) => WorldRenderer.translucentPlane!.matrices[index].m[13])
    }

    captureTerrainMatrices(start: number, matrices: Matrix[]) {
        this.terrainMatrixIndices = Array.from(
            {length: matrices.length - start},
            (_, index) => start + index,
        )
        this.terrainMatrixBaseY = this.terrainMatrixIndices.map((index) => matrices[index].m[13])
    }

    applyDeleteBounceOffset(offset: number): Mesh[] {
        const changedMeshes: Mesh[] = []
        const blockBuffer = WorldRenderer.block1!.matrixBuffer
        if (this.blockMatrixIndices.length > 0 && blockBuffer.length > 0) {
            this.blockMatrixIndices.forEach((index, i) => {
                blockBuffer[(index * 16) + 13] = this.blockMatrixBaseY[i] + offset
            })
            changedMeshes.push(WorldRenderer.block1!.mesh)
        }
        if (this.prefabMatrixIndices.length > 0 && this.prefab!.matrixBuffer.length > 0) {
            this.prefabMatrixIndices.forEach((index, i) => {
                this.prefab!.matrixBuffer[(index * 16) + 13] = this.prefabMatrixBaseY[i] + offset
            })
            changedMeshes.push(this.prefab!.mesh)
        }
        const translucentBuffer = WorldRenderer.translucentPlane!.matrixBuffer
        if (this.translucentMatrixIndices.length > 0 && translucentBuffer.length > 0) {
            this.translucentMatrixIndices.forEach((index, i) => {
                translucentBuffer[(index * 16) + 13] = this.translucentMatrixBaseY[i] + offset
            })
            changedMeshes.push(WorldRenderer.translucentPlane!.mesh)
        }
        if (this.terrainMatrixIndices.length > 0 && TerrainManager.terrainBlockMatrixBuffer.length > 0) {
            this.terrainMatrixIndices.forEach((index, i) => {
                TerrainManager.terrainBlockMatrixBuffer[(index * 16) + 13] = this.terrainMatrixBaseY[i] + offset
            })
            changedMeshes.push(TerrainManager.terrainBlock1!)
        }
        this.onDeleteBounceOffset(offset)
        return changedMeshes
    }

    protected onDeleteBounceOffset(_offset: number) {
    }

    isObjectInCollision(tgtX: number, tgtZ: number, size: number): boolean {
        if (!this.isBlocking()) {
            return false
        }

        const moverHalf = size / 2

        const moverMinX = tgtX - moverHalf
        const moverMaxX = tgtX + moverHalf
        const moverMinZ = tgtZ - moverHalf
        const moverMaxZ = tgtZ + moverHalf

        const tol = this.getCollisionTolerance()

        const objMinX = this.position.x + tol - 0.5
        const objMaxX = this.position.x + this.getSizeX() - (tol + 0.5)
        const objMinZ = this.position.z + tol - 0.5
        const objMaxZ = this.position.z + this.getSizeZ() - (tol + 0.5)

        return (moverMinX < objMaxX && moverMaxX > objMinX && moverMinZ < objMaxZ && moverMaxZ > objMinZ)
    }

    onVisible() {
    }

    onHidden() {
    }

    dispose() {
    }

    abstract render(): void
}
