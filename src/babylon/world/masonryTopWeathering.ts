import type { Matrix } from '@babylonjs/core'

export const MASONRY_TOP_EXPOSURE = 'masonryTopExposure'
export const FULL_TOP_EXPOSURE = 511
const MUDDY_MASONRY_TOP = FULL_TOP_EXPOSURE + 1

// Pack nine sky-facing samples plus the terrain effect into one instance value.
export function markMasonryTopExposure(matrices: readonly Matrix[], layers: readonly number[][], masks: number[],
    terrain: 'snow' | 'mud' | undefined) {
    const covers: {x: number, z: number, xx: number, xz: number, zx: number, zz: number}[] = []
    for (let layer = layers.length - 1; layer >= 0; layer--) {
        for (const index of layers[layer]) {
            const m = matrices[index].m
            if (covers.length === 0) {
                masks[index] = FULL_TOP_EXPOSURE + (terrain === 'mud' ? MUDDY_MASONRY_TOP : 0)
                continue
            }
            let mask = 0
            for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
                const u = (col - 1) * 0.46, v = (row - 1) * 0.46
                const x = m[12] + u * m[0] + v * m[8] + 0.5 * m[4]
                const z = m[14] + u * m[2] + v * m[10] + 0.5 * m[6]
                const sheltered = covers.some(cover => {
                    const dx = x - cover.x, dz = z - cover.z
                    return Math.abs(dx * cover.xx + dz * cover.xz) < 0.53
                        && Math.abs(dx * cover.zx + dz * cover.zz) < 0.53
                })
                if (!sheltered) mask |= 1 << (row * 3 + col)
            }
            if (mask > 0 && terrain === 'mud') mask += MUDDY_MASONRY_TOP
            else if (terrain === 'snow' && mask > 0 && mask < FULL_TOP_EXPOSURE) mask = -mask
            masks[index] = mask
        }
        for (const index of layers[layer]) {
            const m = matrices[index].m
            const determinant = m[0] * m[10] - m[2] * m[8]
            if (Math.abs(determinant) < 1e-6) continue
            covers.push({x: m[12] - 0.5 * m[4], z: m[14] - 0.5 * m[6],
                xx: m[10] / determinant, xz: -m[8] / determinant, zx: -m[2] / determinant, zz: m[0] / determinant})
        }
    }
}

export const masonryTopWeatheringFunctions = `
    float masonryPuddle;
    float masonryTopBit(float mask, vec2 index) {
        return mod(floor(mask / exp2(index.x + index.y * 3.0)), 2.0);
    }
    float masonrySkyExposure(vec3 top) {
        float mask = mod(floor(abs(top.z) + 0.5), ${MUDDY_MASONRY_TOP}.0);
        if (mask >= ${FULL_TOP_EXPOSURE}.0) return 1.0;
        vec2 grid = clamp((top.xy - 0.04) / 0.92, 0.0, 1.0) * 2.0;
        vec2 cell = min(floor(grid), vec2(1.0));
        vec2 t = grid - cell;
        return mix(mix(masonryTopBit(mask, cell), masonryTopBit(mask, cell + vec2(1.0, 0.0)), t.x),
            mix(masonryTopBit(mask, cell + vec2(0.0, 1.0)), masonryTopBit(mask, cell + vec2(1.0)), t.x), t.y);
    }
`

export const masonryTopWeatheringFragment = `
    masonryPuddle = 0.0;
    float masonryUp = smoothstep(0.38, 0.85, geometricNormalW.y);
    float sideEdge = smoothstep(-0.40, -0.08, geometricNormalW.y)
        * (1.0 - smoothstep(0.38, 0.65, geometricNormalW.y));
    if (abs(vMasonryTop.z) > 0.5 && (masonryUp > 0.0 || (sideEdge > 0.0 && vMasonryTop.w < 0.46))) {
        float exposed = smoothstep(0.35, 0.88, masonrySkyExposure(vMasonryTop.xyz)) * (1.0 - staticSnowCover);
        if (exposed > 0.0) {
            vec2 p = mod(vPositionW.xz, 48.0) + vec2(0.61, -0.73) * mod(vPositionW.y, 24.0);
            float patches = terrainNoise(p * 7.0 + vec2(4.1, 9.2));
            float grain = terrainNoise(p * 32.0 + vec2(2.3, 6.1));
            float wet = smoothstep(0.22, 0.69, patches * 0.82 + grain * 0.18);
            surfaceAlbedo *= 1.0 - exposed * masonryUp * (0.08 + wet * 0.38);
            // The noise stays continuous across the rim. Only nearby side fragments can pick up the same patch.
            float spill = sideEdge * 0.84 * (1.0 - smoothstep(0.015, mix(0.20, 0.46, grain), vMasonryTop.w));
            float moss = smoothstep(0.40, 0.785, patches * 0.72 + grain * 0.28);
            float growth = exposed * max(masonryUp, spill);
            vec3 mossColor = terrainContactMossColor(grain) * vec3(0.80, 0.68, 0.84);
            surfaceAlbedo = mix(surfaceAlbedo, mossColor, growth * moss * 0.67);

            if (vMasonryTop.z > ${MUDDY_MASONRY_TOP}.0 && geometricNormalW.y > 0.66) {
                vec2 margin = min(vMasonryTop.xy, 1.0 - vMasonryTop.xy);
                float basin = smoothstep(0.02, 0.20, min(margin.x, margin.y));
                float pockets = terrainNoise(p * 4.35 + vec2(13.1, 2.8));
                float pools = smoothstep(0.49, 0.76, pockets * 0.80 + patches * 0.20);
                float level = smoothstep(0.66, 0.94, geometricNormalW.y);
                masonryPuddle = exposed * basin * pools * level * (1.0 - moss * 0.48);
                surfaceAlbedo *= 1.0 - masonryPuddle * 0.24;
                vec3 waterNormal = normalize(mix(geometricNormalW, vec3(0.0, 1.0, 0.0), 0.72));
                normalW = normalize(mix(normalW, waterNormal, masonryPuddle));
            }

            float lichenSites = terrainNoise(p * 3.3 + vec2(18.7, 4.6));
            if (lichenSites > 0.64) {
                float lobes = terrainNoise(p * 17.0 + vec2(9.5, 14.7));
                float lichen = smoothstep(0.64, 0.80, lichenSites)
                    * smoothstep(0.49, 0.74, lobes * 0.77 + grain * 0.23);
                vec3 lichenColor = terrainContactLichenColor(grain);
                surfaceAlbedo = mix(surfaceAlbedo, lichenColor, growth * lichen * (1.0 - moss * 0.8) * 0.49);
            }

            if (vMasonryTop.z < -0.5) {
                vec2 snowXZ = vPositionW.xz;
                float pockets = terrainNoise(snowXZ * 3.1 + vec2(14.3, 23.5));
                float edgeNoise = terrainNoise(snowXZ * 11.2 + vec2(8.3, 13.6));
                float deposit = smoothstep(0.55, 0.80, pockets * 0.78 + edgeNoise * 0.22) * 0.74;
                float rimReach = mix(0.12, 0.34, edgeNoise);
                float snowRim = sideEdge * 0.76 * (1.0 - smoothstep(0.02, rimReach, vMasonryTop.w));
                float snow = deposit * exposed * max(masonryUp, snowRim);
                if (snow > 0.0) {
                    vec2 snowUV = terrainContactSnowUV(snowXZ, vMasonryTop.w * 0.12);
                    vec3 snowColor = masonrySnowAlbedo(texture2D(staticSnowColor, snowUV).rgb);
                    vec2 snowSurface = snowXZ + vec2(0.38, -0.31) * vPositionW.y;
                    vec2 moundUV = snowSurface * 5.8 + vec2(3.2, 11.1);
                    vec2 grainUV = snowSurface * 23.0 + vec2(7.4, 2.6);
                    float mound = terrainNoise(moundUV);
                    float snowGrain = terrainNoise(grainUV);
                    vec2 moundSlope = vec2(terrainNoise(moundUV + vec2(0.28, 0.0)),
                        terrainNoise(moundUV + vec2(0.0, 0.28))) - mound;
                    vec2 grainSlope = vec2(terrainNoise(grainUV + vec2(0.28, 0.0)),
                        terrainNoise(grainUV + vec2(0.0, 0.28))) - snowGrain;
                    vec2 snowSlope = moundSlope * 0.80 + grainSlope * 0.28;
                    vec3 relief = vec3(snowSlope.x, dot(snowSlope, vec2(0.38, -0.31)), snowSlope.y);
                    relief -= geometricNormalW * dot(geometricNormalW, relief);
                    surfaceAlbedo = mix(surfaceAlbedo, snowColor * mix(0.82, 0.92, snowGrain), snow);
                    vec3 snowNormal = normalize(geometricNormalW - relief);
                    normalW = normalize(mix(normalW, snowNormal, snow * 0.85));
                }
            }
        }
    }
`
