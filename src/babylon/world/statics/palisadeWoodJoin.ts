import type { Matrix } from '@babylonjs/core'
import { WOOD_PATINA_ONLY } from './staticTerrainContact'

export const WOOD_BRACE_JOIN_POSITIVE = WOOD_PATINA_ONLY + 1
export const WOOD_BRACE_JOIN_NEGATIVE = WOOD_PATINA_ONLY + 2
export const WOOD_BEAM_JOIN_BASE = WOOD_PATINA_ONLY + 3
export const WOOD_JOIN_MIN = -0.2
export const WOOD_JOIN_STEP = 0.05

export function getBraceWoodJoin(brace: Matrix, towardX: number, towardZ: number) {
    const m = brace.m
    return towardX * m[8] + towardZ * m[10] >= 0 ? WOOD_BRACE_JOIN_POSITIVE : WOOD_BRACE_JOIN_NEGATIVE
}

export function getBeamWoodJoin(beam: Matrix, braces: readonly Matrix[]) {
    const b = beam.m
    const beamLength = Math.hypot(b[4], b[5], b[6])
    if (b[5] <= 0) return
    // One quantized join height per cardinal face, starting with -X and +X.
    const heights = [0, 0, 0, 0]
    for (const brace of braces) {
        const r = brace.m
        const span = Math.hypot(r[4], r[6])
        const axisX = r[4] / span
        const axisZ = r[6] / span
        const topY = r[13] - r[1] * 0.5
        const atTop = (topY - b[13]) / b[5]
        const dx = b[12] + b[4] * atTop - r[12]
        const dz = b[14] + b[6] * atTop - r[14]
        const along = (dx * axisX + dz * axisZ) / span
        const beamLengthwiseHalf = (Math.abs(b[0] * axisX + b[2] * axisZ)
            + Math.abs(b[8] * axisX + b[10] * axisZ)) * 0.5
        if (Math.abs(along) > 0.5 + beamLengthwiseHalf / span) continue
        const up = (topY + r[5] * Math.max(-0.5, Math.min(0.5, along)) - b[13]) / b[5]
        if (Math.abs(up) > 0.55) continue
        const sideX = -axisZ
        const sideZ = axisX
        const across = (b[12] + b[4] * up - r[12]) * sideX + (b[14] + b[6] * up - r[14]) * sideZ
        const halfWidth = (Math.abs(b[0] * sideX + b[2] * sideZ) + Math.abs(b[8] * sideX + b[10] * sideZ)
            + Math.abs(r[0] * sideX + r[2] * sideZ) + Math.abs(r[8] * sideX + r[10] * sideZ)) * 0.5
        if (Math.abs(across) > halfWidth + 0.035) continue
        const toward = across >= 0 ? -1 : 1
        const face = Math.abs(sideX) > Math.abs(sideZ) ? Number(sideX * toward > 0) : 2 + Number(sideZ * toward > 0)
        const height = 1 + Math.round((up * beamLength - WOOD_JOIN_MIN) / WOOD_JOIN_STEP)
        heights[face] = Math.max(heights[face], Math.min(15, Math.max(1, height)))
    }
    const packed = heights[0] + 16 * (heights[1] + 16 * (heights[2] + 16 * heights[3]))
    return packed ? WOOD_BEAM_JOIN_BASE + packed : undefined
}
