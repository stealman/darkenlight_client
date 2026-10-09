import { Color3, Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
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
const POLE_WIDTH = 0.09
const POLE_HEIGHT = 2.5
const ARM_LENGTH = 0.85
const ARM_WIDTH = 0.09
const BRACE_HORIZONTAL_SPAN = 0.45
const BRACE_VERTICAL_SPAN = 0.38
const BRACE_WIDTH = 0.055
const CHAIN_WIDTH = 0.025
const CHAIN_LENGTH = 0.25
const LANTERN_SIZE = 0.2
const LANTERN_HEIGHT = 0.28
const FRAME_WIDTH = 0.022
const FIRE_BOTTOM_OFFSET = 0.045
const GROUND_OFFSET = 0.5
const BLOCK_SOURCE_Y_OFFSET = -0.5
const LIGHT_INTENSITY = 2.2
const LIGHT_RANGE = 10
const LIGHT_HEIGHT_OFFSET = 0.5
const LIGHT_FORWARD_OFFSET = 0.5

export class LanternStand extends BaseStaticObject {
    private readonly facing: LanternStandFacing
    private readonly baseMaterial: Vector2
    private readonly metalMaterial: Vector2
    private readonly lightIntensity: number
    private readonly lightRange: number
    private readonly firePosition = new Vector3()
    private readonly lightPosition = new Vector3()

    constructor(
        type: number,
        position: Vector3,
        baseMaterial: Vector2,
        metalMaterial: Vector2,
        metadata?: LanternStandMetadata,
    ) {
        super(type, position, 0, metalMaterial, null)
        this.baseMaterial = baseMaterial
        this.metalMaterial = metalMaterial
        this.facing = metadata?.facing === '-X' || metadata?.facing === '+X'
            || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : '+Z'
        this.lightIntensity = getStaticLightLevel(metadata?.lightIntensity)
        this.lightRange = getStaticLightLevel(metadata?.lightRange)
        this.status = {facing: this.facing, lightIntensity: this.lightIntensity, lightRange: this.lightRange}
    }

    render() {
        const normal = this.getFacingNormal()
        const poleBaseY = this.renderPosition.y + GROUND_OFFSET
        const armY = poleBaseY + POLE_HEIGHT - ARM_WIDTH / 2
        const armEndX = this.renderPosition.x + normal.x * ARM_LENGTH
        const armEndZ = this.renderPosition.z + normal.z * ARM_LENGTH
        const chainTopY = armY - ARM_WIDTH / 2
        const lanternTopY = chainTopY - CHAIN_LENGTH
        const lanternCenterY = lanternTopY - LANTERN_HEIGHT / 2

        this.renderPart(BASE_SIZE, BASE_HEIGHT, BASE_SIZE, this.renderPosition.x, poleBaseY + BASE_HEIGHT / 2, this.renderPosition.z, this.baseMaterial)
        this.renderPart(POLE_WIDTH, POLE_HEIGHT, POLE_WIDTH, this.renderPosition.x, poleBaseY + POLE_HEIGHT / 2, this.renderPosition.z, this.metalMaterial)
        this.renderPart(
            normal.x === 0 ? ARM_WIDTH : ARM_LENGTH,
            ARM_WIDTH,
            normal.z === 0 ? ARM_WIDTH : ARM_LENGTH,
            this.renderPosition.x + normal.x * ARM_LENGTH / 2,
            armY,
            this.renderPosition.z + normal.z * ARM_LENGTH / 2,
            this.metalMaterial,
        )
        this.renderBrace(normal, armY)
        this.renderPart(CHAIN_WIDTH, CHAIN_LENGTH, CHAIN_WIDTH, armEndX, chainTopY - CHAIN_LENGTH / 2, armEndZ, this.metalMaterial)
        this.renderLanternFrame(armEndX, lanternCenterY, armEndZ)

        this.firePosition.set(
            armEndX,
            lanternCenterY - LANTERN_HEIGHT / 2 + FIRE_BOTTOM_OFFSET + BLOCK_SOURCE_Y_OFFSET,
            armEndZ,
        )
        this.registerFire()
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
            if (this.firePosition.y === 0) this.updateFirePosition()
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
                this.renderPart(FRAME_WIDTH, LANTERN_HEIGHT, FRAME_WIDTH, x + offsetX, y, z + offsetZ, this.metalMaterial)
            }
        }
        for (const offsetY of [-halfHeight, halfHeight]) {
            for (const offsetZ of [-halfSize, halfSize]) {
                this.renderPart(LANTERN_SIZE + FRAME_WIDTH, FRAME_WIDTH, FRAME_WIDTH, x, y + offsetY, z + offsetZ, this.metalMaterial)
            }
            for (const offsetX of [-halfSize, halfSize]) {
                this.renderPart(FRAME_WIDTH, FRAME_WIDTH, LANTERN_SIZE + FRAME_WIDTH, x + offsetX, y + offsetY, z, this.metalMaterial)
            }
        }
    }

    private renderBrace(normal: Vector3, armY: number) {
        const length = Math.sqrt((BRACE_HORIZONTAL_SPAN * BRACE_HORIZONTAL_SPAN) + (BRACE_VERTICAL_SPAN * BRACE_VERTICAL_SPAN))
        const angle = Math.atan2(BRACE_HORIZONTAL_SPAN, BRACE_VERTICAL_SPAN) * this.getBraceTiltSign()
        const axis = normal.x === 0 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1)
        const matrix = Matrix.Scaling(BRACE_WIDTH, length, BRACE_WIDTH)
            .multiply(Matrix.RotationAxis(axis, angle))
            .multiply(Matrix.Translation(
                this.renderPosition.x + normal.x * BRACE_HORIZONTAL_SPAN / 2,
                armY - BRACE_VERTICAL_SPAN / 2,
                this.renderPosition.z + normal.z * BRACE_HORIZONTAL_SPAN / 2,
            ))
        WorldRenderer.block1!.matrices.push(matrix)
        WorldRenderer.block1!.uvData.push(this.metalMaterial)
    }

    private renderPart(width: number, height: number, depth: number, x: number, y: number, z: number, material: Vector2) {
        WorldRenderer.block1!.matrices.push(
            Matrix.Scaling(width, height, depth).multiply(Matrix.Translation(x, y, z)),
        )
        WorldRenderer.block1!.uvData.push(material)
    }

    private registerFire() {
        if (!Renderer.scene) return
        if (this.firePosition.y === 0) this.updateFirePosition()
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
        const normal = this.getFacingNormal()
        this.lightPosition.set(
            this.firePosition.x + normal.x * LIGHT_FORWARD_OFFSET,
            this.firePosition.y + LIGHT_HEIGHT_OFFSET,
            this.firePosition.z + normal.z * LIGHT_FORWARD_OFFSET,
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
        const normal = this.getFacingNormal()
        const armY = this.renderPosition.y + GROUND_OFFSET + POLE_HEIGHT - ARM_WIDTH / 2
        this.firePosition.set(
            this.renderPosition.x + normal.x * ARM_LENGTH,
            armY - ARM_WIDTH / 2 - CHAIN_LENGTH - LANTERN_HEIGHT + FIRE_BOTTOM_OFFSET + BLOCK_SOURCE_Y_OFFSET,
            this.renderPosition.z + normal.z * ARM_LENGTH,
        )
    }

    private getLightId(): string {
        return `lantern_stand_${this.position.x}_${this.position.z}`
    }

    private getFacingNormal(): Vector3 {
        switch (this.facing) {
            case '-X': return new Vector3(-1, 0, 0)
            case '+X': return new Vector3(1, 0, 0)
            case '-Z': return new Vector3(0, 0, -1)
            default: return new Vector3(0, 0, 1)
        }
    }

    private getBraceTiltSign(): number {
        return this.facing === '+Z' || this.facing === '-X' ? 1 : -1
    }
}
