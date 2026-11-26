// Color rows alternate gray and beige. Relief uses the two original rows.
export function stoneAtlasRow(beige: boolean, seed: number) {
    return Number(beige) + 2 * Math.min(2, Math.floor(seed * 3))
}

export const stoneAtlasShader = `
    vec2 stoneAtlasUV(vec2 cell, vec2 uv) {
        return (cell * 128.0 + 0.5 + clamp(uv, 0.0, 1.0) * 127.0) / 1024.0;
    }
    vec2 stoneReliefUV(vec2 colorUV, float row) {
        return vec2(colorUV.x, colorUV.y - floor(row * 0.5) * 0.25);
    }
`
