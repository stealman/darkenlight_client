import { Vector2 } from '@babylonjs/core'
import type { Matrix } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { TerrainEnum1 } from '@/babylon/materials'
import { FoliageManager } from '@/babylon/world/foliageManager'
import type { FoliageLayer, TerrainFoliage } from '@/babylon/world/foliageManager'
import type { MapBlock } from '@/data/worldDataManager'
import { MUDDY_DRY_GRASS } from './muddyDirtFoliage'
import { findFoliagePatch, forEachFoliageWallFoot } from './terrainFoliagePatches'

const GRASS = 0, TWIGS = 3, SCRUB = 4, DRY_GRASS = 5, MOSS = 6, PEBBLES = 7
// The preview shader remaps these rows to the shared sprites with a different palette.
const MOSSY_PEBBLES = 8, WINTER_SCRUB = 9, SINGLE_MOSSY_PEBBLE = 10
const SNOW_COLUMN_OFFSET = 8
const PEBBLE_ATLAS_Y = new Set([PEBBLES, MOSSY_PEBBLES, SINGLE_MOSSY_PEBBLE]
    .map(row => FoliageManager.getAtlasOffset(0, 0, row).y))
const SINGLE_PEBBLE_SIZE = [0.43, 0.68] as const
// One stone in each pebble cell, in pixels from the cell's lower left.
const SINGLE_PEBBLE_BOUNDS = [[25, 7, 48, 21], [37, 35, 47, 50], [36, 43, 48, 55], [31, 42, 48, 56]]
const PLANT_PATCHES = {
    spacing: 4.6, salt: 6210, minRadius: 1.45, radiusRange: 1.35,
    rows: [GRASS, GRASS, GRASS, GRASS, GRASS, GRASS, DRY_GRASS, WINTER_SCRUB],
}
const GROUND_PATCHES = {
    spacing: 4.9, salt: 7240, minRadius: 1.35, radiusRange: 1.2,
    rows: [SINGLE_MOSSY_PEBBLE, SINGLE_MOSSY_PEBBLE, TWIGS, MOSS],
    radiusBonus: {[SINGLE_MOSSY_PEBBLE]: -0.45},
}
const GRASS_HEIGHT = 0.49

export function snowFoliageOffset(uv: Vector2, layer: FoliageLayer) {
    if (layer === 'blended' || (layer === 'ground' && !PEBBLE_ATLAS_Y.has(uv.y))) return undefined
    return new Vector2(uv.x + SNOW_COLUMN_OFFSET, uv.y)
}

export function createWinterGrassFootTufts(map: MapBlock[][]) {
    const tufts: {matrix: Matrix, uv: Vector2}[] = []
    forEachFoliageWallFoot(map, TerrainEnum1.TERRAIN_GRASS_WINTER.index, (x, z, top, dx, dz, side) => {
        const salt = 8200 + side * 100
        const roll = (offset: number) => FoliageManager.roll(x, z, salt + offset)
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
                matrix: FoliageManager.tuftMatrix(x, z, rootX, top, rootZ, GRASS, tuftSalt, height),
                uv: FoliageManager.getAtlasOffset(x, z, GRASS, tuftSalt),
            })
        }
    })
    return tufts
}

export function createWinterGrassFoliage(transitionWeight: (x: number, z: number) => number): TerrainFoliage {
    return {
        rows: [GRASS, GRASS, GRASS, GRASS, DRY_GRASS],
        tuftsPerTile: 0.92,
        tuftHeights: {[GRASS]: GRASS_HEIGHT, [DRY_GRASS]: 0.45, [WINTER_SCRUB]: 0.31},
        groundRows: GROUND_PATCHES.rows,
        groundPerTile: 0.58,
        blendedGroundRows: [MOSS],
        groundSizes: {
            [SINGLE_MOSSY_PEBBLE]: SINGLE_PEBBLE_SIZE,
            [MOSSY_PEBBLES]: [0.30, 0.53],
            [TWIGS]: [0.38, 0.69],
            [MOSS]: [0.38, 0.59],
        },
        scatter(x, z, variety) {
            const plants = findFoliagePatch(x, z, PLANT_PATCHES)
            const ground = findFoliagePatch(x, z, GROUND_PATCHES)
            const coreStart = 0.58
            const core = Math.min(1, Math.max(0, (plants.influence - coreStart) / 1.75))
            const gapFillChance = 0.24 * Math.max(0, 1 - plants.influence / coreStart)
            const tuftRow = plants.influence > 0.16 && variety < 0.88 ? plants.row : undefined
            const stonePatch = ground.row === SINGLE_MOSSY_PEBBLE
            let groundRow = ground.influence > 0.10 && variety < 0.87 ? ground.row : undefined
            if (stonePatch && ground.influence > 0.40 && variety < 0.34) groundRow = MOSSY_PEBBLES
            return {
                tuftDensity: 0.34 + plants.influence,
                extraTuftChance: gapFillChance + (tuftRow === WINTER_SCRUB ? 0.07 : 0.76) * core ** 1.5,
                extraTuftRow: gapFillChance > 0 ? GRASS : undefined,
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

export function styleTerrainFoliage(tufts: PBRCustomMaterial, ground: PBRCustomMaterial) {
    const snowColumn = SNOW_COLUMN_OFFSET.toFixed(1)
    const grassY = FoliageManager.getAtlasOffset(0, 0, GRASS).y.toFixed(1)
    const winterScrubY = FoliageManager.getAtlasOffset(0, 0, WINTER_SCRUB).y
    const scrubY = FoliageManager.getAtlasOffset(0, 0, SCRUB).y
    const muddyDryY = FoliageManager.getAtlasOffset(0, 0, MUDDY_DRY_GRASS).y
    const dryY = FoliageManager.getAtlasOffset(0, 0, DRY_GRASS).y
    tufts.Vertex_Definitions('attribute vec2 uvc; varying vec3 vTerrainTuftStyle; varying vec3 vSnowTuft;')
    tufts.Vertex_MainBegin(`
        float winterGrass = 1.0 - step(0.5, abs(uvc.y - ${grassY}));
        float winterScrub = 1.0 - step(0.5, abs(uvc.y - ${winterScrubY.toFixed(1)}));
        float muddyDry = 1.0 - step(0.5, abs(uvc.y - (${muddyDryY.toFixed(1)})));
        float muddyScrub = 1.0 - step(0.5, abs(uvc.y - ${scrubY.toFixed(1)}));
        float snow = step(${snowColumn}, uvc.x);
        vec2 foliageAtlasOffset = vec2(uvc.x - snow * ${snowColumn}, uvc.y) + vec2(0.0, winterScrub * ${(scrubY - winterScrubY).toFixed(1)}
            + muddyDry * ${(dryY - muddyDryY).toFixed(1)});
        vTerrainTuftStyle = vec3(winterGrass, winterScrub, max(muddyDry, muddyScrub));
        vSnowTuft = vec3(snow, step(5.5, uvc.y), position.y);
    `)
    tufts.Fragment_Definitions('varying vec3 vTerrainTuftStyle; varying vec3 vSnowTuft;')
    tufts.Fragment_Before_Lights(`
        surfaceAlbedo *= mix(vec3(1.0), vec3(0.79, 0.53, 0.58), vTerrainTuftStyle.x);
        vec3 lightScrub = surfaceAlbedo * vec3(1.05, 1.30, 1.44) + vec3(0.009, 0.008, 0.005);
        surfaceAlbedo = mix(surfaceAlbedo, lightScrub, vTerrainTuftStyle.y);
        surfaceAlbedo *= mix(vec3(1.0), vec3(0.79, 1.08, 1.02), vTerrainTuftStyle.z);
        float snowDust = 0.0;
        vec3 strawEmissiveTint = vec3(1.0);
        if (vSnowTuft.x > 0.5) {
            vec3 paleBrown = surfaceAlbedo * vec3(1.16, 1.29, 1.42) + vec3(0.15, 0.125, 0.095);
            float uneven = 0.06 * sin(dot(vPositionW.xz, vec2(29.0, 19.0)));
            float bladeHeight = vSnowTuft.z + uneven;
            snowDust = 1.0 - smoothstep(0.07, 0.34, bladeHeight);
            vec3 plantColor = paleBrown;
            if (vSnowTuft.y > 0.5) {
                float straw = smoothstep(0.22, 0.58, bladeHeight);
                float greenTip = smoothstep(0.58, 0.98, bladeHeight);
                vec3 lowerStem = surfaceAlbedo * vec3(1.32, 0.91, 0.51) + vec3(0.105, 0.061, 0.030);
                vec3 strawMiddle = surfaceAlbedo * vec3(1.70, 1.25, 0.50) + vec3(0.14, 0.105, 0.053);
                vec3 softGreen = surfaceAlbedo * vec3(1.10, 1.38, 0.66) + vec3(0.093, 0.112, 0.062);
                plantColor = mix(mix(lowerStem, strawMiddle, straw), softGreen, greenTip);
                strawEmissiveTint = mix(mix(vec3(0.88, 0.76, 0.70), vec3(1.0), straw), vec3(0.84, 1.12, 1.10), greenTip);
            }
            surfaceAlbedo = mix(plantColor, vec3(0.80, 0.85, 0.92), snowDust * 0.87);
        }
    `)
    tufts.Fragment_Before_FinalColorComposition(`
        finalEmissive *= mix(vec3(1.0), vec3(0.66, 0.40, 0.49), vTerrainTuftStyle.x);
        finalEmissive *= mix(vec3(1.0), vec3(0.89, 1.03, 1.14), vTerrainTuftStyle.y);
        finalEmissive *= mix(vec3(1.0), vec3(0.79, 1.08, 1.02), vTerrainTuftStyle.z);
        if (vSnowTuft.x > 0.5) {
            vec3 snowPlantTone = mix(vec3(1.18, 1.24, 1.29), vec3(1.55, 1.22, 0.55), vSnowTuft.y);
            vec3 litPlant = (finalEmissive * snowPlantTone + vec3(0.051, 0.041, 0.029)) * strawEmissiveTint;
            finalEmissive = mix(litPlant, vec3(0.10, 0.12, 0.15), snowDust);
        }
    `)

    const mossyY = FoliageManager.getAtlasOffset(0, 0, MOSSY_PEBBLES).y
    const singleY = FoliageManager.getAtlasOffset(0, 0, SINGLE_MOSSY_PEBBLE).y
    const stoneY = FoliageManager.getAtlasOffset(0, 0, PEBBLES).y
    const [firstBounds, ...otherBounds] = SINGLE_PEBBLE_BOUNDS.map(bounds =>
        `vec4(${bounds.map(value => value.toFixed(1)).join(', ')})`)
    ground.Vertex_Definitions('attribute vec2 uvc; varying vec2 vStoneUV; varying vec4 vStoneStyle; varying vec4 vStoneBounds;')
    ground.Vertex_MainBegin(`
        float cluster = 1.0 - step(0.5, abs(uvc.y - ${mossyY.toFixed(1)}));
        float single = 1.0 - step(0.5, abs(uvc.y - ${singleY.toFixed(1)}));
        float bareStone = 1.0 - step(0.5, abs(uvc.y - ${stoneY.toFixed(1)}));
        float snow = step(${snowColumn}, uvc.x);
        float column = uvc.x - snow * ${snowColumn};
        vec2 foliageAtlasOffset = vec2(column, uvc.y) + vec2(0.0,
            cluster * ${(stoneY - mossyY).toFixed(1)} + single * ${(stoneY - singleY).toFixed(1)});
        vStoneStyle = vec4(max(cluster, single) - bareStone, column, single, snow);
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
        if (vStoneStyle.x > 0.5 || vStoneStyle.w > 0.5) {
            vec2 pixel = vStoneUV * 64.0;
            if (vStoneStyle.z > 0.5 && (any(lessThan(pixel, vStoneBounds.xy)) || any(greaterThanEqual(pixel, vStoneBounds.zw)))) {
                discard;
            }
            vec2 p = vStoneUV * 32.0 + vec2(vStoneStyle.y * 3.2, vStoneStyle.y * 6.8);
            float growth = sin(p.x + 0.9 * sin(p.y)) * sin(p.y * 0.84)
                         + 0.45 * sin(p.y * 2.1 - p.x * 1.17);
            if (vStoneStyle.w > 0.5) {
                // Use a pale grey base across the whole stone and let the normals describe the relief.
                float upward = dot(normalW, geometricNormalW);
                float cap = smoothstep(0.60, 0.95, upward + growth * 0.14);
                surfaceAlbedo = mix(vec3(0.69, 0.73, 0.79), vec3(0.88, 0.91, 0.95), cap);
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
