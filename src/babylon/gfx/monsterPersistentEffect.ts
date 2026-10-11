import { Color4, ParticleSystem, Texture, TransformNode, Vector3 } from '@babylonjs/core'
import { AnchoredEffect, EffectTarget, MonsterEffect } from '@/babylon/gfx/characterEffect'
import { MonsterPersistentEffectType, MonsterPersistentEffectTypes } from '@/babylon/gfx/monsterPersistentEffectTypes'
import { Renderer } from '@/babylon/scene/renderer'
import { Settings } from '@/settings/settings'

export class MonsterPersistentEffect extends AnchoredEffect implements MonsterEffect {
    private particleSystem: ParticleSystem | null = null

    constructor(
        target: EffectTarget,
        private readonly effectType: MonsterPersistentEffectType,
    ) {
        super(target)
    }

    isFinished(): boolean {
        return false
    }

    protected ensureEffect(): void {
        if (this.particleSystem || !Renderer.scene) {
            return
        }

        const emitter = this.getOrCreateEmitter(`monsterPersistentEmitter_${this.target.id}`)
        if (!emitter) {
            return
        }

        switch (this.effectType) {
            case MonsterPersistentEffectTypes.SPECTRAL_AURA:
                this.particleSystem = this.createSpectralAura(emitter)
                break
            case MonsterPersistentEffectTypes.WRAITH_LORD_DOWNWARD_SMOKE:
                this.particleSystem = this.createWraithLordDownwardSmoke(emitter)
                break
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
        return 1600
    }

    private createSpectralAura(emitter: TransformNode): ParticleSystem {
        const boxSize = Math.max(0.4, this.target.getBoxSize())
        const radius = boxSize * 0.55
        const height = Math.max(1, this.target.getModelHeight() * 0.75)
        const detailMultiplier = Settings.isDetalLevelHigh() ? 1 : 0.55
        const particles = new ParticleSystem(`monsterSpectralAura_${this.target.id}`, Math.max(30, Math.round(90 * boxSize * detailMultiplier)), Renderer.scene)

        particles.particleTexture = new Texture('images/gfx/flare.png', Renderer.scene)
        // Babylon accepts TransformNode emitters at runtime, although the v7
        // public type only declares AbstractMesh | Vector3 here.
        particles.emitter = emitter as unknown as Vector3
        this.createBottomAnchoredDirectedCylinderEmitter(particles, radius, height, new Vector3(-0.08, 0.15, -0.08), new Vector3(0.08, 0.35, 0.08))
        particles.minLifeTime = 0.8
        particles.maxLifeTime = 1.6
        particles.emitRate = Math.max(10, Math.round(28 * boxSize * detailMultiplier))
        particles.blendMode = ParticleSystem.BLENDMODE_ADD
        particles.minEmitPower = 0.05
        particles.maxEmitPower = 0.15
        particles.minSize = 0.06
        particles.maxSize = 0.16
        particles.gravity = new Vector3(0, 0.12, 0)
        particles.updateSpeed = 0.02
        particles.addColorGradient(0, new Color4(0.18, 0.45, 0.85, 0))
        particles.addColorGradient(0.2, new Color4(0.35, 0.75, 1, 0.65))
        particles.addColorGradient(0.7, new Color4(0.42, 0.2, 0.9, 0.4))
        particles.addColorGradient(1, new Color4(0.12, 0.03, 0.3, 0))
        particles.start()
        return particles
    }

    private createWraithLordDownwardSmoke(emitter: TransformNode): ParticleSystem {
        const boxSize = Math.max(0.4, this.target.getBoxSize())
        const detailMultiplier = Settings.isDetalLevelHigh() ? 1 : 0.6
        const anchorScaleY = this.target.getEffectAnchorNode()?.absoluteScaling.y ?? 1

        // Keep the emission point 0.8 world units above the ground even though
        // the monster template itself is scaled.
        emitter.position.y = anchorScaleY !== 0 ? 0.8 / anchorScaleY : 0.8

        const particles = new ParticleSystem(`wraithLordDownwardSmoke_${this.target.id}`, Math.max(40, Math.round(120 * boxSize * detailMultiplier)), Renderer.scene)

        particles.particleTexture = new Texture('images/gfx/flare-rect.png', Renderer.scene)
        // Babylon accepts TransformNode emitters at runtime, although the v7
        // public type only declares AbstractMesh | Vector3 here.
        particles.emitter = emitter as unknown as Vector3
        particles.createDirectedCylinderEmitter(boxSize * 0.38, 0.12, 1, new Vector3(-0.12, -0.75, -0.12), new Vector3(0.12, -1.15, 0.12))
        particles.minLifeTime = 0.45
        particles.maxLifeTime = 0.8
        particles.emitRate = Math.max(22, Math.round(65 * boxSize * detailMultiplier))
        particles.blendMode = ParticleSystem.BLENDMODE_STANDARD
        particles.minEmitPower = 0.25
        particles.maxEmitPower = 0.5
        particles.minSize = 0.18
        particles.maxSize = 0.34
        particles.minAngularSpeed = -0.6
        particles.maxAngularSpeed = 0.6
        particles.gravity = new Vector3(0, -0.7, 0)
        particles.updateSpeed = 0.02
        particles.addColorGradient(0, new Color4(0.7, 0.92, 1, 0))
        particles.addColorGradient(0.12, new Color4(0.58, 0.86, 1, 0.55))
        particles.addColorGradient(0.55, new Color4(0.38, 0.68, 0.95, 0.3))
        particles.addColorGradient(1, new Color4(0.2, 0.45, 0.8, 0))
        particles.start()
        return particles
    }
}
