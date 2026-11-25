import { Matrix } from '@babylonjs/core'
import type { Vector2, Vector3 } from '@babylonjs/core'
import { TerrainEnum1 } from '@/babylon/materials'
import { FoliageManager } from '@/babylon/world/foliageManager'
import type { TerrainFoliage } from '@/babylon/world/foliageManager'
import type { MapBlock } from '@/data/worldDataManager'
import { TERRAIN_CARDINAL_EDGES } from '@/babylon/world/terrainRoofShape'
import { findFoliagePatch, forEachFoliageWallFoot, wallFootDecal } from './terrainFoliagePatches'

// Rows in the preview atlas, counted from the top.
const GRASS = 0, LOW_GRASS = 1, TWIGS = 3, SCRUB = 4, MOSS = 6, PEBBLES = 7
// Virtual row so the preview can tint dry grass specifically on muddy dirt.
export const MUDDY_DRY_GRASS = 11
const PLANT_PATCHES = {spacing: 5, salt: 1010, minRadius: 1.35, radiusRange: 1.55,
    rows: [LOW_GRASS, MUDDY_DRY_GRASS, MUDDY_DRY_GRASS, SCRUB, SCRUB, SCRUB]}
const GROUND_PATCHES = {spacing: 6.5, salt: 2020, minRadius: 1.75, radiusRange: 1.5,
    rows: [MOSS, MOSS, TWIGS, PEBBLES], radiusBonus: {[MOSS]: 0.25}}
const OPEN_MOSS_PATCHES = {spacing: 4.5, salt: 5100, minRadius: 1.45, radiusRange: 0.65,
    rows: [MOSS], radiusBonus: {[MOSS]: 0.25}}
const WALL_MOSS_PATCHES = {spacing: 3.6, salt: 6200, minRadius: 1.0, radiusRange: 1.3, rows: [MOSS]}
const SMALL_MOSS_SIZE = [0.46, 0.88] as const
const MUDDY_DIRT = TerrainEnum1.TERRAIN_MUDDY_DIRT.index

export function createPavingMoss(map: MapBlock[][], visible: (x: number, z: number) => boolean,
    canDecorate: (x: number, z: number) => boolean, originX: number, originZ: number) {
    const moss: {matrix: Matrix, uv: Vector2}[] = []
    const supportsMoss = (block: MapBlock, x: number, z: number) => !block.snowed && canDecorate(x, z)
        && (block.type === MUDDY_DIRT || block.type === TerrainEnum1.TERRAIN_DIRT.index
            || block.type === TerrainEnum1.TERRAIN_GRASS.index || block.type === TerrainEnum1.TERRAIN_GRASS_WINTER.index)
    map.forEach((row, x) => row.forEach((block, z) => {
        if ((!block.stonePath && !block.beigeStonePath) || !visible(x, z) || !supportsMoss(block, x, z)) return
        const worldX = x + originX, worldZ = z + originZ
        const roll = (salt: number) => FoliageManager.roll(worldX, worldZ, salt)
        const place = (centerX: number, centerZ: number, salt: number, lift: number) => {
            const yaw = roll(salt + 3) * 2 * Math.PI
            let size = 0.48 + roll(salt + 4) * 0.50
            const radius = 0.5 * (Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw)))
            if (!FoliageManager.canPlaceGroundCover(map, centerX, centerZ, block.totalHeight, size * radius, supportsMoss)) {
                size *= 0.60
                if (!FoliageManager.canPlaceGroundCover(map, centerX, centerZ, block.totalHeight, size * radius, supportsMoss)) return
            }
            const matrix = Matrix.Scaling(size, 1, size).multiply(Matrix.RotationY(yaw))
            matrix.setTranslationFromFloats(centerX, block.totalHeight + lift, centerZ)
            moss.push({matrix, uv: FoliageManager.getAtlasOffset(worldX, worldZ, MOSS, salt)})
        }
        for (let patch = 0; patch < 3; patch++) {
            const salt = 7520 + patch * 16
            if (roll(salt) < (patch === 0 ? 0.08 : 0.35)) continue
            place(x + (roll(salt + 1) - 0.5) * 0.70, z + (roll(salt + 2) - 0.5) * 0.70, salt, 0.005 + patch * 0.001)
        }
        TERRAIN_CARDINAL_EDGES.forEach(([dx, dz], side) => {
            const adjacent = map[x + dx]?.[z + dz]
            const salt = 7860 + side * 16
            if (!adjacent || adjacent.stonePath || adjacent.beigeStonePath || !supportsMoss(adjacent, x + dx, z + dz)
                || adjacent.totalHeight !== block.totalHeight || roll(salt) < 0.25) return
            const along = (roll(salt + 1) - 0.5) * 0.58
            const towardEdge = 0.32 + roll(salt + 2) * 0.16
            place(x + dx * towardEdge - dz * along, z + dz * towardEdge + dx * along, salt, 0.008 + side * 0.0004)
        })
    }))
    return moss
}

export function createMuddyDirtFootFoliage(map: MapBlock[][], sunDirection: Vector3,
                                          originX: number, originZ: number, wallDecals: boolean) {
    const moss: {matrix: Matrix, uv: Vector2}[] = []
    const tufts: {matrix: Matrix, uv: Vector2}[] = []
    const pebbles: {matrix: Matrix, uv: Vector2}[] = []
    forEachFoliageWallFoot(map, MUDDY_DIRT, (x, z, top, dx, dz, side, uphill) => {
        const roll = (salt: number) => FoliageManager.roll(x + originX, z + originZ, salt)
        const edgeX = x + dx * 0.5
        const edgeZ = z + dz * 0.5
        const sheltered = dx * sunDirection.x + dz * sunDirection.z < 0
        if (wallDecals && FoliageManager.getTerrainIndex(uphill) === MUDDY_DIRT) {
            const {influence} = findFoliagePatch(edgeX + originX, edgeZ + originZ, WALL_MOSS_PATCHES)
            const chance = (sheltered ? 0.51 : 0.36) + Math.min(0.29, influence * 0.19)
            const salt = 6400 + side * 12
            if (roll(salt) < chance) {
                const width = 0.28 + 0.42 * roll(salt + 1)
                const height = 0.13 + 0.22 * roll(salt + 2)
                const matrix = wallFootDecal(x, z, top, dx, dz, salt, width, height, originX, originZ)
                moss.push({matrix, uv: FoliageManager.getAtlasOffset(x + originX, z + originZ, MOSS, salt)})
            }
        }

        const salt = 9400 + side * 100
        const scatter = roll(salt)
        const pebbleCount = scatter < 0.16 ? 0 : scatter < 0.76 ? 1 : 2
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
            tufts.push({matrix: FoliageManager.tuftMatrix(x + originX, z + originZ, rootX, top, rootZ, GRASS, salt, height),
                uv: FoliageManager.getAtlasOffset(x + originX, z + originZ, GRASS, salt)})
        }
    })
    return {moss, tufts, pebbles}
}

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

export function createMuddyDirtFoliageProfiles(map: MapBlock[][], sunDirection: Vector3, originX = 0, originZ = 0) {
    const horizontal = Math.hypot(sunDirection.x, sunDirection.z)
    const lightX = -sunDirection.x / horizontal
    const lightZ = -sunDirection.z / horizontal
    const slope = -sunDirection.y / horizontal
    const terrainHints = map.map((row, x) => row.map((block, z) => {
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
        return {byLedge, shaded, openMud: levelMudCoverage(map, x, z, block.height)}
    }))

    const profile: TerrainFoliage = {
        rows: PLANT_PATCHES.rows,
        tuftHeights: {[LOW_GRASS]: 0.50, [MUDDY_DRY_GRASS]: 0.55, [SCRUB]: 0.41},
        tuftsPerTile: 0.62,
        groundRows: [TWIGS, ...Array<number>(7).fill(PEBBLES)],
        groundDensityMultipliers: {[TWIGS]: 3.6},
        blendedGroundRows: [MOSS],
        groundSizes: {[PEBBLES]: [0.49, 0.77]},
        groundPerTile: 0.60,
        scatter(x, z, variety) {
            const plants = findFoliagePatch(x + originX, z + originZ, PLANT_PATCHES)
            const ground = findFoliagePatch(x + originX, z + originZ, GROUND_PATCHES)
            const {byLedge, shaded, openMud} = terrainHints[Math.round(x)][Math.round(z)]
            const mossPatch = ground.row === MOSS
            const mossCore = mossPatch ? Math.min(1, ground.influence / 2.1) ** 1.35 : 0
            const openPatch = openMud >= 0.68 && mossCore < 0.30
                ? findFoliagePatch(x + originX, z + originZ, OPEN_MOSS_PATCHES).influence : 0
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
