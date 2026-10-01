import type { Color3, ShadowGenerator, SpotLight, Vector3 } from '@babylonjs/core'

export interface StaticLightProfile {
    color: Color3
    height: number
    intensity: number
    range: number
    flicker?: boolean
    castsShadows?: boolean
    castsActorShadows?: boolean
    direction?: Vector3
    angle?: number
    priority?: number
    outdoorRangeFactor?: number
}

export interface StaticLightSource {
    id: string
    position: Vector3
    profile: StaticLightProfile
    visible: boolean
    flickerPhase: number
}

export interface StaticLightSlot {
    light: SpotLight
    shadow: ShadowGenerator | null
    source: StaticLightSource | null
    targetIntensity: number
    currentIntensity: number
    flickerOffset: Vector3
}
