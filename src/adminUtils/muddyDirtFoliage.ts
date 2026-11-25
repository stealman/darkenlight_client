import { Matrix } from '@babylonjs/core'
import type { Vector2, Vector3 } from '@babylonjs/core'
import { TerrainEnum1 } from '@/babylon/materials'
import { FoliageManager } from '@/babylon/world/foliageManager'
import type { TerrainFoliage } from '@/babylon/world/foliageManager'
import type { MapBlock } from '@/data/worldDataManager'
import { TERRAIN_CARDINAL_EDGES } from '@/babylon/world/terrainRoofShape'
import { findFoliagePatch, forEachFoliageWallFoot } from './terrainFoliagePatches'

const GRASS = 0, TWIGS = 3, EMPTY_TUFT = 4, MOSS = 6, PEBBLES = 7
export const LOW_GRASS = 1
export const MUDDY_DRY_GRASS = 11
const PLANT_PATCHES = {spacing: 5, salt: 1010, minRadius: 1.35, radiusRange: 1.55,
    rows: [LOW_GRASS, MUDDY_DRY_GRASS, MUDDY_DRY_GRASS, EMPTY_TUFT, EMPTY_TUFT, EMPTY_TUFT]}
const GROUND_PATCHES = {spacing: 6.5, salt: 2020, minRadius: 1.75, radiusRange: 1.5,
    rows: [MOSS, MOSS, TWIGS, PEBBLES], radiusBonus: {[MOSS]: 0.25}}
const MUDDY_DIRT = TerrainEnum1.TERRAIN_MUDDY_DIRT.index

export function createMuddyDirtFootFoliage(map: MapBlock[][], sunDirection: Vector3,
                                          originX: number, originZ: number, ground: boolean) {
    const tufts: {matrix: Matrix, row: number}[] = []
    const pebbles: {matrix: Matrix, uv: Vector2}[] = []
    forEachFoliageWallFoot(map, MUDDY_DIRT, (x, z, top, dx, dz, side) => {
        const roll = (salt: number) => FoliageManager.roll(x + originX, z + originZ, salt)
        const edgeX = x + dx * 0.5
        const edgeZ = z + dz * 0.5
        const sheltered = dx * sunDirection.x + dz * sunDirection.z < 0
        const salt = 9400 + side * 100
        const scatter = roll(salt)
        const pebbleCount = !ground || scatter < 0.16 ? 0 : scatter < 0.76 ? 1 : 2
        for (let i = 0; i < pebbleCount; i++) {
            const pebbleSalt = salt + 12 + i * 12
            const slide = (i - (pebbleCount - 1) / 2) * 0.36 + (roll(pebbleSalt) - 0.5) * 0.24
            const inset = 0.19 + 0.12 * roll(pebbleSalt + 1)
            const yaw = roll(pebbleSalt + 2) * 2 * Math.PI
            const radiusPerUnit = 0.5 * (Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw)))
            const size = Math.min(0.35 + 0.22 * roll(pebbleSalt + 4),
                (Math.min(inset, 0.5 - Math.abs(slide)) - 0.01) / radiusPerUnit)
            const matrix = Matrix.Scaling(size, 1, size).multiply(Matrix.RotationY(yaw))
            matrix.setTranslationFromFloats(edgeX - dx * inset + dz * slide, top + 0.008 + 0.002 * roll(pebbleSalt + 5),
                edgeZ - dz * inset - dx * slide)
            pebbles.push({matrix, uv: FoliageManager.getAtlasOffset(x + originX, z + originZ, PEBBLES, pebbleSalt)})
        }

        if (roll(salt + 2) < (sheltered ? 0.45 : 0.30)) {
            const slide = (roll(salt + 4) - 0.5) * 0.62
            const inset = 0.06 + roll(salt + 5) * 0.12
            const rootX = edgeX - dx * inset + dz * slide
            const rootZ = edgeZ - dz * inset - dx * slide
            const height = 0.21 + roll(salt + 6) * 0.12
            tufts.push({matrix: FoliageManager.tuftMatrix(x + originX, z + originZ, rootX, top, rootZ, salt, height),
                row: GRASS})
        }
    })
    return {tufts, pebbles}
}

export function createMuddyDirtFoliageProfiles(map: MapBlock[][], sunDirection: Vector3, originX: number, originZ: number, withGround: boolean) {
    const horizontal = Math.hypot(sunDirection.x, sunDirection.z)
    const lightX = -sunDirection.x / horizontal
    const lightZ = -sunDirection.z / horizontal
    const slope = -sunDirection.y / horizontal
    const terrainHints = withGround ? map.map((row, x) => row.map((block, z) => {
        const byLedge = TERRAIN_CARDINAL_EDGES.some(([dx, dz]) => (map[x + dx]?.[z + dz]?.height ?? block.height) > block.height)
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
        return {byLedge, shaded}
    })) : undefined

    const profile: TerrainFoliage = {
        rows: PLANT_PATCHES.rows,
        tuftHeights: {[LOW_GRASS]: 0.50, [MUDDY_DRY_GRASS]: 0.55},
        tuftsPerTile: 0.62,
        groundRows: [TWIGS, ...Array<number>(7).fill(PEBBLES)],
        groundDensityMultipliers: {[TWIGS]: 3.6},
        groundSizes: {[PEBBLES]: [0.49, 0.77]},
        groundPerTile: 0.60,
        scatter(x, z, variety) {
            const plants = findFoliagePatch(x + originX, z + originZ, PLANT_PATCHES)
            const core = Math.min(1, Math.max(0, (plants.influence - 0.65) / 1.7))
            const growth = {
                tuftDensity: 0.27 + plants.influence,
                extraTuftChance: 0.92 * core ** 1.5,
                tuftRow: plants.influence > 0.12 && variety < 0.84 ? plants.row : undefined,
            }
            if (!terrainHints) return {...growth, groundDensity: 0}

            const ground = findFoliagePatch(x + originX, z + originZ, GROUND_PATCHES)
            const {byLedge, shaded} = terrainHints[Math.round(x)][Math.round(z)]
            const mossPatch = ground.row === MOSS
            const mossCore = mossPatch ? Math.min(1, ground.influence / 2.1) ** 1.35 : 0
            // Reserve the old moss slots so removing the decals preserves the stone and twig scatter.
            const mossChance = (shaded ? 0.34 : 0.13) + (shaded ? 0.56 : 0.62) * mossCore
            let groundRow = ground.row !== MOSS && ground.influence > 0.08 && variety < 0.8 ? ground.row : undefined
            if (variety < mossChance) groundRow = MOSS
            else if (byLedge && variety < mossChance + 0.18) groundRow = PEBBLES
            return {
                ...growth,
                groundDensity: 0.25 + ground.influence * (mossPatch ? 0.85 : 1)
                    + (shaded ? 0.14 : 0) + (byLedge ? 0.10 : 0),
                groundRow,
            }
        },
    }
    return new Map([[MUDDY_DIRT, profile]])
}
