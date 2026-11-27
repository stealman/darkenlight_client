import { Matrix } from '@babylonjs/core'
import { MasonryBatch } from '@/babylon/world/masonryBatch'
import { stoneAtlasRow } from '@/babylon/world/stoneAtlas'
import { createStaticVariation } from '@/babylon/world/statics/staticVariation'
import type { StaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { MyPlayer } from '@/data/myPlayer'

type StoneSize = readonly [width: number, height: number, depth: number]

const PEDESTAL_ROUGHNESS = (10 - 8) / 9
const MIDDLE_GRAY_ROW = stoneAtlasRow(false, 0.5)
const COURSE_OVERLAP = 0.004

export function addMasonryPedestal(object: Pick<StaticObject, 'type' | 'position' | 'renderPosition'>,
    base: StoneSize, yaw = 0, upper?: StoneSize, glowTop = false, batch = MasonryBatch) {
    // A single slab keeps its original dimensions, divided into two courses.
    const lower: StoneSize = upper ? base : [base[0], base[1] / 2, base[2]]
    const courses = [lower, upper ?? lower]
    const layers = batch.topWeathering ? [] as number[][] : null
    const variation = createStaticVariation(MyPlayer.worldId, object.position, object.type)
    const {x, y, z} = object.renderPosition
    let bottom = y + 0.5
    for (const [index, [width, height, depth]] of courses.entries()) {
        const top = index === 1
        const rotation = yaw + variation.signed(index, 4) * PEDESTAL_ROUGHNESS * 0.24
        const centerY = bottom + height / 2 + (top ? -1 : 1) * COURSE_OVERLAP / 2
        const matrix = Matrix.Scaling(width, height + COURSE_OVERLAP, depth)
            .multiply(Matrix.RotationY(rotation))
            .setTranslationFromFloats(x, centerY, z)
        const instance = batch.add(matrix, object.position, variation.unit(index), false, PEDESTAL_ROUGHNESS, false, false,
            {row: MIDDLE_GRAY_ROW, glowTop: top && glowTop})
        layers?.push([instance])
        bottom += height
    }
    if (layers) batch.markExposedTops(layers, object.position, true, courses.length - 1)
}
