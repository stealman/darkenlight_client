import { ShadowDepthWrapper } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import type { MapBlock } from '@/data/worldDataManager'
import { TERRAIN_ROOF_CORNERS, TERRAIN_STEP_HEIGHT, WATER_BLOCK_TYPE } from './terrainRoofShape'

export const TERRACE_EDGE_ATTRIBUTE = 'terrainTerraceEdge'

export function terraceCornerMasks(map: MapBlock[][], x: number, z: number) {
    const tile = map[x][z]
    if (tile.type <= 0 || tile.type === WATER_BLOCK_TYPE) return 0
    let packed = 0
    for (const [dx, dz] of TERRAIN_ROOF_CORNERS) {
        let mask = 0
        // Encode the four columns in world order so both sides of a seam agree.
        for (let i = 0; i < 4; i++) {
            const neighbor = map[x + Math.min(dx, 0) + (i % 2)]?.[z + Math.min(dz, 0) + (i >> 1)]
            if (neighbor && neighbor.type > 0 && neighbor.height > tile.height - TERRAIN_STEP_HEIGHT) mask |= 1 << i
        }
        // Full corners and diagonally touching terraces have no single inward direction.
        packed = packed * 16 + (mask === 15 || mask === 6 || mask === 9 ? 0 : mask)
    }
    return packed
}

export function configureTerrainTerraceEdges(material: PBRCustomMaterial) {
    material.AddAttribute(TERRACE_EDGE_ATTRIBUTE)
    material.Vertex_Definitions(`
        ${material.CustomParts.Vertex_Definitions ?? ''}
        attribute vec4 ${TERRACE_EDGE_ATTRIBUTE};

        float terraceEdgeHash(vec3 p) {
            vec3 h = fract(p * vec3(0.1031, 0.1030, 0.0973));
            h += dot(h, h.yxz + 33.33);
            return fract((h.x + h.y) * h.z);
        }

        vec3 terraceCornerOffset(float masks, float place, vec2 corner, float height) {
            float mask = mod(floor(masks / place), 16.0);
            vec4 filled = mod(floor(mask / vec4(1.0, 2.0, 4.0, 8.0)), 2.0);
            vec2 inward = vec2(dot(filled, vec4(-1.0, 1.0, -1.0, 1.0)),
                               dot(filled, vec4(-1.0, -1.0, 1.0, 1.0)));
            float lengthSquared = dot(inward, inward);
            if (lengthSquared < 1.0) return vec3(0.0);
            inward *= inversesqrt(lengthSquared);
            vec3 seed = vec3(corner, height) + 17.0;
            float inset = mix(0.025, 0.13, terraceEdgeHash(seed));
            float dropSeed = terraceEdgeHash(seed + vec3(29.1, 8.2, 47.5));
            // One occupied quadrant forms a convex corner. Its drop exceeds the straight-edge range.
            bool convexCorner = dot(filled, vec4(1.0)) == 1.0;
            float drop = convexCorner ? mix(0.12, 0.15, dropSeed) : mix(0.025, 0.10, dropSeed);
            return vec3(inward.x * inset, -drop, inward.y * inset);
        }
    `)
    material.Vertex_After_WorldPosComputed(`
        ${material.CustomParts.Vertex_After_WorldPosComputed ?? ''}
        #ifdef THIN_INSTANCES
        float terraceMasks = terrainTerraceEdge.w;
        if (terraceMasks > 0.0) {
            vec3 terrainPoint = (mat4(world0, world1, world2, world3) * vec4(positionUpdated, 1.0)).xyz;
            float height = terrainTerraceEdge.z;
            float rim = smoothstep(-0.24, -0.05, terrainPoint.y - height);
            if (rim > 0.0) {
                vec2 corner = terrainTerraceEdge.xy - 0.5;
                vec2 uv = clamp(terrainPoint.xz - corner, 0.0, 1.0);
                uv = smoothstep(vec2(0.0), vec2(1.0), uv);
                vec3 nearEdge = mix(terraceCornerOffset(terraceMasks, 4096.0, corner, height),
                    terraceCornerOffset(terraceMasks, 256.0, corner + vec2(1.0, 0.0), height), uv.x);
                vec3 farEdge = mix(terraceCornerOffset(terraceMasks, 16.0, corner + 1.0, height),
                    terraceCornerOffset(terraceMasks, 1.0, corner + vec2(0.0, 1.0), height), 1.0 - uv.x);
                worldPos.xyz += (world * vec4(mix(nearEdge, farEdge, uv.y) * rim, 0.0)).xyz;
                vPositionW = worldPos.xyz;
            }
        }
        #endif
    `)
    material.shadowDepthWrapper = new ShadowDepthWrapper(material, material.getScene(), {standalone: true})
}
