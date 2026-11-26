import { Color3, Matrix, Quaternion, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { MaterialEnum1 } from '@/babylon/materials'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { MasonryBatch } from '@/babylon/world/masonryBatch'
import { TaperedBlockBatch } from '@/babylon/world/taperedBlockBatch'
import { addMasonryPedestal } from '@/babylon/world/statics/masonryPedestal'
import { WOOD_POST_TOP_MOISTURE } from '@/babylon/world/statics/palisadeWoodJoin'
import { createStaticVariation, placeStaticPart } from '@/babylon/world/statics/staticVariation'
import { createWoodShape, type WoodPiece } from '@/babylon/world/statics/staticWoodShape'
import { MyPlayer } from '@/data/myPlayer'
import { Lights } from '@/babylon/scene/lights'
import {
    getStaticLightIntensityLevelFactor,
    getStaticLightLevel,
    getStaticLightRangeLevelFactor,
    OUTDOOR_STATIC_LIGHT_RANGE_FACTOR,
    STATIC_SHADOW_MAP_SIZE,
    type StaticLightMetadata,
} from '@/babylon/scene/lighting/lightConfig'
import { StaticFireParticleManager } from '@/babylon/world/statics/staticFireParticleManager'
import { Renderer } from '@/babylon/scene/renderer'

export type LanternStandFacing = '-X' | '+X' | '-Z' | '+Z'

export interface LanternStandMetadata extends StaticLightMetadata {
    facing?: LanternStandFacing
}

const LIGHT_COLOR = new Color3(1, 0.5, 0.18)
const BASE_SIZE = 0.4
const BASE_HEIGHT = 0.12
const POLE_WIDTH = 0.14
const POLE_HEIGHT = 2.5
const ARM_LENGTH = 0.85
const ARM_WIDTH = 0.11
const BRACE_VERTICAL_SPAN = 0.38
const BRACE_WIDTH = 0.075
const WOOD_WEATHERING = {patina: true, suppressDamage: true, join: WOOD_POST_TOP_MOISTURE} as const
const CHAIN_WIDTH = 0.025
const CHAIN_LENGTH = 0.25
const LANTERN_SIZE = 0.2
const LANTERN_HEIGHT = 0.28
const FRAME_WIDTH = 0.022
const FIRE_BOTTOM_OFFSET = 0.045
const LIGHT_INTENSITY = 2.2
const LIGHT_RANGE = 10
const LIGHT_HEIGHT_OFFSET = 0.5
const LIGHT_FORWARD_OFFSET = 0.5

export class LanternStand extends BaseStaticObject {
    private readonly wood: readonly [WoodPiece, WoodPiece, WoodPiece]
    private readonly forward: Vector3
    private readonly chainAnchor: Vector3
    private readonly lightIntensity: number
    private readonly lightRange: number
    private readonly firePosition = new Vector3()
    private readonly lightPosition = new Vector3()
    private woodMatrixStart = -1

    constructor(
        type: number,
        position: Vector3,
        metalMaterial: Vector2,
        metadata?: LanternStandMetadata,
    ) {
        super(type, position, 0, metalMaterial, MasonryBatch.prefab)
        const facing = metadata?.facing === '-X' || metadata?.facing === '+X'
            || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : '+Z'
        this.lightIntensity = getStaticLightLevel(metadata?.lightIntensity)
        this.lightRange = getStaticLightLevel(metadata?.lightRange)
        this.status = {facing, lightIntensity: this.lightIntensity, lightRange: this.lightRange}

        const variation = createStaticVariation(MyPlayer.worldId, position, type)
        const heading = facing === '+X' ? Math.PI / 2 : facing === '-X' ? -Math.PI / 2 : facing === '-Z' ? Math.PI : 0
        const yaw = heading + variation.signed(1, 1) * 0.12
        this.forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw))
        const foot = new Vector3(0, BASE_HEIGHT - 0.035, 0)
        const top = new Vector3(variation.signed(0, 1) * 0.13, POLE_HEIGHT + variation.signed(0, 2) * 0.18,
            variation.signed(0, 3) * 0.13)
        const armThickness = ARM_WIDTH * (1 + variation.signed(1, 2) * 0.18)
        const armRoot = top.add(new Vector3(0, -armThickness * 0.47, 0))
        const armStart = armRoot.subtract(this.forward.scale(0.085))
        const armEnd = armRoot.add(this.forward.scale(ARM_LENGTH + variation.signed(1, 3) * 0.13))
        armEnd.y += variation.signed(1, 4) * 0.095
        this.chainAnchor = Vector3.Lerp(armRoot, armEnd, 0.94)
        this.chainAnchor.y -= armThickness * 0.34
        const braceStart = Vector3.Lerp(top, foot, (BRACE_VERTICAL_SPAN + variation.signed(2, 1) * 0.08) / (top.y - foot.y))
        const braceEnd = Vector3.Lerp(armRoot, armEnd, 0.55 + variation.signed(2, 2) * 0.09)
        braceEnd.y -= armThickness * 0.26

        const beam = (start: Vector3, end: Vector3, thickness: number, part: number): WoodPiece => {
            const direction = end.subtract(start)
            const length = direction.length()
            const rotation = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction.scale(1 / length), new Quaternion())
            const center = Vector3.Center(start, end)
            return {
                matrix: Matrix.Scaling(thickness, length, thickness * (1 + variation.signed(part, 5) * 0.18))
                    .multiply(Matrix.RotationY(variation.signed(part, 6) * 0.20))
                    .multiply(Matrix.FromQuaternionToRef(rotation, Matrix.Identity()))
                    .setTranslationFromFloats(center.x, center.y + 0.5, center.z),
                shape: createWoodShape(variation, part),
            }
        }
        this.wood = [
            beam(foot, top, POLE_WIDTH * (1 + variation.signed(0, 7) * 0.17), 0),
            beam(armStart, armEnd, armThickness, 1),
            beam(braceStart, braceEnd, BRACE_WIDTH * (1 + variation.signed(2, 7) * 0.18), 2),
        ]
    }

    render() {
        const origin = this.renderPosition
        addMasonryPedestal(this, [BASE_SIZE, BASE_HEIGHT, BASE_SIZE])
        this.woodMatrixStart = this.wood[0].shape ? TaperedBlockBatch.prefab!.matrices.length : -1
        for (const {matrix, shape} of this.wood) {
            TaperedBlockBatch.add(placeStaticPart(matrix, origin), MaterialEnum1.WOOD_3.uv, shape, WOOD_WEATHERING)
        }
        const x = origin.x + this.chainAnchor.x, z = origin.z + this.chainAnchor.z
        const chainTopY = origin.y + this.chainAnchor.y + 0.5
        this.renderPart(CHAIN_WIDTH, CHAIN_LENGTH, CHAIN_WIDTH, x, chainTopY - CHAIN_LENGTH / 2, z)
        this.renderLanternFrame(x, chainTopY - CHAIN_LENGTH - LANTERN_HEIGHT / 2, z)
        this.registerFire()
    }

    clearRenderMatrixCapture() {
        super.clearRenderMatrixCapture()
        this.woodMatrixStart = -1
    }

    applyDeleteBounceOffset(offset: number) {
        const meshes = super.applyDeleteBounceOffset(offset)
        const batch = TaperedBlockBatch.prefab
        if (this.woodMatrixStart >= 0 && batch?.matrixBuffer.length) {
            for (const [index, {matrix}] of this.wood.entries()) {
                batch.matrixBuffer[(this.woodMatrixStart + index) * 16 + 13] = this.renderPosition.y + matrix.m[13] + offset
            }
            meshes.push(batch.mesh)
        }
        return meshes
    }

    onVisible() {
        this.registerFire()
    }

    onHidden() {
        this.dispose()
    }

    dispose() {
        Lights.unregisterStaticLight(this.getLightId())
        StaticFireParticleManager.unregister(this.getLightId())
    }

    setLightVisible(visible: boolean) {
        if (visible) {
            this.updateFirePosition()
            this.registerLight()
        } else {
            Lights.unregisterStaticLight(this.getLightId())
        }
    }

    getLightVisibilityRadius(): number {
        return LIGHT_RANGE * getStaticLightRangeLevelFactor(this.lightRange) * OUTDOOR_STATIC_LIGHT_RANGE_FACTOR
    }

    private renderLanternFrame(x: number, y: number, z: number) {
        const halfSize = LANTERN_SIZE / 2
        const halfHeight = LANTERN_HEIGHT / 2
        for (const offsetX of [-halfSize, halfSize]) {
            for (const offsetZ of [-halfSize, halfSize]) {
                this.renderPart(FRAME_WIDTH, LANTERN_HEIGHT, FRAME_WIDTH, x + offsetX, y, z + offsetZ)
            }
        }
        for (const offsetY of [-halfHeight, halfHeight]) {
            for (const offsetZ of [-halfSize, halfSize]) {
                this.renderPart(LANTERN_SIZE + FRAME_WIDTH, FRAME_WIDTH, FRAME_WIDTH, x, y + offsetY, z + offsetZ)
            }
            for (const offsetX of [-halfSize, halfSize]) {
                this.renderPart(FRAME_WIDTH, FRAME_WIDTH, LANTERN_SIZE + FRAME_WIDTH, x + offsetX, y + offsetY, z)
            }
        }
    }

    private renderPart(width: number, height: number, depth: number, x: number, y: number, z: number) {
        const matrix = Matrix.Scaling(width, height, depth).setTranslationFromFloats(x, y, z)
        WorldRenderer.block1!.matrices.push(matrix)
        WorldRenderer.block1!.uvData.push(this.material)
    }

    private registerFire() {
        if (!Renderer.scene) return
        this.updateFirePosition()
        this.registerLight()
        StaticFireParticleManager.register(Renderer.scene, this.getLightId(), {
            profile: 'lantern',
            x: this.firePosition.x,
            y: this.firePosition.y,
            z: this.firePosition.z,
            fireHalfWidth: 0.025,
            fireHalfDepth: 0.025,
            fireMaxY: 0.015,
            smokeHalfWidth: 0.04,
            smokeHalfDepth: 0.04,
            smokeMinY: 0.08,
            smokeMaxY: 0.12,
        })
    }

    private registerLight() {
        this.lightPosition.set(
            this.firePosition.x + this.forward.x * LIGHT_FORWARD_OFFSET,
            this.firePosition.y + LIGHT_HEIGHT_OFFSET,
            this.firePosition.z + this.forward.z * LIGHT_FORWARD_OFFSET,
        )
        Lights.registerStaticLight(this.getLightId(), this.lightPosition, {
            color: LIGHT_COLOR,
            height: 0,
            intensity: LIGHT_INTENSITY * getStaticLightIntensityLevelFactor(this.lightIntensity),
            range: LIGHT_RANGE * getStaticLightRangeLevelFactor(this.lightRange),
            flicker: true,
            flickerPosition: false,
            shadowMapSize: STATIC_SHADOW_MAP_SIZE,
        })
    }

    private updateFirePosition() {
        const origin = this.renderPosition
        this.firePosition.set(
            origin.x + this.chainAnchor.x,
            origin.y + this.chainAnchor.y - CHAIN_LENGTH - LANTERN_HEIGHT + FIRE_BOTTOM_OFFSET,
            origin.z + this.chainAnchor.z,
        )
    }

    private getLightId(): string {
        return `lantern_stand_${this.position.x}_${this.position.z}`
    }
}
