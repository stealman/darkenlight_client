import {
    AbstractMesh,
    DirectionalLight,
    Mesh,
    RenderTargetTexture,
    ShadowGenerator,
    SpotLight,
    Vector3,
} from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { MyPlayer } from '@/data/myPlayer'
import { getBrightnessIntensityFactor, Settings } from '@/settings/settings'
import {
    ACTOR_STATIC_LIGHT_LIMIT,
    ACTOR_STATIC_SHADOW_CASTER_UPDATE_SECONDS,
    LARGE_CAMPFIRE_SHADOW_MAP_SIZE,
    LARGE_CAMPFIRE_SHADOW_SLOT_COUNT,
    OUTDOOR_ACTOR_STATIC_LIGHT_LIMIT,
    OUTDOOR_STATIC_LIGHT_INTENSITY_FACTOR,
    OUTDOOR_STATIC_LIGHT_LIMITS,
    OUTDOOR_STATIC_LIGHT_RANGE_FACTOR,
    STATIC_SHADOW_MAP_SIZE,
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
    actorStaticShadowCasterUpdateTime: number
    localLightFactor: number
    indoor: boolean
    updateDayNightLighting(): void
    updateSharedLightMeshes(): void
    updateActorLightMeshes(): void
    updateActorStaticShadowCasters(): void
    registerSharedLightMesh(mesh: AbstractMesh): void
    warmUpStaticLightShaderVariant(meshes: Array<Mesh | AbstractMesh>, selectedLights: Array<DirectionalLight | SpotLight>): Promise<void>
}

const DEFAULT_STATIC_LIGHT_DIRECTION = new Vector3(0, -1, 0)
const DEFAULT_STATIC_LIGHT_ANGLE = Math.PI * 0.96
const DEFAULT_STATIC_LIGHT_PRIORITY = 1

export function resetStaticLighting(host: StaticLightingHost) {
    host.staticLights.clear()
    host.staticLightSlots = []
    host.staticShadowGenerators = []
    host.staticLightShadersWarmed = false
    host.staticLightShadersWarming = false
    host.staticLightFlickerTime = 0
    host.actorStaticShadowCasterUpdateTime = ACTOR_STATIC_SHADOW_CASTER_UPDATE_SECONDS
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
        let standardShadow: ShadowGenerator | null = null
        let largeCampfireShadow: ShadowGenerator | null = null
        if (useStaticShadows) {
            standardShadow = createStaticShadowGenerator(host, light, STATIC_SHADOW_MAP_SIZE)
            if (i < LARGE_CAMPFIRE_SHADOW_SLOT_COUNT) {
                largeCampfireShadow = createStaticShadowGenerator(host, light, LARGE_CAMPFIRE_SHADOW_MAP_SIZE)
            }
            shadow = standardShadow
            light.getShadowGenerators()?.set(null, shadow)
            light.shadowMinZ = 0.05
            light.shadowMaxZ = 12
        }

        host.staticLightSlots.push({
            light,
            shadow,
            standardShadow,
            largeCampfireShadow,
            source: null,
            targetIntensity: 0,
            currentIntensity: 0,
            flickerOffset: new Vector3(),
            actorShadowCasters: new Set<AbstractMesh>(),
        })
    }
}

export function registerStaticLight(host: StaticLightingHost, id: string, position: Vector3, profile: StaticLightProfile) {
    let source = host.staticLights.get(id)
    const actorShadowModeChanged = source != null
        && source.profile.castsActorShadows !== profile.castsActorShadows
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
    if (actorShadowModeChanged) {
        host.updateActorStaticShadowCasters()
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
    host.updateActorStaticShadowCasters()
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
            const priorityDifference = (b.profile.priority ?? DEFAULT_STATIC_LIGHT_PRIORITY)
                - (a.profile.priority ?? DEFAULT_STATIC_LIGHT_PRIORITY)
            if (priorityDifference !== 0) return priorityDifference
            if (playerPosition == null) return 0
            return Vector3.DistanceSquared(a.position, playerPosition) - Vector3.DistanceSquared(b.position, playerPosition)
        })
    const activeCandidates = candidates.slice(0, staticLightLimit)
    const activeSources = new Set(activeCandidates)

    for (const slot of host.staticLightSlots) {
        if (slot.source != null && (!activeSources.has(slot.source) || !usableSlots.includes(slot))) {
            slot.targetIntensity = 0
        }
    }

    assignUnslottedStaticLightSources(host, usableSlots, activeCandidates, LARGE_CAMPFIRE_SHADOW_MAP_SIZE)
    assignUnslottedStaticLightSources(host, usableSlots, activeCandidates, STATIC_SHADOW_MAP_SIZE)

    host.staticLightSlots.forEach((slot, index) => {
        const active = usableSlots.includes(slot) && slot.source != null && activeSources.has(slot.source)
        updateStaticSlotShadowState(host, slot, index, staticLightLimit, active || slot.currentIntensity > 0.001)
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
            slot.light.direction.copyFrom(slot.source.profile.direction ?? DEFAULT_STATIC_LIGHT_DIRECTION)
            slot.light.angle = slot.source.profile.angle ?? DEFAULT_STATIC_LIGHT_ANGLE
            slot.light.range = getStaticLightRange(host, slot.source)
            if (slot.shadow != null) {
                slot.light.shadowMaxZ = slot.light.range
            }
        }

        slot.currentIntensity = moveTowards(slot.currentIntensity, slot.targetIntensity, timeRate / STATIC_LIGHT_FADE_SECONDS)
        slot.light.intensity = slot.currentIntensity

        if (!active && slot.currentIntensity === 0 && slot.targetIntensity === 0) {
            slot.source = null
        }
    })

    host.actorStaticShadowCasterUpdateTime += timeRate
    if (host.actorStaticShadowCasterUpdateTime >= ACTOR_STATIC_SHADOW_CASTER_UPDATE_SECONDS) {
        host.actorStaticShadowCasterUpdateTime %= ACTOR_STATIC_SHADOW_CASTER_UPDATE_SECONDS
        host.updateActorStaticShadowCasters()
    }

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

export function warmUpStaticShadowMaps(host: StaticLightingHost) {
    const originalShadows = host.staticLightSlots.map(slot => slot.shadow)
    let hasAlternateShadow = false

    host.staticLightSlots.forEach(slot => {
        if (slot.largeCampfireShadow != null) {
            selectStaticShadowGenerator(slot, slot.largeCampfireShadow)
            hasAlternateShadow = true
        }
    })

    if (hasAlternateShadow) {
        host.sunLight.getScene().render()
    }

    host.staticLightSlots.forEach((slot, index) => {
        selectStaticShadowGenerator(slot, originalShadows[index])
    })
}

export function updateStaticLightShadowMode(host: StaticLightingHost) {
    const shadowLightLimit = getStaticLightLimit(host)
    host.staticLightSlots.forEach((slot, index) => {
        updateStaticSlotShadowState(host, slot, index, shadowLightLimit, slot.source != null)
    })
}

function updateStaticSlotShadowState(host: StaticLightingHost, slot: StaticLightSlot, index: number, shadowLightLimit: number, sourceActive: boolean) {
    const shadowSlotEnabled = slot.shadow != null && index < shadowLightLimit
    slot.light.shadowEnabled = shadowSlotEnabled
    if (slot.shadow == null) {
        return
    }

    const outdoorLightVisible = host.indoor || host.localLightFactor > 0.05
    const shadowVisible = shadowSlotEnabled
        && sourceActive
        && slot.source?.profile.castsShadows !== false
        && outdoorLightVisible
    setStaticShadowGeneratorActive(slot.shadow, shadowVisible)
}

function assignStaticLightSlot(host: StaticLightingHost, slot: StaticLightSlot, source: StaticLightSource) {
    selectStaticShadowGenerator(slot, getStaticLightShadowMapSize(source) === LARGE_CAMPFIRE_SHADOW_MAP_SIZE
        ? slot.largeCampfireShadow
        : slot.standardShadow)
    slot.source = source
    slot.currentIntensity = 0
    slot.targetIntensity = 0
    slot.light.position.set(source.position.x, source.position.y + source.profile.height, source.position.z)
    slot.light.direction.copyFrom(source.profile.direction ?? DEFAULT_STATIC_LIGHT_DIRECTION)
    slot.light.angle = source.profile.angle ?? DEFAULT_STATIC_LIGHT_ANGLE
    slot.light.range = getStaticLightRange(host, source)
    if (slot.shadow != null) {
        slot.light.shadowMaxZ = slot.light.range
    }
    slot.light.diffuse = source.profile.color
    slot.light.specular = source.profile.color
}

function assignUnslottedStaticLightSources(host: StaticLightingHost, usableSlots: StaticLightSlot[], sources: StaticLightSource[], shadowMapSize: number) {
    const resolutionSpecificSlots = usableSlots.length > 0 && usableSlots[0].standardShadow != null
    for (const source of sources) {
        const requiredShadowMapSize = resolutionSpecificSlots
            ? getStaticLightShadowMapSize(source)
            : STATIC_SHADOW_MAP_SIZE
        if (requiredShadowMapSize !== shadowMapSize || usableSlots.some(slot => slot.source === source)) {
            continue
        }
        let emptySlot = findAvailableStaticLightSlot(usableSlots, shadowMapSize)
        if (emptySlot == null && shadowMapSize === LARGE_CAMPFIRE_SHADOW_MAP_SIZE) {
            emptySlot = moveStandardSourceOutOfLargeCampfireSlot(host, usableSlots)
        }
        if (emptySlot != null) {
            assignStaticLightSlot(host, emptySlot, source)
        }
    }
}

function findAvailableStaticLightSlot(slots: StaticLightSlot[], shadowMapSize: number): StaticLightSlot | null {
    if (shadowMapSize === LARGE_CAMPFIRE_SHADOW_MAP_SIZE) {
        return slots.find(slot => slot.source == null && slot.currentIntensity === 0 && slot.largeCampfireShadow != null) ?? null
    }

    return slots.find(slot => slot.source == null && slot.currentIntensity === 0 && slot.largeCampfireShadow == null)
        ?? slots.find(slot => slot.source == null && slot.currentIntensity === 0)
        ?? null
}

function moveStandardSourceOutOfLargeCampfireSlot(host: StaticLightingHost, slots: StaticLightSlot[]): StaticLightSlot | null {
    const targetSlot = slots.find(slot => slot.source == null
        && slot.currentIntensity === 0
        && slot.largeCampfireShadow == null)
    const sourceSlot = slots.find(slot => slot.largeCampfireShadow != null
        && slot.source != null
        && getStaticLightShadowMapSize(slot.source) === STATIC_SHADOW_MAP_SIZE)
    if (targetSlot == null || sourceSlot?.source == null) {
        return null
    }

    const currentIntensity = sourceSlot.currentIntensity
    const targetIntensity = sourceSlot.targetIntensity
    assignStaticLightSlot(host, targetSlot, sourceSlot.source)
    targetSlot.currentIntensity = currentIntensity
    targetSlot.targetIntensity = targetIntensity
    targetSlot.light.intensity = currentIntensity

    sourceSlot.source = null
    sourceSlot.currentIntensity = 0
    sourceSlot.targetIntensity = 0
    sourceSlot.light.intensity = 0
    return sourceSlot
}

function getStaticLightShadowMapSize(source: StaticLightSource): number {
    return source.profile.castsShadows === false
        ? STATIC_SHADOW_MAP_SIZE
        : source.profile.shadowMapSize ?? STATIC_SHADOW_MAP_SIZE
}

function selectStaticShadowGenerator(slot: StaticLightSlot, shadow: ShadowGenerator | null) {
    if (slot.shadow === shadow) {
        return
    }
    if (slot.shadow != null) {
        setStaticShadowGeneratorActive(slot.shadow, false)
    }
    slot.shadow = shadow
    if (shadow != null) {
        slot.light.getShadowGenerators()?.set(null, shadow)
    }
}

function createStaticShadowGenerator(host: StaticLightingHost, light: SpotLight, mapSize: number): ShadowGenerator {
    const shadow = new ShadowGenerator(mapSize, light, false)
    shadow.bias = 0.005
    shadow.setDarkness(1)
    shadow.usePoissonSampling = true
    shadow.forceBackFacesOnly = true
    shadow.frustumEdgeFalloff = 0.3
    const shadowMap = shadow.getShadowMap()
    if (shadowMap != null) {
        shadowMap.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
    }
    host.staticShadowGenerators.push(shadow)
    return shadow
}

function setStaticShadowGeneratorActive(shadow: ShadowGenerator, active: boolean) {
    const darkness = active ? 0 : 1
    if (shadow.getDarkness() !== darkness) {
        shadow.setDarkness(darkness)
    }
    const shadowMap = shadow.getShadowMap()
    const refreshRate = active
        ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
        : RenderTargetTexture.REFRESHRATE_RENDER_ONCE
    if (shadowMap != null && shadowMap.refreshRate !== refreshRate) {
        shadowMap.refreshRate = refreshRate
    }
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
    return source.profile.range * (host.indoor ? 1 : source.profile.outdoorRangeFactor ?? OUTDOOR_STATIC_LIGHT_RANGE_FACTOR)
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
