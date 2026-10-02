import {
    Color3,
    DirectionalLight,
    RenderTargetTexture,
    ShadowGenerator,
    SpotLight,
} from '@babylonjs/core'
import { getBrightnessIntensityFactor, Settings } from '@/settings/settings'
import type { DayNightCycleSync } from '@/network/messageIfs'
import {
    DEFAULT_DAY_NIGHT_CYCLE_DURATION_MS,
    INITIAL_DAY_NIGHT_PHASE,
    NIGHT_ENVIRONMENT_INTENSITY_FACTOR,
} from '@/babylon/scene/lighting/lightConfig'
import { LightningEffect } from '@/babylon/scene/lighting/lightningEffect'

const SUNRISE_END_PHASE = 1 / 12
const SUNSET_START_PHASE = 1 / 2
const SUNSET_END_PHASE = 7 / 12
const PERSONAL_LIGHT_SUNRISE_END_PHASE = 1 / 32
const PERSONAL_LIGHT_SUNSET_START_PHASE = 53 / 96
const LIGHTING_PHASE_OFFSET = 3 / 4
const NIGHT_SUN_INTENSITY_FACTOR = 0
const DEFAULT_SUN_INTENSITY = 0.75
const DEFAULT_PERSONAL_LIGHT_INTENSITY = 2.5 + (4 / 9)
const OUTDOOR_PERSONAL_LIGHT_FACTOR = 0.75
const DAY_SUN_COLOR = new Color3(1, 0.91, 0.78)
const TWILIGHT_SUN_COLOR = new Color3(1, 0.32, 0.1)
const NIGHT_SUN_COLOR = new Color3(0.3, 0.4, 0.68)
const DAY_FOG_COLOR = new Color3(0.2, 0.22, 0.24)
const TWILIGHT_FOG_COLOR = new Color3(0.16, 0.075, 0.045)
const NIGHT_FOG_COLOR = new Color3(0.018, 0.028, 0.055)
const DAY_FOG_START = 20
const DAY_FOG_END = 50
const NIGHT_FOG_START = 25
const NIGHT_FOG_END = 60
const SUN_BASE_AZIMUTH = Math.atan2(0.3, -0.75)
const SUN_AZIMUTH_RANGE = 20 * Math.PI / 180
const SUN_MIN_ELEVATION = 38 * Math.PI / 180
const SUN_MAX_ELEVATION = 48 * Math.PI / 180
const SUN_SHADOW_DISTANCE = 64

export const FOG_ENABLED = true

export interface DayNightLightingHost {
    shadow: ShadowGenerator
    sunLight: DirectionalLight
    personalLight: SpotLight
    personalShadow: ShadowGenerator
    dayNightPhaseAtSync: number
    dayNightCycleDurationMs: number
    dayNightSynchronizedAt: number
    dayNightPaused: boolean
    daylightFactor: number
    localLightFactor: number
    indoor: boolean
    getEnvironmentIntensity(): number
    updateSharedLightMeshes(): void
    updateActorLightMeshes(): void
}

export function resetDayNightLighting(host: DayNightLightingHost) {
    host.dayNightPhaseAtSync = INITIAL_DAY_NIGHT_PHASE
    host.dayNightCycleDurationMs = DEFAULT_DAY_NIGHT_CYCLE_DURATION_MS
    host.dayNightSynchronizedAt = performance.now()
    host.dayNightPaused = false
    host.daylightFactor = 1
    host.localLightFactor = 0
}

export function synchronizeDayNightCycle(host: DayNightLightingHost, sync: DayNightCycleSync | null | undefined) {
    if (sync == null || !Number.isFinite(sync.phase) || !Number.isFinite(sync.cycleDurationMs) || sync.cycleDurationMs <= 0) {
        return
    }
    host.dayNightPhaseAtSync = ((sync.phase % 1) + 1) % 1
    host.dayNightCycleDurationMs = sync.cycleDurationMs
    host.dayNightSynchronizedAt = performance.now()
    host.dayNightPaused = sync.paused === true
    updateDayNightLighting(host)
}

export function getDayNightPhase(host: DayNightLightingHost): number {
    if (host.dayNightPaused) {
        return host.dayNightPhaseAtSync
    }
    const elapsed = performance.now() - host.dayNightSynchronizedAt
    return (host.dayNightPhaseAtSync + (elapsed / host.dayNightCycleDurationMs)) % 1
}

export function getGameTimeInfo(host: DayNightLightingHost) {
    const phase = getDayNightPhase(host)
    const lightingPhase = getLightingPhase(phase)
    const totalMinutes = Math.floor(phase * 24 * 60)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const phaseName = lightingPhase < SUNRISE_END_PHASE
        ? 'sunrise'
        : lightingPhase < SUNSET_START_PHASE
            ? 'day'
            : lightingPhase < SUNSET_END_PHASE
                ? 'sunset'
                : 'night'

    return {
        time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
        phaseName,
    }
}

export function updateDayNightLighting(host: DayNightLightingHost) {
    if (host.sunLight == null || typeof host.sunLight.getScene !== 'function') {
        return
    }

    const phase = getLightingPhase(getDayNightPhase(host))
    let daylightFactor = 0
    let twilightFactor = 0

    if (phase < SUNRISE_END_PHASE) {
        const progress = phase / SUNRISE_END_PHASE
        daylightFactor = smoothstep(progress)
        twilightFactor = Math.sin(Math.PI * progress)
    } else if (phase < SUNSET_START_PHASE) {
        daylightFactor = 1
    } else if (phase < SUNSET_END_PHASE) {
        const progress = (phase - SUNSET_START_PHASE) / (SUNSET_END_PHASE - SUNSET_START_PHASE)
        daylightFactor = 1 - smoothstep(progress)
        twilightFactor = Math.sin(Math.PI * progress)
    }

    host.daylightFactor = daylightFactor
    host.localLightFactor = 1 - daylightFactor
    const personalLightFactor = getPersonalLightFactor(phase)
    updateLightEnabledState(host)

    const brightnessFactor = getBrightnessIntensityFactor(Settings.brightness)
    const sunIntensity = DEFAULT_SUN_INTENSITY * brightnessFactor
    const personalIntensity = DEFAULT_PERSONAL_LIGHT_INTENSITY * brightnessFactor
    const environmentIntensity = host.getEnvironmentIntensity()
    const scene = host.sunLight.getScene()
    updateFog(host, daylightFactor)

    if (host.indoor) {
        host.sunLight.intensity = 0
        host.personalLight.intensity = personalIntensity
        scene.environmentIntensity = environmentIntensity * NIGHT_ENVIRONMENT_INTENSITY_FACTOR
        updateShadowRefreshRates(host, 0, 1)
        return
    }

    host.sunLight.intensity = sunIntensity * (NIGHT_SUN_INTENSITY_FACTOR + ((1 - NIGHT_SUN_INTENSITY_FACTOR) * daylightFactor))
    host.personalLight.intensity = personalIntensity * OUTDOOR_PERSONAL_LIGHT_FACTOR * personalLightFactor
    scene.environmentIntensity = environmentIntensity * (NIGHT_ENVIRONMENT_INTENSITY_FACTOR + ((1 - NIGHT_ENVIRONMENT_INTENSITY_FACTOR) * daylightFactor))

    setBlendedColor(host.sunLight.diffuse, NIGHT_SUN_COLOR, DAY_SUN_COLOR, TWILIGHT_SUN_COLOR, daylightFactor, twilightFactor, 0.72)
    host.sunLight.specular.copyFrom(host.sunLight.diffuse)
    setBlendedColor(scene.fogColor, NIGHT_FOG_COLOR, DAY_FOG_COLOR, TWILIGHT_FOG_COLOR, daylightFactor, twilightFactor, 0.45)
    updateSunDirection(host, phase)
    updateShadowRefreshRates(host, daylightFactor, personalLightFactor)
    LightningEffect.apply(host.sunLight, scene, sunIntensity, environmentIntensity)
}

function updateFog(host: DayNightLightingHost, daylightFactor: number) {
    const scene = host.sunLight.getScene()
    if (!FOG_ENABLED || host.indoor) {
        if (scene.fogEnabled) {
            scene.fogEnabled = false
        }
        return
    }

    // Keep the fog shader active throughout the outdoor cycle. Switching it at
    // a phase boundary dirties every material and causes a first-cycle stall.
    const nightFactor = 1 - daylightFactor
    scene.fogStart = DAY_FOG_START + ((NIGHT_FOG_START - DAY_FOG_START) * nightFactor)
    scene.fogEnd = DAY_FOG_END + ((NIGHT_FOG_END - DAY_FOG_END) * nightFactor)
    if (!scene.fogEnabled) {
        scene.fogEnabled = true
    }
}

function updateLightEnabledState(host: DayNightLightingHost) {
    const sunEnabled = !host.indoor
    const personalEnabled = true
    const enabledStateChanged = host.sunLight.isEnabled() !== sunEnabled
        || host.personalLight.isEnabled() !== personalEnabled
    if (!enabledStateChanged) {
        return
    }

    host.sunLight.setEnabled(sunEnabled)
    host.personalLight.setEnabled(personalEnabled)
    host.updateSharedLightMeshes()
    host.updateActorLightMeshes()
}

function updateShadowRefreshRates(host: DayNightLightingHost, daylightFactor: number, personalLightFactor: number) {
    if (!Settings.isShadowsEnabled()) {
        return
    }

    const sunShadowMap = host.shadow.getShadowMap()
    const personalShadowMap = host.personalShadow.getShadowMap()
    const sunRefreshRate = daylightFactor > 0.05
        ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
        : RenderTargetTexture.REFRESHRATE_RENDER_ONCE
    const personalRefreshRate = personalLightFactor > 0.05
        ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
        : RenderTargetTexture.REFRESHRATE_RENDER_ONCE

    if (sunShadowMap != null && sunShadowMap.refreshRate !== sunRefreshRate) {
        sunShadowMap.refreshRate = sunRefreshRate
    }
    if (personalShadowMap != null && personalShadowMap.refreshRate !== personalRefreshRate) {
        personalShadowMap.refreshRate = personalRefreshRate
    }
}

function setBlendedColor(target: Color3, night: Color3, day: Color3, twilight: Color3, daylightFactor: number, twilightFactor: number, twilightStrength: number) {
    const baseR = night.r + ((day.r - night.r) * daylightFactor)
    const baseG = night.g + ((day.g - night.g) * daylightFactor)
    const baseB = night.b + ((day.b - night.b) * daylightFactor)
    const warmth = twilightFactor * twilightStrength
    target.set(
        baseR + ((twilight.r - baseR) * warmth),
        baseG + ((twilight.g - baseG) * warmth),
        baseB + ((twilight.b - baseB) * warmth),
    )
}

function updateSunDirection(host: DayNightLightingHost, phase: number) {
    const daylightHalf = phase < SUNSET_START_PHASE
    const halfProgress = daylightHalf
        ? phase / SUNSET_START_PHASE
        : (phase - SUNSET_START_PHASE) / (1 - SUNSET_START_PHASE)
    const pathProgress = smoothstep(halfProgress)
    const azimuthOffset = daylightHalf
        ? -SUN_AZIMUTH_RANGE + (2 * SUN_AZIMUTH_RANGE * pathProgress)
        : SUN_AZIMUTH_RANGE - (2 * SUN_AZIMUTH_RANGE * pathProgress)
    const elevation = daylightHalf
        ? SUN_MIN_ELEVATION + (Math.sin(Math.PI * halfProgress) * (SUN_MAX_ELEVATION - SUN_MIN_ELEVATION))
        : SUN_MIN_ELEVATION
    const horizontal = Math.cos(elevation)
    const azimuth = SUN_BASE_AZIMUTH + azimuthOffset

    host.sunLight.direction.set(
        Math.cos(azimuth) * horizontal,
        -Math.sin(elevation),
        Math.sin(azimuth) * horizontal,
    )
    // The light is parented to the player. Placing it directly opposite its
    // direction keeps the player at the center of the fixed shadow frustum,
    // independently of the player's absolute world coordinates.
    host.sunLight.direction.scaleToRef(-SUN_SHADOW_DISTANCE, host.sunLight.position)
}

function smoothstep(value: number): number {
    const clamped = Math.min(1, Math.max(0, value))
    return clamped * clamped * (3 - (2 * clamped))
}

function getLightingPhase(clockPhase: number): number {
    return (clockPhase + LIGHTING_PHASE_OFFSET) % 1
}

function getPersonalLightFactor(lightingPhase: number): number {
    if (lightingPhase < PERSONAL_LIGHT_SUNRISE_END_PHASE) {
        return 1 - smoothstep(lightingPhase / PERSONAL_LIGHT_SUNRISE_END_PHASE)
    }
    if (lightingPhase < PERSONAL_LIGHT_SUNSET_START_PHASE) {
        return 0
    }
    if (lightingPhase < SUNSET_END_PHASE) {
        return smoothstep(
            (lightingPhase - PERSONAL_LIGHT_SUNSET_START_PHASE)
            / (SUNSET_END_PHASE - PERSONAL_LIGHT_SUNSET_START_PHASE),
        )
    }
    return 1
}
