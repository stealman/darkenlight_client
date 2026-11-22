import { FoliageManager } from '@/babylon/world/foliageManager'

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
