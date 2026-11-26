import { Matrix, Vector2 } from '@babylonjs/core'
import { TaperedBlockBatch } from '../taperedBlockBatch'
import type { BlockSection, TaperedBlockShape } from '../taperedBlockBatch'
import type { createStaticVariation } from './staticVariation'

export const MAX_PALISADE_WOOD_TWIST = Math.PI / 12
const ALONG_X = Matrix.RotationZ(-Math.PI / 2)
const ALONG_Z = Matrix.RotationX(Math.PI / 2)

export interface WoodPiece {
    matrix: Matrix
    shape: TaperedBlockShape | null
}

export function createHorizontalWoodMatrix(length: number, width: number, height: number, alongX: boolean, twist: number) {
    // Local Y follows the wood grain and the long axis of the piece.
    return Matrix.Scaling(alongX ? height : width, length, alongX ? width : height)
        .multiply(Matrix.RotationY(twist))
        .multiply(alongX ? ALONG_X : ALONG_Z)
}

function varyWoodSection(width: number, depth: number, jitter: number, sample: (channel: number) => number): BlockSection {
    const corners = [
        new Vector2(-0.5, -0.5), new Vector2(0.5, -0.5),
        new Vector2(-0.5, 0.5), new Vector2(0.5, 0.5),
    ] as const
    let centerX = 0, centerZ = 0
    for (const [index, corner] of corners.entries()) {
        corner.x += sample(index * 2) * jitter
        corner.y += sample(index * 2 + 1) * jitter
        centerX += corner.x / 4
        centerZ += corner.y / 4
    }
    for (const corner of corners) {
        corner.x = (corner.x - centerX) * width
        corner.y = (corner.y - centerZ) * depth
    }
    return corners
}

export function createWoodShape(variation: ReturnType<typeof createStaticVariation>, part: number,
    topWidth?: number, topDepth?: number, jitter = 0.08): TaperedBlockShape | null {
    if (!TaperedBlockBatch.contact) return null
    return {
        foot: varyWoodSection(1, 1, jitter, channel => variation.signed(part, channel + 20)),
        top: varyWoodSection(topWidth ?? (1 + variation.signed(part, 8) * 0.12),
            topDepth ?? (1 + variation.signed(part, 9) * 0.12), jitter, channel => variation.signed(part, channel + 40)),
    }
}
