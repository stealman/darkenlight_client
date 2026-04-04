import { Color4, ParticleSystem, Texture, Vector3 } from '@babylonjs/core'
import { AnchoredEffect, CharacterEffect, MonsterEffect } from '@/babylon/gfx/characterEffect'
import { Renderer } from '@/babylon/scene/renderer'
import { Settings } from '@/settings/settings'

export class BurningEffect extends AnchoredEffect implements CharacterEffect, MonsterEffect {
    private fireParticles: ParticleSystem | null = null
    private smokeParticles: ParticleSystem | null = null

    isFinished(): boolean {
        return false
    }

    protected ensureEffect(): void {
        const shouldUseSmoke = Settings.isDetalLevelHigh()
        if (!Renderer.scene) {
            return
        }

        if (!shouldUseSmoke && this.smokeParticles) {
            this.smokeParticles.stop()
            this.smokeParticles.dispose()
            this.smokeParticles = null
        }

        const emitter = this.getOrCreateEmitter(`burningEmitter_${this.target.id}`)
        if (!emitter) {
            return
        }

        const boxSize = Math.max(0.4, this.target.getBoxSize())
        const halfBox = boxSize * 0.4
        const fireHeight = this.target.getModelHeight() * 0.5
        const smokeHeight = this.target.getModelHeight() * 0.75
        const fireCapacity = Math.max(100, Math.round(160 * boxSize))
        const smokeCapacity = Math.max(40, Math.round(70 * boxSize))

        if (this.fireParticles && (!shouldUseSmoke || this.smokeParticles)) {
            return
        }

        if (!this.fireParticles) {
            const fireParticles = new ParticleSystem(`burningFire_${this.target.id}`, fireCapacity, Renderer.scene)
            fireParticles.particleTexture = new Texture('images/gfx/flare.png', Renderer.scene)
            fireParticles.emitter = emitter
            this.createBottomAnchoredDirectedCylinderEmitter(
                fireParticles,
                halfBox,
                fireHeight,
                new Vector3(-1, 1, -1),
                new Vector3(1, 1, 1),
            )
            fireParticles.minLifeTime = 0.3
            fireParticles.maxLifeTime = 0.4
            fireParticles.emitRate = 200
            fireParticles.blendMode = ParticleSystem.BLENDMODE_ONEONE
            fireParticles.minEmitPower = 0.4
            fireParticles.maxEmitPower = 0.6
            fireParticles.minSize = 0.15
            fireParticles.maxSize = 0.2
            fireParticles.gravity = new Vector3(0, 0.75, 0)
            fireParticles.updateSpeed = 0.02
            fireParticles.addColorGradient(0, new Color4(1, 0.85, 0.55, 0.95))
            fireParticles.addColorGradient(0.45, new Color4(1, 0.4, 0.1, 0.8))
            fireParticles.addColorGradient(1, new Color4(0.15, 0.05, 0.01, 0))
            fireParticles.start()
            this.fireParticles = fireParticles
        }

        if (!shouldUseSmoke) {
            return
        }

        if (!this.smokeParticles) {
            const smokeParticles = new ParticleSystem(`burningSmoke_${this.target.id}`, smokeCapacity, Renderer.scene)
            smokeParticles.particleTexture = new Texture('images/gfx/flare-rect.png', Renderer.scene)
            smokeParticles.emitter = emitter
            this.createBottomAnchoredDirectedCylinderEmitter(
                smokeParticles,
                halfBox,
                smokeHeight,
                new Vector3(-halfBox, 0.5, -halfBox),
                new Vector3(halfBox, 1, halfBox),
            )
            smokeParticles.minLifeTime = 1
            smokeParticles.maxLifeTime = 2
            smokeParticles.emitRate = Math.max(16, Math.round(18 * boxSize))
            smokeParticles.blendMode = ParticleSystem.BLENDMODE_STANDARD
            smokeParticles.minEmitPower = 0.5
            smokeParticles.maxEmitPower = 0.75
            smokeParticles.minSize = 0.6
            smokeParticles.maxSize = 0.8
            smokeParticles.gravity = new Vector3(0, 0.25, 0)
            smokeParticles.updateSpeed = 0.02
            smokeParticles.addColorGradient(0, new Color4(0.35, 0.35, 0.35, 0))
            smokeParticles.addColorGradient(0.1, new Color4(0.48, 0.48, 0.48, 0.16))
            smokeParticles.addColorGradient(0.65, new Color4(0.42, 0.42, 0.42, 0.1))
            smokeParticles.addColorGradient(1, new Color4(0.5, 0.5, 0.5, 0))
            smokeParticles.start()
            this.smokeParticles = smokeParticles
        }
    }

    protected disposeParticleSystems() {
        this.fireParticles?.stop()
        this.fireParticles?.dispose()
        this.fireParticles = null

        this.smokeParticles?.stop()
        this.smokeParticles?.dispose()
        this.smokeParticles = null
    }

    protected stopParticleSystems(): void {
        this.fireParticles?.stop()
        this.smokeParticles?.stop()
    }

    protected getParticleFadeOutMs(): number {
        return 1300
    }
}
