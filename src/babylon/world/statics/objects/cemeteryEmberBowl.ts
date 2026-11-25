import { Color3, Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { BLOCK_TOP_GLOW_U_OFFSET } from '@/babylon/materials'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import {
    getStaticLightIntensityLevelFactor,
    getStaticLightLevel,
    getStaticLightRangeLevelFactor,
    type StaticLightMetadata,
} from '@/babylon/scene/lighting/lightConfig'
import { StaticFireParticleManager } from '@/babylon/world/statics/staticFireParticleManager'
import { StepMarksRenderer } from '@/babylon/world/stepMarksRenderer'
import { Renderer } from '@/babylon/scene/renderer'

export type CemeteryEmberBowlMetadata = StaticLightMetadata

const GLOW_COLOR = new Color3(1, 0.32, 0.08)
const BOWL_SIZE = 0.42
const BASE_HEIGHT = 0.06
const WALL_HEIGHT = 0.13
const WALL_WIDTH = 0.055
const COAL_HEIGHT = 0.055
const GLOW_INTENSITY = 0.35
const GLOW_RADIUS = 1.6
const FIRE_HEIGHT = BASE_HEIGHT + WALL_HEIGHT / 2

export class CemeteryEmberBowl extends BaseStaticObject {
    private readonly coalMaterial: Vector2
    private readonly rimMaterial: Vector2
    readonly glowRadius: number
    private readonly glowIntensity: number
    private readonly effectId: string
    constructor(type: number, position: Vector3, bowlMaterial: Vector2, coalMaterial: Vector2, metadata?: CemeteryEmberBowlMetadata) {
        super(type, position, 0, bowlMaterial, null)
        this.coalMaterial = coalMaterial
        this.rimMaterial = new Vector2(bowlMaterial.x + BLOCK_TOP_GLOW_U_OFFSET, bowlMaterial.y)
        const lightIntensity = getStaticLightLevel(metadata?.lightIntensity)
        const lightRange = getStaticLightLevel(metadata?.lightRange)
        this.glowIntensity = GLOW_INTENSITY * getStaticLightIntensityLevelFactor(lightIntensity)
        this.glowRadius = GLOW_RADIUS * getStaticLightRangeLevelFactor(lightRange)
        this.effectId = `cemetery_ember_bowl_${position.x}_${position.z}`
        this.status = {lightIntensity, lightRange}
    }

    render() {
        const groundY = this.renderPosition.y + 0.5
        const wallOffset = BOWL_SIZE / 2 - WALL_WIDTH / 2
        this.renderPart(BOWL_SIZE, BASE_HEIGHT, BOWL_SIZE, 0, BASE_HEIGHT / 2, 0, this.material)
        this.renderPart(BOWL_SIZE, WALL_HEIGHT, WALL_WIDTH, 0, BASE_HEIGHT + WALL_HEIGHT / 2, -wallOffset, this.rimMaterial)
        this.renderPart(BOWL_SIZE, WALL_HEIGHT, WALL_WIDTH, 0, BASE_HEIGHT + WALL_HEIGHT / 2, wallOffset, this.rimMaterial)
        this.renderPart(WALL_WIDTH, WALL_HEIGHT, BOWL_SIZE - WALL_WIDTH * 2, -wallOffset, BASE_HEIGHT + WALL_HEIGHT / 2, 0, this.rimMaterial)
        this.renderPart(WALL_WIDTH, WALL_HEIGHT, BOWL_SIZE - WALL_WIDTH * 2, wallOffset, BASE_HEIGHT + WALL_HEIGHT / 2, 0, this.rimMaterial)

        const coalY = groundY + BASE_HEIGHT + COAL_HEIGHT / 2
        this.renderWorldPart(0.12, COAL_HEIGHT, 0.15, this.renderPosition.x - 0.08, coalY, this.renderPosition.z - 0.06, this.coalMaterial, 0.35)
        this.renderWorldPart(0.14, COAL_HEIGHT, 0.1, this.renderPosition.x + 0.07, coalY + 0.008, this.renderPosition.z - 0.04, this.coalMaterial, -0.45)
        this.renderWorldPart(0.1, COAL_HEIGHT, 0.14, this.renderPosition.x - 0.03, coalY + 0.012, this.renderPosition.z + 0.07, this.coalMaterial, 0.8)
        this.renderWorldPart(0.09, COAL_HEIGHT, 0.1, this.renderPosition.x + 0.08, coalY, this.renderPosition.z + 0.07, this.coalMaterial, 0.15)

        this.registerParticles()
    }

    onVisible() {
        this.registerParticles()
    }

    onHidden() {
        StaticFireParticleManager.unregister(this.effectId)
    }

    dispose() {
        StepMarksRenderer.field?.removeGlow(this.effectId)
        StaticFireParticleManager.unregister(this.effectId)
    }

    setTerrainGlowVisible(visible: boolean) {
        const field = StepMarksRenderer.field
        if (!field) return
        if (visible) {
            const {x, y, z} = this.renderPosition
            field.setGlow(this.effectId, x, y + 0.5 + FIRE_HEIGHT, z, this.glowRadius, GLOW_COLOR, this.glowIntensity)
        } else {
            field.removeGlow(this.effectId)
        }
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

    private registerParticles() {
        if (!Renderer.scene) return
        const {x, y, z} = this.renderPosition
        StaticFireParticleManager.register(Renderer.scene, this.effectId, {
            profile: 'embers',
            x,
            y: y + FIRE_HEIGHT,
            z,
            fireHalfWidth: 0.12,
            fireHalfDepth: 0.12,
            fireMaxY: 0.025,
            smokeHalfWidth: 0.1,
            smokeHalfDepth: 0.1,
            smokeMinY: 0.03,
            smokeMaxY: 0.07,
        })
    }
}
