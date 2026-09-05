import { Color3, Color4, Matrix, ParticleSystem, Texture, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { Lights } from '@/babylon/scene/lights'
import { Renderer } from '@/babylon/scene/renderer'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'

export type WallTorchFacing = '-X' | '+X' | '-Z' | '+Z'

export interface WallTorchMetadata {
    facing?: WallTorchFacing
    mountHeight?: number
}

const TORCH_LIGHT_COLOR = new Color3(1, 0.5, 0.18)
const WALL_SURFACE_OFFSET = 0.65
const TORCH_BODY_HEIGHT = 0.65
const BLOCK_SOURCE_Y_OFFSET = -0.5
const BLOCK_LOCAL_TOP_Y = 0.5

export class WallTorch extends BaseStaticObject {
    private readonly facing: WallTorchFacing
    private readonly mountHeight: number
    private readonly lightPosition = new Vector3()
    private fireParticles: ParticleSystem | null = null
    private smokeParticles: ParticleSystem | null = null
    private particleEmitter: TransformNode | null = null

    constructor(type: number, position: Vector3, material: Vector2, metadata?: WallTorchMetadata) {
        super(type, position, 0, material, null)
        this.facing = metadata?.facing === '-X' || metadata?.facing === '+X' || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : '-Z'
        this.mountHeight = Number.isFinite(metadata?.mountHeight) ? metadata!.mountHeight! : 2
    }

    private getWallNormal(): Vector3 {
        switch (this.facing) {
            case '-X': return new Vector3(-1, 0, 0)
            case '+X': return new Vector3(1, 0, 0)
            case '+Z': return new Vector3(0, 0, 1)
            default: return new Vector3(0, 0, -1)
        }
    }

    private updateLightPosition() {
        const normal = this.getWallNormal()
        this.lightPosition.set(
            this.renderPosition.x + (normal.x * (WALL_SURFACE_OFFSET + 0.15)),
            this.renderPosition.y + this.mountHeight,
            this.renderPosition.z + (normal.z * (WALL_SURFACE_OFFSET + 0.15)),
        )
    }

    private getLightId(): string {
        return `wall_torch_${this.position.x}_${this.position.z}`
    }

    private getTorchTopY(): number {
        return this.renderPosition.y
            + this.mountHeight
            + (TORCH_BODY_HEIGHT * BLOCK_LOCAL_TOP_Y)
            + BLOCK_SOURCE_Y_OFFSET
    }

    private registerLight() {
        this.updateLightPosition()
        Lights.registerStaticLight(this.getLightId(), this.lightPosition, {
            color: TORCH_LIGHT_COLOR,
            height: 0,
            intensity: 2.2,
            range: 10,
        })
    }

    private updateParticleEmitterPosition() {
        if (this.particleEmitter == null) {
            return
        }

        const normal = this.getWallNormal()
        this.particleEmitter.position.set(
            this.renderPosition.x + (normal.x * WALL_SURFACE_OFFSET),
            this.getTorchTopY(),
            this.renderPosition.z + (normal.z * WALL_SURFACE_OFFSET),
        )
    }

    private createParticles() {
        if ((this.fireParticles != null && this.smokeParticles != null) || Renderer.scene == null) {
            return
        }

        if (this.particleEmitter == null) {
            this.particleEmitter = new TransformNode(`wallTorchEmitter_${this.position.x}_${this.position.z}`, Renderer.scene)
            this.particleEmitter.parent = WorldRenderer.worldParentNode
        }
        this.updateParticleEmitterPosition()

        const normal = this.getWallNormal()
        const width = normal.x === 0 ? 0.18 : 0.12
        const depth = normal.z === 0 ? 0.18 : 0.12
        if (this.fireParticles == null) {
            const fireParticles = new ParticleSystem(`wallTorchParticles_${this.position.x}_${this.position.z}`, 75, Renderer.scene)
            fireParticles.particleTexture = new Texture('images/gfx/flare.png', Renderer.scene)
            fireParticles.emitter = this.particleEmitter
            fireParticles.minEmitBox = new Vector3(-width / 2, 0, -depth / 2)
            fireParticles.maxEmitBox = new Vector3(width / 2, 0.03, depth / 2)
            fireParticles.minLifeTime = 0.5
            fireParticles.maxLifeTime = 0.75
            fireParticles.emitRate = 75
            fireParticles.blendMode = ParticleSystem.BLENDMODE_ONEONE
            fireParticles.direction1 = new Vector3(-0.08, 0.9, -0.08)
            fireParticles.direction2 = new Vector3(0.08, 1.4, 0.08)
            fireParticles.minEmitPower = 0.5
            fireParticles.maxEmitPower = 0.75
            fireParticles.minSize = 0.1
            fireParticles.maxSize = 0.15
            fireParticles.gravity = new Vector3(0, 0.6, 0)
            fireParticles.addColorGradient(0, new Color4(1, 0.8, 0.6, 1))
            fireParticles.addColorGradient(0.4, new Color4(1, 0.4, 0.1, 1))
            fireParticles.addColorGradient(0.8, new Color4(0.1, 0.05, 0.01, 0.2))
            fireParticles.addColorGradient(1, new Color4(0.1, 0.05, 0.01, 0))
            fireParticles.start()
            this.fireParticles = fireParticles
        }

        if (this.smokeParticles == null) {
            const smokeParticles = new ParticleSystem(`wallTorchSmoke_${this.position.x}_${this.position.z}`, 50, Renderer.scene)
            smokeParticles.particleTexture = new Texture('images/gfx/dust.png', Renderer.scene)
            smokeParticles.emitter = this.particleEmitter
            smokeParticles.minEmitBox = new Vector3(-width, 0.2, -depth)
            smokeParticles.maxEmitBox = new Vector3(width, 0.25, depth)
            smokeParticles.minLifeTime = 3.5
            smokeParticles.maxLifeTime = 5
            smokeParticles.emitRate = 12
            smokeParticles.blendMode = ParticleSystem.BLENDMODE_STANDARD
            smokeParticles.direction1 = new Vector3(-0.8, 0.35, -0.8)
            smokeParticles.direction2 = new Vector3(0.8, 0.55, 0.8)
            smokeParticles.minEmitPower = 0.12
            smokeParticles.maxEmitPower = 0.22
            smokeParticles.minSize = 0.35
            smokeParticles.maxSize = 0.5
            smokeParticles.minAngularSpeed = -0.3
            smokeParticles.maxAngularSpeed = 0.3
            smokeParticles.gravity = new Vector3(0, 0.15, 0)
            smokeParticles.updateSpeed = 0.01
            smokeParticles.addColorGradient(0, new Color4(0.6, 0.6, 0.6, 0))
            smokeParticles.addColorGradient(0.3, new Color4(0.7, 0.7, 0.7, 0.08))
            smokeParticles.addColorGradient(0.7, new Color4(0.65, 0.65, 0.65, 0.03))
            smokeParticles.addColorGradient(1, new Color4(0.5, 0.5, 0.5, 0))
            smokeParticles.start()
            this.smokeParticles = smokeParticles
        }
    }

    onVisible() {
        this.createParticles()
        this.updateParticleEmitterPosition()
        this.registerLight()
    }

    onHidden() {
        this.dispose()
    }

    dispose() {
        Lights.unregisterStaticLight(this.getLightId())
        this.fireParticles?.dispose()
        this.smokeParticles?.dispose()
        this.particleEmitter?.dispose()
        this.fireParticles = null
        this.smokeParticles = null
        this.particleEmitter = null
    }

    render() {
        const normal = this.getWallNormal()
        const width = normal.x === 0 ? 0.18 : 0.12
        const depth = normal.z === 0 ? 0.18 : 0.12
        const position = new Vector3(
            this.renderPosition.x + (normal.x * WALL_SURFACE_OFFSET),
            this.renderPosition.y + this.mountHeight,
            this.renderPosition.z + (normal.z * WALL_SURFACE_OFFSET),
        )
        const matrix = Matrix.Scaling(width, TORCH_BODY_HEIGHT, depth).multiply(Matrix.Translation(position.x, position.y, position.z))

        WorldRenderer.block1!.matrices.push(matrix)
        WorldRenderer.block1!.uvData.push(this.material)
        this.updateParticleEmitterPosition()
        this.registerLight()
    }
}
