import { Mesh, Vector3, VertexData } from '@babylonjs/core'
import { TREE_SHAPE_FACES } from './treeSpecies'
import type { TreeShape } from './treeSpecies'

type Point = [number, number, number]

export function createTreeGeometry(mesh: Mesh, shape: TreeShape) {
    const positions: number[] = []
    const normals: number[] = []
    const surfaces: number[] = []
    const indices: number[] = []
    function face(a: Point, b: Point, c: Point, type: number, u = [0, .5, 1], cap = false) {
        const normal = Vector3.Cross(Vector3.FromArray(b).subtractInPlace(Vector3.FromArray(a)),
            Vector3.FromArray(c).subtractInPlace(Vector3.FromArray(a))).normalize()
        // Babylon's left-handed winding is opposite the geometric normal.
        for (const [point, coord] of [[a, u[0]], [c, u[2]], [b, u[1]]] as const) {
            indices.push(positions.length / 3)
            positions.push(...point)
            normals.push(normal.x, normal.y, normal.z)
            surfaces.push(coord, cap ? -1 : point[1], type)
        }
    }
    if (shape === 'leaf') {
        const outline: Point[] = [[0, -.07, -.49], [-.62, .09, .02], [0, -.17, .74], [.55, -.08, .12]]
        for (let i = 0; i < outline.length; i++) {
            const a = outline[i], b = outline[(i + 1) % outline.length]
            face(a, b, [.04, .29, .07], 1)
            face(b, a, [.04, -.22, .07], 1)
        }
    } else if (shape === 'needles' || shape === 'needlesShadow') {
        // Each fan has drooping sprays along its edge and an raised, irregular spine.
        const outline: Point[] = shape === 'needlesShadow' ? [
            [0, .30, 0], [-.83, -.24, .52], [-.67, -.37, .92],
            [.06, -.52, 1.25], [.77, -.35, .91], [.69, -.20, .44],
        ] : [
            [-.13, .18, 0], [-.62, .01, .24], [-.59, -.17, .52], [-.90, -.20, .66],
            [-.70, -.34, .94], [-.40, -.19, .85], [-.34, -.34, 1.09], [.08, -.40, 1.16],
            [.34, -.27, .96], [.64, -.36, 1.00], [.80, -.22, .73], [.52, -.11, .64],
            [.69, -.08, .43], [.34, .09, .16],
        ]
        for (let i = 0; i < outline.length; i++) {
            const next = (i + 1) % outline.length
            const a = outline[i], b = outline[next]
            face(a, b, [.06, .33, .46], 2)
            face(b, a, [.02, -.43, .46], 2)
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
            face(bottom[i], top[i], top[j], 0, [u, u, v])
            face(bottom[i], top[j], bottom[j], 0, [u, v, v])
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
