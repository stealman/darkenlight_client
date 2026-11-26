import { Matrix, Vector2 } from '@babylonjs/core'
import type { Vector3 } from '@babylonjs/core'
import { MasonryBatch } from '@/babylon/world/masonryBatch'
import { createSineStaticVariation } from '@/babylon/world/statics/staticVariation'
import { OrientedWall } from '@/babylon/world/statics/objects/orientedWall'
import type { WallMetadata } from '@/babylon/world/statics/objects/orientedWall'

export interface StoneWallMetadata extends WallMetadata {
    precision?: number
}

export class StoneWall extends OrientedWall {
    readonly precision: number

    constructor(type: number, position: Vector3, metadata?: StoneWallMetadata) {
        super(type, position, Vector2.Zero(), MasonryBatch.prefab, metadata)
        const precision = metadata?.precision
        this.precision = typeof precision === 'number' && Number.isFinite(precision)
            ? Math.max(1, Math.min(10, Math.round(precision))) : 10
        this.status = {orientation: this.orientation, precision: this.precision}
    }

    render() {
        const origin = this.renderPosition
        const variation = createSineStaticVariation(this.position.x * 91.7 + this.position.z * 37.3 + 240, 17.1, 47.7)
        const roughness = (10 - this.precision) / 9
        let index = 0
        const stone = (length: number, height: number, thickness: number, x: number, y: number, z: number, alongX: boolean) => {
            const part = index++
            const sample = (channel: number) => roughness === 0 ? 0 : variation.signed(part, channel) * roughness
            const width = length * (1 + sample(1) * 0.07)
            const blockHeight = height * (1 + sample(2) * 0.19)
            const depth = thickness * (1 + sample(3) * 0.22)
            const yaw = (alongX ? 0 : Math.PI / 2) + sample(4) * 0.24
            const matrix = Matrix.Scaling(width, blockHeight, depth)
                .multiply(Matrix.RotationYawPitchRoll(yaw, sample(5) * 0.21, sample(6) * 0.24))
            const across = sample(7) * 0.075
            matrix.setTranslationFromFloats(origin.x + x + (alongX ? 0 : across),
                origin.y + y + 0.5 + sample(8) * 0.047, origin.z + z + (alongX ? across : 0))
            MasonryBatch.add(matrix, this.position, variation.unit(part), false, roughness)
        }
        const alongX = this.orientation === 'X'
        const alongWall = (length: number, height: number, depth: number, offset: number, y: number) =>
            stone(length, height, depth, alongX ? offset : 0, y, alongX ? 0 : offset, alongX)
        for (let course = 0; course < 4; course++) {
            const y = 0.16 + course * 0.32
            const thickness = 0.46 + variation.unit(course + 23) * 0.02
            if (this.cornerDirections) {
                const center = (course % 2 === 0 ? 0.52 : 0.46) + roughness * variation.signed(course, 9) * 0.09
                stone(center, 0.313, center, 0, y, 0, true)
                const armLength = 0.49 - center / 2
                const offset = center / 2 + armLength / 2
                for (const direction of this.cornerDirections) {
                    stone(armLength - 0.008, 0.313, thickness,
                        direction.x * offset, y, direction.z * offset, direction.x !== 0)
                }
                continue
            }
            const joint = (course % 2 === 0 ? -0.12 : 0.12) + variation.signed(course + 16) * (0.05 + roughness * 0.1)
            for (const [left, right] of [[-0.49, joint], [joint, 0.49]]) {
                alongWall(right - left - 0.008, 0.313, thickness, (left + right) / 2, y)
            }
        }
        if (this.cornerDirections) {
            stone(0.54, 0.12, 0.54, 0, 1.34, 0, true)
            for (const direction of this.cornerDirections) {
                stone(0.214, 0.12, 0.51, direction.x * 0.38, 1.34, direction.z * 0.38, direction.x !== 0)
            }
        } else if (this.precision <= 5) {
            const joint = variation.signed(0, 10) * 0.16
            for (const [left, right] of [[-0.49, joint], [joint, 0.49]]) {
                alongWall(right - left - 0.012, 0.12, 0.51, (left + right) / 2, 1.34)
            }
        } else {
            alongWall(0.984, 0.12, 0.51, 0, 1.34)
        }
    }
}
