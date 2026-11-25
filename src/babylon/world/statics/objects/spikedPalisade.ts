import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { createOrientedStaticVariation, placeStaticPart } from '@/babylon/world/statics/staticVariation'
import { MyPlayer } from '@/data/myPlayer'

export type SpikedPalisadeFacing = '-X' | '+X' | '-Z' | '+Z'

export interface SpikedPalisadeMetadata {
    facing?: SpikedPalisadeFacing
    orientation?: 'X' | 'Z'
}

export class SpikedPalisade extends BaseStaticObject {
    private readonly facing: SpikedPalisadeFacing
    private readonly mainStakes: readonly Matrix[]
    private readonly supports: readonly Matrix[]
    private readonly connector: Matrix

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
    private static readonly SNOW_REACH = 1.85
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
        const variation = createOrientedStaticVariation(MyPlayer.worldId, position, this.facing)
        const axis = this.getAxis()
        const tiltSign = this.getTiltSign()
        this.mainStakes = Array.from({length: SpikedPalisade.MAIN_STAKE_COUNT}, (_, index) => {
            const offset = (index - 2) * SpikedPalisade.MAIN_STAKE_SPACING + variation.signed(index, 201) * 0.012
            const length = SpikedPalisade.MAIN_STAKE_LENGTH - variation.unit(index, 202) * 0.12
            const width = SpikedPalisade.MAIN_STAKE_SIZE + variation.signed(index, 203) * 0.008
            const depth = SpikedPalisade.MAIN_STAKE_SIZE + variation.signed(index, 204) * 0.008
            const angle = tiltSign * (SpikedPalisade.BASE_ANGLE
                + variation.signed(index, 205) * SpikedPalisade.MAX_ANGLE_VARIATION)
            return this.createStake(axis, offset, length, width, depth, angle)
        })
        this.supports = Array.from({length: SpikedPalisade.SUPPORT_COUNT}, (_, index) => {
            const offset = (index - 1) * SpikedPalisade.SUPPORT_SPACING + variation.signed(index, 220) * 0.012
            const length = SpikedPalisade.SUPPORT_LENGTH - variation.unit(index, 221) * 0.08
            const angle = -tiltSign * (SpikedPalisade.BASE_ANGLE
                + variation.signed(index, 222) * SpikedPalisade.MAX_ANGLE_VARIATION)
            return this.createStake(axis, offset, length, SpikedPalisade.SUPPORT_SIZE, SpikedPalisade.SUPPORT_SIZE, angle)
        })
        const forward = this.getForwardNormal()
        const yaw = this.facing === '-X' || this.facing === '+X' ? Math.PI / 2 : 0
        this.connector = Matrix.Scaling(SpikedPalisade.CONNECTOR_LENGTH, SpikedPalisade.CONNECTOR_HEIGHT, SpikedPalisade.CONNECTOR_DEPTH)
            .multiply(Matrix.RotationYawPitchRoll(yaw, 0, variation.signed(0, 240) * Math.PI / 90))
            .setTranslationFromFloats(forward.x * SpikedPalisade.CONNECTOR_FORWARD_OFFSET,
                SpikedPalisade.CONNECTOR_HEIGHT_POSITION + 0.5, forward.z * SpikedPalisade.CONNECTOR_FORWARD_OFFSET)
    }

    render() {
        this.renderStakes(this.mainStakes)
        const batch = WorldRenderer.block1!
        batch.matrices.push(placeStaticPart(this.connector, this.renderPosition))
        batch.uvData.push(this.material)
        this.renderStakes(this.supports)
    }

    private createStake(axis: Vector3, offset: number, length: number, width: number, depth: number, angle: number) {
        return Matrix.Scaling(width, length, depth).multiply(Matrix.RotationAxis(axis, angle))
            .setTranslationFromFloats(axis.x * offset, Math.cos(angle) * length / 2 + 0.5, axis.z * offset)
    }

    private renderStakes(stakes: readonly Matrix[]) {
        for (const stake of stakes) {
            WorldRenderer.addTerrainContactBlock(placeStaticPart(stake, this.renderPosition),
                this.material, true, SpikedPalisade.SNOW_REACH, 'moss')
        }
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

}
