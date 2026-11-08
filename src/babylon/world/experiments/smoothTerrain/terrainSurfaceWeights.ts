const EDGE_SEGMENTS = 4
const EDGE_JITTER = 0.12
const CORNER_CHAMFER = 0.25

// Trim only 3:1 material corners. The small majority bias cuts off the sharp
// tip with straight facets; 2:2 straight borders keep their existing shape.
export function chamferTerrainCornerWeights(weights: number[], types: number[]): number[] {
    if (types.some(type => type < 0) || !types.some(type => types.filter(other => other === type).length === 3)) return weights
    return weights.map((weight, i) => weight + CORNER_CHAMFER
        * weights.reduce((sum, other, j) => sum + (j !== i && types[j] === types[i] ? other : 0), 0))
}

// CPU-only piecewise-linear control field for low-poly material boundaries.
// Coordinates are global so independently generated chunks agree at their edges.
export function terrainWeightsAt(x: number, z: number): number[] {
    const bx = Math.floor(x), bz = Math.floor(z)
    const gx = (x - bx) * EDGE_SEGMENTS, gz = (z - bz) * EDGE_SEGMENTS
    const cx = Math.floor(gx) / EDGE_SEGMENTS, cz = Math.floor(gz) / EDGE_SEGMENTS
    const u = gx - Math.floor(gx), v = gz - Math.floor(gz)
    const control = (px: number, pz: number) => {
        const qx = Math.round((bx + px) * EDGE_SEGMENTS), qz = Math.round((bz + pz) * EDGE_SEGMENTS)
        const seed = ((qx * 137 + qz * 149) % 251 + 251) % 251
        px += ((seed * 73 + 19) % 251 / 125 - 1) * EDGE_JITTER * 4 * px * (1 - px)
        pz += ((seed * 151 + 47) % 251 / 125 - 1) * EDGE_JITTER * 4 * pz * (1 - pz)
        return [(1 - px) * (1 - pz), px * (1 - pz), (1 - px) * pz, px * pz]
    }
    const wx = control(cx + 1 / EDGE_SEGMENTS, cz), wz = control(cx, cz + 1 / EDGE_SEGMENTS)
    if (u + v <= 1) {
        return control(cx, cz).map((w, i) => w * (1 - u - v) + wx[i] * u + wz[i] * v)
    }
    return control(cx + 1 / EDGE_SEGMENTS, cz + 1 / EDGE_SEGMENTS)
        .map((w, i) => w * (u + v - 1) + wx[i] * (1 - v) + wz[i] * (1 - u))
}
