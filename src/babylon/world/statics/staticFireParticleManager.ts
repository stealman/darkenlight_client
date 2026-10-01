import {
    Color4,
    CustomParticleEmitter,
    GPUParticleSystem,
    ParticleSystem,
    Scene,
    ShaderStore,
    Texture,
    Vector3,
} from '@babylonjs/core'
import '@babylonjs/core/Shaders/gpuUpdateParticles.vertex.js'
import '@babylonjs/core/ShadersWGSL/gpuUpdateParticles.compute.js'
import {
    STATIC_FIRE_SMOKE_PARTICLE_FACTORS,
    USE_SHARED_GPU_STATIC_FIRE_PARTICLES,
} from '@/babylon/scene/lighting/lightConfig'
import { Settings } from '@/settings/settings'

export type StaticFireParticleProfile = 'fireplaceSmall' | 'fireplaceLarge' | 'wallTorch'

export interface StaticFireParticleSource {
    profile: StaticFireParticleProfile
    x: number
    y: number
    z: number
    fireHalfWidth: number
    fireHalfDepth: number
    fireMaxY: number
    smokeHalfWidth: number
    smokeHalfDepth: number
    smokeMinY: number
    smokeMaxY: number
}

interface StaticFireParticleProfileConfig {
    fireCapacity: number
    fireEmitRate: number
    fireMinSize: number
    fireMaxSize: number
    fireDirectionX: number
    fireMinDirectionY: number
    fireMaxDirectionY: number
    fireMinPower: number
    fireMaxPower: number
    fireGravity: number
    smokeCapacity: number
    smokeEmitRate: number
    smokeMinSize: number
    smokeMaxSize: number
    smokeDirectionX: number
    smokeMinDirectionY: number
    smokeMaxDirectionY: number
    smokeMinPower: number
    smokeMaxPower: number
    smokeGravity: number
    smokePeakAlpha: number
    smokeLateAlpha: number
}

interface StaticFireProfileSystems {
    sourceKey: string
    fire: GPUParticleSystem
    smoke: GPUParticleSystem
}

interface RetiringParticleSystem {
    system: GPUParticleSystem
    timeout: ReturnType<typeof setTimeout>
}

const PROFILES: StaticFireParticleProfile[] = ['fireplaceSmall', 'fireplaceLarge', 'wallTorch']
const SHARED_SYSTEM_NAME_PREFIX = 'sharedStatic'
const PARTICLE_BASELINE_FPS = 60
const RETIRING_SYSTEM_GRACE_MS = 100
const PROFILE_CONFIGS: Record<StaticFireParticleProfile, StaticFireParticleProfileConfig> = {
    fireplaceSmall: {
        fireCapacity: 150,
        fireEmitRate: 150,
        fireMinSize: 0.15,
        fireMaxSize: 0.2,
        fireDirectionX: 0.12,
        fireMinDirectionY: 0.9,
        fireMaxDirectionY: 1.4,
        fireMinPower: 0.5,
        fireMaxPower: 0.75,
        fireGravity: 0.6,
        smokeCapacity: 80,
        smokeEmitRate: 20,
        smokeMinSize: 0.75,
        smokeMaxSize: 1,
        smokeDirectionX: 1,
        smokeMinDirectionY: 0.45,
        smokeMaxDirectionY: 0.7,
        smokeMinPower: 0.15,
        smokeMaxPower: 0.3,
        smokeGravity: 0.22,
        smokePeakAlpha: 0.05,
        smokeLateAlpha: 0.015,
    },
    fireplaceLarge: {
        fireCapacity: 300,
        fireEmitRate: 300,
        fireMinSize: 0.225,
        fireMaxSize: 0.3,
        fireDirectionX: 0.24,
        fireMinDirectionY: 1.8,
        fireMaxDirectionY: 2.8,
        fireMinPower: 0.75,
        fireMaxPower: 1.125,
        fireGravity: 0.9,
        smokeCapacity: 160,
        smokeEmitRate: 40,
        smokeMinSize: 1.125,
        smokeMaxSize: 1.5,
        smokeDirectionX: 2,
        smokeMinDirectionY: 0.675,
        smokeMaxDirectionY: 1.05,
        smokeMinPower: 0.225,
        smokeMaxPower: 0.45,
        smokeGravity: 0.33,
        smokePeakAlpha: 0.05,
        smokeLateAlpha: 0.015,
    },
    wallTorch: {
        fireCapacity: 75,
        fireEmitRate: 75,
        fireMinSize: 0.1,
        fireMaxSize: 0.15,
        fireDirectionX: 0.08,
        fireMinDirectionY: 0.9,
        fireMaxDirectionY: 1.4,
        fireMinPower: 0.5,
        fireMaxPower: 0.75,
        fireGravity: 0.6,
        smokeCapacity: 50,
        smokeEmitRate: 12,
        smokeMinSize: 0.35,
        smokeMaxSize: 0.5,
        smokeDirectionX: 0.8,
        smokeMinDirectionY: 0.35,
        smokeMaxDirectionY: 0.55,
        smokeMinPower: 0.12,
        smokeMaxPower: 0.22,
        smokeGravity: 0.15,
        smokePeakAlpha: 0.08,
        smokeLateAlpha: 0.03,
    },
}

const STATIC_FIRE_BALLISTIC_DEFINE = '#define STATIC_FIRE_BALLISTIC_EMITTER'
let ballisticShaderInstalled: boolean | null = null

class StaticFireBallisticEmitter extends CustomParticleEmitter {
    getEffectDefines(): string {
        return `${super.getEffectDefines()}\n${STATIC_FIRE_BALLISTIC_DEFINE}`
    }
}

function installBallisticEmitterShader(): boolean {
    if (ballisticShaderInstalled != null) {
        return ballisticShaderInstalled
    }

    const glslName = 'gpuUpdateParticlesVertexShader'
    const glslShader = ShaderStore.ShadersStore[glslName]
    const glslPositionSource = '#if defined(CUSTOMEMITTER)\noutPosition=position+(direction-position)*ageGradient; \noutInitialPosition=initialPosition;\n#else'
    const glslPositionReplacement = `#if defined(CUSTOMEMITTER)\n#ifdef STATIC_FIRE_BALLISTIC_EMITTER\nif(newAge>=life&&stopFactor==0.) {outPosition=vec3(0.,-10000.,0.);} else {outPosition=initialPosition+(direction*newAge)+(gravity*(0.5*newAge*newAge));}\n#else\noutPosition=position+(direction-position)*ageGradient;\n#endif\noutInitialPosition=initialPosition;\n#else`
    const patchedGlsl = glslShader?.replace(glslPositionSource, glslPositionReplacement)

    const wgslName = 'gpuUpdateParticlesComputeShader'
    const wgslShader = ShaderStore.ShadersStoreWGSL[wgslName]
    const wgslPositionSource = '#if defined(CUSTOMEMITTER)\nparticlesOut.particles[index].position=position+(direction-position)*ageGradient; \nparticlesOut.particles[index].initialPosition=particlesIn.particles[index].initialPosition;\n#else'
    const wgslPositionReplacement = `#if defined(CUSTOMEMITTER)\n#ifdef STATIC_FIRE_BALLISTIC_EMITTER\nif(newAge>=life&&params.stopFactor==0.) {particlesOut.particles[index].position=vec3<f32>(0.,-10000.,0.);} else {particlesOut.particles[index].position=particlesIn.particles[index].initialPosition+(direction*newAge)+(params.gravity*(0.5*newAge*newAge));}\n#else\nparticlesOut.particles[index].position=position+(direction-position)*ageGradient;\n#endif\nparticlesOut.particles[index].initialPosition=particlesIn.particles[index].initialPosition;\n#else`
    const patchedWgsl = wgslShader?.replace(wgslPositionSource, wgslPositionReplacement)

    const glslReady = glslShader?.includes('STATIC_FIRE_BALLISTIC_EMITTER') === true
        || (patchedGlsl != null && patchedGlsl !== glslShader)
    const wgslReady = wgslShader == null
        || wgslShader.includes('STATIC_FIRE_BALLISTIC_EMITTER')
        || (patchedWgsl != null && patchedWgsl !== wgslShader)
    if (glslReady) {
        ShaderStore.ShadersStore[glslName] = patchedGlsl
    }
    if (wgslShader != null && patchedWgsl != null && patchedWgsl !== wgslShader) {
        ShaderStore.ShadersStoreWGSL[wgslName] = patchedWgsl
    }

    ballisticShaderInstalled = glslReady && wgslReady
    return ballisticShaderInstalled
}

function deterministicRandom(index: number, salt: number): number {
    const value = Math.sin((index + 1) * (12.9898 + (salt * 3.173))) * 43758.5453123
    return value - Math.floor(value)
}

function sourcesEqual(a: StaticFireParticleSource, b: StaticFireParticleSource): boolean {
    return a.profile === b.profile
        && a.x === b.x
        && a.y === b.y
        && a.z === b.z
        && a.fireHalfWidth === b.fireHalfWidth
        && a.fireHalfDepth === b.fireHalfDepth
        && a.fireMaxY === b.fireMaxY
        && a.smokeHalfWidth === b.smokeHalfWidth
        && a.smokeHalfDepth === b.smokeHalfDepth
        && a.smokeMinY === b.smokeMinY
        && a.smokeMaxY === b.smokeMaxY
}

function setParticleStartPosition(source: StaticFireParticleSource, index: number, smoke: boolean, target: Vector3) {
    const halfWidth = smoke ? source.smokeHalfWidth : source.fireHalfWidth
    const halfDepth = smoke ? source.smokeHalfDepth : source.fireHalfDepth
    const minY = smoke ? source.smokeMinY : 0
    const maxY = smoke ? source.smokeMaxY : source.fireMaxY

    target.set(
        source.x + ((deterministicRandom(index, 1) * 2 - 1) * halfWidth),
        source.y + minY + (deterministicRandom(index, 2) * (maxY - minY)),
        source.z + ((deterministicRandom(index, 3) * 2 - 1) * halfDepth),
    )
}

function createEmitter(sources: StaticFireParticleSource[], config: StaticFireParticleProfileConfig, smoke: boolean): CustomParticleEmitter {
    const emitter = new StaticFireBallisticEmitter()
    emitter.particlePositionGenerator = (index, _particle, position) => {
        setParticleStartPosition(sources[index % sources.length], index, smoke, position)
    }
    emitter.particleDestinationGenerator = (index, _particle, destination) => {
        const directionX = smoke ? config.smokeDirectionX : config.fireDirectionX
        const minDirectionY = smoke ? config.smokeMinDirectionY : config.fireMinDirectionY
        const maxDirectionY = smoke ? config.smokeMaxDirectionY : config.fireMaxDirectionY
        const minPower = smoke ? config.smokeMinPower : config.fireMinPower
        const maxPower = smoke ? config.smokeMaxPower : config.fireMaxPower
        const power = minPower + (deterministicRandom(index, 7) * (maxPower - minPower))

        destination.set(
            (deterministicRandom(index, 4) * 2 - 1) * directionX * power,
            (minDirectionY + (deterministicRandom(index, 5) * (maxDirectionY - minDirectionY))) * power,
            (deterministicRandom(index, 6) * 2 - 1) * directionX * power,
        )
    }
    return emitter
}

function disposeOrphanedSystems(scene: Scene) {
    const orphanedTextures = new Set<Texture>()
    for (let index = scene.particleSystems.length - 1; index >= 0; index--) {
        const system = scene.particleSystems[index]
        if (!(system instanceof GPUParticleSystem) || !system.name.startsWith(SHARED_SYSTEM_NAME_PREFIX)) {
            continue
        }

        if (system.particleTexture instanceof Texture) {
            orphanedTextures.add(system.particleTexture)
        }
        system.dispose(false)
    }
    orphanedTextures.forEach(texture => texture.dispose())
}

export const StaticFireParticleManager = {
    scene: null as Scene | null,
    sources: new Map<string, StaticFireParticleSource>(),
    systems: new Map<StaticFireParticleProfile, StaticFireProfileSystems>(),
    retiringSystems: new Set<RetiringParticleSystem>(),
    fireTexture: null as Texture | null,
    smokeTexture: null as Texture | null,
    dirty: false,

    register(scene: Scene, id: string, source: StaticFireParticleSource): boolean {
        if (!USE_SHARED_GPU_STATIC_FIRE_PARTICLES || !GPUParticleSystem.IsSupported || !installBallisticEmitterShader()) {
            this.unregister(id)
            return false
        }

        if (this.scene !== scene) {
            this.disposeResources()
            disposeOrphanedSystems(scene)
            this.scene = scene
        }

        const previous = this.sources.get(id)
        if (!previous || !sourcesEqual(previous, source)) {
            this.sources.set(id, source)
            this.dirty = true
        }
        return true
    },

    unregister(id: string) {
        if (this.sources.delete(id)) {
            this.dirty = true
        }
    },

    flush() {
        if (!this.dirty) {
            return
        }

        this.dirty = false
        if (this.scene == null) {
            return
        }

        if (this.sources.size > 0 && this.fireTexture == null) {
            this.fireTexture = new Texture('images/gfx/flare.png', this.scene)
        }
        if (this.sources.size > 0 && this.smokeTexture == null) {
            this.smokeTexture = new Texture('images/gfx/dust.png', this.scene)
        }

        for (const profile of PROFILES) {
            const profileSources: StaticFireParticleSource[] = []
            const sourceKeyParts: string[] = []
            for (const [id, source] of this.sources) {
                if (source.profile === profile) {
                    profileSources.push(source)
                    sourceKeyParts.push(`${id}:${source.x}:${source.y}:${source.z}`)
                }
            }
            const sourceKey = sourceKeyParts.join('|')
            const current = this.systems.get(profile)
            if (current?.sourceKey === sourceKey) {
                continue
            }

            if (current != null) {
                this.retireSystem(current.fire)
                this.retireSystem(current.smoke)
                this.systems.delete(profile)
            }
            if (profileSources.length === 0) {
                continue
            }

            const config = PROFILE_CONFIGS[profile]
            this.systems.set(profile, {
                sourceKey,
                fire: this.createSystem(profile, profileSources, config, false, this.fireTexture!),
                smoke: this.createSystem(profile, profileSources, config, true, this.smokeTexture!),
            })
        }
    },

    retireSystem(system: GPUParticleSystem) {
        system.emitRate = 0
        system.stop()
        const lifetimeMs = Math.ceil(
            (system.maxLifeTime / (system.updateSpeed * PARTICLE_BASELINE_FPS)) * 1000,
        ) + RETIRING_SYSTEM_GRACE_MS
        let retiring: RetiringParticleSystem
        const timeout = setTimeout(() => {
            system.dispose(false)
            this.retiringSystems.delete(retiring)
        }, lifetimeMs)
        retiring = { system, timeout }
        this.retiringSystems.add(retiring)
    },

    createSystem(
        profile: StaticFireParticleProfile,
        sources: StaticFireParticleSource[],
        config: StaticFireParticleProfileConfig,
        smoke: boolean,
        texture: Texture,
    ): GPUParticleSystem {
        const smokeFactor = STATIC_FIRE_SMOKE_PARTICLE_FACTORS[Settings.detailLevel.level - 1]
        const capacityPerSource = smoke ? Math.round(config.smokeCapacity * smokeFactor) : config.fireCapacity
        const emitRatePerSource = smoke ? config.smokeEmitRate * smokeFactor : config.fireEmitRate
        const system = new GPUParticleSystem(
            `${SHARED_SYSTEM_NAME_PREFIX}${smoke ? 'Smoke' : 'Fire'}_${profile}`,
            { capacity: Math.max(1, capacityPerSource * sources.length) },
            this.scene!,
        )

        system.particleTexture = texture
        system.emitter = Vector3.Zero()
        system.particleEmitterType = createEmitter(sources, config, smoke)
        system.minLifeTime = smoke ? 3.5 : 0.5
        system.maxLifeTime = smoke ? 5 : 0.75
        system.emitRate = emitRatePerSource * sources.length
        system.minSize = smoke ? config.smokeMinSize : config.fireMinSize
        system.maxSize = smoke ? config.smokeMaxSize : config.fireMaxSize
        system.minAngularSpeed = smoke ? -0.3 : 0
        system.maxAngularSpeed = smoke ? 0.3 : 0
        system.gravity.set(0, smoke ? config.smokeGravity : config.fireGravity, 0)
        system.updateSpeed = 0.01
        system.blendMode = smoke ? ParticleSystem.BLENDMODE_STANDARD : ParticleSystem.BLENDMODE_ONEONE

        if (smoke) {
            system.addColorGradient(0, new Color4(0.6, 0.6, 0.6, 0))
            system.addColorGradient(0.3, new Color4(0.7, 0.7, 0.7, config.smokePeakAlpha))
            system.addColorGradient(0.7, new Color4(0.65, 0.65, 0.65, config.smokeLateAlpha))
            system.addColorGradient(1, new Color4(0.5, 0.5, 0.5, 0))
        } else {
            system.addColorGradient(0, new Color4(1, 0.8, 0.6, 1))
            system.addColorGradient(0.4, new Color4(1, 0.4, 0.1, 1))
            system.addColorGradient(0.8, new Color4(0.1, 0.05, 0.01, 0.2))
            system.addColorGradient(1, new Color4(0.1, 0.05, 0.01, 0))
        }

        system.start()
        return system
    },

    disposeSystems() {
        for (const profileSystems of this.systems.values()) {
            profileSystems.fire.dispose(false)
            profileSystems.smoke.dispose(false)
        }
        this.systems.clear()
        for (const retiring of this.retiringSystems) {
            clearTimeout(retiring.timeout)
            retiring.system.dispose(false)
        }
        this.retiringSystems.clear()
    },

    disposeResources() {
        this.disposeSystems()
        this.fireTexture?.dispose()
        this.smokeTexture?.dispose()
        this.fireTexture = null
        this.smokeTexture = null
        this.sources.clear()
        this.scene = null
        this.dirty = false
    },
}

if (import.meta.hot) {
    import.meta.hot.dispose(() => StaticFireParticleManager.disposeResources())
}
