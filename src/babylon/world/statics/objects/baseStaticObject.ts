import { Vector2, Vector3 } from '@babylonjs/core'
import { Prefab } from '@/babylon/world/worldRenderer'
import { StaticObjectInfo, StaticObjectsCodebook } from '@/babylon/world/statics/staticsCodebook'

export interface StaticObject {
    type: number
    position: Vector3
    renderPosition: Vector3

    render(): void
    getSize(): number
    isBlocking(): boolean
    isObjectInCollision(tgtX: number, tgtZ: number, size: number): boolean
    getCollisionTolerance(): number
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

    protected constructor(type: number, position: Vector3, rotation: number, material: Vector2, prefab: Prefab | null) {
        this.type = type
        this.position = position
        this.rotation = rotation
        this.material = material
        this.prefab = prefab
        this.objectInfo = StaticObjectsCodebook.get(type)!
        this.renderPosition = new Vector3(position.x - 0.5 + this.getSize() / 2, position.y, position.z - 0.5 + this.getSize() / 2)
    }

    getSize(): number {
        return this.objectInfo.size
    }

    isBlocking(): boolean {
        return this.objectInfo.blocking
    }

    getCollisionTolerance(): number {
        return this.objectInfo.collisionTolerance
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
        const objMaxX = this.position.x + this.getSize() - (tol + 0.5)
        const objMinZ = this.position.z + tol - 0.5
        const objMaxZ = this.position.z + this.getSize() - (tol + 0.5)

        return (moverMinX < objMaxX && moverMaxX > objMinX && moverMinZ < objMaxZ && moverMaxZ > objMinZ)
    }

    abstract render(): void
}
