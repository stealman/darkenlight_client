import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { MaterialEnum1 } from '@/babylon/materials'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'

const FULL_CIRCLE = Math.PI * 2
const FIREPLACE_LOG_COUNT = 7

abstract class BaseFireplace extends BaseStaticObject {
    logWidth: number
    logHeight: number
    logLength: number
    logInnerOffset: number
    logCenterShift: number
    logTilt: number
    logVariation: number

    protected constructor(type: number, position: Vector3, rotation: number, material: Vector2, logLength: number, logInnerOffset: number, logTilt: number) {
        super(type, position, rotation, material, null)
        this.logWidth = 0.08
        this.logHeight = 0.08
        this.logLength = logLength
        this.logInnerOffset = logInnerOffset
        this.logCenterShift = 0.08
        this.logTilt = logTilt
        this.logVariation = 0.1
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

    render() {
        const angleStep = FULL_CIRCLE / FIREPLACE_LOG_COUNT
        const emberY = this.renderPosition.y + 0.55
        const emberSize = 0.3
        const emberRadius = 0.12
        const emberHeight = 0.05

        for (let i = 0; i < 3; i++) {
            const emberAngle = this.rotation + ((i / 3) * FULL_CIRCLE) + (Math.PI / 6)
            const emberRotation = Matrix.RotationY(emberAngle + (((this.getLogNoise(i, 20) * 2) - 1) * 0.18))
            const emberX = this.renderPosition.x + (Math.cos(emberAngle) * emberRadius)
            const emberZ = this.renderPosition.z + (Math.sin(emberAngle) * emberRadius)
            const emberHeightOffset = ((this.getLogNoise(i, 21) * 2) - 1) * 0.01
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
        super(type, position, rotation, material, 0.45, 0.01, 0.7)
    }
}

export class FireplaceLarge extends BaseFireplace {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, 0.82, 0.05, 0.35)
    }
}
