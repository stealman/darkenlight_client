import { Color4, Matrix, ParticleSystem, Texture, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { MaterialEnum1 } from '@/babylon/materials'
import { Renderer } from '@/babylon/scene/renderer'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'

const FULL_CIRCLE = Math.PI * 2
const FIREPLACE_LOG_COUNT = 7

abstract class BaseFireplace extends BaseStaticObject {
    fireplaceScale: number
    fireplaceScaleReduced: number
    logWidth: number
    logHeight: number
    logLength: number
    logInnerOffset: number
    logCenterShift: number
    logTilt: number
    logVariation: number
    fireParticles: ParticleSystem | null
    smokeParticles: ParticleSystem | null
    particleEmitter: TransformNode | null

    protected constructor(type: number, position: Vector3, rotation: number, material: Vector2, fireplaceScale: number, logLength: number, logInnerOffset: number, logTilt: number) {
        super(type, position, rotation, material, null)
        this.fireplaceScale = fireplaceScale
        this.fireplaceScaleReduced = 1 + ((fireplaceScale - 1) * 0.5)
        this.logWidth = 0.08 * fireplaceScale
        this.logHeight = 0.08 * fireplaceScale
        this.logLength = logLength
        this.logInnerOffset = logInnerOffset
        this.logCenterShift = 0.08 * fireplaceScale
        this.logTilt = logTilt
        this.logVariation = 0.1
        this.fireParticles = null
        this.smokeParticles = null
        this.particleEmitter = null
    }

    private getLogNoise(logIndex: number, channel: number): number {
        const seed = (this.type * 97.13)
            + (this.position.x * 53.71)
            + (this.position.z * 31.37)
            + (logIndex * 19.19)
            + (channel * 7.73)

        const value = Math.sin(seed) * 43758.5453123
        return value - Math.floor(value)
    }

    private updateParticleEmitterPosition() {
        if (this.particleEmitter == null) {
            return
        }

        this.particleEmitter.position.set(this.renderPosition.x, this.renderPosition.y + (0.12 * this.fireplaceScaleReduced), this.renderPosition.z)
    }

    private createParticles() {
        if ((this.fireParticles != null && this.smokeParticles != null) || Renderer.scene == null) {
            return
        }

        if (this.particleEmitter == null) {
            this.particleEmitter = new TransformNode(`fireplaceEmitter_${this.position.x}_${this.position.z}`, Renderer.scene)
            this.particleEmitter.parent = WorldRenderer.worldParentNode
            this.updateParticleEmitterPosition()
        }

        if (this.fireParticles == null) {
            const fireParticles = new ParticleSystem(`fireplaceParticles_${this.position.x}_${this.position.z}`, Math.round(150 * this.fireplaceScale), Renderer.scene)
            fireParticles.particleTexture = new Texture('images/gfx/flare.png', Renderer.scene)
            fireParticles.emitter = this.particleEmitter
            fireParticles.minEmitBox = new Vector3(-0.12 * this.fireplaceScale, 0, -0.12 * this.fireplaceScale)
            fireParticles.maxEmitBox = new Vector3(0.12 * this.fireplaceScale, 0.03 * this.fireplaceScale, 0.12 * this.fireplaceScale)
            fireParticles.minLifeTime = 0.5
            fireParticles.maxLifeTime = 0.75
            fireParticles.emitRate = 150 * this.fireplaceScale
            fireParticles.blendMode = ParticleSystem.BLENDMODE_ONEONE
            fireParticles.direction1 = new Vector3(-0.12 * this.fireplaceScale, 0.9 * this.fireplaceScale, -0.12 * this.fireplaceScale)
            fireParticles.direction2 = new Vector3(0.12 * this.fireplaceScale, 1.4 * this.fireplaceScale, 0.12 * this.fireplaceScale)
            fireParticles.minEmitPower = 0.5 * this.fireplaceScaleReduced
            fireParticles.maxEmitPower = 0.75 * this.fireplaceScaleReduced
            fireParticles.minSize = 0.15 * this.fireplaceScaleReduced
            fireParticles.maxSize = 0.2 * this.fireplaceScaleReduced
            fireParticles.gravity = new Vector3(0, 0.6 * this.fireplaceScaleReduced, 0)
            fireParticles.addColorGradient(0, new Color4(1, 0.8, 0.6, 1))
            fireParticles.addColorGradient(0.4, new Color4(1, 0.4, 0.1, 1))
            fireParticles.addColorGradient(0.8, new Color4(0.1, 0.05, 0.01, 0.2))
            fireParticles.addColorGradient(1, new Color4(0.1, 0.05, 0.01, 0.0))
            fireParticles.start()

            this.fireParticles = fireParticles
        }

        if (this.smokeParticles == null) {
            const smokeParticles = new ParticleSystem(`fireplaceSmoke_${this.position.x}_${this.position.z}`, Math.round(80 * this.fireplaceScale), Renderer.scene)
            smokeParticles.particleTexture = new Texture('images/gfx/dust.png', Renderer.scene)
            smokeParticles.emitter = this.particleEmitter
            smokeParticles.minEmitBox = new Vector3(-0.15 * this.fireplaceScale, 0.02 * this.fireplaceScale * 8, -0.15 * this.fireplaceScale)
            smokeParticles.maxEmitBox = new Vector3(0.15 * this.fireplaceScale, 0.08 * this.fireplaceScale * 8, 0.15 * this.fireplaceScale)
            smokeParticles.minLifeTime = 3.5
            smokeParticles.maxLifeTime = 5
            smokeParticles.emitRate = 26 * this.fireplaceScale
            smokeParticles.blendMode = ParticleSystem.BLENDMODE_STANDARD
            smokeParticles.direction1 = new Vector3(-1 * this.fireplaceScale, 0.45 * this.fireplaceScaleReduced, -1 * this.fireplaceScale)
            smokeParticles.direction2 = new Vector3(1 * this.fireplaceScale, 0.7 * this.fireplaceScaleReduced, 1 * this.fireplaceScale)
            smokeParticles.minEmitPower = 0.15 * this.fireplaceScaleReduced
            smokeParticles.maxEmitPower = 0.3 * this.fireplaceScaleReduced
            smokeParticles.minSize = 0.75 * this.fireplaceScaleReduced
            smokeParticles.maxSize = 1 * this.fireplaceScaleReduced
            smokeParticles.minAngularSpeed = -0.3
            smokeParticles.maxAngularSpeed = 0.3
            smokeParticles.gravity = new Vector3(0, 0.22 * this.fireplaceScaleReduced, 0)
            smokeParticles.updateSpeed = 0.01
            smokeParticles.addColorGradient(0, new Color4(0.6, 0.6, 0.6, 0))
            smokeParticles.addColorGradient(0.3, new Color4(0.7, 0.7, 0.7, 0.03))
            smokeParticles.addColorGradient(0.7, new Color4(0.65, 0.65, 0.65, 0.015))
            smokeParticles.addColorGradient(1, new Color4(0.5, 0.5, 0.5, 0))
            smokeParticles.start()

            this.smokeParticles = smokeParticles
        }
    }

    onVisible() {
        this.createParticles()
        this.updateParticleEmitterPosition()
    }

    onHidden() {
        this.dispose()
    }

    dispose() {
        this.fireParticles?.dispose()
        this.smokeParticles?.dispose()
        this.particleEmitter?.dispose()
        this.fireParticles = null
        this.smokeParticles = null
        this.particleEmitter = null
    }

    render() {
        this.updateParticleEmitterPosition()

        const angleStep = FULL_CIRCLE / FIREPLACE_LOG_COUNT
        const emberY = this.renderPosition.y + 0.55
        const emberSize = 0.3 * this.fireplaceScale
        const emberRadius = 0.12 * this.fireplaceScale
        const emberHeight = 0.05 * this.fireplaceScale

        for (let i = 0; i < 3; i++) {
            const emberAngle = this.rotation + ((i / 3) * FULL_CIRCLE) + (Math.PI / 6)
            const emberRotation = Matrix.RotationY(emberAngle + (((this.getLogNoise(i, 20) * 2) - 1) * 0.18))
            const emberX = this.renderPosition.x + (Math.cos(emberAngle) * emberRadius)
            const emberZ = this.renderPosition.z + (Math.sin(emberAngle) * emberRadius)
            const emberHeightOffset = ((this.getLogNoise(i, 21) * 2) - 1) * (0.01 * this.fireplaceScale)
            const currentEmberHeight = emberHeight + emberHeightOffset
            const emberScaleMatrix = Matrix.Scaling(emberSize, currentEmberHeight, emberSize)
            const emberStoneScaleMatrix = Matrix.Scaling(emberSize * 1.5, 0.03, emberSize * 1.5)
            const emberPositionMatrix = Matrix.Translation(emberX, emberY + emberHeightOffset, emberZ)

            WorldRenderer.block1!.matrices.push(emberStoneScaleMatrix.multiply(emberRotation).multiply(emberPositionMatrix))
            WorldRenderer.block1!.uvData.push(MaterialEnum1.BRICK_BLACK.uv)
            WorldRenderer.block1!.matrices.push(emberScaleMatrix.multiply(emberRotation).multiply(emberPositionMatrix))
            WorldRenderer.block1!.uvData.push(MaterialEnum1.EMBERS.uv)
        }

        for (let i = 0; i < FIREPLACE_LOG_COUNT; i++) {
            const angleOffset = ((this.getLogNoise(i, 1) * 2) - 1) * angleStep * this.logVariation
            const widthScale = 1 + (((this.getLogNoise(i, 2) * 2) - 1) * this.logVariation)
            const heightScale = 1 + (((this.getLogNoise(i, 3) * 2) - 1) * this.logVariation)
            const lengthScale = 1 + (((this.getLogNoise(i, 4) * 2) - 1) * this.logVariation)
            const tiltOffset = (((this.getLogNoise(i, 5) * 2) - 1) * this.logVariation * 0.5)
            const angle = this.rotation + (i * angleStep) + angleOffset
            const logWidth = this.logWidth * widthScale
            const logHeight = this.logHeight * heightScale
            const logLength = this.logLength * lengthScale
            const logTilt = this.logTilt + tiltOffset
            const directionX = Math.cos(angle)
            const directionZ = Math.sin(angle)
            const centerOffset = this.logInnerOffset + (logLength / 2) - this.logCenterShift
            const x = this.renderPosition.x + (directionX * centerOffset)
            const z = this.renderPosition.z + (directionZ * centerOffset)
            const scaleMatrix = Matrix.Scaling(logWidth, logHeight, logLength)
            const tiltMatrix = Matrix.RotationX(logTilt)
            const rotationMatrix = Matrix.RotationY((Math.PI / 2) - angle)
            const verticalOffset = Math.sin(logTilt) * (logLength / 2)
            const positionMatrix = Matrix.Translation(x, this.renderPosition.y + logHeight + 0.5 + verticalOffset, z)

            WorldRenderer.block1!.matrices.push(scaleMatrix.multiply(tiltMatrix).multiply(rotationMatrix).multiply(positionMatrix))
            WorldRenderer.block1!.uvData.push(this.material)
        }
    }
}

export class FireplaceSmall extends BaseFireplace {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, 1, 0.45, 0.01, 0.5)
    }
}

export class FireplaceLarge extends BaseFireplace {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, 2, 0.9, 0.02, 0.5)
    }
}
