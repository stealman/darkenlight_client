import { Color4, ParticleSystem, Texture, TransformNode, Vector3 } from '@babylonjs/core'
import { CharacterEffect, EffectTarget, MonsterEffect } from '@/babylon/gfx/characterEffect'
import { Renderer } from '@/babylon/scene/renderer'

export class HitSparkEffect implements CharacterEffect, MonsterEffect {
    target: EffectTarget
    positionOffset: Vector3 = Vector3.Zero()

    private readonly direction: Vector3
    private startTime: number = 0
    private particleSystem: ParticleSystem | null = null
    private emitter: TransformNode | null = null

    constructor(target: EffectTarget, attackerPosition: Vector3) {
        this.target = target
        this.direction = target.pos.subtract(attackerPosition)
        this.direction.y = 0
        if (this.direction.lengthSquared() < 0.001) {
            this.direction.set(1, 0, 0)
        } else {
            this.direction.normalize()
        }
    }

    onStart(actualTime: number): void {
        this.startTime = actualTime
        if (!this.target.isEffectVisible(true) || !Renderer.scene) {
            return
        }

        const emitter = new TransformNode(`hitSparkEmitter_${this.target.id}_${actualTime}`, Renderer.scene)
        emitter.position.copyFrom(this.target.pos)
        emitter.position.y += this.target.getModelHeight() * 0.45

        const particles = new ParticleSystem(`hitSparks_${this.target.id}_${actualTime}`, 22, Renderer.scene)
        particles.particleTexture = new Texture('images/gfx/flare-star.png', Renderer.scene)
        particles.emitter = emitter
        particles.minEmitBox = new Vector3(-0.12, -0.18, -0.12)
        particles.maxEmitBox = new Vector3(0.12, 0.18, 0.12)
        particles.direction1 = new Vector3(this.direction.x - 0.45, -1.2, this.direction.z - 0.45)
        particles.direction2 = new Vector3(this.direction.x + 0.45, -0.15, this.direction.z + 0.45)
        particles.minEmitPower = 3.25
        particles.maxEmitPower = 4.5
        particles.minLifeTime = 0.2
        particles.maxLifeTime = 0.36
        particles.minSize = 0.08
        particles.maxSize = 0.16
        particles.gravity = new Vector3(0, -5, 0)
        particles.updateSpeed = 0.02
        particles.blendMode = ParticleSystem.BLENDMODE_ONEONE
        particles.addColorGradient(0, new Color4(1, 0.95, 0.65, 0.9))
        particles.addColorGradient(0.45, new Color4(1, 0.45, 0.1, 0.6))
        particles.addColorGradient(1, new Color4(0.35, 0.05, 0.01, 0))
        particles.manualEmitCount = 20
        particles.disposeOnStop = true
        particles.onDisposeObservable.addOnce(() => {
            emitter.dispose()
            if (this.particleSystem === particles) {
                this.particleSystem = null
                this.emitter = null
            }
        })
        particles.start()

        this.emitter = emitter
        this.particleSystem = particles
    }

    onUpdate(): void {
    }

    onEnd(): void {
        this.particleSystem?.stop()
        if (!this.particleSystem) {
            this.emitter?.dispose()
            this.emitter = null
        }
    }

    isFinished(actualTime: number): boolean {
        return this.startTime > 0 && actualTime - this.startTime >= 450
    }
}
