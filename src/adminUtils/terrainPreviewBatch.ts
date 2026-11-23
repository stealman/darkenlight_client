import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import type { Mesh } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { TERRAIN_BEVEL_DROP, TERRAIN_BEVEL_WIDTH } from '@/babylon/world/beveledTerrainBlock'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'

type TriangleUV = readonly [Vector2, Vector2, Vector2]
export type TerrainPreviewTriangle = {
    points: readonly [Vector3, Vector3, Vector3]
    normal: Vector3
}

const HALF_TURN = Matrix.RotationY(Math.PI)
const PLANE_UVS = [new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1)]
const BLOCK_TOP_UVS = PLANE_UVS.map(uv => new Vector2(0.25 + 0.25 * uv.x, (1 + uv.y) / 3))
// Preview heights stay inside these bounds. The sentinels put absent edges out of shader range.
const NO_DIRT_EDGE = 10000
type DirtEdges = {top?: number, foot?: number}

export const terrainNoiseShader = `
    float terrainHash(vec2 p) {
        vec3 h = fract(vec3(p.xyx) * 0.1031);
        h += dot(h, h.yzx + 33.33);
        return fract((h.x + h.y) * h.z);
    }

    float terrainNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        vec2 t = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(terrainHash(cell), terrainHash(cell + vec2(1.0, 0.0)), t.x),
            mix(terrainHash(cell + vec2(0.0, 1.0)), terrainHash(cell + 1.0), t.x),
            t.y
        );
    }
`

export class TerrainPreviewBatch {
    private readonly matrices: Matrix[] = []
    private readonly origins: Vector2[] = []
    private readonly uValues: number[] = []
    private readonly vValues: number[] = []
    private readonly dirtEdges: number[] = []

    get count() {
        return this.matrices.length
    }

    addPlane(matrix: Matrix, origin: Vector2, options?: {blockAtlas?: boolean, bottomV?: number, dirtEdges?: DirtEdges}) {
        const {blockAtlas = false, bottomV = 0, dirtEdges} = options ?? {}
        const [a, b, c, d] = blockAtlas ? BLOCK_TOP_UVS : PLANE_UVS
        const lowerLeft = bottomV === 0 ? a : new Vector2(a.x, bottomV)
        const lowerRight = bottomV === 0 ? b : new Vector2(b.x, bottomV)
        this.addInstance(matrix, origin, [lowerLeft, lowerRight, c], dirtEdges)
        this.addInstance(HALF_TURN.multiply(matrix), origin, [c, d, lowerLeft], dirtEdges)
    }

    addTriangle({points: [a, b, c], normal}: TerrainPreviewTriangle, origin: Vector2, uv: TriangleUV, dirtEdges?: DirtEdges) {
        const u = b.subtract(a)
        const v = c.subtract(b)
        const center = a.add(c).scaleInPlace(0.5)
        const matrix = Matrix.FromValues(
            u.x, u.y, u.z, 0,
            normal.x, normal.y, normal.z, 0,
            v.x, v.y, v.z, 0,
            center.x, center.y, center.z, 1,
        )
        this.addInstance(matrix, origin, uv, dirtEdges)
    }

    apply(mesh: Mesh, roundDirtEdges = false) {
        const count = this.matrices.length
        if (count) {
            mesh.thinInstanceSetBuffer('terrainTriangleU', new Float32Array(this.uValues), 3)
            mesh.thinInstanceSetBuffer('terrainTriangleV', new Float32Array(this.vValues), 3)
            if (roundDirtEdges) mesh.thinInstanceSetBuffer('terrainDirtEdges', new Float32Array(this.dirtEdges), 2)
        }
        updateWorldInstanceBuffers(mesh, this.matrices, this.origins)
        mesh.setEnabled(count > 0)
    }

    private addInstance(matrix: Matrix, origin: Vector2, [a, b, c]: TriangleUV, dirtEdges?: DirtEdges) {
        this.matrices.push(matrix)
        this.origins.push(origin)
        this.uValues.push(a.x, b.x, c.x)
        this.vValues.push(a.y, b.y, c.y)
        this.dirtEdges.push(dirtEdges?.top ?? -NO_DIRT_EDGE, dirtEdges?.foot ?? NO_DIRT_EDGE)
    }
}

export function addTerrainPreviewRoof(
    batch: TerrainPreviewBatch, placement: Matrix, origin: Vector2,
    triangles?: readonly TerrainPreviewTriangle[],
    options?: {blockAtlas?: boolean, mirrorAtTileEdge?: boolean, roundDirtEdges?: boolean},
) {
    const {blockAtlas = false, mirrorAtTileEdge = false, roundDirtEdges = false} = options ?? {}
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
        const dirtEdges = roundDirtEdges ? {
            top: Math.min(a.y, b.y, c.y) < center.y - 1e-6 ? center.y : undefined,
        } : undefined
        batch.addTriangle(triangle, origin, [project(a), project(b), project(c)], dirtEdges)
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

export function configureDirtEdgeLighting(material: PBRCustomMaterial, mixedCoverage = false) {
    material.AddAttribute('terrainDirtEdges')
    material.Vertex_Definitions(`${material.CustomParts.Vertex_Definitions}
        attribute vec2 terrainDirtEdges;
        varying vec2 vDirtEdges;
    `)
    material.Vertex_After_WorldPosComputed(`${material.CustomParts.Vertex_After_WorldPosComputed}
        vDirtEdges = world[1].y * terrainDirtEdges + world[3].y;
    `)
    material.Fragment_Definitions(`${material.CustomParts.Fragment_Definitions ?? ''}
        ${mixedCoverage ? '' : terrainNoiseShader}
        varying vec2 vDirtEdges;

        vec3 roundDirtEdge(vec3 bumped, vec3 surface, float depth, float edgeY, float dirt, vec2 widths, bool foot) {
            float bevelDrop = foot ? 0.0 : ${TERRAIN_BEVEL_DROP};
            if (depth <= 0.0 || depth >= bevelDrop + widths.y || dirt <= 0.0) return bumped;

            // Both faces of the same edge use the same world-space pattern.
            vec2 p = vPositionW.xz + vec2(1.9, -1.4) * edgeY;
            float variation = 0.74 * terrainNoise(p * 2.6) + 0.26 * terrainNoise(p * 7.5 + vec2(4.0, 9.0));
            float shape = smoothstep(0.16, 0.84, variation);
            vec3 up = vec3(0.0, 1.0, 0.0);
            float reveal;
            vec3 rounded;
            if (surface.y > 0.0001) {
                reveal = smoothstep(0.0, ${TERRAIN_BEVEL_DROP}, depth);
                rounded = normalize(mix(up, surface, reveal));
            } else {
                float width = mix(widths.x, widths.y, shape);
                reveal = 1.0 - smoothstep(0.0, width, depth - bevelDrop);
                if (reveal <= 0.0) return bumped;
                // At the foot, match the flat terrace's lighting. At the top, match the bevel.
                vec3 lip = foot ? up : normalize(up + surface * ${TERRAIN_BEVEL_DROP / TERRAIN_BEVEL_WIDTH});
                rounded = normalize(mix(surface, lip, reveal));
            }
            float relief = 1.0 - mix(0.48, 0.83, shape) * reveal;
            return normalize(mix(bumped, rounded + (bumped - surface) * relief, dirt));
        }
    `)
    material.Fragment_Before_Lights(`${material.CustomParts.Fragment_Before_Lights ?? ''}
        vec2 edgeDirt = ${mixedCoverage ? 'dirtCoverage' : 'vec2(1.0)'};
        normalW = roundDirtEdge(normalW, geometricNormalW, vDirtEdges.x - vPositionW.y, vDirtEdges.x, edgeDirt.x, vec2(0.13, 0.33), false);
        normalW = roundDirtEdge(normalW, geometricNormalW, vPositionW.y - vDirtEdges.y, vDirtEdges.y, edgeDirt.y, vec2(0.09, 0.26), true);
    `)
}
