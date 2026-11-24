import { Vector2 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { ATLAS_SIZE } from './buildingRoofSnow'

const WALL = 13
const CORNER = 14
const WOOD = 15
const HEIGHT_UNITS = 256

export function encodeWallDampUv(uv: Vector2, centerY: number, surface: 'wall' | 'corner' | 'wood') {
    // Preserve the atlas cell. Thin instances also need the block's height above the house base.
    const flag = {wall: WALL, corner: CORNER, wood: WOOD}[surface]
    return new Vector2(
        uv.x + ATLAS_SIZE * flag,
        uv.y + ATLAS_SIZE * Math.round(centerY * HEIGHT_UNITS),
    )
}

export function configureBuildingWallDamp(material: PBRCustomMaterial) {
    const parts = material.CustomParts
    material.Vertex_Definitions(`
        ${parts.Vertex_Definitions}
        varying float vBuildingDampHeight;
    `)
    material.Vertex_After_WorldPosComputed(`
        ${parts.Vertex_After_WorldPosComputed ?? ''}
        vBuildingDampHeight = positionUpdated.y;
        #ifdef THIN_INSTANCES
            vBuildingDampHeight = positionUpdated.y * length(finalWorld[1].xyz) + vBuildingSurface.y / ${HEIGHT_UNITS}.0;
        #endif
    `)
    material.Fragment_Definitions(`
        ${parts.Fragment_Definitions}
        varying float vBuildingDampHeight;

        vec3 buildingMossColor(float grain) {
            return toLinearSpace(mix(vec3(0.20, 0.25, 0.14), vec3(0.34, 0.41, 0.24), grain));
        }
    `)
    material.Fragment_Before_Lights(`
        ${parts.Fragment_Before_Lights}
        if (buildingSurface.x >= ${WALL}.0 && buildingSurface.x <= ${WOOD}.0 && abs(geometricNormalW.y) < 0.35) {
            bool wetCorner = buildingSurface.x == ${CORNER}.0;
            vec2 wallXZ = mod(vPositionW.xz, 48.0);
            float dampEdge = terrainNoise(wallXZ * 3.3 + vec2(4.1, 9.7));
            float dampGrain = terrainNoise(wallXZ * 12.0 + vec2(vBuildingDampHeight * 7.0, 2.5));
            float height = wetCorner ? mix(0.92, 1.92, dampEdge) : mix(0.60, 1.12, dampEdge);
            height += (dampGrain - 0.5) * 0.24;
            float risingDamp = 1.0 - smoothstep(height * 0.20, height, vBuildingDampHeight);
            float dampStrength = wetCorner ? mix(0.67, 0.82, dampGrain) : mix(0.48, 0.65, dampGrain);
            surfaceAlbedo *= 1.0 - dampStrength * risingDamp;
            if (buildingSurface.x == ${WOOD}.0 && vBuildingDampHeight < height * 0.5) {
                float mossGrain = terrainNoise(wallXZ * 23.0 + vec2(7.2, vBuildingDampHeight * 19.0));
                float moss = 1.0 - smoothstep(height * 0.12, height * 0.5, vBuildingDampHeight);
                moss *= mix(0.55, 1.0, smoothstep(0.22, 0.72, mossGrain));
                surfaceAlbedo = mix(surfaceAlbedo, buildingMossColor(mossGrain), moss * 0.48);
            }
        }
    `)
}
