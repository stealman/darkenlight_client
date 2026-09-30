import {
    AbstractMesh,
    DirectionalLight,
    Mesh,
    ShadowGenerator,
    SpotLight,
    Vector3,
} from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { MyPlayer } from '@/data/myPlayer'
import { getBrightnessIntensityFactor, Settings } from '@/settings/settings'
import {
    ACTOR_STATIC_LIGHT_LIMIT,
    INDOOR_STATIC_SHADOW_MAP_SIZE,
    OUTDOOR_ACTOR_STATIC_LIGHT_LIMIT,
    OUTDOOR_STATIC_SHADOW_MAP_SIZE,
    OUTDOOR_STATIC_LIGHT_INTENSITY_FACTOR,
    OUTDOOR_STATIC_LIGHT_LIMITS,
    OUTDOOR_STATIC_LIGHT_RANGE_FACTOR,
    STATIC_LIGHT_DEFAULT_BRIGHTNESS_FACTOR,
    STATIC_LIGHT_FADE_SECONDS,
    STATIC_LIGHT_LIMITS,
} from '@/babylon/scene/lighting/lightConfig'
import type {
    StaticLightProfile,
    StaticLightSlot,
    StaticLightSource,
} from '@/babylon/scene/lighting/lightTypes'

export interface StaticLightingHost {
    sunLight: DirectionalLight
    personalLight: SpotLight
    staticShadowGenerators: ShadowGenerator[]
    staticLights: Map<string, StaticLightSource>
    staticLightSlots: StaticLightSlot[]
    staticLightShadersWarmed: boolean
    staticLightShadersWarming: boolean
    staticLightFlickerTime: number
    localLightFactor: number
    indoor: boolean
    updateDayNightLighting(): void
    updateSharedLightMeshes(): void
    updateActorLightMeshes(): void
    registerSharedLightMesh(mesh: AbstractMesh): void
    warmUpStaticLightShaderVariant(meshes: Array<Mesh | AbstractMesh>, selectedLights: Array<DirectionalLight | SpotLight>): Promise<void>
}

export function resetStaticLighting(host: StaticLightingHost) {
    host.staticLights.clear()
    host.staticLightSlots = []
    host.staticShadowGenerators = []
    host.staticLightShadersWarmed = false
    host.staticLightShadersWarming = false
    host.staticLightFlickerTime = 0
}

export function configureStaticLightMaterials(host: StaticLightingHost) {
    const staticLightLimit = STATIC_LIGHT_LIMITS[Settings.detailLevel.level - 1]
    const outdoorStaticLightLimit = OUTDOOR_STATIC_LIGHT_LIMITS[Settings.detailLevel.level - 1]
    const useStaticShadows = Settings.isDetalLevelHigh() && Settings.isShadowsEnabled()
    // This is a material capacity, not the number of lights in the current
    // day/night phase. Keep it stable to avoid mismatched light UBO layouts.
    const maxLights = staticLightLimit + 2
    Materials.terrainMaterial!.maxSimultaneousLights = maxLights
    Materials.planeMaterial!.maxSimultaneousLights = maxLights
    Materials.blockMat1!.maxSimultaneousLights = maxLights
    Materials.blockMatAlpha1!.maxSimultaneousLights = maxLights

    for (let i = 0; i < staticLightLimit; i++) {
        const light = new SpotLight(
            `staticLightSlot_${i}`,
            new Vector3(0, -1000, 0),
            new Vector3(0, -1, 0),
            Math.PI * 0.96,
            1,
            host.sunLight.getScene(),
        )
        light.intensity = 0
        light.range = 1
        light.renderPriority = 1
        // Keep enabled shadow-capable slots detached from ordinary scene meshes;
        // explicit shared/actor light lists are the only assignment source.
        light.excludeWithLayerMask = 0xffffffff
        light.shadowEnabled = useStaticShadows && (host.indoor || i < getStaticLightLimit(host))
        light.setEnabled(true)

        let shadow: ShadowGenerator | null = null
        if (useStaticShadows) {
            const shadowMapSize = i < outdoorStaticLightLimit
                ? OUTDOOR_STATIC_SHADOW_MAP_SIZE
                : INDOOR_STATIC_SHADOW_MAP_SIZE
            shadow = new ShadowGenerator(shadowMapSize, light, false)
            shadow.bias = 0.005
            shadow.setDarkness(0)
            shadow.usePoissonSampling = true
            shadow.forceBackFacesOnly = true
            shadow.frustumEdgeFalloff = 0.3
            light.shadowMinZ = 0.05
            light.shadowMaxZ = 12
            host.staticShadowGenerators.push(shadow)
        }

        host.staticLightSlots.push({
            light,
            shadow,
            source: null,
            targetIntensity: 0,
            currentIntensity: 0,
            flickerOffset: new Vector3(),
        })
    }
}

export function registerStaticLight(host: StaticLightingHost, id: string, position: Vector3, profile: StaticLightProfile) {
    let source = host.staticLights.get(id)
    if (source == null) {
        source = {
            id,
            position,
            profile,
            visible: true,
            flickerPhase: getStaticLightFlickerPhase(id),
        }
        host.staticLights.set(id, source)
    } else {
        source.position = position
        source.profile = profile
        source.visible = true
    }
}

export function unregisterStaticLight(host: StaticLightingHost, id: string) {
    const source = host.staticLights.get(id)
    if (source != null) {
        source.visible = false
    }
}

export function clearStaticLights(host: StaticLightingHost) {
    host.staticLights.clear()
    host.staticLightSlots.forEach(slot => {
        slot.source = null
        slot.currentIntensity = 0
        slot.targetIntensity = 0
        slot.light.intensity = 0
    })
    host.updateSharedLightMeshes()
}

export function onLightsFrame(host: StaticLightingHost, timeRate: number) {
    host.staticLightFlickerTime += timeRate
    host.updateDayNightLighting()
    if (host.staticLights.size === 0 || host.staticLightShadersWarming) {
        return
    }

    const playerPosition = MyPlayer.myChar?.pos
    const staticLightLimit = getStaticLightLimit(host)
    const usableSlots = host.staticLightSlots.slice(0, staticLightLimit)
    const candidates = Array.from(host.staticLights.values())
        .filter(source => source.visible)
        .sort((a, b) => {
            if (playerPosition == null) return 0
            return Vector3.DistanceSquared(a.position, playerPosition) - Vector3.DistanceSquared(b.position, playerPosition)
        })
    const activeSources = new Set(candidates.slice(0, staticLightLimit))

    for (const slot of host.staticLightSlots) {
        if (slot.source != null && (!activeSources.has(slot.source) || !usableSlots.includes(slot))) {
            slot.targetIntensity = 0
        }
    }

    for (const source of activeSources) {
        if (usableSlots.some(slot => slot.source === source)) {
            continue
        }
        const emptySlot = usableSlots.find(slot => slot.source == null && slot.currentIntensity === 0)
        if (emptySlot != null) {
            assignStaticLightSlot(host, emptySlot, source)
        }
    }

    host.staticLightSlots.forEach(slot => {
        const active = usableSlots.includes(slot) && slot.source != null && activeSources.has(slot.source)
        const flickerIntensity = active && shouldFlicker(slot.source!)
            ? getStaticLightFlickerIntensity(host, slot.source!)
            : 1
        slot.targetIntensity = active
            ? getStaticLightIntensity(host, slot.source!) * getStaticLightBrightnessFactor() * getLocalLightFactor(host) * flickerIntensity
            : 0

        if (slot.source != null) {
            const flickerPosition = slot.flickerOffset
            if (shouldFlicker(slot.source)) {
                updateStaticLightFlickerPosition(host, slot.source, flickerPosition)
            } else {
                flickerPosition.set(0, 0, 0)
            }
            slot.light.position.set(
                slot.source.position.x + flickerPosition.x,
                slot.source.position.y + slot.source.profile.height + flickerPosition.y,
                slot.source.position.z + flickerPosition.z,
            )
            slot.light.range = getStaticLightRange(host, slot.source)
            if (slot.shadow != null) {
                slot.light.shadowMaxZ = slot.light.range
            }
        }

        slot.currentIntensity = moveTowards(slot.currentIntensity, slot.targetIntensity, timeRate / STATIC_LIGHT_FADE_SECONDS)
        slot.light.intensity = slot.currentIntensity

        if (slot.currentIntensity === 0 && slot.targetIntensity === 0) {
            slot.source = null
        }
    })

    host.staticLights.forEach((source, id) => {
        if (!source.visible && !host.staticLightSlots.some(slot => slot.source === source)) {
            host.staticLights.delete(id)
        }
    })

    host.updateSharedLightMeshes()
    host.updateActorLightMeshes()
}

export async function warmUpStaticLightShaders(host: StaticLightingHost, meshes: Array<Mesh | AbstractMesh>) {
    if (host.staticLightShadersWarmed || host.staticLightShadersWarming) {
        return
    }

    meshes.forEach(mesh => host.registerSharedLightMesh(mesh))
    host.staticLightShadersWarming = true
    try {
        const staticLights = host.staticLightSlots.slice(0, getStaticLightLimit(host)).map(slot => slot.light)
        const variants: Array<Array<DirectionalLight | SpotLight>> = [host.indoor
            ? [host.personalLight, ...staticLights]
            : [host.sunLight, host.personalLight, ...staticLights]]
        for (const variant of variants) {
            await host.warmUpStaticLightShaderVariant(meshes, variant)
        }

        host.staticLightShadersWarmed = true
    } catch (error) {
        console.warn('Static light shader warm-up failed', error)
    } finally {
        host.updateSharedLightMeshes()
        host.staticLightShadersWarming = false
    }
}

export function getStaticLightLimit(host: Pick<StaticLightingHost, 'indoor'>): number {
    const limits = host.indoor ? STATIC_LIGHT_LIMITS : OUTDOOR_STATIC_LIGHT_LIMITS
    return limits[Settings.detailLevel.level - 1]
}

export function getActorStaticLightLimit(host: Pick<StaticLightingHost, 'indoor'>): number {
    return host.indoor ? ACTOR_STATIC_LIGHT_LIMIT : OUTDOOR_ACTOR_STATIC_LIGHT_LIMIT
}

export function updateStaticLightShadowMode(host: StaticLightingHost) {
    const shadowLightLimit = getStaticLightLimit(host)
    host.staticLightSlots.forEach((slot, index) => {
        slot.light.shadowEnabled = slot.shadow != null && index < shadowLightLimit
    })
}

function assignStaticLightSlot(host: StaticLightingHost, slot: StaticLightSlot, source: StaticLightSource) {
    slot.source = source
    slot.currentIntensity = 0
    slot.targetIntensity = 0
    slot.light.position.set(source.position.x, source.position.y + source.profile.height, source.position.z)
    slot.light.range = getStaticLightRange(host, source)
    if (slot.shadow != null) {
        slot.light.shadowMaxZ = slot.light.range
    }
    slot.light.diffuse = source.profile.color
    slot.light.specular = source.profile.color
}

function moveTowards(current: number, target: number, amount: number): number {
    if (current < target) return Math.min(current + amount * target, target)
    if (current > target) return Math.max(current - amount, target)
    return current
}

function getStaticLightBrightnessFactor(): number {
    return STATIC_LIGHT_DEFAULT_BRIGHTNESS_FACTOR * getBrightnessIntensityFactor(Settings.brightness)
}

function getStaticLightIntensity(host: StaticLightingHost, source: StaticLightSource): number {
    return source.profile.intensity * (host.indoor ? 1 : OUTDOOR_STATIC_LIGHT_INTENSITY_FACTOR)
}

function getStaticLightRange(host: StaticLightingHost, source: StaticLightSource): number {
    return source.profile.range * (host.indoor ? 1 : OUTDOOR_STATIC_LIGHT_RANGE_FACTOR)
}

function shouldFlicker(source: StaticLightSource): boolean {
    return Settings.isDetalLevelHigh() && source.profile.flicker === true
}

function getStaticLightFlickerPhase(id: string): number {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
        hash = ((hash * 31) + id.charCodeAt(i)) | 0
    }
    return Math.abs(hash) * 0.017
}

function getStaticLightFlickerIntensity(host: StaticLightingHost, source: StaticLightSource): number {
    const time = host.staticLightFlickerTime
    const phase = source.flickerPhase
    return 1
        + (Math.sin((time * 5.3) + phase) * 0.055)
        + (Math.sin((time * 9.1) + (phase * 1.7)) * 0.035)
}

function updateStaticLightFlickerPosition(host: StaticLightingHost, source: StaticLightSource, position: Vector3) {
    const time = host.staticLightFlickerTime
    const phase = source.flickerPhase
    position.set(
        (Math.sin((time * 3.7) + phase) * 0.007) + (Math.sin((time * 6.1) + (phase * 1.4)) * 0.003),
        Math.sin((time * 4.3) + (phase * 0.8)) * 0.004,
        (Math.cos((time * 4.1) + phase) * 0.007) + (Math.cos((time * 6.7) + (phase * 1.6)) * 0.003),
    )
}

function getLocalLightFactor(host: StaticLightingHost): number {
    return host.indoor ? 1 : host.localLightFactor
}
