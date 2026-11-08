import { chamferTerrainCornerWeights, terrainWeightsAt } from './terrainSurfaceWeights'

// Width in material-weight space: about 0.08 world units on a straight edge.
// The entire ramp belongs to the raised surface; its visible edge starts at 0.
const BEVEL_WIDTH = 0.16
export type TerrainSurface = { valid: boolean, layer: number, type: number, cell: number[] }
type Point = { x: number, z: number, y: number, originalY: number, normal: number[], weights: number[] }
export interface BevelGeometry {
    positions: number[]
    normals: number[]
    uvs: number[]
    offsets: number[]
    blend: number[]
    indices: number[]
}

// Bake per-tile UV repetition into vertex data for the existing atlas material.
// Vertices share only when position, normal, atlas cell AND local UV agree.
export function bakeTerrainAtlas(source: BevelGeometry, ranges: Int32Array, originX: number, originZ: number, size: number): BevelGeometry {
    const result: BevelGeometry = { positions: [], normals: [], uvs: [], offsets: [], blend: [], indices: [] }
    const vertices = new Map<string, number>()
    for (let tile = 0; tile < size * size; tile++) {
        const tx = originX + Math.floor(tile / size), tz = originZ + tile % size
        const start = ranges[tile * 2], end = start + ranges[tile * 2 + 1]
        for (let i = start; i < end; i++) {
            const index = source.indices[i], position = source.positions.slice(index * 3, index * 3 + 3)
            const normal = source.normals.slice(index * 3, index * 3 + 3), cell = source.offsets.slice(index * 2, index * 2 + 2)
            const uv = source.blend[index] ? [position[0] - tx + 0.5, 0.5 - position[2] + tz] : source.uvs.slice(index * 2, index * 2 + 2)
            const key = [...position, ...normal, ...uv, ...cell].join(';')
            let target = vertices.get(key)
            if (target === undefined) {
                target = result.positions.length / 3
                vertices.set(key, target)
                result.positions.push(...position)
                result.normals.push(...normal)
                result.uvs.push(...uv)
                result.offsets.push(...cell)
                result.blend.push(source.blend[index])
            }
            result.indices.push(target)
        }
    }
    return result
}

function interpolate(a: Point, b: Point, t: number): Point {
    const mix = (x: number, y: number) => x + (y - x) * t
    return { x: mix(a.x, b.x), z: mix(a.z, b.z), y: mix(a.y, b.y), originalY: mix(a.originalY, b.originalY),
        normal: a.normal.map((n, i) => mix(n, b.normal[i])), weights: a.weights.map((w, i) => mix(w, b.weights[i])) }
}

function clip(polygon: Point[], distance: (p: Point) => number): Point[] {
    const result: Point[] = []
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length]
        const da = distance(a), db = distance(b)
        if (da >= 0) result.push(a)
        if ((da < 0) !== (db < 0)) result.push(interpolate(a, b, da / (da - db)))
    }
    return result
}

// Only boundary tiles are refined. Uniform terrain retains its cached two
// triangles. Material contours and bevel shoulders are inserted as real edges.
export function bevelTerrainSurfaces(
    geometry: BevelGeometry, ranges: Int32Array, originX: number, originZ: number, size: number,
    surfaceAt: (x: number, z: number) => TerrainSurface,
    smoothedLayerAt: (tileX: number, tileZ: number, x: number, z: number) => number,
) {
    const sourceIndices = geometry.indices
    const indices: number[] = []
    const sample = (index: number, tx: number, tz: number): Point => {
        const x = geometry.positions[index * 3], y = geometry.positions[index * 3 + 1], z = geometry.positions[index * 3 + 2]
        return { x, z, originalY: y, y: y - smoothedLayerAt(tx, tz, x, z),
            normal: geometry.normals.slice(index * 3, index * 3 + 3), weights: [] }
    }
    const emit = (polygon: Point[], layer: (p: Point) => number, cell: number[]) => {
        for (let i = 1; i + 1 < polygon.length; i++) {
            // Test winding at GPU precision too: tiny clipped slivers can
            // otherwise collapse into degenerate faces after Float32 upload.
            const tri = [polygon[0], polygon[i], polygon[i + 1]]
                .map(p => ({ ...p, x: Math.fround(p.x), z: Math.fround(p.z) }))
            const [a, b, c] = tri
            const dx1 = b.x - a.x, dz1 = b.z - a.z, dx2 = c.x - a.x, dz2 = c.z - a.z
            const det = dx1 * dz2 - dx2 * dz1
            if (det <= 1e-10) continue
            const heights = tri.map(p => p.y + layer(p))
            const gradient = (ys: number[]) => [((ys[1] - ys[0]) * dz2 - (ys[2] - ys[0]) * dz1) / det,
                (dx1 * (ys[2] - ys[0]) - dx2 * (ys[1] - ys[0])) / det]
            const old = gradient(tri.map(p => p.originalY)), current = gradient(heights)
            for (let j = 0; j < 3; j++) {
                const p = tri[j], index = geometry.positions.length / 3
                geometry.positions.push(p.x, heights[j], p.z)
                // Preserve the existing broad terrain lighting, adding only the
                // local slope of the bevel. No second render pass or overlay.
                const ny = Math.max(p.normal[1], 1e-5)
                const normal = [p.normal[0] / ny - current[0] + old[0], 1, p.normal[2] / ny - current[1] + old[1]]
                const length = Math.hypot(...normal)
                geometry.normals.push(...normal.map(n => n / length))
                geometry.uvs.push(p.x + 0.5, 0.5 - p.z)
                geometry.offsets.push(...cell)
                geometry.blend.push(1)
                indices.push(index)
            }
        }
    }
    const refine = (tri: Point[], cell: number[]) => {
        const mid = (a: Point, b: Point) => interpolate(a, b, 0.5)
        const [a, b, c] = tri
        const span = Math.max(Math.abs(a.x - b.x), Math.abs(a.x - c.x), Math.abs(a.z - b.z), Math.abs(a.z - c.z), Math.abs(b.x - c.x), Math.abs(b.z - c.z))
        if (span > 0.250001) {
            const ab = mid(a, b), ac = mid(a, c), bc = mid(b, c)
            for (const child of [[a, ab, ac], [ab, b, bc], [ac, bc, c], [ab, bc, ac]]) refine(child, cell)
            return
        }
        const bx = Math.floor((a.x + b.x + c.x) / 3), bz = Math.floor((a.z + b.z + c.z) / 3)
        const surfaces = [surfaceAt(bx, bz), surfaceAt(bx + 1, bz), surfaceAt(bx, bz + 1), surfaceAt(bx + 1, bz + 1)]
        const cornerTypes = surfaces.map(surface => surface.valid ? surface.type : -1)
        // Keep vertices on the upper boundary in this microtriangle's source
        // cell by sampling infinitesimally toward its centre.
        const centreX = (a.x + b.x + c.x) / 3, centreZ = (a.z + b.z + c.z) / 3
        const points = tri.map(p => {
            const sx = p.x + (centreX - p.x) * 1e-8, sz = p.z + (centreZ - p.z) * 1e-8
            const weights = chamferTerrainCornerWeights(terrainWeightsAt(sx, sz), cornerTypes)
            return { ...p, weights }
        })
        const raised = surfaces.map((s, i) => s.valid && s.layer > 0 ? i : -1).filter(i => i >= 0)
        const bare = surfaces.map((s, i) => s.valid && s.layer === 0 ? i : -1).filter(i => i >= 0)
        if (!raised.length || !bare.length) {
            const candidates = surfaces.map((s, i) => s.valid ? i : -1).filter(i => i >= 0)
            if (!candidates.length) { emit(points, () => 0, cell); return }
            for (const candidate of candidates) {
                let polygon = points
                for (const other of candidates) if (other !== candidate) polygon = clip(polygon, p => p.weights[candidate] - p.weights[other])
                emit(polygon, () => surfaces[candidate].layer, surfaces[candidate].cell)
            }
            return
        }
        for (const r of raised) for (const d of bare) {
            let polygon = points
            for (const other of raised) if (other !== r) polygon = clip(polygon, p => p.weights[r] - p.weights[other])
            for (const other of bare) if (other !== d) polygon = clip(polygon, p => p.weights[d] - p.weights[other])
            const gap = (p: Point) => p.weights[r] - p.weights[d]
            const lower = clip(polygon, p => -gap(p))
            const upper = clip(polygon, p => gap(p) - BEVEL_WIDTH)
            const shoulder = clip(clip(polygon, gap), p => BEVEL_WIDTH - gap(p))
            emit(lower, () => 0, surfaces[d].cell)
            emit(upper, () => surfaces[r].layer, surfaces[r].cell)
            const rampHeight = (p: Point) => gap(p) / BEVEL_WIDTH * surfaces[r].layer
            // The snow/grass texture owns the complete ramp down to the ground.
            // The bare texture stays at ground height right up to that edge.
            emit(shoulder, rampHeight, surfaces[r].cell)
        }
    }
    for (let tile = 0; tile < size * size; tile++) {
        const start = ranges[tile * 2], count = ranges[tile * 2 + 1]
        const tx = originX + Math.floor(tile / size), tz = originZ + tile % size
        const types = new Set<number>()
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
            const surface = surfaceAt(tx + dx, tz + dz)
            if (surface.valid) types.add(surface.type)
        }
        ranges[tile * 2] = indices.length
        for (let i = start; i < start + count; i += 3) {
            const tri = sourceIndices.slice(i, i + 3)
            if (types.size <= 1 || tri.some(index => geometry.blend[index] === 0)) indices.push(...tri)
            else refine(tri.map(index => sample(index, tx, tz)), geometry.offsets.slice(tri[0] * 2, tri[0] * 2 + 2))
        }
        ranges[tile * 2 + 1] = indices.length - ranges[tile * 2]
    }
    geometry.indices = indices
}
