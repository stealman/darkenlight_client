export const TERRAIN_NOISE_SIZE = 512

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
