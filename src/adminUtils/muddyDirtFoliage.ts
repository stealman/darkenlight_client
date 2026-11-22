import type { Vector3 } from '@babylonjs/core'
import { TerrainEnum1 } from '@/babylon/materials'
import type { TerrainFoliage } from '@/babylon/world/foliageManager'
import type { MapBlock } from '@/data/worldDataManager'
import { findFoliagePatch } from './terrainFoliagePatches'

// Rows in the preview atlas, counted from the top.
const LOW_GRASS = 1, TWIGS = 3, SCRUB = 4, DRY_GRASS = 5, MOSS = 6, PEBBLES = 7
const PLANT_PATCHES = {spacing: 5, salt: 1010, minRadius: 1.35, radiusRange: 1.55, rows: [LOW_GRASS, DRY_GRASS, DRY_GRASS, SCRUB, SCRUB, SCRUB]}
const GROUND_PATCHES = {spacing: 6.5, salt: 2020, minRadius: 1.75, radiusRange: 1.5,
    rows: [MOSS, MOSS, TWIGS, PEBBLES], radiusBonus: {[MOSS]: 0.25}}
const OPEN_MOSS_PATCHES = {spacing: 4.5, salt: 5100, minRadius: 1.45, radiusRange: 0.65,
    rows: [MOSS], radiusBonus: {[MOSS]: 0.25}}
const CARDINAL_NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
const SMALL_MOSS_SIZE = [0.46, 0.88] as const
const MUDDY_DIRT = TerrainEnum1.TERRAIN_MUDDY_DIRT.index

function levelMudCoverage(map: MapBlock[][], x: number, z: number, height: number): number {
    let tiles = 0
    for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
            const nearby = map[x + dx]?.[z + dz]
            if (nearby?.type === MUDDY_DIRT && !nearby.snowed && nearby.height === height) {
                tiles++
            } else if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
                return 0
            }
        }
    }
    return tiles / 25
}

export function createMuddyDirtFoliageProfiles(map: MapBlock[][], sunDirection: Vector3) {
    const horizontal = Math.hypot(sunDirection.x, sunDirection.z)
    const lightX = -sunDirection.x / horizontal
    const lightZ = -sunDirection.z / horizontal
    const slope = -sunDirection.y / horizontal
    const terrainHints = map.map((row, x) => row.map((block, z) => {
        const byLedge = CARDINAL_NEIGHBORS.some(([dx, dz]) => (map[x + dx]?.[z + dz]?.height ?? block.height) > block.height)
        let shaded = false
        // Sample toward the preview sun once per tile, independent of the camera and shadow-map pixels.
        for (let distance = 0.5; distance <= 9; distance += 0.5) {
            const other = map[Math.round(x + lightX * distance)]?.[Math.round(z + lightZ * distance)]
            if (!other) break
            if (other.height > block.height + 0.12 + distance * slope) {
                shaded = true
                break
            }
        }
        return {byLedge, shaded, openMud: levelMudCoverage(map, x, z, block.height)}
    }))

    const profile: TerrainFoliage = {
        rows: PLANT_PATCHES.rows,
        tuftHeights: {[LOW_GRASS]: 0.50, [DRY_GRASS]: 0.55, [SCRUB]: 0.41},
        tuftsPerTile: 0.62,
        groundRows: [TWIGS, ...Array<number>(7).fill(PEBBLES)],
        groundDensityMultipliers: {[TWIGS]: 3.6},
        blendedGroundRows: [MOSS],
        groundSizes: {[PEBBLES]: [0.49, 0.77]},
        groundPerTile: 0.60,
        scatter(x, z, variety) {
            const plants = findFoliagePatch(x, z, PLANT_PATCHES)
            const ground = findFoliagePatch(x, z, GROUND_PATCHES)
            const {byLedge, shaded, openMud} = terrainHints[Math.round(x)][Math.round(z)]
            const mossPatch = ground.row === MOSS
            const mossCore = mossPatch ? Math.min(1, ground.influence / 2.1) ** 1.35 : 0
            const openPatch = openMud >= 0.68 && mossCore < 0.30
                ? findFoliagePatch(x, z, OPEN_MOSS_PATCHES).influence : 0
            const openCore = Math.min(1, openPatch / 2.2)
            const mossChance = (shaded ? 0.34 : 0.13) + (shaded ? 0.56 : 0.62) * mossCore
            let groundRow = ground.row !== MOSS && ground.influence > 0.08 && variety < 0.8 ? ground.row : undefined
            if (variety < mossChance) groundRow = MOSS
            else if (byLedge && variety < mossChance + 0.18) groundRow = PEBBLES
            const core = Math.min(1, Math.max(0, (plants.influence - 0.65) / 1.7))
            // Let local species dominate, with occasional other species interspersed.
            return {
                tuftDensity: 0.27 + plants.influence,
                groundDensity: 0.25 + ground.influence * (mossPatch ? 0.85 : 1)
                    + (groundRow === MOSS ? 0.55 * ground.influence * mossCore : 0)
                    + (shaded ? 0.14 : 0) + (byLedge ? 0.10 : 0),
                extraTuftChance: 0.92 * core ** 1.5,
                tuftRow: plants.influence > 0.12 && variety < 0.84 ? plants.row : undefined,
                groundRow,
                groundSize: groundRow === MOSS
                    ? [SMALL_MOSS_SIZE[0] + 0.28 * mossCore, SMALL_MOSS_SIZE[1] + 1.2 * mossCore]
                    : undefined,
                extraGround: openPatch > 0.16
                    ? {
                        row: MOSS,
                        chance: openMud * Math.min(0.55, 0.23 * openPatch) * (shaded ? 1.2 : 1),
                        size: [0.58 + 0.14 * openCore, 0.9 + 0.29 * openCore],
                    }
                    : undefined,
            }
        },
    }
    return new Map([[MUDDY_DIRT, profile]])
}
