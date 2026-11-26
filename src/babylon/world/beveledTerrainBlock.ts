import { VertexData } from '@babylonjs/core'

import { TerrainCorner, TerrainEdge } from './terrainRoofShape'
export const TerrainVerticalCorner = { NorthWest: 256, NorthEast: 512, SouthEast: 1024, SouthWest: 2048 } as const
export const TERRAIN_BEVEL_WIDTH = 0.1
export const TERRAIN_VERTICAL_BEVEL_WIDTH = 0.08
export const SNOW_BLOCK_HEIGHT = 0.04
export const TERRAIN_BEVEL_DROP = 0.04
type Point = [number, number, number]
type Face = { vertices: Point[], outward: Point }

function clipVerticalCorners(faces: Face[], mask: number): Face[] {
    for (const [sx, sz, bit] of [[-1, -1, TerrainVerticalCorner.NorthWest], [1, -1, TerrainVerticalCorner.NorthEast],
        [1, 1, TerrainVerticalCorner.SouthEast], [-1, 1, TerrainVerticalCorner.SouthWest]]) {
        if (!(mask & bit)) continue
        const next: Face[] = [], intersections = new Map<string, Point>()
        const distance = (p: Point) => 1 - TERRAIN_VERTICAL_BEVEL_WIDTH - sx * p[0] - sz * p[2]
        const remember = (point: Point) => intersections.set(point.map(v => v.toFixed(8)).join(';'), point)
        // Clip complete faces before triangulating. Cutting triangle soup would
        // introduce many unnecessary vertices on the new diagonal wall.
        for (const face of faces) {
            const vertices: Point[] = []
            for (let edge = 0; edge < face.vertices.length; edge++) {
                const a = face.vertices[edge], b = face.vertices[(edge + 1) % face.vertices.length]
                const da = distance(a), db = distance(b)
                if (da >= -1e-9) { vertices.push(a); if (Math.abs(da) < 1e-9) remember(a) }
                if ((da < 0) !== (db < 0)) {
                    const t = da / (da - db)
                    const vertex = a.map((v, axis) => v + (b[axis] - v) * t) as Point
                    vertices.push(vertex)
                    remember(vertex)
                }
            }
            if (vertices.length >= 3) next.push({ vertices, outward: face.outward })
        }
        const border = [...intersections.values()]
        if (border.length >= 3) {
            const centre = border.reduce((sum, point) => sum.map((v, axis) => v + point[axis] / border.length) as Point, [0, 0, 0] as Point)
            const tangent = (point: Point) => sz * (point[0] - centre[0]) - sx * (point[2] - centre[2])
            border.sort((a, b) => Math.atan2(a[1] - centre[1], tangent(a)) - Math.atan2(b[1] - centre[1], tangent(b)))
            next.push({ outward: [sx, 0, sz], vertices: border })
        }
        faces = next
    }
    return faces
}

export function createBeveledTerrainVertexData(
    mask: number, heightOffset: number, cornerSteps?: readonly number[],
): VertexData {
    const top = 0.5
    // Keep the world-space chamfer depth constant for bare, grassy and snowy
    // blocks, despite their different thin-instance vertical scales.
    const drop = TERRAIN_BEVEL_DROP / (1 + heightOffset)
    const left = -0.5 + (mask & TerrainEdge.West ? TERRAIN_BEVEL_WIDTH : 0)
    const right = 0.5 - (mask & TerrainEdge.East ? TERRAIN_BEVEL_WIDTH : 0)
    const north = -0.5 + (mask & TerrainEdge.North ? TERRAIN_BEVEL_WIDTH : 0)
    const south = 0.5 - (mask & TerrainEdge.South ? TERRAIN_BEVEL_WIDTH : 0)
    const inner: Point[] = [[left, top, north], [right, top, north], [right, top, south], [left, top, south]]
    const outer: Point[] = [[-0.5, top, -0.5], [0.5, top, -0.5], [0.5, top, 0.5], [-0.5, top, 0.5]]
    const cornerBits = [TerrainCorner.NorthWest, TerrainCorner.NorthEast, TerrainCorner.SouthEast, TerrainCorner.SouthWest]
    const edges = [TerrainEdge.North, TerrainEdge.East, TerrainEdge.South, TerrainEdge.West]
    outer.forEach((point, i) => {
        if (cornerSteps) point[1] += cornerSteps[i] * drop
        else if (mask & (edges[i] | edges[(i + 3) % 4] | cornerBits[i])) point[1] -= drop
    })
    const entry = inner.map(point => [...point] as Point), exit = inner.map(point => [...point] as Point)
    for (let i = 0; i < 4; i++) if (mask & cornerBits[i]) {
        const previous = inner[(i + 3) % 4], next = inner[(i + 1) % 4]
        for (const axis of [0, 2]) {
            entry[i][axis] += Math.sign(previous[axis] - inner[i][axis]) * TERRAIN_BEVEL_WIDTH
            exit[i][axis] += Math.sign(next[axis] - inner[i][axis]) * TERRAIN_BEVEL_WIDTH
        }
    }
    const positions: number[] = [], indices: number[] = []
    const faces: Face[] = []
    const polygon = (vertices: Point[], outward: Point) => {
        faces.push({vertices, outward})
    }
    const plateau: Point[] = []
    for (let i = 0; i < 4; i++) {
        plateau.push(entry[i])
        if (mask & cornerBits[i]) plateau.push(exit[i])
    }
    polygon(plateau, [0, 1, 0])
    const sideNormals: Point[] = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]]
    for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4
        // Without a horizontal bevel, a dropped rim still needs a vertical strip above the wall.
        const outward: Point = mask & edges[i] ? [0, 1, 0] : sideNormals[i]
        polygon([outer[i], outer[next], entry[next], exit[i]], outward)
        if (mask & cornerBits[i]) polygon([outer[i], entry[i], exit[i]], [0, 1, 0])
        polygon([[outer[i][0], -0.5, outer[i][2]], [outer[next][0], -0.5, outer[next][2]], outer[next], outer[i]], sideNormals[i])
    }
    polygon(outer.map(([x, , z]) => [x, -0.5, z]), [0, -1, 0])
    const clipped = mask >= 256 ? clipVerticalCorners(faces, mask) : faces
    const cross = (a: Point, b: Point, c: Point) => {
        const ab = b.map((v, axis) => v - a[axis]), ac = c.map((v, axis) => v - a[axis])
        return [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
    }
    const emit = (a: Point, b: Point, c: Point, outward: Point) => {
        const normal = cross(a, b, c)
        if (Math.hypot(...normal) < 1e-9) return
        const start = positions.length / 3
        positions.push(...a, ...b, ...c)
        if (normal.reduce((sum, n, axis) => sum + n * outward[axis], 0) > 0) indices.push(start, start + 2, start + 1)
        else indices.push(start, start + 1, start + 2)
    }
    for (const face of clipped) {
        const vertices = face.vertices.filter((vertex, i, all) => {
            const next = all[(i + 1) % all.length]
            return Math.hypot(...vertex.map((v, axis) => v - next[axis])) > 1e-9
        })
        if (vertices.length < 3) continue
        const collinear = vertices.some((v, i) => Math.hypot(...cross(vertices[(i + vertices.length - 1) % vertices.length],
            v, vertices[(i + 1) % vertices.length])) < 1e-9)
        if (collinear) {
            // Preserve every boundary segment where neighboring roof faces join.
            const centre: Point = [0, 0, 0]
            for (const vertex of vertices) {
                for (let axis = 0; axis < 3; axis++) centre[axis] += vertex[axis] / vertices.length
            }
            for (let i = 0; i < vertices.length; i++) emit(centre, vertices[i], vertices[(i + 1) % vertices.length], face.outward)
        } else for (let i = 1; i + 1 < vertices.length; i++) emit(vertices[0], vertices[i], vertices[i + 1], face.outward)
    }
    const data = new VertexData(), normals: number[] = []
    VertexData.ComputeNormals(positions, indices, normals)
    data.positions = positions
    data.indices = indices
    data.normals = normals
    return data
}
