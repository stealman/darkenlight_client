import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import type { Mesh } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'

type TriangleUV = readonly [Vector2, Vector2, Vector2]
export type TerrainPreviewTriangle = {
    points: readonly [Vector3, Vector3, Vector3]
    normal: Vector3
}

const HALF_TURN = Matrix.RotationY(Math.PI)
const PLANE_UVS = [new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1)]
const BLOCK_TOP_UVS = PLANE_UVS.map(uv => new Vector2(0.25 + 0.25 * uv.x, (1 + uv.y) / 3))

export class TerrainPreviewBatch {
    private readonly matrices: Matrix[] = []
    private readonly origins: Vector2[] = []
    private readonly uValues: number[] = []
    private readonly vValues: number[] = []

    get count() {
        return this.matrices.length
    }

    addPlane(matrix: Matrix, origin: Vector2, options?: {blockAtlas?: boolean, bottomV?: number}) {
        const {blockAtlas = false, bottomV = 0} = options ?? {}
        const [a, b, c, d] = blockAtlas ? BLOCK_TOP_UVS : PLANE_UVS
        const lowerLeft = bottomV === 0 ? a : new Vector2(a.x, bottomV)
        const lowerRight = bottomV === 0 ? b : new Vector2(b.x, bottomV)
        this.addInstance(matrix, origin, [lowerLeft, lowerRight, c])
        this.addInstance(HALF_TURN.multiply(matrix), origin, [c, d, lowerLeft])
    }

    addTriangle({points: [a, b, c], normal}: TerrainPreviewTriangle, origin: Vector2, uv: TriangleUV) {
        const u = b.subtract(a)
        const v = c.subtract(b)
        const center = a.add(c).scaleInPlace(0.5)
        const matrix = Matrix.FromValues(
            u.x, u.y, u.z, 0,
            normal.x, normal.y, normal.z, 0,
            v.x, v.y, v.z, 0,
            center.x, center.y, center.z, 1,
        )
        this.addInstance(matrix, origin, uv)
    }

    apply(mesh: Mesh) {
        const count = this.matrices.length
        if (count) {
            mesh.thinInstanceSetBuffer('terrainTriangleU', new Float32Array(this.uValues), 3)
            mesh.thinInstanceSetBuffer('terrainTriangleV', new Float32Array(this.vValues), 3)
        }
        updateWorldInstanceBuffers(mesh, this.matrices, this.origins)
        mesh.setEnabled(count > 0)
    }

    private addInstance(matrix: Matrix, origin: Vector2, [a, b, c]: TriangleUV) {
        this.matrices.push(matrix)
        this.origins.push(origin)
        this.uValues.push(a.x, b.x, c.x)
        this.vValues.push(a.y, b.y, c.y)
    }
}

export function addTerrainPreviewRoof(
    batch: TerrainPreviewBatch, placement: Matrix, origin: Vector2,
    triangles?: readonly TerrainPreviewTriangle[], options?: {blockAtlas?: boolean, mirrorAtTileEdge?: boolean},
) {
    const {blockAtlas = false, mirrorAtTileEdge = false} = options ?? {}
    if (!triangles) {
        batch.addPlane(placement, origin, {blockAtlas})
        return
    }
    const center = placement.getTranslation()
    const axis = placement.m
    const project = (point: Vector3) => {
        const x = point.x - center.x, z = point.z - center.z
        let u = x * axis[0] + z * axis[2] + 0.5
        let v = x * axis[8] + z * axis[10] + 0.5
        if (mirrorAtTileEdge) {
            u = 1 - Math.abs(1 - Math.abs(u))
            v = 1 - Math.abs(1 - Math.abs(v))
        }
        return blockAtlas ? new Vector2(0.25 + 0.25 * u, (1 + v) / 3) : new Vector2(u, v)
    }
    for (const triangle of triangles) {
        const [a, b, c] = triangle.points
        batch.addTriangle(triangle, origin, [project(a), project(b), project(c)])
    }
}

export function configureTerrainPreviewBatch(mesh: Mesh, material: PBRCustomMaterial, useDefaultAtlasUv = true) {
    // A single triangle handles both halves of regular planes and the clipped faces.
    mesh.setIndices(mesh.getIndices()!.slice(0, 3))
    mesh.material = material
    material.AddAttribute('terrainTriangleU')
    material.AddAttribute('terrainTriangleV')
    material.Vertex_Definitions(`${material.CustomParts.Vertex_Definitions}
        attribute vec3 terrainTriangleU;
        attribute vec3 terrainTriangleV;
        vec2 terrainAtlasUV(vec3 localPosition) {
            vec2 corner = localPosition.xz + 0.5;
            vec3 weights = vec3(1.0 - corner.x, corner.x * (1.0 - corner.y), corner.x * corner.y);
            return vec2(dot(weights, terrainTriangleU), dot(weights, terrainTriangleV)) + uvc;
        }
    `)
    if (useDefaultAtlasUv) material.Vertex_Before_PositionUpdated('uvUpdated = terrainAtlasUV(positionUpdated);')
}
