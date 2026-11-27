import { SNOWMELT_DISTANCE_SCALE, SNOWMELT_MAX_DISTANCE } from './terrainTransitionField'

export const terrainSnowmeltShader = `
    float terrainSnowmeltPooling(vec3 position) {
        vec2 p = position.xz + position.y * vec2(0.61, -0.47);
        return terrainNoise(p * 2.1 + vec2(3.7, 14.2));
    }
    float terrainSnowmeltWetness(float runoff, float pooling) {
        return runoff * mix(0.63, 1.0, pooling) * 1.25;
    }
    float terrainSnowmeltRunoff(float snowDistance, float pooling) {
        return 1.0 - smoothstep(0.31 * ${SNOWMELT_DISTANCE_SCALE},
            mix(1.55 * ${SNOWMELT_DISTANCE_SCALE}, ${SNOWMELT_MAX_DISTANCE}, pooling), snowDistance);
    }
    void applyTerrainSnowmelt(float wetness, vec3 geometryNormal, inout vec3 albedo, inout vec3 normal) {
        albedo *= 1.0 - 0.21 * wetness;
        normal = normalize(mix(normal, geometryNormal, 0.20 * wetness));
    }
    float terrainSnowmeltRoughness(float roughness, float wetness) {
        return clamp(mix(roughness, 0.44, wetness), 0.0, 1.0);
    }
`
