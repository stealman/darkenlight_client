import { Vector3 } from '@babylonjs/core'
import type { Matrix } from '@babylonjs/core'
import type { TaperedBlockShape } from '@/babylon/world/taperedBlockBatch'

type Triangle = readonly [Vector3, Vector3, Vector3]

const BOX_CORNERS = [{x: -0.5, y: -0.5}, {x: 0.5, y: -0.5}, {x: -0.5, y: 0.5}, {x: 0.5, y: 0.5}]
// Match the diagonals of the wrapped block, including when its deformed faces are slightly warped.
const ALONG_X = {top: [[4, 2, 0], [4, 6, 2]], bottom: [[5, 1, 3], [5, 3, 7]]} as const
const ALONG_Z = {top: [[5, 4, 0], [5, 0, 1]], bottom: [[3, 2, 6], [3, 6, 7]]} as const

export function getWoodBearingFaces(matrix: Matrix, shape: TaperedBlockShape | null, alongX: boolean) {
    const foot = shape?.foot ?? BOX_CORNERS
    const top = shape?.top ?? BOX_CORNERS
    const corner = (x: number, y: number, z: number) => Vector3.TransformCoordinates(new Vector3(x, y, z), matrix)
    const vertices = [
        ...foot.map(p => corner(p.x, -0.5, p.y)),
        ...top.map(p => corner(p.x, 0.5, p.y)),
    ]
    const faces = alongX ? ALONG_X : ALONG_Z
    const triangle = ([a, b, c]: readonly number[]): Triangle => [vertices[a], vertices[b], vertices[c]]
    return {top: faces.top.map(triangle), bottom: faces.bottom.map(triangle), lowestY: Math.min(...vertices.map(v => v.y))}
}

function sideOfEdge(a: Vector3, b: Vector3, p: Vector3) {
    return (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)
}

function clipFootprint(points: readonly Vector3[], a: Vector3, b: Vector3, winding: number) {
    const clipped: Vector3[] = []
    for (const [index, point] of points.entries()) {
        const next = points[(index + 1) % points.length]
        const here = winding * sideOfEdge(a, b, point)
        const there = winding * sideOfEdge(a, b, next)
        if (here >= 0) clipped.push(point)
        if ((here >= 0) !== (there >= 0)) clipped.push(Vector3.Lerp(point, next, here / (here - there)))
    }
    return clipped
}

export function getWoodSupportHeight(bottom: readonly Triangle[], support: readonly Triangle[]) {
    let height = -Infinity
    for (const [a, b, c] of bottom) {
        const normal = Vector3.Cross(b.subtract(a), c.subtract(a))
        if (Math.abs(normal.y) < 1e-6) continue
        const winding = Math.sign(sideOfEdge(a, b, c))
        for (const top of support) {
            // Over the common footprint, the difference between the two faces is linear.
            const clipped = clipFootprint(clipFootprint(clipFootprint(top, a, b, winding), b, c, winding), c, a, winding)
            for (const p of clipped) {
                const bottomY = a.y - (normal.x * (p.x - a.x) + normal.z * (p.z - a.z)) / normal.y
                height = Math.max(height, p.y - bottomY)
            }
        }
    }
    return height
}
