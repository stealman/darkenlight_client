export const LOCAL_TRANSITION_NOISE_PERIOD = 48
export const NOISE_QUARTER_PERIOD = LOCAL_TRANSITION_NOISE_PERIOD / 4

export const terrainTransitionNoiseShader = `
    struct TransitionNoise {
        float shape;
        float grain;
        float halfWidth;
    };

    TransitionNoise sampleTransitionNoise(vec2 p, bool localGrass) {
        float clumps = terrainNoise(p * vec2(1.35, 1.95));
        float shape = (clumps - 0.5) * 1.65;
        #ifdef TERRAIN_LOW_DETAIL_TRANSITIONS
        float grain = 0.0;
        #else
        if (localGrass) {
            shape += (terrainNoise(p * vec2(2.8, 2.3) + vec2(3.0, 7.0)) - 0.5) * 1.5;
        } else {
            shape += sin(p.y * 1.45 + 0.4) * 0.58 + sin(p.y * 3.1) * 0.24;
        }
        float grain = (terrainNoise(p * 6.8) - 0.5) * 0.58;
        #endif
        shape -= sign(shape) * max(abs(shape) - 0.65, 0.0) * 0.32;
        return TransitionNoise(shape, grain, mix(0.26, 0.68, clumps));
    }

    float boundaryDistance(vec4 corners, vec2 tileUV) {
        vec2 uv = clamp(tileUV, 0.0, 1.0);
        return mix(mix(corners.x, corners.y, uv.x), mix(corners.z, corners.w, uv.x), uv.y);
    }

    float localTerrainCoverDistance(float distance, TransitionNoise noise, bool soften, bool rock) {
        float shape = rock ? noise.shape * 0.64 + noise.grain * 0.78 : noise.shape + noise.grain;
        return distance + shape * (soften ? 1.0 - smoothstep(0.75, 1.75, abs(distance)) : 1.0);
    }
`
