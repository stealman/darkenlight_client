import {
    Constants,
    CustomParticleEmitter,
    GPUParticleSystem,
    Frustum,
    Plane,
    ParticleSystem,
    RawTexture,
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
import type { FoggyAreaData as FoggyAreaMessage } from '@/network/messageIfs'

export interface FoggyAreaData extends FoggyAreaMessage {
    ground: boolean
}

const CAPACITY_LIMIT = 6000
// Maximum cloud radius (12 / 2) plus maximum horizontal drift (2.6).
const VISIBILITY_MARGIN = 9
const FOG_ALPHA_FADE_DEFINE = '#define FOGGY_AREA_ALPHA_FADE'
const GROUND_FOG_DEFINE = '#define FOGGY_AREA_GROUND'
const GROUND_FOG_TOP = 1.35
const NIGHT_PARTICLE_COLOR_FACTOR = 0.75
let fogAlphaFadeShaderInstalled = false

function installFogAlphaFadeShader(): boolean {
    if (fogAlphaFadeShaderInstalled) return true
    const vertexName = 'gpuRenderParticlesVertexShader'
    const fragmentName = 'gpuRenderParticlesPixelShader'
    const vertex = ShaderStore.ShadersStore[vertexName]
    const fragment = ShaderStore.ShadersStore[fragmentName]
    if (vertex?.includes('float fogTerrainHeight(') && fragment?.includes('float fogTerrainHeight(')) {
        fogAlphaFadeShaderInstalled = true
        return true
    }
    const source = 'vColor=color*vec4(1.0-ratio)+colorDead*vec4(ratio);\n#endif'
    const replacement = `vColor=color*vec4(1.0-ratio)+colorDead*vec4(ratio);
#ifdef FOGGY_AREA_ALPHA_FADE
vColor.rgb=color.rgb;
vColor.a=color.a*smoothstep(0.0,0.22,ratio)*(1.0-smoothstep(0.55,1.0,ratio));
#endif
#endif`
    const project = 'gl_Position=projection*viewPosition;'
    const color = 'gl_FragColor=textureColor*vColor;'
    if (!vertex?.includes(source) || !vertex.includes(project) || !fragment?.includes(color)) return false
    const terrainLookup = `
#ifdef FOGGY_AREA_GROUND
uniform sampler2D fogTerrain;
uniform vec4 fogTerrainBounds;
float fogTerrainHeight(vec2 worldXZ) {
    vec2 tile = floor(worldXZ) - fogTerrainBounds.xy;
    return texture2D(fogTerrain, (tile + 0.5) / fogTerrainBounds.zw).r;
}
#endif
`
    ShaderStore.ShadersStore[vertexName] = vertex
        .replace('void main() {', terrainLookup + 'void main() {')
        .replace(source, replacement)
        .replace(project, `
#ifdef FOGGY_AREA_GROUND
// The particle simulation stores Y relative to the terrain. Flatten the
// billboard in world Y and place it at the height of its drifting center.
vPositionW.y = position.y + (vPositionW.y - position.y) * 0.28 + fogTerrainHeight(position.xz);
viewPosition = view * vec4(vPositionW, 1.0);
#endif
${project}`)
    ShaderStore.ShadersStore[fragmentName] = fragment
        .replace('void main() {', terrainLookup + `
#ifdef FOGGY_AREA_GROUND
varying vec3 vPositionW;
#endif
void main() {`)
        .replace(color, `${color}
#ifdef FOGGY_AREA_GROUND
float aboveGround = vPositionW.y - fogTerrainHeight(vPositionW.xz);
gl_FragColor.a *= smoothstep(0.0, 0.12, aboveGround)
    * (1.0 - smoothstep(0.85, ${GROUND_FOG_TOP}, aboveGround));
#endif`)
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
    systems: new Map<number, {key: string, particles: GPUParticleSystem}>(),
    texture: null as Texture | null,
    lastLightingFactor: -1,

    initialize(scene: Scene) {
        this.disposeResources()
        this.scene = scene
    },

    setAreas(areas: FoggyAreaMessage[]) {
        const next = areas.map((area) => ({...area, ground: area.ground !== false}))
        if (JSON.stringify(next) === JSON.stringify(this.areas)) return
        this.areas.splice(0, this.areas.length, ...next)
        this.refreshVisibleAreas()
    },

    applyChange(area: FoggyAreaMessage, deleted: boolean) {
        const index = this.areas.findIndex((item) => item.id === area.id)
        if (deleted) {
            if (index >= 0) this.areas.splice(index, 1)
        } else {
            const next = {...area, ground: area.ground !== false}
            if (index >= 0) this.areas[index] = next
            else this.areas.push(next)
        }
        this.refreshVisibleAreas()
    },

    refreshVisibleAreas() {
        if (!Settings.isFoggyAreasEnabled()) {
            this.disposeSystems()
            return
        }
        const camera = this.scene?.activeCamera
        if (!this.scene || !camera || !ViewportManager.viewPortInitialized) return
        // Terrain's viewport includes tall objects and lower height layers.
        // Fog instead uses its own terrain-height bounds against the real camera.
        camera.getViewMatrix()
        camera.getProjectionMatrix()
        const planes = Frustum.GetPlanes(camera.getTransformationMatrix())
        const terrainRevision = WorldDataManager.getTerrainRevision()
        const activeIds = new Set<number>()
        for (const area of this.areas) {
            if (!this.isAreaVisible(area, planes)) continue
            activeIds.add(area.id)
            const key = `${area.x}:${area.z}:${area.width}:${area.depth}:${area.rotation}:${area.intensity}:${area.ground ? terrainRevision : 'air'}`
            const existing = this.systems.get(area.id)
            if (existing?.key === key) continue
            existing?.particles.dispose(false)
            this.systems.delete(area.id)
            const particles = this.createSystem({...area})
            if (particles) this.systems.set(area.id, {key, particles})
        }
        for (const [id, system] of this.systems) {
            if (!activeIds.has(id)) {
                system.particles.dispose(false)
                this.systems.delete(id)
            }
        }
        this.updateParticleColors(true)
    },

    isAreaVisible(area: FoggyAreaData, planes: Plane[]): boolean {
        const rotation = area.rotation * Math.PI / 180
        const cos = Math.cos(rotation)
        const sin = Math.sin(rotation)
        const halfWidth = area.width * 0.5
        const halfDepth = area.depth * 0.5
        const extentX = Math.hypot(halfWidth * cos, halfDepth * sin)
        const extentZ = Math.hypot(halfWidth * sin, halfDepth * cos)
        // Match the world's configured visibility distance as well as the
        // screen footprint; the frustum itself reaches all the way to maxZ.
        if (this.scene?.fogMode === Scene.FOGMODE_LINEAR && this.scene.activeCamera) {
            const camera = this.scene.activeCamera.globalPosition
            const dx = Math.max(0, Math.abs(camera.x - area.x) - extentX - VISIBILITY_MARGIN)
            const dz = Math.max(0, Math.abs(camera.z - area.z) - extentZ - VISIBILITY_MARGIN)
            if (Math.hypot(dx, dz) > this.scene.fogEnd) return false
        }
        const map = WorldDataManager.getBlockMap()
        const groundMargin = area.ground ? VISIBILITY_MARGIN : 0
        let minY = Infinity
        let maxY = -Infinity
        for (let x = Math.max(0, Math.floor(area.x - extentX - groundMargin)); x <= Math.min(map.length - 1, Math.floor(area.x + extentX + groundMargin)); x++) {
            const column = map[x]
            if (!column) continue
            for (let z = Math.max(0, Math.floor(area.z - extentZ - groundMargin)); z <= Math.min(column.length - 1, Math.floor(area.z + extentZ + groundMargin)); z++) {
                const height = column[z]?.totalHeight
                if (!Number.isFinite(height)) continue
                minY = Math.min(minY, height)
                maxY = Math.max(maxY, height)
            }
        }
        if (!Number.isFinite(minY)) return false
        minY += area.ground ? 0 : 0.12 - 6
        maxY += area.ground ? GROUND_FOG_TOP : 0.12 + 1.55 + 6
        for (const plane of planes) {
            const n = plane.normal
            // Support of the rotated ellipse, expanded by cloud size and drift.
            const horizontalRadius = Math.hypot(
                halfWidth * (n.x * cos + n.z * sin),
                halfDepth * (-n.x * sin + n.z * cos),
            ) + VISIBILITY_MARGIN * Math.hypot(n.x, n.z)
            const highestDistance = n.x * area.x + n.z * area.z
                + n.y * (n.y >= 0 ? maxY : minY) + plane.d + horizontalRadius
            if (highestDistance < 0) return false
        }
        return true
    },

    getParticleStart(index: number, target: Vector3, area: FoggyAreaData): Vector3 {
        const angle = random(index, 2) * Math.PI * 2
        const radius = Math.sqrt(random(index, 3))
        const localX = Math.cos(angle) * radius * area.width * 0.5
        const localZ = Math.sin(angle) * radius * area.depth * 0.5
        const rotation = area.rotation * Math.PI / 180
        const x = area.x + localX * Math.cos(rotation) - localZ * Math.sin(rotation)
        const z = area.z + localX * Math.sin(rotation) + localZ * Math.cos(rotation)
        if (area.ground) return target.set(x, 0.28, z)
        const block = WorldDataManager.getBlockMap()?.[Math.floor(x)]?.[Math.floor(z)]
        target.set(x, block ? block.totalHeight + 0.12 : -10000, z)
        return target
    },

    createSystem(area: FoggyAreaData): GPUParticleSystem | null {
        if (!this.scene || !GPUParticleSystem.IsSupported || !installFogAlphaFadeShader()) return null
        const weightedArea = areaWeight(area)
        const capacity = Math.max(64, Math.min(CAPACITY_LIMIT, Math.ceil(weightedArea * 1.5)))
        const emitter = new CustomParticleEmitter()
        const start = new Vector3()
        emitter.particlePositionGenerator = (index, _particle, position) => {
            this.getParticleStart(index, position, area)
        }
        emitter.particleDestinationGenerator = (index, _particle, destination) => {
            this.getParticleStart(index, start, area)
            const driftAngle = random(index, 4) * Math.PI * 2
            const drift = 0.8 + random(index, 5) * 1.8
            destination.set(
                start.x + Math.cos(driftAngle) * drift,
                start.y + (area.ground ? 0.18 + random(index, 6) * 0.34 : 0.45 + random(index, 6) * 1.1),
                start.z + Math.sin(driftAngle) * drift,
            )
        }

        if (!this.texture) this.texture = new Texture('images/gfx/dust.png', this.scene)
        const particles = new GPUParticleSystem(`foggyArea:${area.id}`, {capacity}, this.scene)
        const fillDefines = particles.fillDefines.bind(particles)
        particles.fillDefines = (defines, blendMode, fillImageProcessing) => {
            fillDefines(defines, blendMode, fillImageProcessing)
            defines.push(FOG_ALPHA_FADE_DEFINE)
            if (area.ground) defines.push(GROUND_FOG_DEFINE)
        }
        if (area.ground) this.bindGroundTerrain(particles, area, this.scene)
        particles.particleTexture = this.texture
        particles.emitter = Vector3.Zero()
        particles.particleEmitterType = emitter
        particles.minLifeTime = 6
        particles.maxLifeTime = 9
        particles.emitRate = Math.min(capacity / 5, weightedArea * 0.03)
        particles.minAngularSpeed = -0.08
        particles.maxAngularSpeed = 0.08
        particles.updateSpeed = 0.01
        particles.blendMode = ParticleSystem.BLENDMODE_STANDARD
        // GPU size gradients are absolute world sizes and override minSize/maxSize.
        particles.addSizeGradient(0, 5.5)
        particles.addSizeGradient(0.45, 9)
        particles.addSizeGradient(1, 12)
        particles.start()
        return particles
    },

    bindGroundTerrain(particles: GPUParticleSystem, area: FoggyAreaData, scene: Scene) {
        const map = WorldDataManager.getBlockMap()
        const radius = Math.max(area.width, area.depth) * 0.5 + VISIBILITY_MARGIN
        const minX = Math.floor(area.x - radius)
        const minZ = Math.floor(area.z - radius)
        const width = Math.floor(area.x + radius) - minX + 1
        const depth = Math.floor(area.z + radius) - minZ + 1
        const heights = new Float32Array(width * depth)
        for (let z = 0; z < depth; z++) {
            for (let x = 0; x < width; x++) {
                heights[z * width + x] = map[minX + x]?.[minZ + z]?.totalHeight ?? -10000
            }
        }
        const terrain = RawTexture.CreateRTexture(heights, width, depth, scene, false, false,
            Texture.NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT)
        terrain.wrapU = terrain.wrapV = Texture.CLAMP_ADDRESSMODE
        const fillBindings = particles.fillUniformsAttributesAndSamplerNames.bind(particles)
        particles.fillUniformsAttributesAndSamplerNames = (uniforms, attributes, samplers) => {
            fillBindings(uniforms, attributes, samplers)
            uniforms.push('fogTerrainBounds')
            samplers.push('fogTerrain')
        }
        particles.onBeforeDrawParticlesObservable.add((effect) => {
            if (!effect) return
            effect.setFloat4('fogTerrainBounds', minX, minZ, width, depth)
            effect.setTexture('fogTerrain', terrain)
        })
        particles.onDisposeObservable.addOnce(() => terrain.dispose())
    },

    onFrame() {
        this.updateParticleColors(false)
    },

    updateParticleColors(force: boolean) {
        if (!this.systems.size || !this.scene) return
        const daylight = Lights.indoor ? 1 : Lights.daylightFactor
        if (!force && daylight === this.lastLightingFactor) return
        this.lastLightingFactor = daylight

        const colorFactor = NIGHT_PARTICLE_COLOR_FACTOR + (1 - NIGHT_PARTICLE_COLOR_FACTOR) * daylight
        const red = 0.72 * colorFactor
        const green = 0.75 * colorFactor
        const blue = 0.75 * colorFactor
        const alpha = 0.06732 - daylight * 0.00732
        // Without a GPU color gradient, color1/color2 are captured by each
        // particle when it is emitted. Existing clouds retain their shade and
        // naturally fade out while new clouds adopt the current day/night tint.
        for (const {particles} of this.systems.values()) {
            particles.color1.set(red, green, blue, alpha)
            particles.color2.set(red * 0.9, green * 0.92, blue, alpha * 0.8)
            particles.colorDead.set(red * 0.85, green * 0.85, blue * 0.85, 0)
        }
    },

    disposeSystems() {
        for (const {particles} of this.systems.values()) particles.dispose(false)
        this.systems.clear()
        this.lastLightingFactor = -1
    },

    clearWorld() {
        this.disposeSystems()
        this.areas.splice(0)
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
