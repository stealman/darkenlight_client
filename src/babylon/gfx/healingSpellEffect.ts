import {Color4, Constants, DynamicTexture, MeshBuilder, ParticleSystem, Scene, ShaderMaterial, Vector3} from '@babylonjs/core'
import {HealingSpell} from '@game/game/spells/healingSpell'
import {trackSpellGlowMesh, untrackSpellGlowMesh} from '@/babylon/gfx/spellGlowLayer'

const textures = new WeakMap<Scene, DynamicTexture>()
const starTextures = new WeakMap<Scene, DynamicTexture>()
const descentDuration = 650
const riseCastFraction = 0.82
const particleTailPadding = 20

function getSparkTexture(scene: Scene, star = false) {
    const cache = star ? starTextures : textures
    const existing = cache.get(scene)
    if (existing) return existing

    const texture = new DynamicTexture(star ? 'healingWandStar' : 'healingLightSpark', 64, scene, false)
    const context = texture.getContext()
    const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    glow.addColorStop(0, '#ffffff')
    glow.addColorStop(0.21, '#f7fff5')
    glow.addColorStop(0.48, star ? 'rgba(186,246,174,0.32)' : 'rgba(215,249,205,0.68)')
    glow.addColorStop(0.76, star ? 'rgba(171,239,158,0.08)' : 'rgba(196,242,180,0.23)')
    glow.addColorStop(1, 'rgba(196,242,180,0)')
    context.fillStyle = glow
    context.fillRect(0, 0, 64, 64)
    if (star) {
        context.fillStyle = '#f6fff3'
        context.beginPath()
        context.moveTo(32, 4)
        context.lineTo(36, 28)
        context.lineTo(55, 32)
        context.lineTo(36, 36)
        context.lineTo(32, 60)
        context.lineTo(28, 36)
        context.lineTo(9, 32)
        context.lineTo(28, 28)
        context.closePath()
        context.fill()
    }
    texture.hasAlpha = true
    texture.update()
    cache.set(scene, texture)
    return texture
}

function createWandStars(scene: Scene, previousWand: Vector3, wand: Vector3, speed: number) {
    const stars = new ParticleSystem('healingWandStars', 48, scene)
    stars.particleTexture = getSparkTexture(scene, true)
    stars.emitter = wand
    stars.blendMode = ParticleSystem.BLENDMODE_ADD
    stars.startPositionFunction = (_matrix, position) => {
        Vector3.LerpToRef(previousWand, wand, Math.random(), position)
        position.addInPlaceFromFloats(
            (Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.09,
        )
    }
    stars.direction1.set(-0.45, -0.15, -0.45)
    stars.direction2.set(0.45, 0.45, 0.45)
    stars.minEmitPower = 0.08
    stars.maxEmitPower = 0.28
    stars.minLifeTime = 0.20
    stars.maxLifeTime = 0.35
    stars.minSize = 0.075
    stars.maxSize = 0.17
    stars.minInitialRotation = -Math.PI / 2
    stars.maxInitialRotation = Math.PI / 2
    stars.minAngularSpeed = -3
    stars.maxAngularSpeed = 3
    stars.color1 = new Color4(0.89, 0.99, 0.84, 1)
    stars.color2 = new Color4(0.69, 0.96, 0.61, 0.97)
    stars.colorDead = new Color4(0.65, 0.94, 0.57, 0)
    stars.updateSpeed = speed / 60
    return stars
}

function createGroundSwirl(scene: Scene) {
    const material = new ShaderMaterial('healingGroundSwirl', scene, {
        vertexSource: `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            uniform mat4 worldViewProjection;
            uniform float elapsed;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vec2 offset = uv * 2.0 - 1.0;
                float wave = 0.055 * sin(offset.x * 4.5 + elapsed * 10.0)
                    + 0.025 * sin(offset.y * 5.5 - elapsed * 7.0);
                gl_Position = worldViewProjection * vec4(position + vec3(0.0, wave, 0.0), 1.0);
            }`,
        fragmentSource: `
            precision highp float;
            varying vec2 vUv;
            uniform float elapsed;
            uniform float opacity;
            void main() {
                vec2 offset = vUv * 2.0 - 1.0;
                float radius = length(offset);
                float angle = atan(offset.y, offset.x);
                float wave = 0.5 + 0.5 * cos(angle * 2.0 - radius * 9.0 + elapsed * 9.0);
                float glow = pow(wave, 4.0);
                float core = pow(wave, 18.0);
                float falloff = smoothstep(0.20, 0.43, radius) * (1.0 - smoothstep(0.66, 0.99, radius));
                float pulse = 0.78 + 0.22 * sin(angle * 2.0 - elapsed * 6.0 + radius * 7.0);
                vec3 light = mix(vec3(0.56, 0.96, 0.49), vec3(0.90, 0.99, 0.84), core);
                gl_FragColor = vec4(light, (0.29 * glow + 0.67 * core) * falloff * pulse * opacity);
            }`,
    }, {attributes: ['position', 'uv'], uniforms: ['worldViewProjection', 'elapsed', 'opacity'], needAlphaBlending: true})
    material.alphaMode = Constants.ALPHA_ADD
    material.disableDepthWrite = true
    material.setFloat('opacity', 0)
    const mesh = MeshBuilder.CreateGround('healingGroundSwirl', {width: 2.05, height: 2.05, subdivisions: 16}, scene)
    mesh.material = material
    mesh.isPickable = false
    mesh.alwaysSelectAsActiveMesh = true
    trackSpellGlowMesh(mesh)
    return {mesh, material}
}

export class HealingSpellEffect {
    private readonly particles: ParticleSystem
    private readonly wandStars: ParticleSystem | null
    private readonly groundSwirl: ReturnType<typeof createGroundSwirl> | null
    private readonly feet = Vector3.Zero()
    private readonly wand = Vector3.Zero()
    private readonly previousWand = Vector3.Zero()
    private readonly front = Vector3.Zero()
    private readonly startedAt = performance.now()
    private lastWandSampleAt: number | null = null
    private stoppedAt: number | null = null
    private radius = 0
    private angle = 0
    private readonly observer
    isDisposed = false

    constructor(private readonly scene: Scene, private readonly readPosition: (feet: Vector3, wand: Vector3) => void,
                private readonly kind: 'charge' | 'bloom', private readonly speed = 1) {
        const bloom = kind === 'bloom'
        const particles = this.particles = new ParticleSystem(bloom ? 'healingDescentSparks' : 'healingRiseSparks', 160, scene)
        particles.particleTexture = getSparkTexture(scene)
        particles.emitter = this.front
        particles.blendMode = ParticleSystem.BLENDMODE_ADD
        particles.startPositionFunction = (_matrix, position) => {
            // Offset the trailing sparks from the bright rotating front so it reads as a stream.
            const angle = this.angle + (Math.random() - 0.5) * 1.4 + (Math.random() < 0.25 ? Math.PI : 0)
            const radius = this.radius * (0.55 + Math.random() * 0.62)
            position.copyFrom(this.front).addInPlaceFromFloats(
                Math.cos(angle) * radius, (Math.random() - 0.5) * 0.21, Math.sin(angle) * radius,
            )
        }
        particles.direction1.set(-0.32, bloom ? -0.78 : 0.25, -0.32)
        particles.direction2.set(0.32, bloom ? -0.18 : 0.86, 0.32)
        particles.minEmitPower = 0.35
        particles.maxEmitPower = 0.7
        particles.minLifeTime = bloom ? 0.17 : 0.20
        particles.maxLifeTime = bloom ? 0.35 : 0.42
        particles.minSize = 0.055
        particles.maxSize = 0.22
        particles.minScaleY = 1.05
        particles.maxScaleY = 2.2
        particles.color1 = new Color4(0.95, 0.99, 0.93, 1)
        particles.color2 = new Color4(0.85, 0.97, 0.80, 1)
        particles.colorDead = new Color4(0.76, 0.95, 0.70, 0)
        particles.updateSpeed = speed / 60
        this.wandStars = bloom ? null : createWandStars(scene, this.previousWand, this.wand, speed)
        this.groundSwirl = bloom ? null : createGroundSwirl(scene)
        this.update()
        particles.start()
        this.wandStars?.start()
        this.observer = scene.onBeforeRenderObservable.add(() => this.update())
    }

    finishCharge() {
        this.stopEmission(performance.now())
    }

    dispose() {
        if (this.isDisposed) return
        this.isDisposed = true
        this.scene.onBeforeRenderObservable.remove(this.observer)
        this.particles.dispose(false)
        this.wandStars?.dispose(false)
        if (this.groundSwirl) {
            untrackSpellGlowMesh(this.groundSwirl.mesh)
            this.groundSwirl.mesh.dispose()
            this.groundSwirl.material.dispose()
        }
    }

    private stopEmission(now: number) {
        if (this.stoppedAt !== null) return
        this.stoppedAt = now
        this.particles.stop()
        this.wandStars?.stop()
    }

    private update() {
        const now = performance.now()
        if (this.stoppedAt !== null) {
            const tailElapsed = (now - this.stoppedAt) * this.speed
            this.groundSwirl?.material.setFloat('elapsed', (now - this.startedAt) * this.speed / 1000)
            this.groundSwirl?.material.setFloat('opacity', Math.max(0, 1 - tailElapsed / 150))
            const tailDuration = Math.max(this.particles.maxLifeTime, this.wandStars?.maxLifeTime ?? 0) * 1000
            if (tailElapsed >= tailDuration + particleTailPadding) this.dispose()
            return
        }

        const elapsed = (now - this.startedAt) * this.speed
        const bloom = this.kind === 'bloom'
        const progress = Math.min(1, elapsed / (bloom ? descentDuration : HealingSpell.castDuration))
        if (progress === 1) {
            this.stopEmission(now)
            return
        }
        this.previousWand.copyFrom(this.wand)
        this.readPosition(this.feet, this.wand)
        if (this.wandStars) {
            let distance = Vector3.Distance(this.previousWand, this.wand)
            if (this.lastWandSampleAt === null || distance > 1.6) {
                this.previousWand.copyFrom(this.wand)
                distance = 0
            }

            // A quick swing leaves a legible trail. A resting tip emits only a few stars.
            const sampleSeconds = Math.max(0.001, (elapsed - (this.lastWandSampleAt ?? elapsed)) / 1000)
            this.wandStars.emitRate = 22 + Math.min(74, distance * 14 / sampleSeconds)
            this.lastWandSampleAt = elapsed
        }
        this.angle = progress * (bloom ? -Math.PI * 3 : Math.PI * 4)
        if (bloom) {
            this.front.copyFrom(this.feet).addInPlaceFromFloats(0, 1.96 - 1.79 * progress, 0)
            this.radius = 0.37 + 0.16 * Math.sin(Math.PI * progress) + 0.47 * progress ** 6
            this.particles.emitRate = 260
        } else {
            const converge = progress ** 2.6
            if (this.groundSwirl) {
                const {mesh, material} = this.groundSwirl
                const scale = 1 - 0.4 * converge
                mesh.position.copyFrom(this.feet).addInPlaceFromFloats(0, 0.115, 0)
                mesh.scaling.set(scale, 1, scale)
                material.setFloat('elapsed', elapsed / 1000)
                material.setFloat('opacity', Math.min(1, elapsed / 90))
            }
            const riseProgress = Math.min(1, progress / riseCastFraction)
            this.front.set(
                this.feet.x + (this.wand.x - this.feet.x) * converge,
                this.feet.y + 0.11 + (this.wand.y - this.feet.y - 0.11) * riseProgress,
                this.feet.z + (this.wand.z - this.feet.z) * converge,
            )
            this.radius = 0.58 * (1 - converge) + 0.045
            this.particles.emitRate = 205 + 100 * progress
        }
    }
}
