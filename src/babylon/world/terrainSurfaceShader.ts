import { RawTexture, Texture } from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { STATIC_LIGHT_LIMITS, STATIC_SHADOW_LIGHT_LIMITS } from '@/babylon/scene/lighting/lightConfig'
import { Settings } from '@/settings/settings'
import { TERRAIN_ATLAS_TILES, terrainCoverPatterns } from './terrainAtlasPlacement'

const USE_TERRAIN_NOISE_TEXTURE = true
const TERRAIN_NOISE_SIZE = 512
const noiseTextures = new WeakMap<Scene, RawTexture>()

function createTerrainNoiseTexture(scene: Scene) {
    const values = new Uint8Array(TERRAIN_NOISE_SIZE ** 2)
    let seed = 0x6b842af1
    for (let i = 0; i < values.length; i++) {
        seed ^= seed << 13
        seed ^= seed >>> 17
        seed ^= seed << 5
        values[i] = seed >>> 24
    }
    const texture = RawTexture.CreateLuminanceTexture(values, TERRAIN_NOISE_SIZE, TERRAIN_NOISE_SIZE, scene,
        false, false, Texture.BILINEAR_SAMPLINGMODE)
    texture.name = 'terrainNoise'
    texture.gammaSpace = false
    texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE
    return texture
}

export function configureTerrainNoiseTexture(material: PBRCustomMaterial, surfaceSamplers: number) {
    if (!USE_TERRAIN_NOISE_TEXTURE) return
    const scene = material.getScene()
    const caps = scene.getEngine().getCaps()
    const detailIndex = Settings.detailLevel.level - 1
    const staticShadowSamplers = STATIC_SHADOW_LIGHT_LIMITS[detailIndex] ? STATIC_LIGHT_LIMITS[detailIndex] : 0
    // Include environment maps, sun/personal shadow maps, and the new noise sampler.
    const requiredSamplers = surfaceSamplers + (caps.textureLOD ? 3 : 5) + 2 + staticShadowSamplers + 1
    if (caps.maxTexturesImageUnits < requiredSamplers) return
    let texture = noiseTextures.get(scene)
    if (!texture) {
        texture = createTerrainNoiseTexture(scene)
        noiseTextures.set(scene, texture)
    }
    material.AddUniform('terrainNoiseTexture', 'sampler2D', texture)
    material.Fragment_Definitions(`\n#define TERRAIN_NOISE_TEXTURE\n${material.CustomParts.Fragment_Definitions ?? ''}`)
}

export const terrainNoiseShader = `
    float terrainHash(vec2 p) {
        vec3 h = fract(vec3(p.xyx) * 0.1031);
        h += dot(h, h.yzx + 33.33);
        return fract((h.x + h.y) * h.z);
    }

    float terrainProceduralNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        vec2 t = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(terrainHash(cell), terrainHash(cell + vec2(1.0, 0.0)), t.x),
            mix(terrainHash(cell + vec2(0.0, 1.0)), terrainHash(cell + 1.0), t.x),
            t.y
        );
    }

    float terrainNoise(vec2 p) {
        #ifdef TERRAIN_NOISE_TEXTURE
        vec2 f = fract(p);
        // Preserve the cubic fade between lattice points and let the sampler interpolate.
        vec2 fade = f * f * (3.0 - 2.0 * f);
        vec2 uv = (floor(p) + fade + 0.5) / ${TERRAIN_NOISE_SIZE}.0;
        return texture2D(terrainNoiseTexture, uv).r;
        #else
        return terrainProceduralNoise(p);
        #endif
    }
`

export const terrainFringeShader = `
    float terrainFringeCoverage(vec2 terrainXZ, float fromEdge, float edgeHeight, float minReach, float maxReach) {
        // Anchor the fringe to the world so it crosses wall joins.
        vec2 noisePosition = terrainXZ + vec2(edgeHeight * 1.17, -edgeHeight * 0.79);
        float clusters = terrainNoise(noisePosition * 2.55);
        #ifdef TERRAIN_SIMPLIFIED_WALL_FRINGE
        float lobes = 0.5;
        float edge = fromEdge;
        #else
        float lobes = terrainNoise(noisePosition * 8.2 + vec2(4.7, 9.3));
        float grain = terrainNoise(noisePosition * 19.0 + vec2(fromEdge * 11.0, -fromEdge * 13.0)) - 0.5;
        float edge = fromEdge + grain * 0.10;
        #endif
        float shape = smoothstep(0.17, 0.86, clusters) * 0.78 + lobes * 0.22;
        float reach = mix(minReach, maxReach, shape);
        float feather = mix(0.085, 0.15, lobes);
        float thickness = mix(0.68, 1.0, smoothstep(0.18, 0.62, clusters));
        return thickness * (1.0 - smoothstep(max(0.015, reach - feather), reach + feather, edge));
    }
`
const snowPatch = terrainCoverPatterns[0]
const [snowU, snowV] = snowPatch.origins[0]
const snowPatchBottom = TERRAIN_ATLAS_TILES - snowV - snowPatch.size

export const terrainContactMossShader = `
    vec3 terrainContactMossColor(float grain) {
        return toLinearSpace(mix(vec3(0.20, 0.25, 0.14), vec3(0.34, 0.41, 0.24), grain));
    }
`

export const terrainContactSnowShader = `
    vec2 terrainContactSnowUV(vec2 worldXZ, float aboveSnow) {
        // Project the atlas patch up the face so the grain stays visible on vertical surfaces.
        vec2 patchUV = worldXZ + vec2(0.73, 0.89) * aboveSnow;
        patchUV = ${snowPatch.size}.0 - abs(mod(patchUV, ${2 * snowPatch.size}.0) - ${snowPatch.size}.0);
        return (vec2(${snowU}, ${snowPatchBottom}) + clamp(patchUV, 0.004, ${snowPatch.size - 0.004}))
            / ${TERRAIN_ATLAS_TILES}.0;
    }
`
