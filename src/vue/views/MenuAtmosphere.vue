<template>
    <div class="menu-atmosphere" aria-hidden="true"><canvas ref="canvas" /></div>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch} from 'vue'
import type {Particle} from '@babylonjs/core'
import {Camera, Color4, Engine, EngineStore, FreeCamera, GPUParticleSystem, ParticleSystem, Scene, Texture, Vector3} from '@babylonjs/core'
import {AudioManager} from '@/babylon/audio/audioManager'

const canvas = ref<HTMLCanvasElement | null>(null)
const props = defineProps<{musicActive: boolean}>()
watch(() => props.musicActive, active => AudioManager.setMenuMusicActive(active))
let engine: Engine | null = null
let resize: (() => void) | null = null
const unlockMenuAudio = () => {
    Engine.audioEngine?.unlock()
    AudioManager.setMenuAudioActive(true, props.musicActive)
}
onMounted(() => {
    AudioManager.setMenuAudioActive(true, props.musicActive)
    window.addEventListener('pointerdown', unlockMenuAudio)
    window.addEventListener('keydown', unlockMenuAudio)
    // Keep default-scene constructors in the gameplay renderer on its own scene.
    const previousScene = EngineStore.LastCreatedScene
    try {
        engine = new Engine(canvas.value!, false, {alpha: true, stencil: false, loseContextOnDispose: true}, false)
        engine.setHardwareScalingLevel(1.5)
        const scene = new Scene(engine)
        AudioManager.initializeMenuMusic(scene)
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
        const sparks = GPUParticleSystem.IsSupported
            ? new GPUParticleSystem('menuSparks', {capacity: 1200}, scene)
            : new ParticleSystem('menuSparks', 1200, scene)
        sparks.particleTexture = new Texture('/images/gfx/flare.png', scene)
        sparks.emitter = Vector3.Zero()
        sparks.minEmitBox = new Vector3(-6, -3.6, -0.5)
        sparks.maxEmitBox = new Vector3(6, -3.1, 0)
        sparks.direction1 = new Vector3(-0.22, 0.65, 0)
        sparks.direction2 = new Vector3(0.3, 1.2, 0)
        sparks.minEmitPower = 0.6
        sparks.maxEmitPower = 1.1
        sparks.gravity = new Vector3(0.025, 0.025, 0)
        sparks.minLifeTime = 3
        sparks.maxLifeTime = 7
        sparks.minSize = 0.015
        sparks.maxSize = 0.035
        sparks.emitRate = 100
        sparks.updateSpeed = 0.016
        sparks.blendMode = ParticleSystem.BLENDMODE_ADD
        sparks.addColorGradient(0, new Color4(1, 0.65, 0.2, 0))
        sparks.addColorGradient(0.08, new Color4(1, 0.55, 0.12, 0.85))
        sparks.addColorGradient(0.45, new Color4(1, 0.32, 0.05, 0.65))
        sparks.addColorGradient(1, new Color4(0.6, 0.12, 0.02, 0))
        sparks.preWarmCycles = 100
        sparks.preWarmStepOffset = 3
        resize = () => {
            engine?.resize()
            const halfWidth = 3 * canvas.value!.clientWidth / Math.max(1, canvas.value!.clientHeight)
            camera.orthoLeft = -halfWidth
            camera.orthoRight = halfWidth
            smoke.minEmitBox.x = -halfWidth - 1
            smoke.maxEmitBox.x = halfWidth + 1
            sparks.minEmitBox.x = -halfWidth - 0.3
            sparks.maxEmitBox.x = halfWidth + 0.3
        }
        resize()
        window.addEventListener('resize', resize)
        smoke.start()
        sparks.start()
        engine.runRenderLoop(() => scene.render())
    } catch (error) {
        if (resize) window.removeEventListener('resize', resize)
        engine?.dispose()
        engine = null
        console.warn('Could not initialize menu smoke', error)
    } finally { EngineStore._LastCreatedScene = previousScene }
})
onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', unlockMenuAudio)
    window.removeEventListener('keydown', unlockMenuAudio)
    AudioManager.setMenuAudioActive(false)
    if (resize) window.removeEventListener('resize', resize)
    engine?.stopRenderLoop()
    // Let the music finish fading even if gameplay loads in less than 1.5 seconds.
    const menuEngine = engine
    window.setTimeout(() => menuEngine?.dispose(), 1500)
    engine = null
    resize = null
})
</script>

<style scoped>
.menu-atmosphere { position: fixed; inset: 0; z-index: 1999; overflow: hidden; isolation: isolate; pointer-events: none; background: rgb(var(--ui-menu-backdrop)); }
.menu-atmosphere::before { content: ''; position: absolute; inset: -8px; z-index: -1; background: url('/images/screen/splash1.jpg') center / cover no-repeat; filter: blur(1px); }
.menu-atmosphere canvas { display: block; width: 100%; height: 100%; }
</style>
