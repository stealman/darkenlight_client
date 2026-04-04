import { Color4, ParticleSystem, Texture, Vector3 } from '@babylonjs/core'
import { AnchoredEffect, CharacterEffect, EffectTarget } from '@/babylon/gfx/characterEffect'
import { Renderer } from '@/babylon/scene/renderer'

export class PotionConsumeEffect extends AnchoredEffect implements CharacterEffect {
    private startTime: number = 0
    private readonly durationMs: number = 1500
    private readonly emitDurationMs: number = 300
    private particleSystem: ParticleSystem | null = null
    private readonly effectId: string

    constructor(target: EffectTarget, positionOffset: Vector3 | null = null) {
        super(target, positionOffset)
        this.effectId = `${target.id}_${Date.now()}`
    }

    onStart(actualTime: number): void {
        this.startTime = actualTime
        super.onStart(actualTime)
    }

    isFinished(actualTime: number): boolean {
        return this.startTime > 0 && actualTime - this.startTime >= this.durationMs
    }

    protected ensureEffect(actualTime: number): void {
        if (this.particleSystem || !this.target.isEffectVisible() || !Renderer.scene) {
            return
        }

        const emitter = this.getOrCreateEmitter(`potionConsumeEmitter_${this.effectId}`)
        if (!emitter) {
            return
        }

        const particleSystem = new ParticleSystem(`potionConsume_${this.effectId}`, 200, Renderer.scene)
        particleSystem.particleTexture = new Texture('images/gfx/flare-rect.png', Renderer.scene)
        particleSystem.emitter = emitter

        particleSystem.createDirectedCylinderEmitter(0.6, 0.05, 0.9, new Vector3(0, 2, 0), new Vector3(0, 2, 0))

        particleSystem.addColorGradient(0, new Color4(0.35, 0.5, 0.55, 0.9))
        particleSystem.addColorGradient(0.5, new Color4(0.2, 0.3, 1, 0.45))
        particleSystem.addColorGradient(1, new Color4(0.1, 0.1, 0.2, 0))

        particleSystem.minSize = 0.075
        particleSystem.maxSize = 0.1
        particleSystem.minLifeTime = 0.05
        particleSystem.maxLifeTime = 0.75

        particleSystem.minEmitPower = 1
        particleSystem.maxEmitPower = 1.5
        particleSystem.gravity = new Vector3(0, 2, 0)

        particleSystem.emitRate = 300
        particleSystem.updateSpeed = 0.02
        particleSystem.blendMode = ParticleSystem.BLENDMODE_ONEONE
        particleSystem.start()

        this.particleSystem = particleSystem
    }

    protected afterEffectUpdate(actualTime: number): void {
        if (this.particleSystem && actualTime - this.startTime >= this.emitDurationMs) {
            this.particleSystem.emitRate = 0
        }
    }

    protected stopParticleSystems(): void {
        this.particleSystem?.stop()
    }

    protected disposeParticleSystems(): void {
        this.particleSystem?.stop()
        this.particleSystem?.dispose()
        this.particleSystem = null
    }

    protected getParticleFadeOutMs(): number {
        return 800
    }
}
