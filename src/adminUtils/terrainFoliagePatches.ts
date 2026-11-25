import { Matrix } from '@babylonjs/core'
import type { Vector2 } from '@babylonjs/core'
import { TERRAIN_BEVEL_WIDTH, TERRAIN_VERTICAL_BEVEL_WIDTH } from '@/babylon/world/beveledTerrainBlock'
import { FoliageManager } from '@/babylon/world/foliageManager'
import type { TerrainFoliage } from '@/babylon/world/foliageManager'
import { WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import { TERRAIN_CARDINAL_EDGES } from '@/babylon/world/terrainRoofShape'
import type { MapBlock } from '@/data/worldDataManager'

const DIAGONAL_NEIGHBORS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const
const TILE_NEIGHBORS = [...TERRAIN_CARDINAL_EDGES, ...DIAGONAL_NEIGHBORS]

export function createWaterEdgeTufts(map: MapBlock[][], profiles: ReadonlyMap<number, TerrainFoliage>, originX = 0, originZ = 0) {
    const tufts: {matrix: Matrix, uv: Vector2}[] = []
    map.forEach((row, x) => row.forEach((block, z) => {
        const profile = profiles.get(FoliageManager.getTerrainIndex(block))
        if (!profile?.tuftsPerTile || !profile.rows.length) return
        const water = TILE_NEIGHBORS.filter(([dx, dz]) => map[x + dx]?.[z + dz]?.type === WATER_BLOCK_TYPE)
        if (!water.length) return
        const roots: [number, number][] = []
        const count = 2 + Math.floor(FoliageManager.roll(x + originX, z + originZ, 11020) * 3)
        for (let attempt = 0; attempt < 12 && roots.length < count; attempt++) {
            const salt = 11100 + attempt * 16
            const roll = (offset: number) => FoliageManager.roll(x + originX, z + originZ, salt + offset)
            const localX = (roll(0) - 0.5) * 0.76, localZ = (roll(1) - 0.5) * 0.76
            const clearance = Math.min(...water.map(([dx, dz]) => Math.hypot(
                Math.max(0, Math.abs(localX - dx) - 0.5), Math.max(0, Math.abs(localZ - dz) - 0.5),
            )))
            // Keep the roots on the outer side of the bank, clear of most of the spill.
            if (clearance < 0.62 || clearance > 1.0 || roots.some(([px, pz]) => Math.hypot(px - localX, pz - localZ) < 0.17)) continue
            roots.push([localX, localZ])
            const rootX = x + localX, rootZ = z + localZ
            const variety = roll(2)
            const scatter = profile.scatter?.(rootX, rootZ, variety)
            const species = scatter?.tuftRow ?? profile.rows[Math.floor(variety * profile.rows.length)]
            tufts.push({
                matrix: FoliageManager.tuftMatrix(x + originX, z + originZ, rootX, block.totalHeight, rootZ, species, salt, profile.tuftHeights?.[species]),
                uv: FoliageManager.getAtlasOffset(x + originX, z + originZ, species, salt),
            })
        }
    }))
    return tufts
}

export function insetTuftFromLedges(map: MapBlock[][], matrix: Matrix) {
    const [rootX, rootY, rootZ] = [matrix.m[12], matrix.m[13], matrix.m[14]]
    const x = Math.round(rootX), z = Math.round(rootZ)
    const top = map[x]?.[z]?.totalHeight
    if (top === undefined) return
    const drops = (dx: number, dz: number) => {
        const neighbor = map[x + dx]?.[z + dz]
        return neighbor !== undefined && top - neighbor.totalHeight > 0.5
    }

    const radius = 0.5 * Math.hypot(matrix.m[0], matrix.m[2])
    const inset = Math.min(0.49, radius + TERRAIN_BEVEL_WIDTH + 0.025)
    const limit = 0.5 - inset
    const localX = Math.max(drops(-1, 0) ? -limit : -0.5, Math.min(rootX - x, drops(1, 0) ? limit : 0.5))
    const localZ = Math.max(drops(0, -1) ? -limit : -0.5, Math.min(rootZ - z, drops(0, 1) ? limit : 0.5))

    // Keep the footprint inside the diagonal cut where a cliff ends at a corner.
    let cornerScale = 1
    const cornerLimit = 1 - TERRAIN_BEVEL_WIDTH - Math.SQRT2 * (radius + 0.025)
    for (const [dx, dz] of DIAGONAL_NEIGHBORS) {
        const towardCorner = dx * localX + dz * localZ
        if (towardCorner > cornerLimit && drops(dx, dz)) {
            cornerScale = Math.min(cornerScale, cornerLimit / towardCorner)
        }
    }
    matrix.setTranslationFromFloats(x + localX * cornerScale, rootY, z + localZ * cornerScale)
}

export function forEachFoliageWallFoot(map: MapBlock[][], terrain: number | undefined, visit: (
    x: number, z: number, height: number, dx: number, dz: number, side: number, uphill: MapBlock,
) => void) {
    map.forEach((row, x) => row.forEach((block, z) => {
        if (terrain !== undefined && FoliageManager.getTerrainIndex(block) !== terrain) return
        TERRAIN_CARDINAL_EDGES.forEach(([dx, dz], side) => {
            const uphill = map[x + dx]?.[z + dz]
            if (block.type > 0 && uphill && uphill.totalHeight - block.totalHeight > 0.5) {
                visit(x, z, block.totalHeight, dx, dz, side, uphill)
            }
        })
    }))
}

export function wallFootDecal(x: number, z: number, top: number, dx: number, dz: number, salt: number,
                             width: number, height: number, originX = 0, originZ = 0) {
    // Fit the decal between the wall's clipped corners.
    const slide = (FoliageManager.roll(x + originX, z + originZ, salt + 3) * 2 - 1) * (0.49 - TERRAIN_VERTICAL_BEVEL_WIDTH - width / 2)
    const matrix = Matrix.Scaling(width, 1, height)
        .multiply(Matrix.RotationYawPitchRoll(Math.atan2(dx, dz), -Math.PI / 2, 0))
    const lift = 0.006 + FoliageManager.roll(x + originX, z + originZ, salt + 4) * 0.04
    matrix.setTranslationFromFloats(x + dx * 0.496 + dz * slide,
        top + height / 2 + lift, z + dz * 0.496 - dx * slide)
    return matrix
}

type FoliagePatches = {
    spacing: number
    salt: number
    minRadius: number
    radiusRange: number
    rows: readonly number[]
    radiusBonus?: Readonly<Record<number, number>>
}

export function findFoliagePatch(x: number, z: number, patches: FoliagePatches) {
    const {spacing, salt, minRadius, radiusRange, rows, radiusBonus} = patches
    const cellX = Math.floor(x / spacing)
    const cellZ = Math.floor(z / spacing)
    let influence = 0
    let row: number | undefined
    for (let cx = cellX - 1; cx <= cellX + 1; cx++) {
        for (let cz = cellZ - 1; cz <= cellZ + 1; cz++) {
            if (FoliageManager.roll(cx, cz, salt) > 0.78) continue
            const dx = x - (cx + FoliageManager.roll(cx, cz, salt + 1)) * spacing
            const dz = z - (cz + FoliageManager.roll(cx, cz, salt + 2)) * spacing
            const patchRow = rows[FoliageManager.hashTile(cx, cz, salt + 6) % rows.length]
            const radius = minRadius + FoliageManager.roll(cx, cz, salt + 3) * radiusRange + (radiusBonus?.[patchRow] ?? 0)
            if (dx * dx + dz * dz >= radius * radius) continue
            const angle = FoliageManager.roll(cx, cz, salt + 4) * 2 * Math.PI
            const along = (dx * Math.cos(angle) + dz * Math.sin(angle)) / radius
            const across = (-dx * Math.sin(angle) + dz * Math.cos(angle)) / (radius * 0.7)
            const falloff = Math.max(0, 1 - along * along - across * across)
            const weight = falloff * falloff * (2 + FoliageManager.roll(cx, cz, salt + 5))
            if (weight > influence) {
                influence = weight
                row = patchRow
            }
        }
    }
    return {influence, row}
}
