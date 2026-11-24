import { Texture, Vector2 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { MaterialEnum1 } from '@/babylon/materials'
import { terrainContactSnowShader, terrainNoiseShader } from '../terrainSurfaceShader'
import snowColorUrl from '@/adminUtils/assets/snow-atlas.png'

export const ATLAS_SIZE = 16
export const SHED_ROOF_OVERHANG = 0.1
export const HOUSE_ROOF_EAVE_OVERHANG = 0.3
export const HOUSE_ROOF_ANGLE = Math.PI / 6
export const HOUSE_ROOF_THICKNESS = 0.2
export const HUMAN_HOUSE_WIDTH = 5
export const HOUSE_ROOF_END_OVERHANG = 0.5

export function encodeRoofSnowUv(uv: Vector2, highSide: '+X' | '-X' | '+Z' | '-Z', lowTile: number, raised = false) {
    const slope = {'+X': 1, '-X': 2, '+Z': 3, '-Z': 4}[highSide]
    // Whole-atlas offsets preserve the texture cell while carrying the slope and lowest tile.
    return new Vector2(uv.x + ATLAS_SIZE * (slope + (raised ? 4 : 0)), uv.y + ATLAS_SIZE * lowTile)
}

export function encodeHouseRoofSnowUv(uv: Vector2, highSide: '+X' | '-X' | '+Z' | '-Z', lowTile: number) {
    const encoded = encodeRoofSnowUv(uv, highSide, lowTile)
    encoded.x += ATLAS_SIZE * 8
    return encoded
}

export function configureBuildingRoofSnow(material: PBRCustomMaterial) {
    const snow = new Texture(snowColorUrl, material.getScene())
    snow.wrapU = snow.wrapV = Texture.CLAMP_ADDRESSMODE
    material.onDisposeObservable.addOnce(() => snow.dispose())
    material.AddUniform('buildingSnowColor', 'sampler2D', snow)
    const parts = material.CustomParts
    const hay = MaterialEnum1.HAY.uv
    const roofSpan = HUMAN_HOUSE_WIDTH + 2 * HOUSE_ROOF_END_OVERHANG
    material.Vertex_Definitions(`
        ${parts.Vertex_Definitions}
        varying vec2 vBuildingSurface;
        varying vec2 vHouseThatch;
    `)
    material.Vertex_Before_PositionUpdated(`
        ${parts.Vertex_Before_PositionUpdated}
        vBuildingSurface = floor(uvc / ${ATLAS_SIZE}.0);
        uvUpdated -= ${ATLAS_SIZE}.0 * vBuildingSurface;
        vHouseThatch = vec2(1.0 - step(0.01, distance(mod(uvc, ${ATLAS_SIZE}.0), vec2(${hay.x}, ${hay.y}))), uv.y);
    `)
    material.Fragment_Definitions(`
        ${parts.Fragment_Definitions}
        varying vec2 vBuildingSurface;
        varying vec2 vHouseThatch;
        ${terrainNoiseShader}
        ${terrainContactSnowShader}

        vec2 houseThatchUV(vec2 atlasUV) {
            #ifdef NORMAL
                if (vHouseThatch.x > 0.5 && abs(vNormalW.y) > 0.45) {
                    float across = (atlasUV.x * ${ATLAS_SIZE}.0 - ${hay.x}) * ${roofSpan}.0;
                    // Mirror repeats to keep sampling continuous across the one-piece roof.
                    atlasUV.x = (${hay.x} + 1.0 - abs(mod(across, 2.0) - 1.0)) / ${ATLAS_SIZE}.0;
                }
            #endif
            return atlasUV;
        }
    `)
    material.Fragment_MainBegin(`
        ${parts.Fragment_MainBegin ?? ''}
        #if defined(ALBEDO) && ALBEDODIRECTUV == 0
            vec2 buildingAlbedoUV = houseThatchUV(vAlbedoUV);
            #define vAlbedoUV buildingAlbedoUV
        #endif
        #if defined(BUMP) && BUMPDIRECTUV == 0
            vec2 buildingBumpUV = houseThatchUV(vBumpUV);
            #define vBumpUV buildingBumpUV
        #endif
        #if defined(EMISSIVE) && EMISSIVEDIRECTUV == 0
            vec2 buildingEmissiveUV = houseThatchUV(vEmissiveUV);
            #define vEmissiveUV buildingEmissiveUV
        #endif
    `)
    material.Fragment_Before_Lights(`
        ${parts.Fragment_Before_Lights ?? ''}
        // Interpolation can put an integer flag just below its exact value.
        vec2 buildingSurface = floor(vBuildingSurface + vec2(0.5));
        if (buildingSurface.x > 0.5 && buildingSurface.x < 12.5) {
            vec2 roof = buildingSurface;
            bool house = roof.x > 8.5;
            bool raised = !house && roof.x > 4.5;
            float slope = roof.x - (house ? 8.0 : raised ? 4.0 : 0.0);
            bool alongX = slope < 2.5;
            float uphill = mod(slope, 2.0) > 0.5 ? 1.0 : -1.0;
            float uphillCoord = alongX ? vPositionW.x : vPositionW.z;
            float alongEave = alongX ? vPositionW.z : vPositionW.x;
            float outward = -uphill * (alongX ? geometricNormalW.x : geometricNormalW.z);
            bool houseEave = house && outward > 0.75;
            if (geometricNormalW.y > 0.45 || houseEave) {
                // Uphill toward +X puts the cold eave on -X. The Z slopes keep full baseline coverage.
                float snowExposure = alongX ? 1.0 + 0.30 * uphill : 1.0;
                float dampExposure = mix(1.0, snowExposure, 0.65);
                // The low edge sits half a tile plus the roof overhang beyond its tile center.
                float fromEave = (uphillCoord - roof.y) * uphill
                    + (house ? ${0.5 + HOUSE_ROOF_EAVE_OVERHANG} : ${0.5 + SHED_ROOF_OVERHANG});
                float edgeDepth = 1.0 - vHouseThatch.y;
                vec2 snowXZ = vPositionW.xz;
                if (houseEave) {
                    // Project the cut face onto the top lip so both faces use the same snow mask.
                    float lipOffset = edgeDepth * ${(HOUSE_ROOF_THICKNESS * Math.sin(HOUSE_ROOF_ANGLE)).toFixed(4)};
                    fromEave -= lipOffset;
                    snowXZ -= (alongX ? vec2(uphill, 0.0) : vec2(0.0, uphill)) * lipOffset;
                }
                vec2 roofXZ = mod(snowXZ, 48.0);
                vec2 snowNoise = vec2(alongEave, roof.y);
                float drift = terrainNoise(snowNoise * 1.9);
                float detail = terrainNoise(roofXZ * 8.0);
                float reach = house
                    ? mix(0.22, 0.52, drift) + (detail - 0.5) * 0.14
                    : mix(0.31, 0.93, drift) + (detail - 0.5) * 0.21;
                reach *= snowExposure;
                float cover = raised
                    ? smoothstep(0.48, 0.72, reach) * (1.0 - smoothstep(0.23 * snowExposure, 0.38 * snowExposure, fromEave))
                    : 1.0 - smoothstep(reach - 0.16, reach + 0.09, fromEave);
                if (house) {
                    float banks = terrainNoise(snowNoise * 1.24 + vec2(5.5, 12.1));
                    cover *= smoothstep(0.28, 0.52, banks + (detail - 0.5) * 0.12);
                }
                if (houseEave) {
                    float edgeNoise = terrainNoise(snowNoise * 8.4 + vec2(3.6, 7.1));
                    float hang = mix(0.24, 0.73, edgeNoise * 0.78 + drift * 0.22) * snowExposure;
                    cover *= 1.0 - smoothstep(hang - 0.09, hang + 0.08, edgeDepth);
                }

                // Wet wood starts at the snowline and dries out at a varying distance uphill.
                float fromSnow = fromEave - reach;
                float dampWidth = mix(0.22, 0.72, terrainNoise(snowNoise * 2.6 + vec2(8.2, 4.1)));
                dampWidth += (detail - 0.5) * 0.16;
                dampWidth *= dampExposure;
                float damp = smoothstep(-0.20, 0.02, fromSnow) * (1.0 - smoothstep(dampWidth * 0.28, dampWidth, fromSnow));
                float dampStrength = mix(0.34, 0.51, detail) * (raised ? 0.72 : 1.0);
                if (house) {
                    // Damp thatch extends uphill from the eave and dries gradually near the ridge.
                    float dryLine = mix(1.42, 1.78, terrainNoise(snowNoise * 1.15 + vec2(8.2, 4.1)));
                    damp = 1.0 - smoothstep(0.72 * dampExposure, dryLine * dampExposure, fromEave);
                    float wetPatches = terrainNoise(roofXZ * 1.8 + vec2(13.5, 3.2)) * 0.72
                        + terrainNoise(roofXZ * 4.5 + vec2(3.4, 9.7)) * 0.28;
                    dampStrength = mix(0.24, 0.76, smoothstep(0.17, 0.80, wetPatches));
                }
                if (!houseEave) surfaceAlbedo *= 1.0 - damp * dampStrength * dampExposure;
                if (cover > 0.0) {
                    vec2 snowUV = terrainContactSnowUV(snowXZ, 0.0);
                    vec3 roofSnow = toLinearSpace(texture2D(buildingSnowColor, snowUV).rgb);
                    surfaceAlbedo = mix(surfaceAlbedo, roofSnow, cover);
                    // Thick snow on the house hides the ribbed thatch underneath.
                    float snowNormalBlend = house ? smoothstep(0.0, 0.72, cover) : cover * 0.65;
                    normalW = normalize(mix(normalW, geometricNormalW, snowNormalBlend));
                }
            }
        }
    `)
}
