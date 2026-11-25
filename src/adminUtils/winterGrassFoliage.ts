import { Vector2 } from '@babylonjs/core'
import type { Matrix } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { FoliageManager } from '@/babylon/world/foliageManager'
import type { TerrainFoliage } from '@/babylon/world/foliageManager'
import type { MapBlock } from '@/data/worldDataManager'
import { findFoliagePatch, forEachFoliageWallFoot } from './terrainFoliagePatches'

export const GRASS_ROW = 0
const TWIGS = 3, MOSS = 6, PEBBLES = 7
export const DRY_GRASS = 5
// The preview shader remaps these rows to the shared sprites with a different palette.
const MOSSY_PEBBLES = 8, EMPTY_TUFT = 9, SINGLE_MOSSY_PEBBLE = 10
const ROCK_PEBBLES = 11, LIGHT_ROCK_PEBBLE = 12
const SNOW_COLUMN_OFFSET = 8
const PEBBLE_ATLAS_Y = new Set([PEBBLES, MOSSY_PEBBLES, SINGLE_MOSSY_PEBBLE]
    .map(row => FoliageManager.getAtlasOffset(0, 0, row).y))
const SINGLE_PEBBLE_SIZE = [0.43, 0.68] as const
// One stone in each pebble cell, in pixels from the cell's lower left.
const SINGLE_PEBBLE_BOUNDS = [[25, 7, 48, 21], [37, 35, 47, 50], [36, 43, 48, 55], [31, 42, 48, 56]]
const PLANT_PATCHES = {
    spacing: 4.6, salt: 6210, minRadius: 1.45, radiusRange: 1.35,
    rows: [GRASS_ROW, GRASS_ROW, GRASS_ROW, GRASS_ROW, GRASS_ROW, GRASS_ROW, DRY_GRASS, EMPTY_TUFT],
}
const GROUND_PATCHES = {
    spacing: 4.9, salt: 7240, minRadius: 1.35, radiusRange: 1.2,
    rows: [SINGLE_MOSSY_PEBBLE, SINGLE_MOSSY_PEBBLE, TWIGS, MOSS],
    radiusBonus: {[SINGLE_MOSSY_PEBBLE]: -0.45},
}
const GRASS_HEIGHT = 0.49

export function snowFoliageOffset(uv: Vector2, layer: 'ground' | 'blended') {
    if (layer === 'blended' || (layer === 'ground' && !PEBBLE_ATLAS_Y.has(uv.y))) return undefined
    return new Vector2(uv.x + SNOW_COLUMN_OFFSET, uv.y)
}

export function rockPebbleOffset(uv: Vector2, matrix: Matrix, layer: 'ground' | 'blended', originX = 0, originZ = 0) {
    if (layer !== 'ground') return uv
    const x = Math.round((matrix.m[12] + originX) * 128), z = Math.round((matrix.m[14] + originZ) * 128)
    const row = FoliageManager.roll(x, z, 9541) < 0.13 ? LIGHT_ROCK_PEBBLE : ROCK_PEBBLES
    return new Vector2(uv.x, FoliageManager.getAtlasOffset(0, 0, row).y)
}

export function createGrassFootTufts(map: MapBlock[][], terrainType: number, originX = 0, originZ = 0) {
    const tufts: {matrix: Matrix, row: number}[] = []
    forEachFoliageWallFoot(map, terrainType, (x, z, top, dx, dz, side) => {
        const salt = 8200 + side * 100
        const roll = (offset: number) => FoliageManager.roll(x + originX, z + originZ, salt + offset)
        const growth = roll(0)
        if (growth < 0.20) return
        const count = growth < 0.57 ? 1 : growth < 0.87 ? 2 : 3
        const center = (roll(1) - 0.5) * 0.32
        const spacing = 0.14 + roll(2) * 0.10
        for (let i = 0; i < count; i++) {
            const tuftSalt = salt + 12 + i * 12
            // Anchor the root on the terrace and let the billboard intersect the wall.
            const distanceToWall = 0.12 - 0.095 * roll(3 + i)
            const advance = 0.5 - distanceToWall
            const slide = center + (i - (count - 1) / 2) * spacing
            const rootX = x + dx * advance + dz * slide
            const rootZ = z + dz * advance - dx * slide
            const height = GRASS_HEIGHT * (0.80 + 0.33 * roll(6 + i))
            tufts.push({
                matrix: FoliageManager.tuftMatrix(x + originX, z + originZ, rootX, top, rootZ, tuftSalt, height),
                row: GRASS_ROW,
            })
        }
    })
    return tufts
}

export function createWinterGrassFoliage(transitionWeight: (x: number, z: number) => number, originX = 0, originZ = 0): TerrainFoliage {
    return {
        rows: [GRASS_ROW, GRASS_ROW, GRASS_ROW, GRASS_ROW, DRY_GRASS],
        tuftsPerTile: 0.92,
        tuftHeights: {[GRASS_ROW]: GRASS_HEIGHT, [DRY_GRASS]: 0.45},
        groundRows: GROUND_PATCHES.rows,
        groundPerTile: 0.58,
        groundSizes: {
            [SINGLE_MOSSY_PEBBLE]: SINGLE_PEBBLE_SIZE,
            [MOSSY_PEBBLES]: [0.30, 0.53],
            [TWIGS]: [0.38, 0.69],
            [MOSS]: [0.38, 0.59],
        },
        scatter(x, z, variety) {
            const plants = findFoliagePatch(x + originX, z + originZ, PLANT_PATCHES)
            const ground = findFoliagePatch(x + originX, z + originZ, GROUND_PATCHES)
            const coreStart = 0.58
            const core = Math.min(1, Math.max(0, (plants.influence - coreStart) / 1.75))
            const gapFillChance = 0.24 * Math.max(0, 1 - plants.influence / coreStart)
            const tuftRow = plants.influence > 0.16 && variety < 0.88 ? plants.row : undefined
            const stonePatch = ground.row === SINGLE_MOSSY_PEBBLE
            let groundRow = ground.influence > 0.10 && variety < 0.87 ? ground.row : undefined
            if (stonePatch && ground.influence > 0.40 && variety < 0.34) groundRow = MOSSY_PEBBLES
            return {
                tuftDensity: 0.34 + plants.influence,
                extraTuftChance: gapFillChance + (tuftRow === EMPTY_TUFT ? 0.07 : 0.76) * core ** 1.5,
                extraTuftRow: gapFillChance > 0 ? GRASS_ROW : undefined,
                tuftRow,
                groundDensity: 0.23 + ground.influence * (stonePatch ? 0.68 : 1.14),
                groundRow,
                extraGround: {
                    row: SINGLE_MOSSY_PEBBLE,
                    chance: 0.040 + 0.22 * transitionWeight(x, z),
                    size: SINGLE_PEBBLE_SIZE,
                },
            }
        },
    }
}

export function styleGroundFoliage(ground: PBRCustomMaterial) {
    const snowColumn = SNOW_COLUMN_OFFSET.toFixed(1)
    const mossyY = FoliageManager.getAtlasOffset(0, 0, MOSSY_PEBBLES).y
    const singleY = FoliageManager.getAtlasOffset(0, 0, SINGLE_MOSSY_PEBBLE).y
    const stoneY = FoliageManager.getAtlasOffset(0, 0, PEBBLES).y
    const rockY = FoliageManager.getAtlasOffset(0, 0, ROCK_PEBBLES).y
    const lightRockY = FoliageManager.getAtlasOffset(0, 0, LIGHT_ROCK_PEBBLE).y
    const [firstBounds, ...otherBounds] = SINGLE_PEBBLE_BOUNDS.map(bounds =>
        `vec4(${bounds.map(value => value.toFixed(1)).join(', ')})`)
    ground.Vertex_Definitions('attribute vec2 uvc; varying vec2 vStoneUV; varying vec4 vStoneStyle; varying vec4 vStoneBounds;')
    ground.Vertex_MainBegin(`
        float cluster = 1.0 - step(0.5, abs(uvc.y - ${mossyY.toFixed(1)}));
        float single = 1.0 - step(0.5, abs(uvc.y - ${singleY.toFixed(1)}));
        float bareStone = 1.0 - step(0.5, abs(uvc.y - ${stoneY.toFixed(1)}));
        float rock = 1.0 - step(0.5, abs(uvc.y - ${rockY.toFixed(1)}));
        float lightRock = 1.0 - step(0.5, abs(uvc.y - ${lightRockY.toFixed(1)}));
        float snow = step(${snowColumn}, uvc.x);
        float column = uvc.x - snow * ${snowColumn};
        vec2 foliageAtlasOffset = vec2(column, uvc.y) + vec2(0.0,
            cluster * ${(stoneY - mossyY).toFixed(1)} + single * ${(stoneY - singleY).toFixed(1)}
            + rock * ${(stoneY - rockY).toFixed(1)} + lightRock * ${(stoneY - lightRockY).toFixed(1)});
        vStoneStyle = vec4(max(cluster, single) - bareStone - 2.0 * rock - 3.0 * lightRock, column, max(single, lightRock), snow);
        vStoneBounds = ${firstBounds};
        ${otherBounds.map((bounds, index) => `if (column > ${index}.5) vStoneBounds = ${bounds};`).join('\n        ')}
    `)
    ground.Vertex_After_WorldPosComputed('vStoneUV = uvUpdated - foliageAtlasOffset;')
    ground.Fragment_Definitions('varying vec2 vStoneUV; varying vec4 vStoneStyle; varying vec4 vStoneBounds;')
    ground.Fragment_Before_Lights(`
        if (abs(vStoneStyle.x) > 0.5) {
            // Reflect the tangent components while retaining the upward component of the stone normal.
            normalW = 2.0 * geometricNormalW * dot(normalW, geometricNormalW) - normalW;
        }
        if (vStoneStyle.z > 0.5) {
            vec2 pixel = vStoneUV * 64.0;
            if (any(lessThan(pixel, vStoneBounds.xy)) || any(greaterThanEqual(pixel, vStoneBounds.zw))) {
                discard;
            }
        }
        if (vStoneStyle.x < -1.5) {
            float sourceLight = dot(surfaceAlbedo, vec3(0.2126, 0.7152, 0.0722));
            float shade = mix(0.038, 0.093, smoothstep(0.015, 0.28, sourceLight));
            shade += 0.060 * step(2.5, -vStoneStyle.x);
            surfaceAlbedo = vec3(0.96, 1.0, 1.05) * shade;
        } else if (vStoneStyle.x > 0.5 || vStoneStyle.w > 0.5) {
            vec2 p = vStoneUV * 32.0 + vec2(vStoneStyle.y * 3.2, vStoneStyle.y * 6.8);
            float growth = sin(p.x + 0.9 * sin(p.y)) * sin(p.y * 0.84)
                         + 0.45 * sin(p.y * 2.1 - p.x * 1.17);
            if (vStoneStyle.w > 0.5) {
                // Keep the snow coating muted and let the normals describe the relief.
                float upward = dot(normalW, geometricNormalW);
                float cap = smoothstep(0.60, 0.95, upward + growth * 0.14);
                surfaceAlbedo = mix(vec3(0.44, 0.47, 0.52), vec3(0.58, 0.61, 0.66), cap);
                normalW = normalize(mix(geometricNormalW, normalW, 0.57));
            } else {
                float moss = smoothstep(-0.23, 0.70, growth);
                vec3 stone = surfaceAlbedo * vec3(0.82, 0.89, 0.76);
                float stoneLight = dot(stone, vec3(0.2126, 0.7152, 0.0722));
                vec3 mossColor = vec3(0.79, 1.04, 0.48) * (stoneLight * 0.76 + 0.021);
                surfaceAlbedo = mix(stone, mossColor, mix(0.38, 0.88, moss));
            }
        }
    `)
}
