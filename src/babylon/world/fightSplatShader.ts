import type { Vector3 } from '@babylonjs/core'

export const MAX_FIGHT_SPLATS = 250
export const FIGHT_SPLAT_TTL = 900000

export type TerrainSplat = {
    pos: Vector3
    rot: number
    scaleX: number
    scaleZ: number
    creationTime: number
    deadTime: number
    type: number
    seed: number
}

export const fightSplatShader = `
    float splatHash(vec2 p) {
        vec3 h = fract(p.xyx * 0.1031);
        h += dot(h, h.yzx + 33.33);
        return fract((h.x + h.y) * h.z);
    }

    float splatNoise(vec2 p) {
        vec2 cell = floor(p), t = fract(p);
        t = t * t * (3.0 - 2.0 * t);
        return mix(mix(splatHash(cell), splatHash(cell + vec2(1.0, 0.0)), t.x),
            mix(splatHash(cell + vec2(0.0, 1.0)), splatHash(cell + 1.0), t.x), t.y);
    }

    vec3 splatPigment(float type) {
        if (type < 1.5) return vec3(0.2892, 0.0197, 0.0274);
        if (type < 2.5) return vec3(0.1911, 0.3451, 0.0228);
        if (type < 3.5) return vec3(0.3939, 0.0584, 0.0804);
        if (type < 5.0) return vec3(0.2417, 0.0459, 0.3957);
        return vec3(0.4118, 0.3898, 0.3568);
    }

    vec3 blendTerrainSplats(vec3 albedo, vec3 positionW, float facing) {
        vec2 range = terrainSplatTexel(terrainMarkBucket(positionW.xz)).xy;
        for (int i = int(range.x); i < int(range.y); i += 3) {
            vec4 stamp = terrainSplatTexel(i);
            vec3 delta = positionW - stamp.xyz;
            if (abs(delta.y) >= 0.24 || any(greaterThan(abs(delta.xz), vec2(0.46)))) continue;
            vec4 profile = terrainSplatTexel(i + 1);
            vec2 axis = vec2(stamp.w, profile.x);
            vec2 p = vec2(dot(delta.xz, axis), dot(delta.xz, vec2(-axis.y, axis.x))) / profile.yz;
            float distance2 = dot(p, p);
            if (distance2 >= 1.0) continue;
            vec2 kindSeed = terrainSplatTexel(i + 2).xy;
            float age = clamp((terrainStepTime - profile.w) / ${FIGHT_SPLAT_TTL / 1000}.0, 0.0, 1.0);
            float fade = 1.0 - smoothstep(0.16, 1.0, age);
            if (fade <= 0.0) continue;
            vec2 noiseOffset = vec2(kindSeed.y * 21.7, kindSeed.y * 13.3);
            float grain = splatNoise(p * 15.0 + noiseOffset);
            float shape = splatNoise(p * 3.6 + noiseOffset);
            float roundness = smoothstep(0.20, 0.83, kindSeed.y);
            float bend = (splatHash(noiseOffset) - 0.5) * 0.64;
            // Shift the lobes outward on a smear and sideways on a rounder splash.
            vec2 q = p - vec2(mix(-0.14, -0.04, roundness), bend * p.x);
            float body = length(q / mix(vec2(0.60, 0.40), vec2(0.51, 0.54), roundness));
            vec2 lobeCenter = mix(vec2(0.35, bend + 0.16), vec2(0.29, 0.40 + bend * 0.45), roundness);
            vec2 tailCenter = mix(vec2(-0.56, -bend - 0.16), vec2(-0.38, -0.40 + bend * 0.45), roundness);
            float lobe = length((p - lobeCenter) / mix(vec2(0.35, 0.25), vec2(0.27, 0.30), roundness));
            float tail = length((p - tailCenter) / mix(vec2(0.27, 0.16), vec2(0.25, 0.24), roundness));
            float edge = min(body, min(lobe, tail)) + (shape - 0.5) * 0.86 + (grain - 0.5) * 0.30;
            float center = 1.0 - smoothstep(0.82, 1.04, edge);
            float drops = smoothstep(0.73, 0.86, splatNoise(p * 10.0 - noiseOffset))
                * smoothstep(0.94, 1.20, edge);
            float coverage = max(center * mix(0.70, 1.0, grain), drops * 0.66)
                * (1.0 - smoothstep(0.84, 1.0, distance2));
            if (kindSeed.x > 5.0) coverage *= smoothstep(0.30, 0.74, grain);
            float opacity = coverage * fade * facing * (1.0 - smoothstep(0.13, 0.24, abs(delta.y)));
            vec3 pigment = splatPigment(kindSeed.x);
            // Keep the underlying grain and lighting while tinting dark and bright terrain alike.
            vec3 stained = albedo * (0.38 + pigment * 0.66) + pigment * 0.16;
            albedo = mix(albedo, stained, opacity * 0.92);
        }
        return albedo;
    }
`
