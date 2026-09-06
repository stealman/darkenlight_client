import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'

export class Wall2 extends BaseStaticObject {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, null)
    }

    render() {
        for (let i = 1; i <= 2; i++) {
            WorldRenderer.block1!.matrices.push(Matrix.Translation(this.renderPosition.x, this.renderPosition.y + i, this.renderPosition.z))
            WorldRenderer.block1!.uvData.push(this.material)
        }
    }
}

export class Wall3 extends BaseStaticObject {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, null)
    }

    render() {
        for (let i = 1; i <= 3; i++) {
            WorldRenderer.block1!.matrices.push(Matrix.Translation(this.renderPosition.x, this.renderPosition.y + i, this.renderPosition.z))
            WorldRenderer.block1!.uvData.push(this.material)
        }
    }
}

export type StoneEntranceFacing = '-X' | '+X' | '-Z' | '+Z'

export interface StoneEntranceMetadata {
    facing?: StoneEntranceFacing
}

export class StoneEntrance extends BaseStaticObject {
    private readonly facing: StoneEntranceFacing

    constructor(type: number, position: Vector3, material: Vector2, metadata?: StoneEntranceMetadata) {
        super(type, position, 0, material, null)
        this.facing = metadata?.facing === '-X' || metadata?.facing === '+X' || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : '+Z'
        this.status = {facing: this.facing}
        this.renderPosition.set(position.x - 0.5 + this.getSizeX() / 2, position.y, position.z - 0.5 + this.getSizeZ() / 2)
    }

    render() {
        const runsAlongX = this.getSizeX() > this.getSizeZ()
        const addBlock = (offset: number, height: number) => {
            const x = this.position.x + (runsAlongX ? offset : 0)
            const z = this.position.z + (runsAlongX ? 0 : offset)
            WorldRenderer.block1!.matrices.push(Matrix.Translation(x, this.position.y + height, z))
            WorldRenderer.block1!.uvData.push(this.material)
        }

        for (const offset of [0, 3]) {
            for (let height = 1; height <= 3; height++) {
                addBlock(offset, height)
            }
        }
        addBlock(1, 3)
        addBlock(2, 3)
    }

    isObjectInCollision(tgtX: number, tgtZ: number, size: number): boolean {
        const moverHalf = size / 2
        const runsAlongX = this.getSizeX() > this.getSizeZ()
        return [0, 3].some((offset) => {
            const blockX = this.position.x + (runsAlongX ? offset : 0)
            const blockZ = this.position.z + (runsAlongX ? 0 : offset)
            return tgtX - moverHalf < blockX + 0.5
                && tgtX + moverHalf > blockX - 0.5
                && tgtZ - moverHalf < blockZ + 0.5
                && tgtZ + moverHalf > blockZ - 0.5
        })
    }
}
