import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { WorldRenderer } from '@/babylon/world/worldRenderer'

export type CampObjectFacing = '-X' | '+X' | '-Z' | '+Z'
export type CampFenceOrientation = 'X' | 'Z'

export interface CampObjectMetadata {
    facing?: CampObjectFacing
    length?: number
    containerId?: string
}

export interface CampFenceMetadata {
    orientation?: CampFenceOrientation
}

interface Direction {
    x: number
    z: number
}

function addPart(width: number, height: number, depth: number, x: number, y: number, z: number, material: Vector2, yaw = 0, roll = 0) {
    WorldRenderer.block1!.matrices.push(
        Matrix.Scaling(width, height, depth)
            .multiply(Matrix.RotationYawPitchRoll(yaw, 0, roll))
            .multiply(Matrix.Translation(x, y, z)),
    )
    WorldRenderer.block1!.uvData.push(material)
}

abstract class CampObject extends BaseStaticObject {
    protected readonly facing: CampObjectFacing
    protected readonly accentMaterial: Vector2

    protected constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, metadata?: CampObjectMetadata) {
        super(type, position, 0, material, null)
        this.facing = metadata?.facing === '-X' || metadata?.facing === '+X'
            || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : '+Z'
        this.accentMaterial = accentMaterial
        this.status = {facing: this.facing, containerId: metadata?.containerId}
        this.renderPosition.set(
            position.x - 0.5 + this.getSizeX() / 2,
            position.y,
            position.z - 0.5 + this.getSizeZ() / 2,
        )
    }

    protected get yaw(): number {
        return this.facing === '-X' || this.facing === '+X' ? Math.PI / 2 : 0
    }

    protected rotateOffset(x: number, z: number): {x: number, z: number} {
        if (this.facing === '-X' || this.facing === '+X') {
            return {x: -z, z: x}
        }
        return {x, z}
    }

    protected part(width: number, height: number, depth: number, x: number, y: number, z: number, material = this.material, roll = 0) {
        const offset = this.rotateOffset(x, z)
        addPart(
            width,
            height,
            depth,
            this.renderPosition.x + offset.x,
            this.renderPosition.y + y + 0.5,
            this.renderPosition.z + offset.z,
            material,
            this.yaw,
            roll,
        )
    }
}

export class CampBench extends CampObject {
    render() {
        for (const x of [-0.675, -0.225, 0.225, 0.675]) {
            for (const z of [-0.115, 0.115]) {
                this.part(0.43, 0.12, 0.21, x, 0.38, z)
            }
        }
        for (const x of [-0.68, 0.68]) {
            this.part(0.2, 0.32, 0.34, x, 0.16, 0, this.accentMaterial)
        }
    }
}

export class PlankPile extends CampObject {
    render() {
        const rows = [
            [-0.2, 0.12, -0.16, -0.035],
            [0.2, 0.12, 0.15, 0.025],
            [-0.08, 0.24, 0.1, 0.02],
            [0.13, 0.36, -0.08, -0.045],
        ]
        for (const [x, y, z, roll] of rows) {
            this.part(0.82, 0.1, 0.16, x, y, z, this.material, roll)
        }
    }
}

export class LogPile extends CampObject {
    private readonly length: number

    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, metadata?: CampObjectMetadata) {
        super(type, position, material, accentMaterial, metadata)
        this.length = metadata?.length === 2 || metadata?.length === 3 ? metadata.length : 1
        this.status = {facing: this.facing, length: this.length}
        this.renderPosition.set(
            position.x - 0.5 + this.getSizeX() / 2,
            position.y,
            position.z - 0.5 + this.getSizeZ() / 2,
        )
    }

    render() {
        const logLength = this.length - 0.18
        for (const [x, y, z] of [
            [-0.24, 0.13, -0.14], [0.24, 0.13, -0.14], [0, 0.13, 0.18],
            [-0.14, 0.36, 0], [0.2, 0.36, 0.04], [0.02, 0.59, 0.01],
        ]) {
            this.part(0.18, 0.18, logLength, x, y, z)
        }
    }

    getSizeX(): number {
        return this.status?.facing === '-X' || this.status?.facing === '+X' ? this.length ?? 1 : 1
    }

    getSizeZ(): number {
        return this.status?.facing === '-X' || this.status?.facing === '+X' ? 1 : this.length ?? 1
    }
}

export class SupplyCrate extends CampObject {
    render() {
        this.part(0.78, 0.7, 0.78, 0, 0.35, 0)
        for (const y of [0.08, 0.62]) {
            this.part(0.86, 0.09, 0.86, 0, y, 0, this.accentMaterial)
        }
        this.part(0.1, 0.76, 0.86, 0, 0.37, 0, this.accentMaterial, Math.PI / 4)
    }
}

export class CampBarrel extends CampObject {
    private readonly lidMaterial: Vector2

    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, lidMaterial: Vector2, metadata?: CampObjectMetadata) {
        super(type, position, material, accentMaterial, metadata)
        this.lidMaterial = lidMaterial
    }

    render() {
        this.part(0.62, 0.82, 0.62, 0, 0.41, 0)
        this.part(0.7, 0.09, 0.7, 0, 0.14, 0, this.accentMaterial)
        this.part(0.7, 0.09, 0.7, 0, 0.68, 0, this.accentMaterial)
        this.part(0.56, 0.08, 0.56, 0, 0.86, 0, this.lidMaterial)
    }
}

export class CampFence extends BaseStaticObject {
    private static readonly railHeights = [0.975, 1.35]
    private readonly orientation: CampFenceOrientation
    private readonly railMaterial: Vector2
    private cornerDirections: [Direction, Direction] | null = null

    constructor(type: number, position: Vector3, postMaterial: Vector2, railMaterial: Vector2, metadata?: CampFenceMetadata) {
        super(type, position, 0, postMaterial, null)
        this.orientation = metadata?.orientation === 'X' ? 'X' : 'Z'
        this.railMaterial = railMaterial
        this.status = {orientation: this.orientation}
    }

    getOrientation(): CampFenceOrientation {
        return this.orientation
    }

    setCornerDirections(directions: [Direction, Direction] | null) {
        this.cornerDirections = directions
    }

    render() {
        if (this.cornerDirections) {
            this.renderCorner()
            return
        }

        const alongX = this.orientation === 'X'
        for (const offset of [-0.42, 0, 0.42]) {
            addPart(0.1, 0.95, 0.1,
                this.renderPosition.x + (alongX ? offset : 0), this.renderPosition.y + 0.975,
                this.renderPosition.z + (alongX ? 0 : offset), this.material)
        }
        for (const y of CampFence.railHeights) {
            addPart(alongX ? 0.94 : 0.09, 0.1, alongX ? 0.09 : 0.94,
                this.renderPosition.x, this.renderPosition.y + y, this.renderPosition.z, this.railMaterial)
        }
    }

    private renderCorner() {
        addPart(0.1, 0.95, 0.1, this.renderPosition.x, this.renderPosition.y + 0.975, this.renderPosition.z, this.material)
        for (const direction of this.cornerDirections!) {
            addPart(0.1, 0.95, 0.1,
                this.renderPosition.x + direction.x * 0.42, this.renderPosition.y + 0.975,
                this.renderPosition.z + direction.z * 0.42, this.material)
            for (const y of CampFence.railHeights) {
                addPart(direction.x === 0 ? 0.09 : 0.48, 0.1, direction.z === 0 ? 0.09 : 0.48,
                    this.renderPosition.x + direction.x * 0.22, this.renderPosition.y + y,
                    this.renderPosition.z + direction.z * 0.22, this.railMaterial)
            }
        }
    }

    isObjectInCollision(tgtX: number, tgtZ: number, size: number): boolean {
        const moverHalf = size / 2
        const toleranceX = !this.cornerDirections && this.orientation === 'X' ? 0 : this.getCollisionTolerance()
        const toleranceZ = !this.cornerDirections && this.orientation === 'Z' ? 0 : this.getCollisionTolerance()
        return tgtX - moverHalf < this.position.x + 0.5 - toleranceX
            && tgtX + moverHalf > this.position.x - 0.5 + toleranceX
            && tgtZ - moverHalf < this.position.z + 0.5 - toleranceZ
            && tgtZ + moverHalf > this.position.z - 0.5 + toleranceZ
    }
}
