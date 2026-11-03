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

    constructor(target: EffectTarget, attackerPosition: Vector3, private readonly style: 'sparks' | 'silverSmoke' = 'sparks',
                private readonly powerStrike: boolean = false) {
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
        const smoke = this.style === 'silverSmoke'
        const smokeSpeedMultiplier = this.powerStrike ? 1.3 : 1
        particles.particleTexture = new Texture(smoke ? 'images/gfx/dust.png' : 'images/gfx/flare-star.png', Renderer.scene)
        particles.emitter = emitter
        particles.minEmitBox = new Vector3(-0.12, -0.18, -0.12)
        particles.maxEmitBox = new Vector3(0.12, 0.18, 0.12)
        const directionSpread = smoke ? 0.65 : 0.45
        particles.direction1 = new Vector3(this.direction.x - directionSpread, smoke ? -0.3 : -1.2, this.direction.z - directionSpread)
        particles.direction2 = new Vector3(this.direction.x + directionSpread, smoke ? 0.25 : -0.15, this.direction.z + directionSpread)
        particles.minEmitPower = smoke ? 1.4 * smokeSpeedMultiplier : 3.25
        particles.maxEmitPower = smoke ? 2.1 * smokeSpeedMultiplier : 4.5
        particles.minLifeTime = smoke ? 0.5 : 0.2
        particles.maxLifeTime = smoke ? 0.8125 : 0.36
        particles.minSize = smoke ? 0.528 : 0.08
        particles.maxSize = smoke ? 0.858 : 0.16
        particles.gravity = new Vector3(0, smoke ? 0 : -5, 0)
        particles.updateSpeed = 0.02
        particles.blendMode = smoke ? ParticleSystem.BLENDMODE_STANDARD : ParticleSystem.BLENDMODE_ONEONE
        if (smoke) {
            particles.addVelocityGradient(0, 1)
            particles.addVelocityGradient(0.5, 0.55)
            particles.addVelocityGradient(1, 0.15)
            particles.minInitialRotation = 0
            particles.maxInitialRotation = Math.PI * 2
            particles.minAngularSpeed = -2
            particles.maxAngularSpeed = 2
            particles.addColorGradient(0, new Color4(0.3775, 0.3675, 0.4125, 0.4))
            particles.addColorGradient(0.35, new Color4(0.4775, 0.4675, 0.5175, 0.3))
            particles.addColorGradient(0.75, new Color4(0.6125, 0.6025, 0.6575, 0.16))
            particles.addColorGradient(1, new Color4(0.6725, 0.6625, 0.7175, 0))
        } else {
            particles.addColorGradient(0, new Color4(1, 0.95, 0.65, 0.9))
            particles.addColorGradient(0.45, new Color4(1, 0.45, 0.1, 0.6))
            particles.addColorGradient(1, new Color4(0.35, 0.05, 0.01, 0))
        }
        particles.manualEmitCount = smoke ? (this.powerStrike ? Math.round(16 * 1.3) : 16) : 20
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
        return this.startTime > 0 && actualTime - this.startTime >= (this.style === 'silverSmoke' ? 950 : 450)
    }
}

export class PowerStrikeSparkFountainEffect implements CharacterEffect, MonsterEffect {
    target: EffectTarget
    positionOffset: Vector3 = Vector3.Zero()

    private startTime: number = 0
    private particleSystem: ParticleSystem | null = null
    private emitter: TransformNode | null = null

    constructor(target: EffectTarget) {
        this.target = target
    }

    onStart(actualTime: number): void {
        this.startTime = actualTime
        if (!this.target.isEffectVisible(true) || !Renderer.scene) {
            return
        }

        const emitter = new TransformNode(`powerStrikeSparkFountainEmitter_${this.target.id}_${actualTime}`, Renderer.scene)
        emitter.position.copyFrom(this.target.pos)
        emitter.position.y += this.target.getModelHeight() * 0.45

        const particles = new ParticleSystem(`powerStrikeSparkFountain_${this.target.id}_${actualTime}`, 32, Renderer.scene)
        particles.particleTexture = new Texture('images/gfx/flare-star.png', Renderer.scene)
        particles.emitter = emitter
        particles.minEmitBox = new Vector3(-0.08, -0.08, -0.08)
        particles.maxEmitBox = new Vector3(0.08, 0.08, 0.08)
        particles.direction1 = new Vector3(-0.55, 1, -0.55)
        particles.direction2 = new Vector3(0.55, 1.35, 0.55)
        particles.minEmitPower = 2.8
        particles.maxEmitPower = 4.2
        particles.minLifeTime = 0.75
        particles.maxLifeTime = 1.15
        particles.minSize = 0.075
        particles.maxSize = 0.16
        particles.gravity = new Vector3(0, -8, 0)
        particles.updateSpeed = 0.02
        particles.blendMode = ParticleSystem.BLENDMODE_ONEONE
        particles.addColorGradient(0, new Color4(1, 1, 0.78, 1))
        particles.addColorGradient(0.45, new Color4(1, 0.58, 0.12, 0.8))
        particles.addColorGradient(0.8, new Color4(0.9, 0.2, 0.03, 0.45))
        particles.addColorGradient(1, new Color4(0.25, 0.02, 0.01, 0))
        particles.manualEmitCount = 28
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
        return this.startTime > 0 && actualTime - this.startTime >= 1250
    }
}
