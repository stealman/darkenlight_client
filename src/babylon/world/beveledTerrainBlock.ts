import { Mesh, Scene, TransformNode, VertexData } from '@babylonjs/core'

export const TerrainEdge = { West: 1, East: 2, North: 4, South: 8 } as const
export const TerrainCorner = { NorthWest: 16, NorthEast: 32, SouthEast: 64, SouthWest: 128 } as const
export const TerrainVerticalCorner = { NorthWest: 256, NorthEast: 512, SouthEast: 1024, SouthWest: 2048 } as const
export const TERRAIN_BEVEL_WIDTH = 0.1
export const TERRAIN_VERTICAL_BEVEL_WIDTH = 0.08
export const SNOW_BLOCK_HEIGHT = 0.04
export const TERRAIN_BEVEL_DROP = 0.04
type Point = [number, number, number]
type ClipVertex = { point: Point, uv: number[] }
type Face = { vertices: ClipVertex[], outward: Point }

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
            const vertices: ClipVertex[] = []
            for (let edge = 0; edge < face.vertices.length; edge++) {
                const a = face.vertices[edge], b = face.vertices[(edge + 1) % face.vertices.length]
                const da = distance(a.point), db = distance(b.point)
                if (da >= -1e-9) { vertices.push(a); if (Math.abs(da) < 1e-9) remember(a.point) }
                if ((da < 0) !== (db < 0)) {
                    const t = da / (da - db)
                    const vertex = { point: a.point.map((v, axis) => v + (b.point[axis] - v) * t) as Point,
                        uv: a.uv.map((v, axis) => v + (b.uv[axis] - v) * t) }
                    vertices.push(vertex)
                    remember(vertex.point)
                }
            }
            if (vertices.length >= 3) next.push({ vertices, outward: face.outward })
        }
        const border = [...intersections.values()]
        if (border.length >= 3) {
            const centre = border.reduce((sum, point) => sum.map((v, axis) => v + point[axis] / border.length) as Point, [0, 0, 0] as Point)
            const tangent = (point: Point) => sz * (point[0] - centre[0]) - sx * (point[2] - centre[2])
            border.sort((a, b) => Math.atan2(a[1] - centre[1], tangent(a)) - Math.atan2(b[1] - centre[1], tangent(b)))
            next.push({ outward: [sx, 0, sz], vertices: border.map(point => ({ point,
                uv: [0.25 + (0.5 - point[0]) / 4, sz < 0 ? (point[1] + 0.5) / 3 : 2 / 3 + (0.5 - point[1]) / 3] })) })
        }
        faces = next
    }
    return faces
}

// Edge masks, including adjacent/opposite pairs, and diagonal corner cuts use
// one builder. Top-only tiles retain their plane atlas; solid blocks use the
// existing cross-shaped block UV layout.
export function createBeveledTerrainVertexData(mask: number, topOnly: boolean, heightOffset = SNOW_BLOCK_HEIGHT): VertexData {
    const top = topOnly ? 0 : 0.5
    // Keep the world-space chamfer depth constant for bare, grassy and snowy
    // blocks, despite their different thin-instance vertical scales.
    const drop = topOnly ? TERRAIN_BEVEL_DROP : TERRAIN_BEVEL_DROP / (1 + heightOffset)
    const left = -0.5 + (mask & TerrainEdge.West ? TERRAIN_BEVEL_WIDTH : 0)
    const right = 0.5 - (mask & TerrainEdge.East ? TERRAIN_BEVEL_WIDTH : 0)
    const north = -0.5 + (mask & TerrainEdge.North ? TERRAIN_BEVEL_WIDTH : 0)
    const south = 0.5 - (mask & TerrainEdge.South ? TERRAIN_BEVEL_WIDTH : 0)
    const inner: Point[] = [[left, top, north], [right, top, north], [right, top, south], [left, top, south]]
    const outer: Point[] = [[-0.5, top, -0.5], [0.5, top, -0.5], [0.5, top, 0.5], [-0.5, top, 0.5]]
    const cornerEdges = [TerrainEdge.West | TerrainEdge.North, TerrainEdge.East | TerrainEdge.North,
        TerrainEdge.East | TerrainEdge.South, TerrainEdge.West | TerrainEdge.South]
    const cornerBits = [TerrainCorner.NorthWest, TerrainCorner.NorthEast, TerrainCorner.SouthEast, TerrainCorner.SouthWest]
    outer.forEach((point, i) => { if (mask & (cornerEdges[i] | cornerBits[i])) point[1] -= drop })
    const entry = inner.map(point => [...point] as Point), exit = inner.map(point => [...point] as Point)
    for (let i = 0; i < 4; i++) if (mask & cornerBits[i]) {
        const previous = inner[(i + 3) % 4], next = inner[(i + 1) % 4]
        for (const axis of [0, 2]) {
            entry[i][axis] += Math.sign(previous[axis] - inner[i][axis]) * TERRAIN_BEVEL_WIDTH
            exit[i][axis] += Math.sign(next[axis] - inner[i][axis]) * TERRAIN_BEVEL_WIDTH
        }
    }
    const positions: number[] = [], indices: number[] = [], uvs: number[] = []
    const topUv = ([x, , z]: Point) => topOnly ? [x + 0.5, 0.5 - z] : [0.25 + (x + 0.5) / 4, 1 / 3 + (0.5 - z) / 3]
    const faces: Face[] = []
    const polygon = (points: Point[], uv: (point: Point) => number[], outward: Point) => {
        faces.push({ vertices: points.map(point => ({ point, uv: uv(point) })), outward })
    }
    const plateau: Point[] = []
    for (let i = 0; i < 4; i++) {
        plateau.push(entry[i])
        if (mask & cornerBits[i]) plateau.push(exit[i])
    }
    polygon(plateau, topUv, [0, 1, 0])
    const sides = [
        { bit: TerrainEdge.North, normal: [0, 0, -1] as Point, uv: ([x, y]: Point) => [0.25 + (0.5 - x) / 4, (y + 0.5) / 3] },
        { bit: TerrainEdge.East, normal: [1, 0, 0] as Point, uv: ([, y, z]: Point) => [0.5 + (0.5 - y) / 4, 1 / 3 + (0.5 - z) / 3] },
        { bit: TerrainEdge.South, normal: [0, 0, 1] as Point, uv: ([x, y]: Point) => [0.25 + (0.5 - x) / 4, 2 / 3 + (0.5 - y) / 3] },
        { bit: TerrainEdge.West, normal: [-1, 0, 0] as Point, uv: ([, y, z]: Point) => [(y + 0.5) / 4, 1 / 3 + (z + 0.5) / 3] },
    ]
    for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4, side = sides[i]
        polygon([outer[i], outer[next], entry[next], exit[i]], topUv, [side.normal[0], mask & side.bit ? 1 : 0, side.normal[2]])
        if (mask & cornerBits[i]) polygon([outer[i], entry[i], exit[i]], topUv, [0, 1, 0])
        if (!topOnly) {
            polygon([[outer[i][0], -0.5, outer[i][2]], [outer[next][0], -0.5, outer[next][2]], outer[next], outer[i]], side.uv, side.normal)
        }
    }
    if (!topOnly) polygon(outer.map(([x, , z]) => [x, -0.5, z] as Point), ([x, , z]) => [0.25 + (0.5 - z) / 4, 2 / 3 + (0.5 - x) / 3], [0, -1, 0])
    const clipped = !topOnly && mask >= 256 ? clipVerticalCorners(faces, mask) : faces
    const cross = (a: Point, b: Point, c: Point) => {
        const ab = b.map((v, axis) => v - a[axis]), ac = c.map((v, axis) => v - a[axis])
        return [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
    }
    const emit = (a: ClipVertex, b: ClipVertex, c: ClipVertex, outward: Point) => {
        const normal = cross(a.point, b.point, c.point)
        if (Math.hypot(...normal) < 1e-9) return
        const start = positions.length / 3
        for (const vertex of [a, b, c]) { positions.push(...vertex.point); uvs.push(...vertex.uv) }
        if (normal.reduce((sum, n, axis) => sum + n * outward[axis], 0) > 0) indices.push(start, start + 2, start + 1)
        else indices.push(start, start + 1, start + 2)
    }
    for (const face of clipped) {
        const vertices = face.vertices.filter((vertex, i, all) => {
            const next = all[(i + 1) % all.length].point
            return Math.hypot(...vertex.point.map((v, axis) => v - next[axis])) > 1e-9
        })
        if (vertices.length < 3) continue
        const collinear = vertices.some((v, i) => Math.hypot(...cross(vertices[(i + vertices.length - 1) % vertices.length].point,
            v.point, vertices[(i + 1) % vertices.length].point)) < 1e-9)
        if (collinear) {
            // Preserve every boundary segment where neighboring roof faces join.
            const centre: ClipVertex = { point: [0, 0, 0], uv: [0, 0] }
            for (const vertex of vertices) {
                for (let axis = 0; axis < 3; axis++) centre.point[axis] += vertex.point[axis] / vertices.length
                for (let axis = 0; axis < 2; axis++) centre.uv[axis] += vertex.uv[axis] / vertices.length
            }
            for (let i = 0; i < vertices.length; i++) emit(centre, vertices[i], vertices[(i + 1) % vertices.length], face.outward)
        } else for (let i = 1; i + 1 < vertices.length; i++) emit(vertices[0], vertices[i], vertices[i + 1], face.outward)
    }
    const data = new VertexData(), normals: number[] = []
    VertexData.ComputeNormals(positions, indices, normals)
    data.positions = positions
    data.indices = indices
    data.normals = normals
    data.uvs = uvs
    return data
}

export function createBeveledTerrainBlock(scene: Scene, parent: TransformNode | null, mask: number, topOnly: boolean, heightOffset = SNOW_BLOCK_HEIGHT): Mesh {
    const mesh = new Mesh(`terrain_bevel_${topOnly ? 'top' : 'block'}_${mask}`, scene)
    createBeveledTerrainVertexData(mask, topOnly, heightOffset).applyToMesh(mesh)
    mesh.parent = parent
    mesh.position.y = topOnly ? 0 : -0.5
    mesh.isPickable = true
    mesh.thinInstanceEnablePicking = true
    mesh.alwaysSelectAsActiveMesh = true
    return mesh
}
