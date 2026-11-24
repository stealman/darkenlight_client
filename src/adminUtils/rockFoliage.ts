import type { Matrix, Vector2 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { TerrainEnum1 } from '@/babylon/materials'
import { FoliageManager } from '@/babylon/world/foliageManager'
import type { TerrainFoliage } from '@/babylon/world/foliageManager'
import type { MapBlock } from '@/data/worldDataManager'
import { findFoliagePatch, forEachFoliageWallFoot, wallFootDecal } from './terrainFoliagePatches'
import { terrainNoiseShader } from '@/babylon/world/terrainSurfaceShader'

const ROCK = TerrainEnum1.TERRAIN_ROCK.index
const PEBBLES = 7, MOSS = 6, LICHEN = 13
const LICHEN_PATCHES = {spacing: 4.6, salt: 2310, minRadius: 1.1, radiusRange: 1.3, rows: [LICHEN]}

export const createRockFoliage = (originX: number, originZ: number): TerrainFoliage => ({
    rows: [], tuftsPerTile: 0, groundPerTile: 1.35, groundRows: [PEBBLES], groundSizes: {[PEBBLES]: [0.32, 0.62]},
    blendedGroundRows: [LICHEN],
    scatter(x, z) {
        const influence = findFoliagePatch(x + originX, z + originZ, LICHEN_PATCHES).influence
        const inGap = influence === 0
        return {
            tuftDensity: 0,
            groundDensity: FoliageManager.patchDensity(x + originX, z + originZ),
            extraGround: inGap
                ? {row: LICHEN, chance: 0.014, size: [0.44, 0.82]}
                : {row: LICHEN, chance: 0.004 + 0.05 * Math.min(1, influence), size: [1.30, 2.65]},
        }
    },
})

export function createRockWallLichen(map: MapBlock[][], originX = 0, originZ = 0) {
    const decals: {matrix: Matrix, uv: Vector2}[] = []
    forEachFoliageWallFoot(map, undefined, (x, z, top, dx, dz, side, uphill) => {
        if (uphill.type !== ROCK || uphill.snowed || map[x][z].snowed) return
        const salt = 2520 + side * 12
        const influence = findFoliagePatch(x + originX + dx * 0.5, z + originZ + dz * 0.5, LICHEN_PATCHES).influence
        const roll = (offset: number) => FoliageManager.roll(x + originX, z + originZ, salt + offset)
        if (roll(0) >= 0.23 + Math.min(0.37, influence * 0.25)) return
        const width = 0.57 + 0.24 * roll(1)
        const height = 0.26 + 0.32 * roll(2)
        decals.push({matrix: wallFootDecal(x, z, top, dx, dz, salt, width, height, originX, originZ),
            uv: FoliageManager.getAtlasOffset(x + originX, z + originZ, LICHEN, salt)})
    })
    return decals
}

export function styleRockLichen(material: PBRCustomMaterial) {
    const lichenY = FoliageManager.getAtlasOffset(0, 0, LICHEN).y
    const mossY = FoliageManager.getAtlasOffset(0, 0, MOSS).y
    const varyings = 'varying float vLichen; varying vec2 vLichenLocal;'
    material.Vertex_Definitions(`${material.CustomParts.Vertex_Definitions} ${varyings}`)
    material.Vertex_MainBegin(`
        vLichen = 1.0 - step(0.5, abs(uvc.y - (${lichenY.toFixed(1)})));
        vLichenLocal = position.xz;
        vec2 foliageAtlasOffset = uvc + vec2(0.0, vLichen * ${(mossY - lichenY).toFixed(1)});
    `)
    material.Fragment_Definitions(`${varyings}\n${terrainNoiseShader}`)
    material.Fragment_Custom_Alpha(`
        if (vLichen > 0.5) {
            vec2 p = vPositionW.xz + vPositionW.y * vec2(0.64, -0.73);
            float patches = terrainNoise(p * 12.0);
            float pores = terrainNoise(p * 52.0 + vec2(7.2, 2.9));
            float bend = terrainNoise(p * 5.3 + vec2(3.1, 8.7));
            vec2 uv = vLichenLocal;
            float axis = uv.x + uv.y * 0.34;
            float spine = uv.y - (bend - 0.5) * 0.47 - 0.20 * uv.x;
            float width = mix(0.045, 0.24, patches);
            float main = 1.0 - smoothstep(width * 0.36, width, abs(spine));
            float fork = 1.0 - smoothstep(0.02, 0.11, abs(spine + 0.65 * axis - 0.13));
            fork *= smoothstep(-0.36, -0.02, axis) * (1.0 - smoothstep(0.05, 0.36, axis));
            float growth = max(main, fork * 0.79);
            if (abs(geometricNormalW.y) < 0.01) {
                float fineWidth = width * 0.65;
                float stem = 1.0 - smoothstep(fineWidth * 0.28, fineWidth, abs(spine));
                float left = 1.0 - smoothstep(0.009, 0.052, abs(spine + (axis + 0.13) * 0.78));
                left *= smoothstep(-0.38, -0.19, axis) * (1.0 - smoothstep(-0.13, 0.0, axis));
                float right = 1.0 - smoothstep(0.008, 0.046, abs(spine - (axis - 0.03) * 0.90));
                right *= smoothstep(-0.03, 0.08, axis) * (1.0 - smoothstep(0.22, 0.40, axis));
                growth = 0.87 * max(stem * 0.90, max(left, right));
            }
            float border = max(abs(uv.x), abs(uv.y));
            float envelope = growth * (1.0 - smoothstep(0.28, 0.49, border));
            float coverage = smoothstep(0.26, 0.70, 0.62 * patches + 0.38 * pores);
            alpha = envelope * coverage * (0.47 + 0.12 * alpha);
        } else if (abs(geometricNormalW.y) < 0.01) {
            alpha *= 0.72 * (2.0 - alpha);
        }
    `)
    material.Fragment_Before_Lights(`
        if (vLichen > 0.5) {
            float shade = dot(surfaceAlbedo, vec3(0.2126, 0.7152, 0.0722));
            surfaceAlbedo = mix(vec3(0.19, 0.213, 0.17), vec3(0.33, 0.37, 0.29), smoothstep(0.02, 0.22, shade));
            if (abs(geometricNormalW.y) < 0.01) {
                float luma = dot(surfaceAlbedo, vec3(0.2126, 0.7152, 0.0722));
                surfaceAlbedo = mix(vec3(luma * 0.92), surfaceAlbedo, 0.24);
            }
        } else if (abs(geometricNormalW.y) < 0.01) {
            surfaceAlbedo *= vec3(0.95, 1.18, 0.82);
        }
    `)
}
