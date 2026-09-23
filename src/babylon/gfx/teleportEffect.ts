import {Color4, ParticleSystem, Texture, TransformNode, Vector3} from '@babylonjs/core'
import {Renderer} from '@/babylon/scene/renderer'
import {Settings} from '@/settings/settings'

export const TeleportEffect = {
    create(x: number, y: number, z: number) {
        if (!Renderer.scene) {
            return
        }

        const emitter = new TransformNode(`teleportPuffEmitter_${Date.now()}`, Renderer.scene)
        emitter.position.set(x, y + 0.1, z)

        const particles = new ParticleSystem(`teleportPuff_${Date.now()}`, Math.max(28, Settings.detailLevel.level * 50), Renderer.scene)
        particles.particleTexture = new Texture('images/gfx/dust.png', Renderer.scene)
        particles.emitter = emitter
        particles.minEmitBox = new Vector3(-0.4, 0, -0.4)
        particles.maxEmitBox = new Vector3(0.4, 0.75, 0.4)
        particles.direction1 = new Vector3(-0.4, 0.45, -0.4)
        particles.direction2 = new Vector3(0.4, 1.1, 0.4)
        particles.minEmitPower = 0.15
        particles.maxEmitPower = 0.3
        particles.minLifeTime = 0.65
        particles.maxLifeTime = 1.1
        particles.minSize = 0.4
        particles.maxSize = 0.65
        particles.minAngularSpeed = -0.3
        particles.maxAngularSpeed = 0.3
        particles.gravity = new Vector3(0, 0.2, 0)
        particles.updateSpeed = 0.01
        particles.blendMode = ParticleSystem.BLENDMODE_STANDARD
        particles.addColorGradient(0, new Color4(0.72, 0.72, 0.72, 0))
        particles.addColorGradient(0.2, new Color4(0.86, 0.86, 0.86, 0.45))
        particles.addColorGradient(0.7, new Color4(0.72, 0.72, 0.72, 0.16))
        particles.addColorGradient(1, new Color4(0.58, 0.58, 0.58, 0))
        particles.emitRate = 0
        particles.manualEmitCount = Math.max(24, Settings.detailLevel.level * 40)
        particles.disposeOnStop = true
        particles.onDisposeObservable.addOnce(() => emitter.dispose())
        particles.start()
    }
}
