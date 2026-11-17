<template>
    <div class="menu-atmosphere" aria-hidden="true"><canvas ref="canvas" /></div>
</template>

<script setup lang="ts">
import {onMounted, onUnmounted, ref} from 'vue'
import type {Particle} from '@babylonjs/core'
import {Camera, Color4, Engine, EngineStore, FreeCamera, ParticleSystem, Scene, Texture, Vector3} from '@babylonjs/core'

const canvas = ref<HTMLCanvasElement | null>(null)
let engine: Engine | null = null
let resize: (() => void) | null = null
onMounted(() => {
    // Keep default-scene constructors in the gameplay renderer on its own scene.
    const previousScene = EngineStore.LastCreatedScene
    try {
        engine = new Engine(canvas.value!, false, {alpha: true, stencil: false}, false)
        engine.setHardwareScalingLevel(1.5)
        const scene = new Scene(engine)
        scene.clearColor = new Color4(0, 0, 0, 0)
        const camera = new FreeCamera('menuSmokeCamera', new Vector3(0, 0, -5), scene)
        camera.setTarget(Vector3.Zero())
        camera.mode = Camera.ORTHOGRAPHIC_CAMERA
        camera.orthoTop = 3
        camera.orthoBottom = -3
        const smoke = new ParticleSystem('menuSmoke', 192, scene)
        smoke.particleTexture = new Texture('/images/gfx/dust.png', scene)
        smoke.emitter = Vector3.Zero()
        smoke.minEmitBox = new Vector3(-6, -4, -1.5)
        smoke.maxEmitBox = new Vector3(6, -3, 0)
        smoke.minLifeTime = 18
        smoke.maxLifeTime = 32
        smoke.emitRate = 5
        smoke.minInitialRotation = -Math.PI
        smoke.maxInitialRotation = Math.PI
        const motion = new WeakMap<Particle, {phase: number, rise: number, sway: number, spin: number}>()
        const updateParticles = smoke.updateFunction.bind(smoke)
        smoke.updateFunction = particles => {
            for (const particle of particles) {
                let drift = motion.get(particle)
                if (!drift || particle.age === 0) {
                    drift = {phase: Math.random() * Math.PI * 2, rise: 0.14 + Math.random() * 0.3,
                        sway: 0.08 + Math.random() * 0.12, spin: (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.07)}
                    motion.set(particle, drift)
                }
                const phase = particle.age * 0.45 + drift.phase
                particle.direction.x = Math.sin(phase) * drift.sway + Math.sin(phase * 0.47) * 0.05
                particle.direction.y = drift.rise + Math.cos(phase * 0.7) * 0.035
                particle.angularSpeed = drift.spin * (0.8 + Math.sin(phase * 0.6) * 0.3)
            }
            // Keep Babylon's lifetime, size and alpha gradients and particle recycling.
            updateParticles(particles)
        }
        smoke.updateSpeed = 0.012
        smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD
        smoke.addSizeGradient(0, 1.1, 1.4)
        smoke.addSizeGradient(0.5, 1.8, 2.2)
        smoke.addSizeGradient(1, 2.4, 2.9)
        smoke.addColorGradient(0, new Color4(0.6, 0.62, 0.65, 0))
        smoke.addColorGradient(0.12, new Color4(0.6, 0.62, 0.65, 0.14))
        smoke.addColorGradient(0.3, new Color4(0.6, 0.62, 0.65, 0.18))
        smoke.addColorGradient(0.6, new Color4(0.6, 0.62, 0.65, 0.1))
        smoke.addColorGradient(0.85, new Color4(0.6, 0.62, 0.65, 0.025))
        smoke.addColorGradient(1, new Color4(0.6, 0.62, 0.65, 0))
        smoke.preWarmCycles = 240
        smoke.preWarmStepOffset = 5
        resize = () => {
            engine?.resize()
            const halfWidth = 3 * canvas.value!.clientWidth / Math.max(1, canvas.value!.clientHeight)
            camera.orthoLeft = -halfWidth
            camera.orthoRight = halfWidth
            smoke.minEmitBox.x = -halfWidth - 1
            smoke.maxEmitBox.x = halfWidth + 1
        }
        resize()
        window.addEventListener('resize', resize)
        smoke.start()
        engine.runRenderLoop(() => scene.render())
    } catch (error) {
        if (resize) window.removeEventListener('resize', resize)
        engine?.dispose()
        engine = null
        console.warn('Could not initialize menu smoke', error)
    } finally { EngineStore._LastCreatedScene = previousScene }
})
onUnmounted(() => {
    if (resize) window.removeEventListener('resize', resize)
    engine?.dispose()
})
</script>

<style scoped>
.menu-atmosphere { position: fixed; inset: 0; z-index: 1999; overflow: hidden; isolation: isolate; pointer-events: none; background: rgb(var(--ui-menu-backdrop)); }
.menu-atmosphere::before { content: ''; position: absolute; inset: -8px; z-index: -1; background: url('/images/screen/splash1.jpg') center / cover no-repeat; filter: blur(1px); }
.menu-atmosphere canvas { display: block; width: 100%; height: 100%; }
</style>
