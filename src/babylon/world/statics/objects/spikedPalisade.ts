import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { getPalisadeRandom } from '@/babylon/world/statics/palisadeRandom'

export type SpikedPalisadeFacing = '-X' | '+X' | '-Z' | '+Z'

export interface SpikedPalisadeMetadata {
    facing?: SpikedPalisadeFacing
    orientation?: 'X' | 'Z'
}

export class SpikedPalisade extends BaseStaticObject {
    private readonly facing: SpikedPalisadeFacing

    private static readonly MAIN_STAKE_COUNT = 5
    private static readonly MAIN_STAKE_SPACING = 0.2
    private static readonly MAIN_STAKE_LENGTH = 1.55
    private static readonly MAIN_STAKE_SIZE = 0.1
    private static readonly SUPPORT_COUNT = 3
    private static readonly SUPPORT_SPACING = 0.32
    private static readonly SUPPORT_LENGTH = 0.9
    private static readonly SUPPORT_SIZE = 0.075
    private static readonly BASE_ANGLE = Math.PI / 4
    private static readonly MAX_ANGLE_VARIATION = Math.PI / 60
    private static readonly CONNECTOR_LENGTH = 0.95
    private static readonly CONNECTOR_HEIGHT = 0.09
    private static readonly CONNECTOR_DEPTH = 0.09
    private static readonly CONNECTOR_HEIGHT_POSITION = 0.66
    private static readonly CONNECTOR_FORWARD_OFFSET = 0.13

    constructor(type: number, position: Vector3, material: Vector2, metadata?: SpikedPalisadeMetadata) {
        super(type, position, 0, material, null)
        this.facing = metadata?.facing === '-X' || metadata?.facing === '+X'
            || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : metadata?.orientation === 'X' ? '+Z' : '+X'
        this.status = {facing: this.facing}
    }

    render() {
        this.renderMainStakes()
        this.renderConnector()
        this.renderSupports()
    }

    private renderMainStakes() {
        const axis = this.getAxis()
        for (let i = 0; i < SpikedPalisade.MAIN_STAKE_COUNT; i++) {
            const axisOffset = (i - 2) * SpikedPalisade.MAIN_STAKE_SPACING
                + (this.random(i, 1) * 2 - 1) * 0.012
            const length = SpikedPalisade.MAIN_STAKE_LENGTH - this.random(i, 2) * 0.12
            const width = SpikedPalisade.MAIN_STAKE_SIZE + (this.random(i, 3) * 2 - 1) * 0.008
            const depth = SpikedPalisade.MAIN_STAKE_SIZE + (this.random(i, 4) * 2 - 1) * 0.008
            const angle = this.getTiltSign() * (SpikedPalisade.BASE_ANGLE
                + (this.random(i, 5) * 2 - 1) * SpikedPalisade.MAX_ANGLE_VARIATION
            )
            this.addTiltedStake(axisOffset, length, width, depth, angle)
        }
    }

    private renderSupports() {
        const axis = this.getAxis()
        for (let i = 0; i < SpikedPalisade.SUPPORT_COUNT; i++) {
            const axisOffset = (i - 1) * SpikedPalisade.SUPPORT_SPACING
                + (this.random(i, 20) * 2 - 1) * 0.012
            const length = SpikedPalisade.SUPPORT_LENGTH - this.random(i, 21) * 0.08
            const angle = -this.getTiltSign() * (SpikedPalisade.BASE_ANGLE
                + (this.random(i, 22) * 2 - 1) * SpikedPalisade.MAX_ANGLE_VARIATION
            )
            this.addTiltedStake(
                axisOffset,
                length,
                SpikedPalisade.SUPPORT_SIZE,
                SpikedPalisade.SUPPORT_SIZE,
                angle,
            )
        }
    }

    private addTiltedStake(axisOffset: number, length: number, width: number, depth: number, angle: number) {
        const axis = this.getAxis()
        const x = this.renderPosition.x + axis.x * axisOffset
        const z = this.renderPosition.z + axis.z * axisOffset
        const verticalHeight = Math.cos(angle) * length
        WorldRenderer.block1!.matrices.push(
            Matrix.Scaling(width, length, depth)
                .multiply(Matrix.RotationAxis(axis, angle))
                .multiply(Matrix.Translation(x, this.renderPosition.y + verticalHeight / 2 + 0.5, z)),
        )
        WorldRenderer.block1!.uvData.push(this.material)
    }

    private renderConnector() {
        const normal = this.getForwardNormal()
        const angle = (this.random(0, 40) * 2 - 1) * Math.PI / 90
        const yaw = this.facing === '-X' || this.facing === '+X' ? Math.PI / 2 : 0
        WorldRenderer.block1!.matrices.push(
            Matrix.Scaling(
                SpikedPalisade.CONNECTOR_LENGTH,
                SpikedPalisade.CONNECTOR_HEIGHT,
                SpikedPalisade.CONNECTOR_DEPTH,
            )
                .multiply(Matrix.RotationYawPitchRoll(yaw, 0, angle))
                .multiply(Matrix.Translation(
                    this.renderPosition.x + normal.x * SpikedPalisade.CONNECTOR_FORWARD_OFFSET,
                    this.renderPosition.y + SpikedPalisade.CONNECTOR_HEIGHT_POSITION + 0.5,
                    this.renderPosition.z + normal.z * SpikedPalisade.CONNECTOR_FORWARD_OFFSET,
                )),
        )
        WorldRenderer.block1!.uvData.push(this.material)
    }

    private getAxis(): Vector3 {
        return this.facing === '-Z' || this.facing === '+Z'
            ? new Vector3(1, 0, 0)
            : new Vector3(0, 0, 1)
    }

    private getForwardNormal(): Vector3 {
        switch (this.facing) {
            case '-X': return new Vector3(-1, 0, 0)
            case '+X': return new Vector3(1, 0, 0)
            case '-Z': return new Vector3(0, 0, -1)
            default: return new Vector3(0, 0, 1)
        }
    }

    private getTiltSign(): number {
        return this.facing === '+Z' || this.facing === '-X' ? 1 : -1
    }

    private random(elementIndex: number, salt: number): number {
        return getPalisadeRandom(this.position.x, this.position.z, this.facing, elementIndex, 200 + salt)
    }
}
