import { Mesh, Vector3, VertexData } from '@babylonjs/core'
import { TREE_SHAPE_FACES } from './treeSpecies'
import type { TreeShape } from './treeSpecies'

type Point = [number, number, number]
type Triangle = [Point, Point, Point]
// A cross-section across a spray. The two edges share a Z coordinate with the upper and lower spine.
type CrownSection = [z: number, leftX: number, leftY: number, rightX: number, rightY: number,
    spineX: number, topY: number, bottomY: number]

const NEEDLE_SECTIONS: CrownSection[] = [
    [.14, -.30, .10, .27, .06, .00, .31, -.10],
    [.33, -.68, -.09, .48, -.05, .07, .30, -.21],
    [.48, -.55, -.07, .74, -.19, .04, .22, -.27],
    [.66, -.88, -.28, .53, -.15, -.04, .11, -.36],
    [.85, -.51, -.23, .65, -.34, -.09, .01, -.42],
    [1.03, -.35, -.38, .29, -.27, .02, -.14, -.45],
]
const LEAF_SECTIONS: CrownSection[] = [
    [-.09, -.48, -.01, .43, -.06, .04, .18, -.16],
    [.28, -.47, -.09, .39, -.14, -.02, .10, -.23],
]
const SHADOW_SPRAYS: readonly [start: Point, tip: Point, width: number][] = [
    [[.03, .26, 0], [.09, -.34, 1.25], .20],
    [[-.03, .19, .14], [-.87, -.32, .66], .17],
    [[.05, .10, .29], [.84, -.29, .76], .17],
    [[.01, -.03, .55], [-.55, -.38, 1.06], .13],
]

function faceNormal([a, b, c]: Triangle) {
    return Vector3.Cross(Vector3.FromArray(b).subtractInPlace(Vector3.FromArray(a)),
        Vector3.FromArray(c).subtractInPlace(Vector3.FromArray(a)))
}

function crownFaces(base: Point, tip: Point, sections: CrownSection[], upper: boolean): Triangle[] {
    const rows = sections.map(([z, lx, ly, rx, ry, cx, topY, bottomY]): Point[] =>
        [[lx, ly, z], [cx, upper ? topY : bottomY, z], [rx, ry, z]])
    const [left, mid, right] = rows[0]
    const triangles: Triangle[] = [[base, left, mid], [base, mid, right]]
    for (let i = 1; i < rows.length; i++) {
        const [a, b, c] = rows[i - 1]
        const [d, e, f] = rows[i]
        triangles.push([a, d, e], [a, e, b], [b, e, f], [b, f, c])
    }
    const [l, m, r] = rows[rows.length - 1]
    triangles.push([l, tip, m], [m, tip, r])
    if (!upper) for (const triangle of triangles) [triangle[1], triangle[2]] = [triangle[2], triangle[1]]
    return triangles
}

export function createTreeGeometry(mesh: Mesh, shape: TreeShape) {
    const positions: number[] = []
    const normals: number[] = []
    const surfaces: number[] = []
    const indices: number[] = []
    function face(a: Point, b: Point, c: Point, type: number, u = [0, .5, 1], cap = false,
        shade?: (point: Point, normal: Vector3) => Vector3) {
        const normal = faceNormal([a, b, c]).normalize()
        // Babylon's left-handed winding is opposite the geometric normal.
        for (const [point, coord] of [[a, u[0]], [c, u[2]], [b, u[1]]] as const) {
            indices.push(positions.length / 3)
            positions.push(...point)
            const n = shade?.(point, normal) ?? normal
            normals.push(n.x, n.y, n.z)
            if (type === 0) surfaces.push(coord, cap ? -1 : point[1], 0)
            else surfaces.push(point[0], point[2], type)
        }
    }
    if (shape === 'foliageCard' || shape === 'birchCard' || shape === 'roundedFoliageCard') {
        // A bent, double-sided surface with an indexed ridge. The alpha atlas defines its outline.
        const rounded = shape === 'roundedFoliageCard'
        const rows = rounded ? [[0, .12], [.275, .195], [.55, .17], [.90, -.008], [1.25, -.35]]
            : [[0, .12], [.55, .17], [1.25, -.35]]
        for (const [z, drop] of rows) {
            for (const x of [-.88, 0, .88]) {
                positions.push(x, drop - Math.abs(x) * .21, z)
                const normal = new Vector3(x * .19, 1, rounded ? (1.334 * z - .458) * .42 : z * .19).normalize()
                normals.push(normal.x, normal.y, normal.z)
                surfaces.push(x, z, 2)
            }
        }
        for (let row = 0; row < rows.length - 1; row++) {
            for (let col = 0; col < 2; col++) {
                const a = row * 3 + col, b = a + 1, c = a + 3, d = c + 1
                indices.push(a, b, c, b, d, c)
            }
        }
    } else if (shape === 'leaf' || shape === 'needles') {
        const leaf = shape === 'leaf'
        const base: Point = leaf ? [0, -.07, -.49] : [-.06, .17, 0]
        const tip: Point = leaf ? [.09, -.18, .74] : [.10, -.43, 1.25]
        for (const upper of [true, false]) {
            const triangles = crownFaces(base, tip, leaf ? LEAF_SECTIONS : NEEDLE_SECTIONS, upper)
            const smooth = new Map<Point, Vector3>()
            for (const triangle of triangles) {
                const normal = faceNormal(triangle)
                for (const point of triangle) {
                    let sum = smooth.get(point)
                    if (!sum) smooth.set(point, sum = Vector3.Zero())
                    sum.addInPlace(normal)
                }
            }
            for (const normal of smooth.values()) normal.normalize()
            const shade = (point: Point, normal: Vector3) => Vector3.Lerp(normal, smooth.get(point)!, .86).normalize()
            for (const [a, b, c] of triangles) face(a, b, c, leaf ? 1 : 2, undefined, false, shade)
        }
    } else if (shape === 'needlesShadow') {
        // Silhouettes have real gaps between sprays. Each spray is a small closed volume
        // so the same mesh works for a low sun and a light overhead.
        for (const [start, tip, width] of SHADOW_SPRAYS) {
            const dx = tip[0] - start[0], dz = tip[2] - start[2]
            const perpendicular = width / Math.hypot(dx, dz)
            const sideX = -dz * perpendicular, sideZ = dx * perpendicular
            const y = (start[1] + tip[1]) * .5
            const outline: Point[] = [start,
                [start[0] + dx * .43 + sideX, y, start[2] + dz * .43 + sideZ],
                tip,
                [start[0] + dx * .64 - sideX, y - .045, start[2] + dz * .64 - sideZ],
            ]
            const x = start[0] + dx * .54, z = start[2] + dz * .54
            const top: Point = [x, y + .12, z], bottom: Point = [x, y - .11, z]
            for (let i = 0; i < outline.length; i++) {
                const a = outline[i], b = outline[(i + 1) % outline.length]
                face(a, b, top, 2)
                face(b, a, bottom, 2)
            }
        }
    } else {
        const sides = Number(shape.slice(4))
        const bottom: Point[] = []
        const top: Point[] = []
        for (let i = 0; i < sides; i++) {
            const angle = i * 2 * Math.PI / sides
            const x = Math.cos(angle), z = Math.sin(angle)
            bottom.push([x, 0, z])
            top.push([x, 1, z])
        }
        for (let i = 0; i < sides; i++) {
            const j = (i + 1) % sides
            const u = i / sides, v = (i + 1) / sides
            const shade = sides === 16 ? (point: Point, flat: Vector3) =>
                Vector3.Lerp(flat, new Vector3(point[0], 0, point[2]), .76).normalize() : undefined
            face(bottom[i], top[i], top[j], 0, [u, u, v], false, shade)
            face(bottom[i], top[j], bottom[j], 0, [u, v, v], false, shade)
        }
        for (let i = 1; i < sides - 1; i++) face(top[0], top[i + 1], top[i], 0, undefined, true)
    }
    if (indices.length / 3 !== TREE_SHAPE_FACES[shape]) throw new Error('Incorrect tree template budget for ' + shape)
    const data = new VertexData()
    data.positions = positions
    data.normals = normals
    data.indices = indices
    data.applyToMesh(mesh)
    mesh.setVerticesData('treeSurface', surfaces, false, 3)
}
