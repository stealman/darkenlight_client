import { Mesh, Vector2, Vector3, VertexBuffer, VertexData } from '@babylonjs/core'

const EPSILON = 1e-5
type Polygon = Vector2[]
type Plane = {origin: number, u: number, v: number}
type SurfaceFace = {emit: (polygons: Polygon[]) => void, polygons: Polygon[]}
type SurfaceOptions = {alternatePartUvs?: number[], roofPlankCount?: number}

function splitPolygon(polygon: Polygon, plane: Plane) {
    const inside: Polygon = [], outside: Polygon = []
    const distance = (point: Vector2) => {
        const value = plane.origin + point.x * plane.u + point.y * plane.v
        return Math.abs(value) <= EPSILON ? 0 : value
    }
    let previous = polygon[polygon.length - 1]
    let previousDistance = distance(previous)
    for (const point of polygon) {
        const currentDistance = distance(point)
        if (previousDistance * currentDistance < 0) {
            const crossing = Vector2.Lerp(previous, point, previousDistance / (previousDistance - currentDistance))
            inside.push(crossing)
            outside.push(crossing)
        }
        if (currentDistance <= 0) inside.push(point)
        if (currentDistance >= 0) outside.push(point)
        previous = point
        previousDistance = currentDistance
    }
    return {inside, outside}
}

function polygonArea(polygon: Polygon) {
    if (polygon.length < 3) return 0
    let area = 0
    let previous = polygon[polygon.length - 1]
    for (const point of polygon) {
        area += previous.x * point.y - point.x * previous.y
        previous = point
    }
    return Math.abs(area) * 0.5
}

function subtractBox(polygon: Polygon, planes: Plane[]): Polygon[] {
    const exposed: Polygon[] = []
    let covered = polygon
    for (const plane of planes) {
        if (Math.abs(plane.origin) <= EPSILON && Math.abs(plane.u) <= EPSILON && Math.abs(plane.v) <= EPSILON) continue
        const {inside, outside} = splitPolygon(covered, plane)
        if (polygonArea(inside) <= EPSILON) return [polygon]
        if (polygonArea(outside) > EPSILON) exposed.push(outside)
        covered = inside
    }
    return exposed
}

// Bake the exposed faces of prefab boxes once. Polygon clipping preserves the source texture mapping on sloped parts.
export function createBuildingBoxSurface(parts: Mesh[], partUvs: number[], name: string,
    {alternatePartUvs, roofPlankCount = 0}: SurfaceOptions = {}) {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = []
    const atlasUvs: number[] = [], alternateUvs: number[] = []
    const boxes = parts.map((part, index) => {
        const world = part.computeWorldMatrix(true)
        const {minimumWorld, maximumWorld, extendSize} = part.getBoundingInfo().boundingBox
        return {
            index, world, inverse: world.clone().invert(), half: extendSize.asArray(),
            min: minimumWorld, max: maximumWorld, neighbors: [] as number[],
        }
    })
    // Only intersecting bounds can hide a face. Sweep once to avoid comparing every roof plank with every other plank.
    const sorted = [...boxes].sort((a, b) => a.min.x - b.min.x)
    for (const [index, box] of sorted.entries()) {
        for (let j = index + 1; j < sorted.length && sorted[j].min.x <= box.max.x + EPSILON; j++) {
            const other = sorted[j]
            if (other.min.y > box.max.y + EPSILON || other.max.y < box.min.y - EPSILON
                || other.min.z > box.max.z + EPSILON || other.max.z < box.min.z - EPSILON) continue
            box.neighbors.push(other.index)
            other.neighbors.push(box.index)
        }
    }

    const quad = [new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1)]
    const faces: SurfaceFace[] = []
    const partialFaces: {face: SurfaceFace, exposed: Polygon[], cost: number, benefit: number}[] = []
    let savedTriangles = 0
    let atlasOffset = 0
    for (const [index, part] of parts.entries()) {
        const box = boxes[index]
        const vertices = part.getVerticesData(VertexBuffer.PositionKind)!
        const vertexNormals = part.getVerticesData(VertexBuffer.NormalKind)!
        const vertexUvs = part.getVerticesData(VertexBuffer.UVKind)!
        for (let start = 0; start < part.getTotalVertices(); start += 4) {
            const point = (index: number) => Vector3.TransformCoordinates(Vector3.FromArray(vertices, index * 3), box.world)
            const origin = point(start)
            const u = point(start + 1).subtract(origin)
            const v = point(start + 3).subtract(origin)
            const normal = Vector3.TransformNormal(Vector3.FromArray(vertexNormals, start * 3), box.world).normalize()
            let exposed = [quad]
            for (const neighbor of box.neighbors) {
                const other = boxes[neighbor]
                const localOrigin = Vector3.TransformCoordinates(origin, other.inverse).asArray()
                const localU = Vector3.TransformNormal(u, other.inverse).asArray()
                const localV = Vector3.TransformNormal(v, other.inverse).asArray()
                const localNormal = Vector3.TransformNormal(normal, other.inverse).asArray()
                const planes: Plane[] = []
                let keepCoplanarFace = false
                for (let axis = 0; axis < 3; axis++) {
                    for (const sign of [-1, 1]) {
                        const plane = {origin: sign * localOrigin[axis] - other.half[axis], u: sign * localU[axis], v: sign * localV[axis]}
                        // Keep one copy of an overlapping outside face, using the original part order to break ties.
                        if (index < neighbor && sign * localNormal[axis] > 0.99
                            && Math.abs(plane.origin) <= EPSILON && Math.abs(plane.u) <= EPSILON && Math.abs(plane.v) <= EPSILON) {
                            keepCoplanarFace = true
                        }
                        planes.push(plane)
                    }
                }
                if (!keepCoplanarFace) exposed = exposed.flatMap(polygon => subtractBox(polygon, planes))
                if (!exposed.length) break
            }
            const exposedArea = exposed.reduce((area, polygon) => area + polygonArea(polygon), 0)
            // Adjacent shed strips have a small height jitter. Drop the slivers left between planks
            // instead of triangulating each one. Fully exposed end and perimeter faces stay intact.
            if (index < roofPlankCount && Math.abs(normal.y) < EPSILON && exposedArea < 0.20) exposed = []
            const faceAtlasOffset = atlasOffset
            const emit = (polygons: Polygon[]) => {
                for (const polygon of polygons) {
                    const first = positions.length / 3
                    for (const point of polygon) {
                        positions.push(origin.x + u.x * point.x + v.x * point.y,
                            origin.y + u.y * point.x + v.y * point.y, origin.z + u.z * point.x + v.z * point.y)
                        normals.push(normal.x, normal.y, normal.z)
                        for (let channel = 0; channel < 2; channel++) {
                            const texel = vertexUvs[start * 2 + channel]
                            uvs.push(texel + (vertexUvs[(start + 1) * 2 + channel] - texel) * point.x
                                + (vertexUvs[(start + 3) * 2 + channel] - texel) * point.y)
                            atlasUvs.push(partUvs[faceAtlasOffset + channel])
                            if (alternatePartUvs) alternateUvs.push(alternatePartUvs[faceAtlasOffset + channel])
                        }
                    }
                    for (let i = 1; i < polygon.length - 1; i++) indices.push(first, first + i, first + i + 1)
                }
            }
            const cost = exposed.reduce((count, polygon) => count + polygon.length - 2, 0) - 2
            const face = {emit, polygons: cost <= 0 ? exposed : [quad]}
            faces.push(face)
            if (cost <= 0) {
                savedTriangles -= cost
            } else {
                const hiddenArea = 1 - exposedArea
                const benefit = hiddenArea * Vector3.Cross(u, v).length() / cost
                partialFaces.push({face, exposed, cost, benefit})
            }
        }
        atlasOffset += vertexUvs.length
    }
    // Prefer larger hidden surfaces, while keeping the mesh at or below the original triangle count.
    partialFaces.sort((a, b) => b.benefit - a.benefit)
    for (const {face, exposed, cost} of partialFaces) {
        if (cost <= savedTriangles) {
            savedTriangles -= cost
            face.polygons = exposed
        }
    }
    for (const face of faces) face.emit(face.polygons)
    const mesh = new Mesh(name, parts[0].getScene())
    const data = new VertexData()
    Object.assign(data, {positions, normals, uvs, indices})
    data.applyToMesh(mesh)
    mesh.setVerticesData('uvc', atlasUvs, !!alternatePartUvs, 2)
    parts.forEach(part => part.dispose())
    return {mesh, atlasUvs, alternateUvs}
}
