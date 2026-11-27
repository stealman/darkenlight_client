import { Frustum, Plane, Vector3, Vector4 } from '@babylonjs/core'
import type { Matrix } from '@babylonjs/core'
import type { TreeModel } from './treeGenerator'
import type { TreePlacement } from './treeRenderer'
import type { TreeShape } from './treeSpecies'

export interface TreeBounds { min: Vector3, max: Vector3 }
export interface TreeRevealEntry { placement: TreePlacement, bounds: TreeBounds, transform: Matrix }
type TreeRevealNode = TreeRevealEntry | {bounds: TreeBounds, left: TreeRevealNode, right: TreeRevealNode}

type TreeModelRevealBounds = TreeBounds & {radius: number, pieces: Map<TreeShape, Float32Array>}
const modelBounds = new WeakMap<TreeModel, TreeModelRevealBounds>()

// Bounds include the vertex shader deformation. Wood endpoints sweep spheres, and
// the box for foliage encloses both templates before taper and droop are applied.
export function getTreeModelBounds(model: TreeModel): TreeModelRevealBounds {
    const cached = modelBounds.get(model)
    if (cached) return cached
    const min = new Vector3(Infinity, Infinity, Infinity)
    const max = new Vector3(-Infinity, -Infinity, -Infinity)
    const point = Vector3.Zero()
    const pieceMin = Vector3.Zero(), pieceMax = Vector3.Zero()
    const pieces = new Map<TreeShape, Float32Array>()
    const include = (radius: number) => {
        pieceMin.set(Math.min(pieceMin.x, point.x - radius), Math.min(pieceMin.y, point.y - radius), Math.min(pieceMin.z, point.z - radius))
        pieceMax.set(Math.max(pieceMax.x, point.x + radius), Math.max(pieceMax.y, point.y + radius), Math.max(pieceMax.z, point.z + radius))
    }
    for (const [shape, parts] of model.shapes) {
        const packed = new Float32Array(parts.length * 6)
        const wood = shape.startsWith('wood')
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i]
            pieceMin.set(Infinity, Infinity, Infinity)
            pieceMax.set(-Infinity, -Infinity, -Infinity)
            if (wood) {
                Vector3.TransformCoordinatesFromFloatsToRef(0, 0, 0, part.matrix, point)
                include(part.radius)
                Vector3.TransformCoordinatesFromFloatsToRef(0, 1, 0, part.matrix, point)
                include(part.radius * part.taper)
            } else {
                const halfHeight = .56 + 1.25 ** 2 * .6 * Math.abs(part.taper - 1)
                for (let corner = 0; corner < 8; corner++) {
                    Vector3.TransformCoordinatesFromFloatsToRef(corner & 1 ? part.taper : -part.taper,
                        corner & 2 ? halfHeight : -halfHeight, corner & 4 ? 1.25 : -.5, part.matrix, point)
                    include(0)
                }
            }
            pieceMin.toArray(packed, i * 6)
            pieceMax.toArray(packed, i * 6 + 3)
            min.minimizeInPlace(pieceMin)
            max.maximizeInPlace(pieceMax)
        }
        pieces.set(shape, packed)
    }
    const radius = Math.hypot(Math.max(Math.abs(min.x), Math.abs(max.x)), Math.max(Math.abs(min.z), Math.abs(max.z)))
    const bounds = {min, max, radius, pieces}
    modelBounds.set(model, bounds)
    return bounds
}

export class TreeCameraFrustum {
    private readonly planes = Array.from({length: 6}, () => new Plane(0, 0, 0, 0))
    private readonly horizontal = new Float64Array(6)

    update(viewProjection: Matrix, padding: number) {
        Frustum.GetPlanesToRef(viewProjection, this.planes)
        for (let i = 0; i < this.planes.length; i++) {
            const plane = this.planes[i]
            plane.d += padding
            this.horizontal[i] = Math.hypot(plane.normal.x, plane.normal.z)
        }
    }

    intersects(model: TreeModel, position: Vector3, scale: number) {
        // An upright cylinder encloses the model at any yaw.
        const {min, max, radius} = getTreeModelBounds(model)
        const width = radius * scale
        const bottom = min.y * scale, top = max.y * scale
        for (let i = 0; i < this.planes.length; i++) {
            const plane = this.planes[i]
            const ny = plane.normal.y
            if (plane.dotCoordinate(position) + this.horizontal[i] * width + ny * (ny > 0 ? top : bottom) < 0) return false
        }
        return true
    }
}

export function projectTreeBounds(bounds: TreeBounds, transform: Matrix, point: Vector3, projected: TreeBounds) {
    const {min, max} = bounds
    const m = transform.m
    projected.min.set(Infinity, Infinity, Infinity)
    projected.max.set(-Infinity, -Infinity, -Infinity)
    for (let corner = 0; corner < 8; corner++) {
        const x = corner & 1 ? max.x : min.x, y = corner & 2 ? max.y : min.y, z = corner & 4 ? max.z : min.z
        // A box crossing the camera plane may cover any part of the viewport.
        if (x * m[3] + y * m[7] + z * m[11] + m[15] <= 0) return false
        Vector3.TransformCoordinatesFromFloatsToRef(x, y, z, transform, point)
        projected.min.minimizeInPlace(point)
        projected.max.maximizeInPlace(point)
    }
    return true
}

// The reveal rectangle is expressed in the same normalized device coordinates.
export function overlapsTreeReveal(bounds: TreeBounds, reveal: Vector4, radiusX: number, radiusY: number, reverseDepth: boolean) {
    if (reveal.z === 0) return false
    const front = reverseDepth ? bounds.max.z > reveal.w : bounds.min.z < reveal.w
    if (!front) return false
    const dx = Math.max(bounds.min.x - reveal.x, reveal.x - bounds.max.x, 0) / (radiusX * reveal.z)
    const dy = Math.max(bounds.min.y - reveal.y, reveal.y - bounds.max.y, 0) / (radiusY * reveal.z)
    return dx * dx + dy * dy < 1
}

// Each plane is a clip-space inequality transformed into world space. This works
// for both the game's perspective camera and the orthographic preview cameras.
export class TreeRevealFrustum {
    private readonly planes = Array.from({length: 5}, () => Vector4.Zero())
    private active = false

    update(viewProjection: Matrix, reveal: Vector4, radiusX: number, radiusY: number, reverseDepth: boolean) {
        this.active = reveal.z > 0
        if (!this.active) return
        const m = viewProjection.m
        this.setPlane(0, 0, 1, reveal.x - radiusX * reveal.z, m)
        this.setPlane(1, 0, -1, reveal.x + radiusX * reveal.z, m)
        this.setPlane(2, 1, 1, reveal.y - radiusY * reveal.z, m)
        this.setPlane(3, 1, -1, reveal.y + radiusY * reveal.z, m)
        this.setPlane(4, 2, reverseDepth ? 1 : -1, reveal.w, m)
    }

    private setPlane(index: number, axis: number, sign: number, limit: number, matrix: Matrix['m']) {
        const scale = -sign * limit
        this.planes[index].set(
            sign * matrix[axis] + scale * matrix[3], sign * matrix[axis + 4] + scale * matrix[7],
            sign * matrix[axis + 8] + scale * matrix[11], sign * matrix[axis + 12] + scale * matrix[15],
        )
    }

    intersects({min, max}: TreeBounds) {
        if (!this.active) return false
        for (const {x, y, z, w} of this.planes) {
            if (x * (x > 0 ? max.x : min.x) + y * (y > 0 ? max.y : min.y) + z * (z > 0 ? max.z : min.z) + w < -1e-5) return false
        }
        return true
    }
}

export function buildTreeRevealIndex(entries: TreeRevealEntry[]): TreeRevealNode | undefined {
    if (entries.length <= 1) return entries[0]
    const min = entries[0].bounds.min.clone(), max = entries[0].bounds.max.clone()
    for (const entry of entries) {
        min.minimizeInPlace(entry.bounds.min)
        max.maximizeInPlace(entry.bounds.max)
    }
    const x = max.x - min.x, y = max.y - min.y, z = max.z - min.z
    const axis = x >= y && x >= z ? 'x' : y >= z ? 'y' : 'z'
    entries.sort((a, b) => (a.bounds.min[axis] + a.bounds.max[axis]) - (b.bounds.min[axis] + b.bounds.max[axis]))
    const middle = entries.length >> 1
    return {bounds: {min, max}, left: buildTreeRevealIndex(entries.slice(0, middle))!, right: buildTreeRevealIndex(entries.slice(middle))!}
}

export function collectTreeRevealCandidates(node: TreeRevealNode | undefined, player: TreeRevealFrustum, target: TreeRevealFrustum,
    candidates: TreeRevealEntry[]) {
    if (!node || (!player.intersects(node.bounds) && !target.intersects(node.bounds))) return
    if ('placement' in node) candidates.push(node)
    else {
        collectTreeRevealCandidates(node.left, player, target, candidates)
        collectTreeRevealCandidates(node.right, player, target, candidates)
    }
}
