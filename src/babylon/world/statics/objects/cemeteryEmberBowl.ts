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

export type CemeteryEmberBowlMetadata = StaticLightMetadata

const LIGHT_COLOR = new Color3(1, 0.32, 0.08)
const BOWL_SIZE = 0.42
const BASE_HEIGHT = 0.06
const WALL_HEIGHT = 0.13
const WALL_WIDTH = 0.055
const COAL_HEIGHT = 0.055
const LIGHT_INTENSITY = 1.4
const LIGHT_RANGE = 6
const LIGHT_HEIGHT_OFFSET = 0.65

export class CemeteryEmberBowl extends BaseStaticObject {
    private readonly coalMaterial: Vector2
    private readonly lightIntensity: number
    private readonly lightRange: number
    private readonly firePosition = new Vector3()
    private readonly lightPosition = new Vector3()

    constructor(type: number, position: Vector3, bowlMaterial: Vector2, coalMaterial: Vector2, metadata?: CemeteryEmberBowlMetadata) {
        super(type, position, 0, bowlMaterial, null)
        this.coalMaterial = coalMaterial
        this.lightIntensity = getStaticLightLevel(metadata?.lightIntensity)
        this.lightRange = getStaticLightLevel(metadata?.lightRange)
        this.status = {lightIntensity: this.lightIntensity, lightRange: this.lightRange}
    }

    render() {
        const groundY = this.renderPosition.y + 0.5
        const wallCenterY = groundY + BASE_HEIGHT + WALL_HEIGHT / 2
        const wallOffset = BOWL_SIZE / 2 - WALL_WIDTH / 2
        this.renderPart(BOWL_SIZE, BASE_HEIGHT, BOWL_SIZE, 0, BASE_HEIGHT / 2, 0, this.material)
        this.renderPart(BOWL_SIZE, WALL_HEIGHT, WALL_WIDTH, 0, BASE_HEIGHT + WALL_HEIGHT / 2, -wallOffset, this.material)
        this.renderPart(BOWL_SIZE, WALL_HEIGHT, WALL_WIDTH, 0, BASE_HEIGHT + WALL_HEIGHT / 2, wallOffset, this.material)
        this.renderPart(WALL_WIDTH, WALL_HEIGHT, BOWL_SIZE - WALL_WIDTH * 2, -wallOffset, BASE_HEIGHT + WALL_HEIGHT / 2, 0, this.material)
        this.renderPart(WALL_WIDTH, WALL_HEIGHT, BOWL_SIZE - WALL_WIDTH * 2, wallOffset, BASE_HEIGHT + WALL_HEIGHT / 2, 0, this.material)

        const coalY = groundY + BASE_HEIGHT + COAL_HEIGHT / 2
        this.renderWorldPart(0.12, COAL_HEIGHT, 0.15, this.renderPosition.x - 0.08, coalY, this.renderPosition.z - 0.06, this.coalMaterial, 0.35)
        this.renderWorldPart(0.14, COAL_HEIGHT, 0.1, this.renderPosition.x + 0.07, coalY + 0.008, this.renderPosition.z - 0.04, this.coalMaterial, -0.45)
        this.renderWorldPart(0.1, COAL_HEIGHT, 0.14, this.renderPosition.x - 0.03, coalY + 0.012, this.renderPosition.z + 0.07, this.coalMaterial, 0.8)
        this.renderWorldPart(0.09, COAL_HEIGHT, 0.1, this.renderPosition.x + 0.08, coalY, this.renderPosition.z + 0.07, this.coalMaterial, 0.15)

        this.firePosition.set(this.renderPosition.x, wallCenterY - 0.5, this.renderPosition.z)
        this.registerEffects()
    }

    onVisible() {
        this.registerEffects()
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

    shouldPlaceOnStatic(): boolean {
        return true
    }

    private renderPart(width: number, height: number, depth: number, x: number, y: number, z: number, material: Vector2) {
        this.renderWorldPart(width, height, depth, this.renderPosition.x + x, this.renderPosition.y + 0.5 + y, this.renderPosition.z + z, material)
    }

    private renderWorldPart(width: number, height: number, depth: number, x: number, y: number, z: number, material: Vector2, yaw = 0) {
        WorldRenderer.block1!.matrices.push(
            Matrix.Scaling(width, height, depth)
                .multiply(Matrix.RotationY(yaw))
                .multiply(Matrix.Translation(x, y, z)),
        )
        WorldRenderer.block1!.uvData.push(material)
    }

    private registerEffects() {
        if (!Renderer.scene) return
        if (this.firePosition.y === 0) this.updateFirePosition()
        this.registerLight()
        StaticFireParticleManager.register(Renderer.scene, this.getLightId(), {
            profile: 'embers',
            x: this.firePosition.x,
            y: this.firePosition.y,
            z: this.firePosition.z,
            fireHalfWidth: 0.12,
            fireHalfDepth: 0.12,
            fireMaxY: 0.025,
            smokeHalfWidth: 0.1,
            smokeHalfDepth: 0.1,
            smokeMinY: 0.03,
            smokeMaxY: 0.07,
        })
    }

    private registerLight() {
        this.lightPosition.set(this.firePosition.x, this.firePosition.y + LIGHT_HEIGHT_OFFSET, this.firePosition.z)
        Lights.registerStaticLight(this.getLightId(), this.lightPosition, {
            color: LIGHT_COLOR,
            height: 0,
            intensity: LIGHT_INTENSITY * getStaticLightIntensityLevelFactor(this.lightIntensity),
            range: LIGHT_RANGE * getStaticLightRangeLevelFactor(this.lightRange),
            flicker: true,
            flickerPosition: false,
            priority: 0,
            shadowMapSize: STATIC_SHADOW_MAP_SIZE,
        })
    }

    private updateFirePosition() {
        this.firePosition.set(
            this.renderPosition.x,
            this.renderPosition.y + BASE_HEIGHT + WALL_HEIGHT / 2,
            this.renderPosition.z,
        )
    }

    private getLightId(): string {
        return `cemetery_ember_bowl_${this.position.x}_${this.position.z}`
    }
}
