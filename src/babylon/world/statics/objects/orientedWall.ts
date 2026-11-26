import type { Vector2, Vector3 } from '@babylonjs/core'
import type { Prefab } from '@/babylon/world/worldRenderer'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'

export type WallOrientation = 'X' | 'Z'

export interface WallMetadata {
    orientation?: WallOrientation
}

export interface WallDirection {
    x: number
    z: number
}

export abstract class OrientedWall extends BaseStaticObject {
    protected readonly orientation: WallOrientation
    protected cornerDirections: [WallDirection, WallDirection] | null = null

    protected constructor(type: number, position: Vector3, material: Vector2, prefab: Prefab | null, metadata?: WallMetadata) {
        super(type, position, 0, material, prefab)
        this.orientation = metadata?.orientation === 'X' ? 'X' : 'Z'
        this.status = {orientation: this.orientation}
    }

    getOrientation(): WallOrientation {
        return this.orientation
    }

    setCornerDirections(directions: [WallDirection, WallDirection] | null) {
        this.cornerDirections = directions
    }

    isObjectInCollision(tgtX: number, tgtZ: number, size: number): boolean {
        const moverHalf = size / 2
        const toleranceX = this.orientation === 'X' ? 0 : this.getCollisionTolerance()
        const toleranceZ = this.orientation === 'Z' ? 0 : this.getCollisionTolerance()
        return tgtX - moverHalf < this.position.x + 0.5 - toleranceX
            && tgtX + moverHalf > this.position.x - 0.5 + toleranceX
            && tgtZ - moverHalf < this.position.z + 0.5 - toleranceZ
            && tgtZ + moverHalf > this.position.z - 0.5 + toleranceZ
    }
}
