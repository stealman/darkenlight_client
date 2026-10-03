import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'

export type WalkableBlockMaterial = 'WOOD' | 'STONE_GRAY' | 'STONE_RED'

export interface WalkableBlockMetadata {
    surfaceHeight?: number
    material?: WalkableBlockMaterial
}

export class WalkableBlock extends BaseStaticObject {
    private readonly surfaceHeight: number

    constructor(type: number, position: Vector3, material: Vector2, metadata?: WalkableBlockMetadata) {
        super(type, position, 0, material, null)
        this.surfaceHeight = metadata?.surfaceHeight === 0.5 ? 0.5 : 1
        this.status = {
            surfaceHeight: this.surfaceHeight,
            material: metadata?.material ?? 'WOOD',
        }
    }

    render() {
        WorldRenderer.block1!.matrices.push(
            Matrix.Scaling(1, this.surfaceHeight, 1).multiply(Matrix.Translation(
                this.renderPosition.x,
                this.renderPosition.y + 0.5 + this.surfaceHeight / 2,
                this.renderPosition.z,
            )),
        )
        WorldRenderer.block1!.uvData.push(this.material)
    }

    getWalkableHeight(): number {
        return this.surfaceHeight
    }
}
