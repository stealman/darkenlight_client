import { PBRMaterial, Vector2 } from '@babylonjs/core'
import type { Mesh, RawTexture, Texture } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { terrainNoiseShader } from './terrainNoiseShader'

export const WATER_FIELD_RESOLUTION = 6
export const POND_DISTANCE_RANGE = 3

export const pondSpillShader = `
    vec2 pondSpill(vec2 p) {
        float outerShape = terrainNoise(p * 1.74 + vec2(2.4, 6.1));
        float details = terrainNoise(p * 7.1 + vec2(9.4, 3.2));
        return vec2(mix(0.34, 0.79, outerShape) + (details - 0.5) * 0.14, details);
    }
`

type WaterShore =
    | {field: Texture, size: Vector2}
    | {tiles: {texture: RawTexture, scale: Vector2}}

export function configureTerrainWater(water: Mesh, name: string, shore?: WaterShore) {
    const scene = water.getScene()
    const material = new PBRCustomMaterial(name, scene)
    water.material = material
    material.metallic = 0
    material.roughness = 0.32
    material.directIntensity = 0.75
    material.usePhysicalLightFalloff = false
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
    // Enable Babylon's blend pass. The shader supplies the per-pixel alpha.
    material.alpha = 0.99
    material.useSpecularOverAlpha = false
    material.useRadianceOverAlpha = false
    const preview = shore && 'field' in shore ? shore : undefined
    const tiles = shore && 'tiles' in shore ? shore.tiles : undefined
    // The shoreline overlay extends onto coplanar terrain.
    if (shore) material.zOffset = material.zOffsetUnits = -2
    if (preview) {
        material.AddUniform('pondDistance', 'sampler2D', preview.field)
        material.AddUniform('pondSize', 'vec2', preview.size)
    }
    if (tiles) {
        material.AddUniform('pondDistance', 'sampler2D', undefined)
        material.AddUniform('pondAtlasScale', 'vec2', tiles.scale)
        material.AddAttribute('uvc')
        const attach = material.AttachAfterBind.bind(material)
        material.AttachAfterBind = (mesh, effect) => {
            attach(mesh, effect)
            effect.setTexture('pondDistance', tiles.texture)
        }
    }
    material.backFaceCulling = !!shore
    const ripplePhase = new Vector2(0, 0)
    material.AddUniform('pondRipplePhase', 'vec2', ripplePhase)
    const rippleClock = scene.onBeforeRenderObservable.add(() => {
        if (!water.isEnabled()) return
        const seconds = Math.min(scene.getEngine().getDeltaTime(), 50) / 1000
        ripplePhase.x = (ripplePhase.x + seconds * 1.08) % (2 * Math.PI)
        ripplePhase.y = (ripplePhase.y + seconds * 1.57) % (2 * Math.PI)
    })
    water.onDisposeObservable.addOnce(() => scene.onBeforeRenderObservable.remove(rippleClock))
    if (shore) {
        material.Vertex_Definitions('varying vec2 vPondUV;' + (tiles ? 'attribute vec2 uvc;' : ''))
        material.Vertex_MainBegin(tiles
            ? `vPondUV = (uvc + (position.xz + 0.5) * ${WATER_FIELD_RESOLUTION}.0) * pondAtlasScale;`
            : 'vPondUV = position.xz + 0.5;')
    }
    material.Fragment_Definitions(`
        ${shore ? 'varying vec2 vPondUV;' : ''}
        float pondDepth;
        ${terrainNoiseShader}
        ${pondSpillShader}
    `)
    material.Fragment_Custom_Alpha(`
        vec2 p = ${preview ? 'vPondUV * pondSize' : 'vPositionW.xz'};
        float fromShore = ${shore
            ? `(texture2D(pondDistance, vPondUV).r - 0.5) * ${POND_DISTANCE_RANGE * 2}.0`
            : `${POND_DISTANCE_RANGE}.0`};
        vec2 spill = pondSpill(p);
        float shoreline = fromShore + spill.x;
        if (shoreline <= 0.0) discard;
        float variation = terrainNoise(p * 1.2 + vec2(3.2, 17.1));
        float shallows = mix(1.28, 1.82, variation);
        float depthDistance = fromShore + (spill.y - 0.5) * 0.18;
        pondDepth = smoothstep(-0.13, shallows, depthDistance);
        float opacityDepth = smoothstep(0.0, shallows + 0.65, depthDistance);
        float bodyOpacity = mix(0.55, 0.88, opacityDepth);
        alpha = smoothstep(0.0, 0.53, shoreline) * bodyOpacity;
    `)
    material.Fragment_Before_Lights(`
        vec3 shallowsColor = vec3(0.082, 0.129, 0.113);
        vec3 deepColor = vec3(0.042, 0.085, 0.084);
        surfaceAlbedo = mix(shallowsColor, deepColor, pondDepth);
        float rippleFade = smoothstep(0.05, 0.60, shoreline) * mix(0.62, 1.0, pondDepth);
        vec2 along = vec2(0.87, 0.49);
        vec2 across = vec2(-0.25, 0.97);
        vec2 crosswind = vec2(0.96, -0.28);
        // Warp the phase independently in each direction to break up repeated highlight rows.
        float drift = terrainNoise(p * 2.8 + vec2(12.7, 4.1));
        float first = dot(p, along) * 17.9 + (drift - 0.5) * 6.2 - pondRipplePhase.x;
        float second = dot(p, across) * 24.8 + (variation - 0.5) * 7.1 - pondRipplePhase.y;
        float third = dot(p, crosswind) * 31.3 + (spill.y - 0.5) * 4.5 - (pondRipplePhase.x + pondRipplePhase.y);
        vec2 slope = along * (mix(0.024, 0.048, variation) * cos(first))
            + across * (mix(0.016, 0.034, drift) * cos(second)) + crosswind * (0.018 * cos(third));
        normalW = normalize(normalW + vec3(slope.x, 0.0, slope.y) * rippleFade);
        surfaceAlbedo *= 1.0 + rippleFade * (0.030 * sin(first) + 0.018 * sin(second) + 0.012 * sin(third));
    `)
    material.Fragment_Custom_MetallicRoughness('metallicRoughness.g = mix(0.48, 0.29, pondDepth);')
}
