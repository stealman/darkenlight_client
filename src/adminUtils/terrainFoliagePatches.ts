import type { Matrix } from '@babylonjs/core'
import { TERRAIN_BEVEL_WIDTH } from '@/babylon/world/beveledTerrainBlock'
import { FoliageManager } from '@/babylon/world/foliageManager'
import type { MapBlock } from '@/data/worldDataManager'

export const CARDINAL_NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
const DIAGONAL_NEIGHBORS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const

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

export function forEachFoliageWallFoot(map: MapBlock[][], terrain: number, visit: (
    x: number, z: number, height: number, dx: number, dz: number, side: number, uphill: MapBlock,
) => void) {
    map.forEach((row, x) => row.forEach((block, z) => {
        if (FoliageManager.getTerrainIndex(block) !== terrain) return
        CARDINAL_NEIGHBORS.forEach(([dx, dz], side) => {
            const uphill = map[x + dx]?.[z + dz]
            if (uphill && uphill.totalHeight - block.totalHeight > 0.5) {
                visit(x, z, block.totalHeight, dx, dz, side, uphill)
            }
        })
    }))
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
