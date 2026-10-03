import { Color3, Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { Lights } from '@/babylon/scene/lights'
import { LARGE_CAMPFIRE_SHADOW_MAP_SIZE } from '@/babylon/scene/lighting/lightConfig'
import { StaticFireParticleManager } from '@/babylon/world/statics/staticFireParticleManager'
import { Renderer } from '@/babylon/scene/renderer'

export type TorchStandFacing = '-X' | '+X' | '-Z' | '+Z'

export interface TorchStandMetadata {
    facing?: TorchStandFacing
}

const LIGHT_COLOR = new Color3(1, 0.5, 0.18)
const BASE_SIZE = 0.4
const BASE_HEIGHT = 0.12
const POLE_WIDTH = 0.09
const POLE_HEIGHT = 2
const TORCH_WIDTH = 0.12
const TORCH_LENGTH = 0.65
const TORCH_ANGLE = Math.PI / 4
const TORCH_ATTACH_HEIGHT = 1.72
const LIGHT_HEIGHT = 4
const LIGHT_FORWARD_OFFSET = 1
const LIGHT_INTENSITY = 2.5
const LIGHT_RANGE = 12

export class TorchStand extends BaseStaticObject {
    private readonly facing: TorchStandFacing
    private readonly baseMaterial: Vector2
    private readonly poleMaterial: Vector2
    private readonly firePosition = new Vector3()
    private readonly lightPosition = new Vector3()

    constructor(
        type: number,
        position: Vector3,
        baseMaterial: Vector2,
        poleMaterial: Vector2,
        torchMaterial: Vector2,
        metadata?: TorchStandMetadata,
    ) {
        super(type, position, 0, torchMaterial, null)
        this.baseMaterial = baseMaterial
        this.poleMaterial = poleMaterial
        this.facing = metadata?.facing === '-X' || metadata?.facing === '+X'
            || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : '+Z'
        this.status = {facing: this.facing}
    }

    render() {
        this.renderPart(BASE_SIZE, BASE_HEIGHT, BASE_SIZE, this.renderPosition.y + BASE_HEIGHT / 2 + 0.5, this.baseMaterial)
        this.renderPart(POLE_WIDTH, POLE_HEIGHT, POLE_WIDTH, this.renderPosition.y + POLE_HEIGHT / 2 + 0.5, this.poleMaterial)
        this.renderTorch()
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

    private renderPart(width: number, height: number, depth: number, y: number, material: Vector2) {
        WorldRenderer.block1!.matrices.push(
            Matrix.Scaling(width, height, depth)
                .multiply(Matrix.Translation(this.renderPosition.x, y, this.renderPosition.z)),
        )
        WorldRenderer.block1!.uvData.push(material)
    }

    private renderTorch() {
        const normal = this.getFacingNormal()
        const axis = this.getTiltAxis()
        const angle = this.getTiltSign() * TORCH_ANGLE
        const verticalSpan = Math.cos(TORCH_ANGLE) * TORCH_LENGTH
        const horizontalSpan = Math.sin(TORCH_ANGLE) * TORCH_LENGTH
        const centerX = this.renderPosition.x + normal.x * horizontalSpan / 2
        const centerZ = this.renderPosition.z + normal.z * horizontalSpan / 2
        const centerY = this.renderPosition.y + TORCH_ATTACH_HEIGHT + verticalSpan / 2

        WorldRenderer.block1!.matrices.push(
            Matrix.Scaling(TORCH_WIDTH, TORCH_LENGTH, TORCH_WIDTH)
                .multiply(Matrix.RotationAxis(axis, angle))
                .multiply(Matrix.Translation(centerX, centerY + 0.5, centerZ)),
        )
        WorldRenderer.block1!.uvData.push(this.material)

        this.firePosition.set(
            this.renderPosition.x + normal.x * horizontalSpan,
            this.renderPosition.y + TORCH_ATTACH_HEIGHT + verticalSpan,
            this.renderPosition.z + normal.z * horizontalSpan,
        )
    }

    private registerFire() {
        if (!Renderer.scene) {
            return
        }
        if (this.firePosition.y === 0) {
            this.updateFirePosition()
        }
        const normal = this.getFacingNormal()
        this.lightPosition.set(
            this.firePosition.x + normal.x * LIGHT_FORWARD_OFFSET,
            this.renderPosition.y + LIGHT_HEIGHT,
            this.firePosition.z + normal.z * LIGHT_FORWARD_OFFSET,
        )
        Lights.registerStaticLight(this.getLightId(), this.lightPosition, {
            color: LIGHT_COLOR,
            height: 0,
            intensity: LIGHT_INTENSITY,
            range: LIGHT_RANGE,
            flicker: true,
            shadowMapSize: LARGE_CAMPFIRE_SHADOW_MAP_SIZE,
        })
        StaticFireParticleManager.register(Renderer.scene, this.getLightId(), {
            profile: 'wallTorch',
            x: this.firePosition.x,
            y: this.firePosition.y,
            z: this.firePosition.z,
            fireHalfWidth: 0.075,
            fireHalfDepth: 0.075,
            fireMaxY: 0.03,
            smokeHalfWidth: 0.15,
            smokeHalfDepth: 0.15,
            smokeMinY: 0.2,
            smokeMaxY: 0.25,
        })
    }

    private updateFirePosition() {
        const normal = this.getFacingNormal()
        const verticalSpan = Math.cos(TORCH_ANGLE) * TORCH_LENGTH
        const horizontalSpan = Math.sin(TORCH_ANGLE) * TORCH_LENGTH
        this.firePosition.set(
            this.renderPosition.x + normal.x * horizontalSpan,
            this.renderPosition.y + TORCH_ATTACH_HEIGHT + verticalSpan,
            this.renderPosition.z + normal.z * horizontalSpan,
        )
    }

    private getLightId(): string {
        return `torch_stand_${this.position.x}_${this.position.z}`
    }

    private getFacingNormal(): Vector3 {
        switch (this.facing) {
            case '-X': return new Vector3(-1, 0, 0)
            case '+X': return new Vector3(1, 0, 0)
            case '-Z': return new Vector3(0, 0, -1)
            default: return new Vector3(0, 0, 1)
        }
    }

    private getTiltAxis(): Vector3 {
        return this.facing === '-Z' || this.facing === '+Z'
            ? new Vector3(1, 0, 0)
            : new Vector3(0, 0, 1)
    }

    private getTiltSign(): number {
        return this.facing === '+Z' || this.facing === '-X' ? 1 : -1
    }
}
