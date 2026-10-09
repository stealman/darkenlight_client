import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { WorldRenderer } from '@/babylon/world/worldRenderer'

export type CemeteryFacing = '-X' | '+X' | '-Z' | '+Z'
export type CemeteryWallOrientation = 'X' | 'Z'

export interface CemeteryObjectMetadata {
    facing?: CemeteryFacing
}

export interface CemeteryWallMetadata {
    orientation?: CemeteryWallOrientation
}

export interface CemeteryWallDirection {
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

abstract class CemeteryObject extends BaseStaticObject {
    protected readonly facing: CemeteryFacing
    protected readonly accentMaterial: Vector2

    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, metadata?: CemeteryObjectMetadata) {
        super(type, position, 0, material, null)
        this.facing = metadata?.facing === '-X' || metadata?.facing === '+X'
            || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : '+Z'
        this.accentMaterial = accentMaterial
        this.status = {facing: this.facing}
        this.renderPosition.set(
            position.x - 0.5 + this.getSizeX() / 2,
            position.y,
            position.z - 0.5 + this.getSizeZ() / 2,
        )
    }

    protected get yaw(): number {
        if (this.facing === '+X') return Math.PI / 2
        if (this.facing === '-Z') return Math.PI
        if (this.facing === '-X') return -Math.PI / 2
        return 0
    }

    protected part(width: number, height: number, depth: number, x: number, y: number, z: number, material = this.material, roll = 0, localYaw = 0) {
        const cos = Math.cos(this.yaw)
        const sin = Math.sin(this.yaw)
        addPart(
            width,
            height,
            depth,
            this.renderPosition.x + x * cos + z * sin,
            this.renderPosition.y + y + 0.5,
            this.renderPosition.z - x * sin + z * cos,
            material,
            this.yaw + localYaw,
            roll,
        )
    }
}

export class CemeteryHeadstone extends CemeteryObject {
    render() {
        this.renderHeadstone(Math.PI / 4)
    }

    protected renderHeadstone(capRoll: number) {
        this.part(0.82, 0.16, 0.48, 0, 0.08, 0)
        this.part(0.62, 0.82, 0.22, 0, 0.55, -0.02)
        this.part(0.46, 0.18, 0.24, 0, 1.03, -0.02, this.accentMaterial, capRoll)
        this.part(0.3, 0.05, 0.025, 0, 0.63, 0.105, this.accentMaterial)
    }
}

export class CemeteryHeadstone2 extends CemeteryHeadstone {
    render() {
        this.renderHeadstone(0)
    }
}

export class CemeteryHeadstone3 extends CemeteryObject {
    render() {
        this.part(0.78, 0.14, 0.46, 0, 0.07, 0)
        this.part(0.56, 0.56, 0.2, 0, 0.42, -0.02)
        this.part(0.62, 0.1, 0.22, 0, 0.74, -0.02, this.accentMaterial)
        this.part(0.1, 0.46, 0.1, 0, 1.01, -0.02, this.accentMaterial)
        this.part(0.38, 0.1, 0.1, 0, 1.06, -0.02, this.accentMaterial)
    }
}

export class CemeteryCross extends CemeteryObject {
    render() {
        this.part(0.72, 0.18, 0.58, 0, 0.09, 0)
        this.part(0.42, 0.28, 0.38, 0, 0.31, 0)
        this.part(0.2, 1.45, 0.2, 0, 1.1, 0)
        this.part(0.82, 0.2, 0.2, 0, 1.32, 0)
        this.part(0.28, 0.12, 0.28, 0, 1.88, 0, this.accentMaterial, Math.PI / 4)
    }
}

export class CemeteryCrossPedestal extends CemeteryObject {
    render() {
        this.part(0.72, 0.18, 0.58, 0, 0.09, 0)
        this.part(0.42, 0.28, 0.38, 0, 0.31, 0)
    }
}

export class FallenCemeteryCross extends BaseStaticObject {
    constructor(type: number, position: Vector3, material: Vector2) {
        super(type, position, 0, material, null)
    }

    render() {
        const random = Math.sin((this.position.x * 91.7) + (this.position.z * 37.3) + 74.1) * 43758.5453
        const yaw = (random - Math.floor(random)) * Math.PI * 2
        addPart(
            0.18,
            0.12,
            1.28,
            this.renderPosition.x,
            this.renderPosition.y + 0.62,
            this.renderPosition.z,
            this.material,
            yaw,
        )
        addPart(
            0.72,
            0.12,
            0.18,
            this.renderPosition.x + Math.sin(yaw) * 0.18,
            this.renderPosition.y + 0.62,
            this.renderPosition.z + Math.cos(yaw) * 0.18,
            this.material,
            yaw,
        )
    }
}

export class FallenCemeteryHeadstone extends BaseStaticObject {
    private readonly capMaterial: Vector2

    constructor(type: number, position: Vector3, material: Vector2, capMaterial: Vector2) {
        super(type, position, 0, material, null)
        this.capMaterial = capMaterial
    }

    private random(salt: number): number {
        const value = Math.sin((this.position.x * 91.7) + (this.position.z * 37.3) + salt * 17.1) * 43758.5453
        return value - Math.floor(value)
    }

    render() {
        const yaw = this.random(1) * Math.PI * 2
        addPart(
            0.62,
            0.12,
            0.82,
            this.renderPosition.x,
            this.renderPosition.y + 0.62,
            this.renderPosition.z,
            this.material,
            yaw,
            (this.random(2) - 0.5) * 0.12,
        )

        const localX = (this.random(3) - 0.5) * 0.24
        const localZ = 0.52 + this.random(4) * 0.14
        const capX = this.renderPosition.x + localX * Math.cos(yaw) + localZ * Math.sin(yaw)
        const capZ = this.renderPosition.z - localX * Math.sin(yaw) + localZ * Math.cos(yaw)
        addPart(
            0.44,
            0.11,
            0.22,
            capX,
            this.renderPosition.y + 0.61,
            capZ,
            this.capMaterial,
            yaw + (this.random(5) - 0.5) * 0.9,
            (this.random(6) - 0.5) * 0.2,
        )
    }
}

export class StoneTomb extends CemeteryObject {
    render() {
        this.part(0.92, 0.18, 1.82, 0, 0.09, 0)
        this.part(0.78, 0.42, 1.58, 0, 0.39, 0, this.accentMaterial)
        this.part(0.88, 0.14, 1.68, 0, 0.67, 0)
        this.part(0.24, 0.05, 0.6, 0, 0.77, 0, this.accentMaterial)
        this.part(0.56, 0.05, 0.2, 0, 0.77, 0, this.accentMaterial)
    }
}

export class CemeteryObelisk extends CemeteryObject {
    render() {
        this.part(0.86, 0.2, 0.86, 0, 0.1, 0)
        this.part(0.65, 0.28, 0.65, 0, 0.34, 0, this.accentMaterial)
        this.part(0.38, 1.35, 0.38, 0, 1.15, 0)
        this.part(0.42, 0.42, 0.42, 0, 2.02, 0, this.material, Math.PI / 4)
    }
}

export class StoneGargoyle extends CemeteryObject {
    render() {
        this.renderGargoyle()
    }

    protected renderGargoyle(yOffset = 0) {
        this.part(0.72, 0.18, 0.72, 0, yOffset + 0.09, 0, this.accentMaterial)
        this.part(0.48, 0.5, 0.42, 0, yOffset + 0.43, 0.05)
        this.part(0.38, 0.34, 0.34, 0, yOffset + 0.79, 0.14)
        this.part(0.28, 0.17, 0.27, 0, yOffset + 0.81, 0.36, this.accentMaterial)
        this.part(0.34, 0.48, 0.12, -0.32, yOffset + 0.62, 0, this.material, -0.42)
        this.part(0.34, 0.48, 0.12, 0.32, yOffset + 0.62, 0, this.material, 0.42)
        for (const x of [-0.17, 0.17]) {
            this.part(0.11, 0.35, 0.14, x, yOffset + 0.23, 0.22, this.accentMaterial, x < 0 ? -0.25 : 0.25)
            this.part(0.07, 0.12, 0.07, x, yOffset + 1.05, 0.12, this.accentMaterial, x < 0 ? -0.35 : 0.35)
        }
    }
}

export class GargoyleOnPedestal extends StoneGargoyle {
    render() {
        this.part(0.92, 0.18, 0.92, 0, 0.09, 0, this.material)
        this.part(0.72, 0.78, 0.72, 0, 0.57, 0, this.accentMaterial)
        this.part(0.86, 0.16, 0.86, 0, 1.04, 0, this.material)
        this.renderGargoyle(1.12)
    }
}

export class CemeteryPedestal extends CemeteryObject {
    render() {
        this.part(0.92, 0.18, 0.92, 0, 0.09, 0, this.material)
        this.part(0.72, 0.78, 0.72, 0, 0.57, 0, this.accentMaterial)
        this.part(0.86, 0.16, 0.86, 0, 1.04, 0, this.material)
    }
}

export class StoneFrameGrave extends CemeteryObject {
    private readonly cavityMaterial: Vector2

    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, cavityMaterial: Vector2, metadata?: CemeteryObjectMetadata) {
        super(type, position, material, accentMaterial, metadata)
        this.cavityMaterial = cavityMaterial
    }

    render() {
        const displaced = this.type === 330
        this.part(0.68, 0.05, 1.42, 0, 0.035, 0, this.cavityMaterial)
        for (const x of [-0.41, 0.41]) {
            this.part(0.09, 0.18, 1.72, x, 0.09, 0, this.accentMaterial)
        }
        for (const z of [-0.79, 0.79]) {
            this.part(0.91, 0.18, 0.09, 0, 0.09, z, this.accentMaterial)
        }
        this.part(
            0.76,
            0.12,
            1.55,
            displaced ? 0.1 : 0,
            0.25,
            0,
            this.material,
            0,
            displaced ? 0.13 : 0,
        )
    }

    getWalkableHeight(): number {
        return 0.3
    }
}

abstract class CemeteryWall extends BaseStaticObject {
    protected readonly orientation: CemeteryWallOrientation
    protected readonly accentMaterial: Vector2
    protected cornerDirections: [CemeteryWallDirection, CemeteryWallDirection] | null = null

    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, metadata?: CemeteryWallMetadata) {
        super(type, position, 0, material, null)
        this.orientation = metadata?.orientation === 'X' ? 'X' : 'Z'
        this.accentMaterial = accentMaterial
        this.status = {orientation: this.orientation}
    }

    getOrientation(): CemeteryWallOrientation {
        return this.orientation
    }

    setCornerDirections(directions: [CemeteryWallDirection, CemeteryWallDirection] | null) {
        this.cornerDirections = directions
    }

    protected part(length: number, height: number, thickness: number, along: number, y: number, across: number, material = this.material, roll = 0) {
        const alongX = this.orientation === 'X'
        addPart(
            length,
            height,
            thickness,
            this.renderPosition.x + (alongX ? along : across),
            this.renderPosition.y + y + 0.5,
            this.renderPosition.z + (alongX ? across : along),
            material,
            alongX ? 0 : Math.PI / 2,
            roll,
        )
    }

    protected worldPart(width: number, height: number, depth: number, x: number, y: number, z: number, material = this.material, roll = 0, yaw = 0) {
        addPart(
            width,
            height,
            depth,
            this.renderPosition.x + x,
            this.renderPosition.y + y + 0.5,
            this.renderPosition.z + z,
            material,
            yaw,
            roll,
        )
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

export class CemeteryIronFence extends CemeteryWall {
    render() {
        if (this.cornerDirections) {
            this.renderCorner()
            return
        }
        this.part(0.98, 0.44, 0.42, 0, 0.22, 0, this.material)
        for (const along of [-0.42, 0.42]) {
            this.part(0.14, 1.78, 0.14, along, 1.06, 0, this.material)
            this.part(0.22, 0.18, 0.22, along, 2.04, 0, this.material, Math.PI / 4)
        }
        for (const along of [-0.28, 0, 0.28]) {
            this.part(0.055, 1.52, 0.055, along, 1.17, 0, this.accentMaterial)
            this.part(0.11, 0.16, 0.11, along, 2.02, 0, this.accentMaterial, Math.PI / 4)
        }
        for (const y of [0.73, 1.5]) this.part(0.82, 0.07, 0.08, 0, y, 0, this.accentMaterial)
    }

    private renderCorner() {
        this.worldPart(0.42, 0.44, 0.42, 0, 0.22, 0)
        this.worldPart(0.16, 1.78, 0.16, 0, 1.06, 0)
        this.worldPart(0.23, 0.18, 0.23, 0, 2.04, 0, this.material, Math.PI / 4)

        for (const direction of this.cornerDirections!) {
            const alongX = direction.x !== 0
            this.worldPart(
                alongX ? 0.58 : 0.42,
                0.44,
                alongX ? 0.42 : 0.58,
                direction.x * 0.29,
                0.22,
                direction.z * 0.29,
            )
            this.worldPart(0.14, 1.78, 0.14, direction.x * 0.46, 1.06, direction.z * 0.46)
            this.worldPart(0.22, 0.18, 0.22, direction.x * 0.46, 2.04, direction.z * 0.46, this.material, Math.PI / 4)

            for (const distance of [0.16, 0.31]) {
                this.worldPart(0.055, 1.52, 0.055, direction.x * distance, 1.17, direction.z * distance, this.accentMaterial)
                this.worldPart(0.11, 0.16, 0.11, direction.x * distance, 2.02, direction.z * distance, this.accentMaterial, Math.PI / 4)
            }
            for (const y of [0.73, 1.5]) {
                this.worldPart(
                    alongX ? 0.46 : 0.08,
                    0.07,
                    alongX ? 0.08 : 0.46,
                    direction.x * 0.23,
                    y,
                    direction.z * 0.23,
                    this.accentMaterial,
                )
            }
        }
    }
}

export class CemeteryStoneWall extends CemeteryWall {
    render() {
        if (this.cornerDirections) {
            this.renderCorner()
            return
        }
        for (const y of [0.35, 1.05]) {
            this.part(0.98, 0.7, 0.48, 0, y, 0)
        }
    }

    private renderCorner() {
        for (const y of [0.35, 1.05]) {
            this.worldPart(0.52, 0.7, 0.52, 0, y, 0)
            for (const direction of this.cornerDirections!) {
                const alongX = direction.x !== 0
                this.worldPart(
                    alongX ? 0.58 : 0.48,
                    0.7,
                    alongX ? 0.48 : 0.58,
                    direction.x * 0.29,
                    y,
                    direction.z * 0.29,
                )
            }
        }
    }
}

export class RuinedCemeteryWall extends CemeteryWall {
    private random(salt: number): number {
        const value = Math.sin((this.position.x * 91.7) + (this.position.z * 37.3) + salt * 17.1) * 43758.5453
        return value - Math.floor(value)
    }

    render() {
        if (this.cornerDirections) {
            this.renderCorner()
            return
        }
        this.part(0.98, 0.65, 0.48, 0, 0.325, 0)
        for (const [index, along] of [-0.33, 0, 0.33].entries()) {
            const height = 0.34 + this.random(index) * 0.48
            const lean = (this.random(index + 4) - 0.5) * 0.16
            this.part(0.3, height, 0.44, along, 0.65 + height / 2, 0, index === 1 ? this.accentMaterial : this.material, lean)
        }
        this.renderFallenStones(false)
    }

    private renderCorner() {
        this.worldPart(0.52, 0.72, 0.52, 0, 0.36, 0)
        for (const [armIndex, direction] of this.cornerDirections!.entries()) {
            const alongX = direction.x !== 0
            this.worldPart(
                alongX ? 0.58 : 0.48,
                0.65,
                alongX ? 0.48 : 0.58,
                direction.x * 0.29,
                0.325,
                direction.z * 0.29,
            )
            for (const [pieceIndex, distance] of [0.16, 0.4].entries()) {
                const randomIndex = 20 + armIndex * 4 + pieceIndex
                const height = 0.3 + this.random(randomIndex) * 0.42
                this.worldPart(
                    alongX ? 0.26 : 0.42,
                    height,
                    alongX ? 0.42 : 0.26,
                    direction.x * distance,
                    0.65 + height / 2,
                    direction.z * distance,
                    pieceIndex === 0 ? this.accentMaterial : this.material,
                    (this.random(randomIndex + 8) - 0.5) * 0.12,
                )
            }
        }
        this.renderFallenStones(true)
    }

    private renderFallenStones(corner: boolean) {
        const salt = corner ? 60 : 40
        const count = 1 + Math.floor(this.random(salt) * 3)
        for (let i = 0; i < count; i++) {
            const randomSalt = salt + 1 + i * 9
            const width = 0.16 + this.random(randomSalt) * 0.25
            const height = 0.11 + this.random(randomSalt + 1) * 0.16
            const depth = 0.15 + this.random(randomSalt + 2) * 0.24
            let x: number
            let z: number

            if (corner) {
                const angle = this.random(randomSalt + 3) * Math.PI * 2
                const distance = 0.28 + this.random(randomSalt + 4) * 0.25
                x = Math.cos(angle) * distance
                z = Math.sin(angle) * distance
            } else {
                const along = (this.random(randomSalt + 3) - 0.5) * 0.88
                const across = (this.random(randomSalt + 4) > 0.5 ? -1 : 1)
                    * (0.3 + this.random(randomSalt + 5) * 0.2)
                x = this.orientation === 'X' ? along : across
                z = this.orientation === 'X' ? across : along
            }

            const roll = (this.random(randomSalt + 6) - 0.5) * 0.5
            const yaw = this.random(randomSalt + 7) * Math.PI
            this.worldPart(width, height, depth, x, height / 2, z, this.material, roll, yaw)
        }
    }
}
