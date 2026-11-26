import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { ArchedMasonryBatch, MasonryBatch } from '@/babylon/world/masonryBatch'
import { addMasonryPedestal } from '@/babylon/world/statics/masonryPedestal'
import { OrientedWall } from '@/babylon/world/statics/objects/orientedWall'
import type { WallMetadata } from '@/babylon/world/statics/objects/orientedWall'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { createStaticVariation, placeStaticPart } from '@/babylon/world/statics/staticVariation'
import { MyPlayer } from '@/data/myPlayer'

export type CemeteryFacing = '-X' | '+X' | '-Z' | '+Z'

function layStoneOnGround(frame: Matrix, stone: Matrix, x: number, z: number) {
    const {m} = stone.multiply(frame)
    const halfHeight = (Math.abs(m[1]) + Math.abs(m[5]) + Math.abs(m[9])) / 2
    frame.setTranslationFromFloats(x - m[12], 0.49 + halfHeight - m[13], z - m[14])
}

export interface CemeteryObjectMetadata {
    facing?: CemeteryFacing
}

export interface StoneFrameGraveMetadata extends CemeteryObjectMetadata {
    displaced?: boolean
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

    protected part(width: number, height: number, depth: number, x: number, y: number, z: number, material = this.material, roll = 0) {
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
            this.yaw,
            roll,
        )
    }
}

abstract class MasonryCemeteryObject extends CemeteryObject {
    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, metadata?: CemeteryObjectMetadata) {
        super(type, position, material, accentMaterial, metadata)
        this.prefab = MasonryBatch.prefab
    }
}

export class CemeteryHeadstone extends MasonryCemeteryObject {
    private readonly fallen: boolean
    private readonly arched: boolean
    private readonly baseSize: readonly [number, number, number]
    private readonly heading: number
    private readonly slab: Matrix
    private readonly seed: number
    private readonly roughness: number
    private readonly inscription?: Matrix
    private readonly cross: Matrix[] = []
    private archedIndex = -1
    private archedBaseY = 0

    constructor(type: number, position: Vector3, accentMaterial: Vector2, metadata?: CemeteryObjectMetadata) {
        super(type, position, Vector2.Zero(), accentMaterial, metadata)
        const variation = createStaticVariation(MyPlayer.worldId, position, type)
        this.fallen = type === 336
        const low = variation.unit(18) < 0.33
        this.baseSize = low ? [0.78, 0.14, 0.46] : [0.82, 0.16, 0.48]
        this.arched = variation.unit(0) < 0.5
        this.seed = variation.unit(16)
        this.roughness = 0.18 + variation.unit(17) * 0.16
        this.heading = this.fallen ? variation.unit(1) * Math.PI * 2 : this.yaw + variation.signed(1) * 0.19
        const pitch = (this.fallen ? -Math.PI / 2 : 0) + variation.signed(2) * 0.055
        const frame = Matrix.RotationYawPitchRoll(this.heading, pitch, variation.signed(3) * 0.075)
        const x = variation.signed(4) * 0.026, z = -0.02 + variation.signed(5) * 0.025
        const width = (low ? 0.56 : 0.62) + variation.signed(6) * 0.065
        const height = (low ? 0.64 : 0.93) + variation.signed(7) * 0.105
        const depth = 0.2 + variation.signed(8) * 0.035
        const slabShape = Matrix.FromValues(
            width, variation.signed(9) * 0.047, 0, 0,
            variation.signed(10) * 0.068, height, 0, 0,
            0, 0, depth, 0,
            0, height / 2 - 0.05, 0, 1,
        )
        if (this.fallen) layStoneOnGround(frame, slabShape, x, z)
        else frame.setTranslationFromFloats(x, 0.5 + this.baseSize[1], z)
        this.slab = slabShape.multiply(frame)

        const decorate = (part: Matrix, x: number, y: number, z: number) => {
            const point = Vector3.TransformCoordinates(new Vector3(x, y, z), slabShape)
            return part.setTranslationFromFloats(point.x, point.y, point.z).multiply(frame)
        }
        if (!low || variation.unit(11) < 0.45) {
            this.inscription = decorate(Matrix.Scaling(width * (0.43 + variation.unit(12) * 0.12), 0.035, 0.028)
                .multiply(Matrix.RotationZ(variation.signed(13) * 0.05)), 0, 0.1, 0.49)
        }
        if (variation.unit(14) < (low ? 0.62 : 0.18)) {
            const crossHeight = 0.32 + variation.unit(15) * 0.12
            const crossWidth = crossHeight * 0.8
            const crossBase = 0.5 - 0.025 / height
            this.cross.push(
                decorate(Matrix.Scaling(0.08, crossHeight, 0.09), 0, crossBase + crossHeight / (2 * height), 0),
                decorate(Matrix.Scaling(crossWidth, 0.072, 0.09), 0, crossBase + crossHeight * 0.64 / height, 0),
            )
        }
    }

    render() {
        if (!this.fallen) addMasonryPedestal(this, this.baseSize, this.heading)
        const slab = placeStaticPart(this.slab, this.renderPosition)
        const batch = this.arched ? ArchedMasonryBatch : MasonryBatch
        const index = batch.add(slab, this.position, this.seed, false, this.roughness, true, false, 'headstone')
        if (this.arched) {
            this.archedIndex = index
            this.archedBaseY = slab.m[13]
        }
        for (const part of this.cross) {
            MasonryBatch.add(placeStaticPart(part, this.renderPosition), this.position, this.seed, false, this.roughness, true, false, 'headstone')
        }
        if (this.inscription) {
            WorldRenderer.addWeatheredBlock(placeStaticPart(this.inscription, this.renderPosition), this.accentMaterial, this.position, this.wear)
        }
    }

    clearRenderMatrixCapture() {
        super.clearRenderMatrixCapture()
        this.archedIndex = -1
    }

    applyDeleteBounceOffset(offset: number) {
        const meshes = super.applyDeleteBounceOffset(offset)
        const batch = ArchedMasonryBatch.prefab
        if (this.archedIndex >= 0 && batch?.matrixBuffer.length) {
            batch.matrixBuffer[this.archedIndex * 16 + 13] = this.archedBaseY + offset
            meshes.push(batch.mesh)
        }
        return meshes
    }
}

const CROSS_BASE = [0.72, 0.18, 0.58] as const
const CROSS_UPPER_BASE = [0.42, 0.27, 0.38] as const
const CEMETERY_CROSS_TYPE = 322

export class CemeteryCross extends MasonryCemeteryObject {
    private readonly fallen: boolean
    private readonly heading: number
    private readonly scale: number
    private readonly stones: {matrix: Matrix, seed: number, roughness: number}[] = []

    constructor(type: number, position: Vector3, metadata?: CemeteryObjectMetadata) {
        super(type, position, Vector2.Zero(), Vector2.Zero(), metadata)
        const variation = createStaticVariation(MyPlayer.worldId, position, CEMETERY_CROSS_TYPE)
        this.fallen = type === 335
        this.scale = 0.75 + variation.unit(0, 14) * 0.35
        this.heading = this.fallen ? variation.unit(0) * Math.PI * 2 : this.yaw + variation.signed(0) * 0.18
        const pitch = (this.fallen ? -Math.PI / 2 : 0) + variation.signed(0, 1) * 0.045
        const frame = Matrix.Scaling(this.scale, this.scale, this.scale)
            .multiply(Matrix.RotationYawPitchRoll(this.heading, pitch, variation.signed(0, 2) * 0.065))
        const x = variation.signed(0, 3) * 0.027, z = variation.signed(0, 4) * 0.027
        const height = 1.45 + variation.signed(1, 5) * 0.10
        const width = 0.20 + variation.signed(1, 6) * 0.022
        const depth = 0.20 + variation.signed(1, 7) * 0.025
        const shaft = Matrix.Scaling(width, height, depth).setTranslationFromFloats(0, height / 2 - 0.05, 0)
        if (this.fallen) layStoneOnGround(frame, shaft, x, z)
        else frame.setTranslationFromFloats(x, 0.5 + (CROSS_BASE[1] + CROSS_UPPER_BASE[1]) * this.scale, z)

        const armWidth = 0.82 + variation.signed(2, 5) * 0.09
        const arm = Matrix.Scaling(armWidth, width * (0.86 + variation.unit(2, 6) * 0.24), depth * 0.92)
            .multiply(Matrix.RotationYawPitchRoll(variation.signed(2, 7) * 0.055, variation.signed(2, 8) * 0.045,
                variation.signed(2, 9) * 0.08))
            .setTranslationFromFloats(variation.signed(2, 10) * 0.035, height * 0.63 + variation.signed(2, 11) * 0.04, 0)
        for (const [part, matrix] of [shaft, arm].entries()) {
            this.stones.push({matrix: matrix.multiply(frame), seed: variation.unit(part, 12),
                roughness: 0.18 + variation.unit(part, 13) * 0.20})
        }
    }

    render() {
        if (!this.fallen) {
            const scale = this.scale
            addMasonryPedestal(this,
                [CROSS_BASE[0] * scale, CROSS_BASE[1] * scale, CROSS_BASE[2] * scale], this.heading,
                [CROSS_UPPER_BASE[0] * scale, CROSS_UPPER_BASE[1] * scale, CROSS_UPPER_BASE[2] * scale])
        }
        for (const {matrix, seed, roughness} of this.stones) {
            MasonryBatch.add(placeStaticPart(matrix, this.renderPosition), this.position, seed, false, roughness, true, false, 'headstone')
        }
    }
}

export class CemeteryCrossPedestal extends MasonryCemeteryObject {
    constructor(type: number, position: Vector3, metadata?: CemeteryObjectMetadata) {
        super(type, position, Vector2.Zero(), Vector2.Zero(), metadata)
    }

    render() {
        addMasonryPedestal(this, CROSS_BASE, this.yaw, CROSS_UPPER_BASE)
    }
}

export class StoneTomb extends MasonryCemeteryObject {
    private readonly stones: {matrix: Matrix, seed: number, roughness: number, appearance: 'graveFrame' | 'graveCover' | 'polished'}[] = []

    constructor(type: number, position: Vector3, metadata?: CemeteryObjectMetadata) {
        super(type, position, Vector2.Zero(), Vector2.Zero(), metadata)
        const variation = createStaticVariation(MyPlayer.worldId, position, type)
        const frame = Matrix.RotationY(this.yaw)
        const addStone = (width: number, height: number, depth: number, x: number, y: number,
            seed: number, roughness: number, appearance: 'graveFrame' | 'graveCover' | 'polished') => {
            const matrix = Matrix.Scaling(width, height, depth).setTranslationFromFloats(x, y + 0.5, 0).multiply(frame)
            this.stones.push({matrix, seed, roughness, appearance})
        }
        addStone(0.78, 0.42, 1.58, 0, 0.39, variation.unit(0), 0.21, 'graveFrame')
        addStone(0.88, 0.14, 1.68, 0, 0.67, variation.unit(1), 0.15, 'graveCover')
        const crossSeed = variation.unit(2)
        const stemWidth = 0.24, crossWidth = 0.56
        const armWidth = (crossWidth - stemWidth) / 2
        const armOffset = (stemWidth + armWidth) / 2
        addStone(stemWidth, 0.05, 0.60, 0, 0.76, crossSeed, 0, 'polished')
        for (const side of [-1, 1]) {
            addStone(armWidth, 0.05, 0.20, side * armOffset, 0.76, crossSeed, 0, 'polished')
        }
    }

    render() {
        addMasonryPedestal(this, [0.92, 0.18, 1.82], this.yaw)
        for (const {matrix, seed, roughness, appearance} of this.stones) {
            MasonryBatch.add(placeStaticPart(matrix, this.renderPosition), this.position, seed, false, roughness, true, false, appearance)
        }
    }
}

export class CemeteryObelisk extends MasonryCemeteryObject {
    protected override readonly wear = 0.62

    render() {
        addMasonryPedestal(this, [0.86, 0.2, 0.86], this.yaw, [0.65, 0.28, 0.65])
        this.part(0.38, 1.35, 0.38, 0, 1.15, 0)
        this.part(0.42, 0.42, 0.42, 0, 2.02, 0, this.material, Math.PI / 4)
    }
}

const TALL_PEDESTAL_BASE = [0.92, 0.18, 0.92] as const
const TALL_PEDESTAL_HEIGHT = 1.12
const TALL_PEDESTAL_UPPER = [0.86, TALL_PEDESTAL_HEIGHT - TALL_PEDESTAL_BASE[1], 0.86] as const

export class CemeteryPedestal extends MasonryCemeteryObject {
    hasEmberBowl = false

    constructor(type: number, position: Vector3, metadata?: CemeteryObjectMetadata) {
        super(type, position, Vector2.Zero(), Vector2.Zero(), metadata)
    }

    render() {
        addMasonryPedestal(this, TALL_PEDESTAL_BASE, this.yaw, TALL_PEDESTAL_UPPER, this.hasEmberBowl)
    }

    getPlacementSurfaceHeight(): number {
        return TALL_PEDESTAL_HEIGHT
    }
}

export class StoneFrameGrave extends MasonryCemeteryObject {
    private readonly stones: {matrix: Matrix, seed: number, roughness: number}[] = []

    constructor(type: number, position: Vector3, cavityMaterial: Vector2, metadata?: StoneFrameGraveMetadata) {
        super(type, position, cavityMaterial, Vector2.Zero(), metadata)
        const displaced = metadata?.displaced === true
        this.status = {facing: this.facing, displaced}
        const variation = createStaticVariation(MyPlayer.worldId, position, type)
        const frame = Matrix.RotationY(this.yaw)
        const addStone = (width: number, height: number, depth: number, x: number, y: number, z: number,
            yaw: number, tilt: number) => {
            const part = this.stones.length
            const matrix = Matrix.Scaling(width, height, depth)
                .multiply(Matrix.RotationYawPitchRoll(yaw, variation.signed(part, 1) * tilt, variation.signed(part, 2) * tilt))
                .setTranslationFromFloats(x, 0.5 + y, z)
                .multiply(frame)
            this.stones.push({matrix, seed: variation.unit(part), roughness: 0.24 + variation.unit(part, 3) * 0.24})
        }
        for (const side of [-1, 1]) {
            const joints = [-0.74, -0.25 + variation.signed(side, 4) * 0.09, 0.25 + variation.signed(side, 5) * 0.09, 0.74]
            for (let i = 1; i < joints.length; i++) {
                const part = this.stones.length
                const height = 0.17 + variation.signed(part, 6) * 0.026
                addStone(0.13 + variation.signed(part, 7) * 0.017, height, joints[i] - joints[i - 1] - 0.009,
                    side * (0.384 + variation.signed(part, 8) * 0.013), height / 2, (joints[i] + joints[i - 1]) / 2,
                    variation.signed(part, 9) * 0.055, 0.042)
            }
        }
        for (const side of [-1, 1]) {
            const joint = variation.signed(side, 10) * 0.11
            for (const [start, end] of [[-0.45, joint], [joint, 0.45]]) {
                const part = this.stones.length
                const height = 0.17 + variation.signed(part, 6) * 0.026
                addStone(end - start - 0.009, height, 0.135 + variation.signed(part, 7) * 0.016,
                    (start + end) / 2, height / 2, side * (0.793 + variation.signed(part, 8) * 0.012),
                    variation.signed(part, 9) * 0.07, 0.045)
            }
        }
        const shiftSide = variation.signed(0, 11) < 0 ? -1 : 1
        const slabHeight = 0.12 + variation.signed(0, 12) * 0.024
        addStone(0.73 + variation.signed(0, 13) * 0.045, slabHeight, 1.49 + variation.signed(0, 14) * 0.065,
            displaced ? shiftSide * (0.15 + variation.unit(0, 15) * 0.07) : variation.signed(0, 15) * 0.025,
            0.31 - slabHeight / 2, variation.signed(0, 16) * (displaced ? 0.10 : 0.035),
            displaced ? shiftSide * (0.11 + variation.unit(0, 17) * 0.08) : variation.signed(0, 17) * 0.045,
            displaced ? 0.052 : 0.018)
    }

    render() {
        this.part(0.68, 0.05, 1.42, 0, 0.035, 0)
        for (const [index, {matrix, seed, roughness}] of this.stones.entries()) {
            const cover = index === this.stones.length - 1
            MasonryBatch.add(placeStaticPart(matrix, this.renderPosition), this.position, seed, false, roughness,
                true, false, cover ? 'graveCover' : 'graveFrame')
        }
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
