import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { BLOCK_TOP_GLOW_U_OFFSET } from '@/babylon/materials'
import { OrientedWall } from '@/babylon/world/statics/objects/orientedWall'
import type { WallMetadata } from '@/babylon/world/statics/objects/orientedWall'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { createSineStaticVariation } from '@/babylon/world/statics/staticVariation'

export type CemeteryFacing = '-X' | '+X' | '-Z' | '+Z'

function createCemeteryVariation(position: Vector3, offset = 0) {
    return createSineStaticVariation(position.x * 91.7 + position.z * 37.3 + offset, 17.1)
}

export interface CemeteryObjectMetadata {
    facing?: CemeteryFacing
}

const CEMETERY_FRINGE_SNOW_CONTACT = {blendGroundLighting: false}

function addPart(width: number, height: number, depth: number, x: number, y: number, z: number, material: Vector2,
    anchor: Vector3, wear: number, yaw = 0, roll = 0, blendGroundLighting = true) {
    const matrix = Matrix.Scaling(width, height, depth)
        .multiply(Matrix.RotationYawPitchRoll(yaw, 0, roll))
        .multiply(Matrix.Translation(x, y, z))
    WorldRenderer.addWeatheredBlock(matrix, material, anchor, wear,
        blendGroundLighting ? undefined : CEMETERY_FRINGE_SNOW_CONTACT)
}

abstract class CemeteryObject extends BaseStaticObject {
    protected readonly wear: number = 1
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
            this.position,
            this.wear,
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
    private readonly yaw: number
    private readonly armX: number
    private readonly armZ: number

    constructor(type: number, position: Vector3, material: Vector2) {
        super(type, position, 0, material, null)
        this.yaw = createCemeteryVariation(position, 74.1).unit(0) * Math.PI * 2
        this.armX = Math.sin(this.yaw) * 0.18
        this.armZ = Math.cos(this.yaw) * 0.18
    }

    render() {
        addPart(
            0.18,
            0.12,
            1.28,
            this.renderPosition.x,
            this.renderPosition.y + 0.62,
            this.renderPosition.z,
            this.material,
            this.position,
            1.3,
            this.yaw,
        )
        addPart(
            0.72,
            0.12,
            0.18,
            this.renderPosition.x + this.armX,
            this.renderPosition.y + 0.62,
            this.renderPosition.z + this.armZ,
            this.material,
            this.position,
            1.3,
            this.yaw,
        )
    }
}

export class FallenCemeteryHeadstone extends BaseStaticObject {
    private readonly capMaterial: Vector2
    private readonly yaw: number
    private readonly roll: number
    private readonly cap: {x: number, z: number, yaw: number, roll: number}

    constructor(type: number, position: Vector3, material: Vector2, capMaterial: Vector2) {
        super(type, position, 0, material, null)
        this.capMaterial = capMaterial
        const variation = createCemeteryVariation(position)
        this.yaw = variation.unit(1) * Math.PI * 2
        this.roll = variation.signed(2) * 0.06
        const localX = variation.signed(3) * 0.12
        const localZ = 0.52 + variation.unit(4) * 0.14
        this.cap = {
            x: localX * Math.cos(this.yaw) + localZ * Math.sin(this.yaw),
            z: -localX * Math.sin(this.yaw) + localZ * Math.cos(this.yaw),
            yaw: this.yaw + variation.signed(5) * 0.45,
            roll: variation.signed(6) * 0.1,
        }
    }

    render() {
        addPart(
            0.62,
            0.12,
            0.82,
            this.renderPosition.x,
            this.renderPosition.y + 0.62,
            this.renderPosition.z,
            this.material,
            this.position,
            1.3,
            this.yaw,
            this.roll,
        )

        addPart(
            0.44,
            0.11,
            0.22,
            this.renderPosition.x + this.cap.x,
            this.renderPosition.y + 0.61,
            this.renderPosition.z + this.cap.z,
            this.capMaterial,
            this.position,
            1.3,
            this.cap.yaw,
            this.cap.roll,
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
    protected override readonly wear = 0.62

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
    hasEmberBowl = false
    private readonly litTopMaterial = new Vector2(this.material.x + BLOCK_TOP_GLOW_U_OFFSET, this.material.y)

    render() {
        this.part(0.92, 0.18, 0.92, 0, 0.09, 0, this.material)
        this.part(0.72, 0.78, 0.72, 0, 0.57, 0, this.accentMaterial)
        this.part(0.86, 0.16, 0.86, 0, 1.04, 0, this.hasEmberBowl ? this.litTopMaterial : this.material)
    }

    getPlacementSurfaceHeight(): number {
        return 1.12
    }
}

export class StoneFrameGrave extends CemeteryObject {
    private readonly cavityMaterial: Vector2

    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, cavityMaterial: Vector2, metadata?: CemeteryObjectMetadata) {
        super(type, position, material, accentMaterial, metadata)
        this.cavityMaterial = cavityMaterial
        this.wear = type === 330 ? 1.28 : 1
    }

    protected override readonly wear: number

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

export class CemeteryIronFence extends OrientedWall {
    private readonly accentMaterial: Vector2

    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, metadata?: WallMetadata) {
        super(type, position, material, null, metadata)
        this.accentMaterial = accentMaterial
    }

    private part(length: number, height: number, thickness: number, along: number, y: number, across: number, material = this.material, roll = 0) {
        const alongX = this.orientation === 'X'
        this.worldPart(
            length,
            height,
            thickness,
            alongX ? along : across,
            y,
            alongX ? across : along,
            material,
            roll,
            alongX ? 0 : Math.PI / 2,
        )
    }

    private worldPart(width: number, height: number, depth: number, x: number, y: number, z: number, material = this.material, roll = 0, yaw = 0) {
        addPart(
            width,
            height,
            depth,
            this.renderPosition.x + x,
            this.renderPosition.y + y + 0.5,
            this.renderPosition.z + z,
            material,
            this.position,
            0.82,
            yaw,
            roll,
            false,
        )
    }

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
