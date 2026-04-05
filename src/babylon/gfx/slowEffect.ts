import { Color4, ParticleSystem, Texture, Vector3 } from '@babylonjs/core'
import { AnchoredEffect, CharacterEffect, MonsterEffect } from '@/babylon/gfx/characterEffect'
import { Renderer } from '@/babylon/scene/renderer'

export class SlowEffect extends AnchoredEffect implements CharacterEffect, MonsterEffect {
    private particles: ParticleSystem | null = null

    isFinished(): boolean {
        return false
    }

    protected ensureEffect(): void {
        if (this.particles || !Renderer.scene) {
            return
        }

        const emitter = this.getOrCreateEmitter(`slowEmitter_${this.target.id}`)
        if (!emitter) {
            return
        }

        const boxSize = Math.max(0.4, this.target.getBoxSize())
        const radius = Math.max(0.05, boxSize / 4)
        const height = 0.05
        const capacity = Math.max(10, Math.round(20 * boxSize))

        const particles = new ParticleSystem(`slowParticles_${this.target.id}`, capacity, Renderer.scene)
        particles.particleTexture = new Texture('images/gfx/flare.png', Renderer.scene)
        particles.emitter = emitter
        this.createBottomAnchoredDirectedCylinderEmitter(
            particles,
            radius,
            height,
            Vector3.Zero(),
            Vector3.Zero(),
        )
        particles.minLifeTime = 0.2
        particles.maxLifeTime = 0.2
        particles.emitRate = Math.max(36, Math.round(48 * boxSize))
        particles.blendMode = ParticleSystem.BLENDMODE_ADD
        particles.minEmitPower = 0
        particles.maxEmitPower = 0
        particles.minSize = 0.25
        particles.maxSize = 0.35
        particles.gravity = Vector3.Zero()
        particles.updateSpeed = 0.02
        particles.addColorGradient(0, new Color4(0.5, 0.2, 0.2, 0.85))
        particles.addColorGradient(0.7, new Color4(0.45, 0.1, 0.1, 0.65))
        particles.addColorGradient(1, new Color4(0.3, 0.05, 0.05, 0))
        particles.start()

        this.particles = particles
    }

    protected disposeParticleSystems() {
        this.particles?.stop()
        this.particles?.dispose()
        this.particles = null
    }

    protected stopParticleSystems(): void {
        this.particles?.stop()
    }

    protected getParticleFadeOutMs(): number {
        return 1500
    }
}
