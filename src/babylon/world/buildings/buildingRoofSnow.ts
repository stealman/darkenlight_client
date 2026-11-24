import { Texture, Vector2 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { terrainContactSnowShader, terrainNoiseShader } from '../terrainSurfaceShader'
import snowColorUrl from '@/adminUtils/assets/snow-atlas.png'

const ATLAS_SIZE = 16
export const SHED_ROOF_OVERHANG = 0.1

export function encodeRoofSnowUv(uv: Vector2, highSide: '+X' | '-X' | '+Z' | '-Z', lowTile: number, raised = false) {
    const slope = {'+X': 1, '-X': 2, '+Z': 3, '-Z': 4}[highSide]
    // Whole-atlas offsets preserve the texture cell while carrying the slope and lowest tile.
    return new Vector2(uv.x + ATLAS_SIZE * (slope + (raised ? 4 : 0)), uv.y + ATLAS_SIZE * lowTile)
}

export function configureBuildingRoofSnow(material: PBRCustomMaterial) {
    const snow = new Texture(snowColorUrl, material.getScene())
    snow.wrapU = snow.wrapV = Texture.CLAMP_ADDRESSMODE
    material.onDisposeObservable.addOnce(() => snow.dispose())
    material.AddUniform('buildingSnowColor', 'sampler2D', snow)
    const parts = material.CustomParts
    material.Vertex_Definitions(`
        ${parts.Vertex_Definitions}
        varying vec2 vBuildingRoof;
    `)
    material.Vertex_Before_PositionUpdated(`
        ${parts.Vertex_Before_PositionUpdated}
        vBuildingRoof = floor(uvc / ${ATLAS_SIZE}.0);
        uvUpdated -= ${ATLAS_SIZE}.0 * vBuildingRoof;
    `)
    material.Fragment_Definitions(`
        ${parts.Fragment_Definitions}
        varying vec2 vBuildingRoof;
        ${terrainNoiseShader}
        ${terrainContactSnowShader}
    `)
    material.Fragment_Before_Lights(`
        ${parts.Fragment_Before_Lights ?? ''}
        // Interpolation can put an integer flag just below its exact value.
        vec2 roof = floor(vBuildingRoof + vec2(0.5));
        if (roof.x > 0.5 && geometricNormalW.y > 0.45) {
            bool raised = roof.x > 4.5;
            float slope = roof.x - (raised ? 4.0 : 0.0);
            bool alongX = slope < 2.5;
            float uphill = mod(slope, 2.0) > 0.5 ? 1.0 : -1.0;
            float uphillCoord = alongX ? vPositionW.x : vPositionW.z;
            float alongEave = alongX ? vPositionW.z : vPositionW.x;
            // The low edge sits half a tile plus the roof overhang beyond its tile center.
            float fromEave = (uphillCoord - roof.y) * uphill + ${0.5 + SHED_ROOF_OVERHANG};
            vec2 roofXZ = mod(vPositionW.xz, 48.0);
            vec2 snowNoise = vec2(alongEave, roof.y);
            float drift = terrainNoise(snowNoise * 1.9);
            float detail = terrainNoise(roofXZ * 8.0);
            float reach = mix(0.31, 0.93, drift) + (detail - 0.5) * 0.21;
            float cover = raised
                ? smoothstep(0.48, 0.72, reach) * (1.0 - smoothstep(0.23, 0.38, fromEave))
                : 1.0 - smoothstep(reach - 0.16, reach + 0.09, fromEave);

            // Wet wood starts at the snowline and dries out at a varying distance uphill.
            float fromSnow = fromEave - reach;
            float dampWidth = mix(0.22, 0.72, terrainNoise(snowNoise * 2.6 + vec2(8.2, 4.1)));
            dampWidth += (detail - 0.5) * 0.16;
            float damp = smoothstep(-0.20, 0.02, fromSnow) * (1.0 - smoothstep(dampWidth * 0.28, dampWidth, fromSnow));
            surfaceAlbedo *= 1.0 - damp * mix(0.34, 0.51, detail) * (raised ? 0.72 : 1.0);
            if (cover > 0.0) {
                vec2 snowUV = terrainContactSnowUV(vPositionW.xz, 0.0);
                vec3 roofSnow = toLinearSpace(texture2D(buildingSnowColor, snowUV).rgb);
                surfaceAlbedo = mix(surfaceAlbedo, roofSnow, cover);
                normalW = normalize(mix(normalW, geometricNormalW, cover * 0.65));
            }
        }
    `)
}
