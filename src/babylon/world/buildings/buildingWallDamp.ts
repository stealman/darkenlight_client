import { Vector2 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { ATLAS_SIZE } from './buildingRoofSnow'
import { terrainContactMossShader } from '../terrainSurfaceShader'

export const HOUSE_FOUNDATION_SURFACE = 13
const CORNER = 14
const WOOD = 15
const WALL_MIN_X = 16
const WALL_MAX_X = 17
const WALL_MIN_Z = 18
const WALL_MAX_Z = 19
const HEIGHT_UNITS = 256

type ExteriorWall = 'wallMinX' | 'wallMaxX' | 'wallMinZ' | 'wallMaxZ'

export function encodeWallDampUv(uv: Vector2, centerY: number, surface: 'foundation' | 'corner' | 'wood' | ExteriorWall) {
    // Preserve the atlas cell. Thin instances also need the block's height above the house base.
    const flag = {
        foundation: HOUSE_FOUNDATION_SURFACE, corner: CORNER, wood: WOOD,
        wallMinX: WALL_MIN_X, wallMaxX: WALL_MAX_X, wallMinZ: WALL_MIN_Z, wallMaxZ: WALL_MAX_Z,
    }[surface]
    return new Vector2(
        uv.x + ATLAS_SIZE * flag,
        uv.y + ATLAS_SIZE * Math.round(centerY * HEIGHT_UNITS),
    )
}

export function configureBuildingWallDamp(material: PBRCustomMaterial) {
    const parts = material.CustomParts
    material.Vertex_Definitions(`
        ${parts.Vertex_Definitions}
        varying vec2 vBuildingWall;
        #ifdef THIN_INSTANCES
            varying vec2 vBuildingPillarOffset;
        #endif
    `)
    material.Vertex_After_WorldPosComputed(`
        ${parts.Vertex_After_WorldPosComputed ?? ''}
        vBuildingWall = vec2(positionUpdated.y, 0.0);
        #ifdef NORMAL
            // Both the merged wall and the individual wall blocks have house-local face normals.
            float wallFace = vBuildingSurface.x;
            if (wallFace == ${WALL_MIN_X}.0) vBuildingWall.y = -normalUpdated.x;
            if (wallFace == ${WALL_MAX_X}.0) vBuildingWall.y = normalUpdated.x;
            if (wallFace == ${WALL_MIN_Z}.0) vBuildingWall.y = -normalUpdated.z;
            if (wallFace == ${WALL_MAX_Z}.0) vBuildingWall.y = normalUpdated.z;
        #endif
        #ifdef THIN_INSTANCES
            vBuildingWall.x = positionUpdated.y * length(finalWorld[1].xyz) + vBuildingSurface.y / ${HEIGHT_UNITS}.0;
            vBuildingPillarOffset = vec2(0.0);
            if (vBuildingSurface.x == ${CORNER}.0) {
                vBuildingPillarOffset = normalize(finalWorld[0].xyz).xz * positionUpdated.x
                    + normalize(finalWorld[2].xyz).xz * positionUpdated.z;
            }
        #endif
    `)
    material.Fragment_Definitions(`
        ${parts.Fragment_Definitions}
        varying vec2 vBuildingWall;
        #ifdef THIN_INSTANCES
            varying vec2 vBuildingPillarOffset;
        #endif

        ${terrainContactMossShader}
    `)
    material.Fragment_Before_Lights(`
        ${parts.Fragment_Before_Lights}
        if (buildingSurface.x >= ${HOUSE_FOUNDATION_SURFACE}.0 && buildingSurface.x <= ${WALL_MAX_Z}.0 && abs(geometricNormalW.y) < 0.35) {
            bool wetCorner = buildingSurface.x == ${CORNER}.0;
            float wallHeight = vBuildingWall.x;
            vec2 wallXZ = mod(vPositionW.xz, 48.0);
            float dampEdge = terrainNoise(wallXZ * 3.3 + vec2(4.1, 9.7));
            float dampGrain = terrainNoise(wallXZ * 12.0 + vec2(wallHeight * 7.0, 2.5));
            float height = wetCorner ? mix(0.92, 1.92, dampEdge) : mix(0.60, 1.12, dampEdge);
            height += (dampGrain - 0.5) * 0.24;
            float risingDamp = 1.0 - smoothstep(height * 0.20, height, wallHeight);
            float dampStrength = wetCorner ? mix(0.67, 0.82, dampGrain) : mix(0.48, 0.65, dampGrain);
            surfaceAlbedo *= 1.0 - dampStrength * risingDamp;
            #ifdef THIN_INSTANCES
                if (wetCorner) {
                    // World-space noise carries the worn edge across courses.
                    vec2 pillarOffset = abs(vBuildingPillarOffset);
                    float edgeDistance = 0.5 - min(pillarOffset.x, pillarOffset.y);
                    float chips = terrainNoise(wallXZ * 14.0 + mod(vPositionW.y, 48.0) * vec2(9.7, 13.1));
                    float bevelWidth = mix(0.018, 0.13, smoothstep(0.27, 0.76, chips));
                    float bevel = 1.0 - smoothstep(bevelWidth * 0.22, bevelWidth, edgeDistance);
                    if (bevel > 0.0) {
                        vec3 edgeNormal = normalize(vec3(vBuildingPillarOffset.x, 0.0, vBuildingPillarOffset.y));
                        normalW = normalize(mix(normalW, edgeNormal, bevel * 0.88));
                        surfaceAlbedo *= 1.0 - bevel * mix(0.05, 0.20, chips);
                    }
                }
            #endif
            if (buildingSurface.x >= ${WOOD}.0 && wallHeight < height * 0.5) {
                float mossGrain = terrainNoise(wallXZ * 23.0 + vec2(7.2, wallHeight * 19.0));
                float moss = 1.0 - smoothstep(height * 0.12, height * 0.5, wallHeight);
                moss *= mix(0.55, 1.0, smoothstep(0.22, 0.72, mossGrain));
                surfaceAlbedo = mix(surfaceAlbedo, terrainContactMossColor(mossGrain), moss * 0.48);
            }
            if (wetCorner && wallHeight < 0.95) {
                vec2 mossUV = wallXZ * 11.0 + vec2(3.7, 8.2) * wallHeight;
                float patches = terrainNoise(mossUV);
                float grain = terrainNoise(mossUV * 4.3 + vec2(6.1, 9.5));
                float moss = smoothstep(0.49, 0.78, patches * 0.78 + grain * 0.22)
                    * (1.0 - smoothstep(0.25, 0.95, wallHeight));
                surfaceAlbedo = mix(surfaceAlbedo, terrainContactMossColor(grain), moss * 0.42);
            }
            if (vBuildingWall.y > 0.5 && wallHeight > height) {
                // Sample across the courses so the patina flows across the individual wall blocks.
                bool facesX = abs(geometricNormalW.x) > 0.5;
                float alongWall = facesX ? vPositionW.z : vPositionW.x;
                float acrossWall = facesX ? vPositionW.x : vPositionW.z;
                vec2 patinaUV = vec2(alongWall, wallHeight) + acrossWall * vec2(0.67, 0.41);
                float weathering = terrainNoise(patinaUV * vec2(2.2, 1.8)) * 0.78
                    + terrainNoise(patinaUV * vec2(9.0, 4.5) + vec2(4.1, 7.8)) * 0.22;
                float dry = smoothstep(height, height + 0.18, wallHeight);
                float faded = smoothstep(0.36, 0.77, weathering) * dry;
                float stain = (1.0 - smoothstep(0.19, 0.40, weathering)) * dry;
                float woodLuma = dot(surfaceAlbedo, vec3(0.2126, 0.7152, 0.0722));
                surfaceAlbedo = mix(surfaceAlbedo, vec3(woodLuma), faded * 0.30);
                surfaceAlbedo *= 1.0 + faded * 0.20 - stain * 0.21;
            }
        }
    `)
}
