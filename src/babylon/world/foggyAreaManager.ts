import {
    CustomParticleEmitter,
    GPUParticleSystem,
    ParticleSystem,
    Scene,
    ShaderStore,
    Texture,
    Vector3,
} from '@babylonjs/core'
import { WorldDataManager } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { Settings } from '@/settings/settings'
import { reactive } from 'vue'
import { Lights } from '@/babylon/scene/lights'

export interface FoggyAreaData {
    id: number
    x: number
    z: number
    width: number
    depth: number
    rotation: number
    intensity: number
}

const DETAIL_FACTORS = [0.45, 0.7, 1]
const CAPACITY_LIMITS = [1800, 3500, 6000]
const VISIBILITY_MARGIN = 6
const FOG_ALPHA_FADE_DEFINE = '#define FOGGY_AREA_ALPHA_FADE'
let fogAlphaFadeShaderInstalled = false

function installFogAlphaFadeShader(): boolean {
    if (fogAlphaFadeShaderInstalled) return true
    const shaderName = 'gpuRenderParticlesVertexShader'
    const shader = ShaderStore.ShadersStore[shaderName]
    const source = 'vColor=color*vec4(1.0-ratio)+colorDead*vec4(ratio);\n#endif'
    const replacement = `vColor=color*vec4(1.0-ratio)+colorDead*vec4(ratio);
#ifdef FOGGY_AREA_ALPHA_FADE
vColor.rgb=color.rgb;
vColor.a=color.a*smoothstep(0.0,0.22,ratio)*(1.0-smoothstep(0.55,1.0,ratio));
#endif
#endif`
    if (!shader?.includes(source)) return false
    ShaderStore.ShadersStore[shaderName] = shader.replace(source, replacement)
    fogAlphaFadeShaderInstalled = true
    return true
}

function random(index: number, salt: number): number {
    const value = Math.sin((index + 1) * (12.9898 + salt * 17.173)) * 43758.5453123
    return value - Math.floor(value)
}

function areaWeight(area: FoggyAreaData): number {
    // Non-linear density: level 3 matches the original level-1 appearance,
    // while level 1 remains a genuinely sparse trace of mist.
    const intensityFactor = area.intensity * area.intensity / 45
    return Math.PI * area.width * area.depth * 0.25 * intensityFactor
}

export const FoggyAreaManager = {
    scene: null as Scene | null,
    areas: reactive([] as FoggyAreaData[]) as FoggyAreaData[],
    activeAreas: [] as FoggyAreaData[],
    activeKey: '',
    particles: null as GPUParticleSystem | null,
    texture: null as Texture | null,
    lastLightingFactor: -1,

    initialize(scene: Scene) {
        this.disposeResources()
        this.scene = scene
    },

    setAreas(areas: FoggyAreaData[]) {
        const next = (areas ?? []).map((area) => ({...area}))
        if (JSON.stringify(next) === JSON.stringify(this.areas)) return
        this.areas.splice(0, this.areas.length, ...next)
        this.activeKey = ''
        this.refreshVisibleAreas()
    },

    applyChange(area: FoggyAreaData, deleted: boolean) {
        const index = this.areas.findIndex((item) => item.id === area.id)
        if (deleted) {
            if (index >= 0) this.areas.splice(index, 1)
        } else if (index >= 0) {
            this.areas[index] = {...area}
        } else {
            this.areas.push({...area})
        }
        this.activeKey = ''
        this.refreshVisibleAreas()
    },

    refreshVisibleAreas() {
        if (!this.scene || !ViewportManager.viewPortInitialized) return
        const active = this.areas.filter((area) => ViewportManager.isPointNearVisibleBounds(
            area.x,
            area.z,
            Math.max(area.width, area.depth) * 0.5 + VISIBILITY_MARGIN,
        ))
        const key = active.map((area) => `${area.id}:${area.x}:${area.z}:${area.width}:${area.depth}:${area.rotation}:${area.intensity}`).join('|')
        if (key === this.activeKey) return
        this.activeKey = key
        this.activeAreas = active
        this.rebuildSystem()
    },

    getAreaForParticle(index: number): FoggyAreaData {
        const totalWeight = this.activeAreas.reduce((sum, area) => sum + areaWeight(area), 0)
        let target = random(index, 1) * totalWeight
        for (const area of this.activeAreas) {
            target -= areaWeight(area)
            if (target <= 0) return area
        }
        return this.activeAreas[this.activeAreas.length - 1]
    },

    getParticleStart(index: number, target: Vector3): Vector3 {
        const area = this.getAreaForParticle(index)
        const angle = random(index, 2) * Math.PI * 2
        const radius = Math.sqrt(random(index, 3))
        const localX = Math.cos(angle) * radius * area.width * 0.5
        const localZ = Math.sin(angle) * radius * area.depth * 0.5
        const rotation = area.rotation * Math.PI / 180
        const x = area.x + localX * Math.cos(rotation) - localZ * Math.sin(rotation)
        const z = area.z + localX * Math.sin(rotation) + localZ * Math.cos(rotation)
        const block = WorldDataManager.getBlockMap()?.[Math.floor(x)]?.[Math.floor(z)]
        target.set(x, block ? block.totalHeight + 0.12 : -10000, z)
        return target
    },

    rebuildSystem() {
        this.particles?.dispose(false)
        this.particles = null
        if (!this.scene || this.activeAreas.length === 0 || !GPUParticleSystem.IsSupported || !installFogAlphaFadeShader()) return

        const detailFactor = DETAIL_FACTORS[Settings.detailLevel.level - 1]
        const weightedArea = this.activeAreas.reduce((sum, area) => sum + areaWeight(area), 0)
        const capacityLimit = CAPACITY_LIMITS[Settings.detailLevel.level - 1]
        const capacity = Math.max(64, Math.min(capacityLimit, Math.ceil(weightedArea * 1.5 * detailFactor)))
        const emitter = new CustomParticleEmitter()
        const start = new Vector3()
        emitter.particlePositionGenerator = (index, _particle, position) => {
            this.getParticleStart(index, position)
        }
        emitter.particleDestinationGenerator = (index, _particle, destination) => {
            this.getParticleStart(index, start)
            const driftAngle = random(index, 4) * Math.PI * 2
            const drift = 0.8 + random(index, 5) * 1.8
            destination.set(
                start.x + Math.cos(driftAngle) * drift,
                start.y + 0.45 + random(index, 6) * 1.1,
                start.z + Math.sin(driftAngle) * drift,
            )
        }

        if (!this.texture) this.texture = new Texture('images/gfx/dust.png', this.scene)
        const particles = new GPUParticleSystem('foggyAreas', {capacity}, this.scene)
        const fillDefines = particles.fillDefines.bind(particles)
        particles.fillDefines = (defines, blendMode, fillImageProcessing) => {
            fillDefines(defines, blendMode, fillImageProcessing)
            defines.push(FOG_ALPHA_FADE_DEFINE)
        }
        particles.particleTexture = this.texture
        particles.emitter = Vector3.Zero()
        particles.particleEmitterType = emitter
        particles.minLifeTime = 6
        particles.maxLifeTime = 9
        particles.emitRate = Math.min(capacity / 5, weightedArea * 0.03 * detailFactor)
        particles.minAngularSpeed = -0.08
        particles.maxAngularSpeed = 0.08
        particles.updateSpeed = 0.01
        particles.blendMode = ParticleSystem.BLENDMODE_STANDARD
        // GPU size gradients are absolute world sizes and override minSize/maxSize.
        particles.addSizeGradient(0, 5.5)
        particles.addSizeGradient(0.45, 9)
        particles.addSizeGradient(1, 12)
        this.particles = particles
        this.lastLightingFactor = -1
        this.updateParticleColors(true)
        particles.start()
    },

    onFrame() {
        this.updateParticleColors(false)
    },

    updateParticleColors(force: boolean) {
        if (!this.particles || !this.scene) return
        const daylight = Lights.indoor ? 1 : Lights.daylightFactor
        if (!force && Math.abs(daylight - this.lastLightingFactor) < 0.025) return
        this.lastLightingFactor = daylight

        const fog = this.scene.fogColor
        const nightRed = 0.19 + fog.r * 0.4
        const nightGreen = 0.2 + fog.g * 0.4
        const nightBlue = 0.22 + fog.b * 0.4
        const red = nightRed + (0.72 - nightRed) * daylight
        const green = nightGreen + (0.75 - nightGreen) * daylight
        const blue = nightBlue + (0.75 - nightBlue) * daylight
        const alpha = 0.06732 - daylight * 0.00732
        // Without a GPU color gradient, color1/color2 are captured by each
        // particle when it is emitted. Existing clouds retain their shade and
        // naturally fade out while new clouds adopt the current day/night tint.
        this.particles.color1.set(red, green, blue, alpha)
        this.particles.color2.set(red * 0.9, green * 0.92, blue, alpha * 0.8)
        this.particles.colorDead.set(red * 0.85, green * 0.85, blue * 0.85, 0)
    },

    clearWorld() {
        this.particles?.dispose(false)
        this.particles = null
        this.areas.splice(0)
        this.activeAreas = []
        this.activeKey = ''
        this.lastLightingFactor = -1
    },

    disposeResources() {
        this.clearWorld()
        this.texture?.dispose()
        this.texture = null
        this.scene = null
    },
}

if (import.meta.hot) {
    import.meta.hot.dispose(() => FoggyAreaManager.disposeResources())
}
