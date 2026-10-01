import type { AbstractMesh, Color3, ShadowGenerator, SpotLight, Vector3 } from '@babylonjs/core'

export interface StaticLightProfile {
    color: Color3
    height: number
    intensity: number
    range: number
    flicker?: boolean
    pulse?: boolean
    castsShadows?: boolean
    castsActorShadows?: boolean
    direction?: Vector3
    angle?: number
    priority?: number
    outdoorRangeFactor?: number
    shadowMapSize?: number
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
    standardShadow: ShadowGenerator | null
    largeCampfireShadow: ShadowGenerator | null
    source: StaticLightSource | null
    active: boolean
    targetIntensity: number
    currentIntensity: number
    flickerOffset: Vector3
    actorShadowCasters: Set<AbstractMesh>
}
