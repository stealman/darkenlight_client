import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { TaperedBlockBatch } from '@/babylon/world/taperedBlockBatch'
import { createOrientedStaticVariation, createStaticVariation, placeStaticPart } from '@/babylon/world/statics/staticVariation'
import { createHorizontalWoodMatrix, createWoodShape, MAX_PALISADE_WOOD_TWIST, type WoodPiece } from '../staticWoodShape'
import { getBeamWoodJoin, getBraceWoodJoin } from '../palisadeWoodJoin'
import { MyPlayer } from '@/data/myPlayer'
import { Settings } from '@/settings/settings'

export type SpikedPalisadeFacing = '-X' | '+X' | '-Z' | '+Z'

export interface SpikedPalisadeMetadata {
    facing?: SpikedPalisadeFacing
    orientation?: 'X' | 'Z'
}

export class SpikedPalisade extends BaseStaticObject {
    private readonly facing: SpikedPalisadeFacing
    private readonly mainStakes: readonly WoodPiece[]
    private readonly supports: readonly WoodPiece[]
    private readonly connector: WoodPiece

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
    private static readonly STAKE_CONTACT = {blendGroundLighting: true, snowReach: 1.85, damp: 'moss', suppressDamage: true, patina: true} as const
    private static readonly CONNECTOR_CONTACT = {snowReach: 0, suppressDamage: true, patina: true} as const
    private static readonly CONNECTOR_LENGTH = 0.95
    private static readonly CONNECTOR_HEIGHT = 0.09
    private static readonly CONNECTOR_DEPTH = 0.09
    private static readonly CONNECTOR_HEIGHT_POSITION = 0.66
    private static readonly CONNECTOR_FORWARD_OFFSET = 0.13
    private static readonly MAX_CONNECTOR_LEAN = Math.PI / 32
    private static readonly MAX_CONNECTOR_SKEW = Math.PI / 70

    constructor(type: number, position: Vector3, material: Vector2, metadata?: SpikedPalisadeMetadata) {
        super(type, position, 0, material, TaperedBlockBatch.prefab)
        this.facing = metadata?.facing === '-X' || metadata?.facing === '+X'
            || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : metadata?.orientation === 'X' ? '+Z' : '+X'
        this.status = {facing: this.facing}
        const variation = createOrientedStaticVariation(MyPlayer.worldId, position, this.facing)
        const woodVariation = createStaticVariation(MyPlayer.worldId, position, type)
        const axis = this.getAxis()
        const tiltSign = this.getTiltSign()
        this.mainStakes = Array.from({length: SpikedPalisade.MAIN_STAKE_COUNT}, (_, index) => {
            const offset = (index - 2) * SpikedPalisade.MAIN_STAKE_SPACING + variation.signed(index, 201) * 0.012
            const length = SpikedPalisade.MAIN_STAKE_LENGTH - variation.unit(index, 202) * 0.12
            const width = SpikedPalisade.MAIN_STAKE_SIZE + variation.signed(index, 203) * 0.008
            const depth = SpikedPalisade.MAIN_STAKE_SIZE + variation.signed(index, 204) * 0.008
            const angle = tiltSign * (SpikedPalisade.BASE_ANGLE
                + variation.signed(index, 205) * SpikedPalisade.MAX_ANGLE_VARIATION)
            return {
                matrix: this.createStake(axis, offset, length, width, depth, angle,
                    variation.signed(index, 206) * MAX_PALISADE_WOOD_TWIST),
                shape: createWoodShape(woodVariation, index),
            }
        })
        this.supports = Array.from({length: SpikedPalisade.SUPPORT_COUNT}, (_, index) => {
            const offset = (index - 1) * SpikedPalisade.SUPPORT_SPACING + variation.signed(index, 220) * 0.012
            const length = SpikedPalisade.SUPPORT_LENGTH - variation.unit(index, 221) * 0.08
            const angle = -tiltSign * (SpikedPalisade.BASE_ANGLE
                + variation.signed(index, 222) * SpikedPalisade.MAX_ANGLE_VARIATION)
            return {
                matrix: this.createStake(axis, offset, length, SpikedPalisade.SUPPORT_SIZE, SpikedPalisade.SUPPORT_SIZE,
                    angle, variation.signed(index, 223) * MAX_PALISADE_WOOD_TWIST),
                shape: createWoodShape(woodVariation, SpikedPalisade.MAIN_STAKE_COUNT + index),
            }
        })
        const forward = this.getForwardNormal()
        const yaw = this.facing === '-X' || this.facing === '+X' ? Math.PI / 2 : 0
        this.connector = {
            matrix: createHorizontalWoodMatrix(SpikedPalisade.CONNECTOR_LENGTH, SpikedPalisade.CONNECTOR_DEPTH,
                SpikedPalisade.CONNECTOR_HEIGHT, true, variation.signed(0, 241) * MAX_PALISADE_WOOD_TWIST)
                .multiply(Matrix.RotationYawPitchRoll(
                    yaw + variation.signed(0, 242) * SpikedPalisade.MAX_CONNECTOR_SKEW,
                    0,
                    variation.signed(0, 240) * SpikedPalisade.MAX_CONNECTOR_LEAN,
                ))
                .setTranslationFromFloats(forward.x * SpikedPalisade.CONNECTOR_FORWARD_OFFSET,
                    SpikedPalisade.CONNECTOR_HEIGHT_POSITION + 0.5, forward.z * SpikedPalisade.CONNECTOR_FORWARD_OFFSET),
            shape: createWoodShape(woodVariation, SpikedPalisade.MAIN_STAKE_COUNT + SpikedPalisade.SUPPORT_COUNT),
        }
    }

    render() {
        const connector = placeStaticPart(this.connector.matrix, this.renderPosition)
        const braces = Settings.isDetalLevelHigh() ? [connector] : undefined
        const forward = this.getForwardNormal()
        this.renderStakes(this.mainStakes, braces)
        TaperedBlockBatch.add(connector, this.material, this.connector.shape, braces
            ? {...SpikedPalisade.CONNECTOR_CONTACT, join: getBraceWoodJoin(connector, -forward.x, -forward.z)}
            : SpikedPalisade.CONNECTOR_CONTACT)
        this.renderStakes(this.supports, braces)
    }

    private createStake(axis: Vector3, offset: number, length: number, width: number, depth: number, angle: number, twist: number) {
        return Matrix.Scaling(width, length, depth)
            .multiply(Matrix.RotationY(twist))
            .multiply(Matrix.RotationAxis(axis, angle))
            .setTranslationFromFloats(axis.x * offset, Math.cos(angle) * length / 2 + 0.5, axis.z * offset)
    }

    private renderStakes(stakes: readonly WoodPiece[], braces?: readonly Matrix[]) {
        for (const {matrix, shape} of stakes) {
            const placed = placeStaticPart(matrix, this.renderPosition)
            TaperedBlockBatch.add(placed, this.material, shape, braces
                ? {...SpikedPalisade.STAKE_CONTACT, join: getBeamWoodJoin(placed, braces)}
                : SpikedPalisade.STAKE_CONTACT)
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
