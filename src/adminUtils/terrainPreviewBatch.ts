import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import type { Mesh } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { TERRAIN_BEVEL_DROP, TERRAIN_BEVEL_WIDTH } from '@/babylon/world/beveledTerrainBlock'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'
import { terrainNoiseShader } from '@/babylon/world/terrainSurfaceShader'
import { SNOWMELT_DISTANCE_SCALE, SNOWMELT_MAX_DISTANCE } from '@/babylon/world/terrainTransitionField'

type TriangleUV = readonly [Vector2, Vector2, Vector2]
export type TerrainPreviewTriangle = {
    points: readonly [Vector3, Vector3, Vector3]
    normal: Vector3
}

const HALF_TURN = Matrix.RotationY(Math.PI)
const PLANE_UVS = [new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1)]
// Preview heights stay inside these bounds. The sentinels put absent edges out of shader range.
const NO_DIRT_EDGE = 10000
export const COAL_DEPOSIT = -1
type TerrainSurfaceDetails = {top?: number, foot?: number, wetTile?: readonly [x: number, z: number, corners: number], depositKind?: number}
export type TerrainInstanceAttribute = {kind: string, stride: number, values: number[]}
export type SubmitTerrainBatch = (mesh: Mesh, batch: TerrainPreviewBatch, attributes: TerrainInstanceAttribute[]) => void
export const PAVING_SNOW_FLAG_SHIFT = 64
export const PAVING_SNOW_ATTRIBUTE = 'terrainPavingSnow'

export class TerrainPreviewBatch {
    private readonly matrices: Matrix[] = []
    private readonly origins: Vector2[] = []
    private readonly uValues: number[] = []
    private readonly vValues: number[] = []
    private readonly dirtEdges: number[] = []
    private readonly wetTiles: number[] = []
    private readonly rockDeposits: number[] = []
    private readonly tiles: number[] = []
    private readonly spans: number[] = []
    tile = -1

    forEachInstance(visit: (tile: number, matrix: Matrix, uv: Vector2, index: number, span: number) => void) {
        for (let i = 0; i < this.matrices.length; i++) {
            visit(this.tiles[i], this.matrices[i], this.origins[i], i, this.spans[i] ?? 1)
        }
    }

    attributes(roundDirtEdges = false, wetness = roundDirtEdges, showRockDeposits = false) {
        const attributes: TerrainInstanceAttribute[] = [
            {kind: 'terrainTriangleU', stride: 3, values: this.uValues},
            {kind: 'terrainTriangleV', stride: 3, values: this.vValues},
        ]
        if (roundDirtEdges) attributes.push({kind: 'terrainDirtEdges', stride: 2, values: this.dirtEdges})
        if (wetness) attributes.push({kind: 'terrainWetTile', stride: 3, values: this.wetTiles})
        if (showRockDeposits) attributes.push({kind: 'terrainDeposit', stride: 1, values: this.rockDeposits})
        return attributes
    }

    get count() {
        return this.matrices.length
    }

    addPlane(matrix: Matrix, origin: Vector2, options?: {bottomV?: number, dirtEdges?: TerrainSurfaceDetails, atlasSpan?: number}) {
        const {bottomV = 0, dirtEdges, atlasSpan = 1} = options ?? {}
        const [a, b, c, d] = atlasSpan === 1 ? PLANE_UVS : PLANE_UVS.map(uv => uv.scale(atlasSpan))
        const lowerLeft = bottomV === 0 ? a : new Vector2(a.x, bottomV)
        const lowerRight = bottomV === 0 ? b : new Vector2(b.x, bottomV)
        if (atlasSpan > 1) {
            this.spans[this.count] = atlasSpan
            this.spans[this.count + 1] = atlasSpan
        }
        this.addInstance(matrix, origin, [lowerLeft, lowerRight, c], dirtEdges)
        this.addInstance(HALF_TURN.multiply(matrix), origin, [c, d, lowerLeft], dirtEdges)
    }

    addTriangle({points: [a, b, c], normal}: TerrainPreviewTriangle, origin: Vector2, uv: TriangleUV, dirtEdges?: TerrainSurfaceDetails) {
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

    apply(mesh: Mesh, roundDirtEdges = false, wetness = roundDirtEdges, showRockDeposits = false) {
        const count = this.matrices.length
        if (count) {
            for (const {kind, stride, values} of this.attributes(roundDirtEdges, wetness, showRockDeposits)) {
                mesh.thinInstanceSetBuffer(kind, new Float32Array(values), stride)
            }
        }
        updateWorldInstanceBuffers(mesh, this.matrices, this.origins)
        mesh.setEnabled(count > 0)
    }

    private addInstance(matrix: Matrix, origin: Vector2, [a, b, c]: TriangleUV, dirtEdges?: TerrainSurfaceDetails) {
        this.matrices.push(matrix)
        this.tiles.push(this.tile)
        this.origins.push(origin)
        this.uValues.push(a.x, b.x, c.x)
        this.vValues.push(a.y, b.y, c.y)
        this.dirtEdges.push(dirtEdges?.top ?? -NO_DIRT_EDGE, dirtEdges?.foot ?? NO_DIRT_EDGE)
        this.wetTiles.push(dirtEdges?.wetTile?.[0] ?? 0, dirtEdges?.wetTile?.[1] ?? 0, dirtEdges?.wetTile?.[2] ?? 0)
        this.rockDeposits.push(dirtEdges?.depositKind ?? 0)
    }
}

export function addTerrainPreviewRoof(
    batch: TerrainPreviewBatch, placement: Matrix, origin: Vector2,
    triangles?: readonly TerrainPreviewTriangle[],
    options?: {mirrorAtTileEdge?: boolean, roundDirtEdges?: boolean, wetCorners?: number, depositKind?: number},
) {
    const {mirrorAtTileEdge = false, roundDirtEdges = false, wetCorners = 0, depositKind = 0} = options ?? {}
    const center = placement.getTranslation()
    const wetTile: TerrainSurfaceDetails['wetTile'] = wetCorners ? [center.x, center.z, wetCorners] : undefined
    if (!triangles) {
        batch.addPlane(placement, origin, {dirtEdges: wetTile || depositKind ? {wetTile, depositKind} : undefined})
        return
    }
    const axis = placement.m
    const project = (point: Vector3) => {
        const x = point.x - center.x, z = point.z - center.z
        let u = x * axis[0] + z * axis[2] + 0.5
        let v = x * axis[8] + z * axis[10] + 0.5
        if (mirrorAtTileEdge) {
            u = 1 - Math.abs(1 - Math.abs(u))
            v = 1 - Math.abs(1 - Math.abs(v))
        }
        return new Vector2(u, v)
    }
    for (const triangle of triangles) {
        const [a, b, c] = triangle.points
        const dirtEdges = roundDirtEdges || wetTile || depositKind ? {
            top: roundDirtEdges && Math.min(a.y, b.y, c.y) < center.y - 1e-6 ? center.y : undefined,
            wetTile,
            depositKind,
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

export function configureTerrainEdgeLighting(material: PBRCustomMaterial, coverage?: string, topOnly = false) {
    material.AddAttribute('terrainDirtEdges')
    material.Vertex_Definitions(`${material.CustomParts.Vertex_Definitions}
        attribute vec2 terrainDirtEdges;
        varying vec2 vDirtEdges;
    `)
    material.Vertex_After_WorldPosComputed(`${material.CustomParts.Vertex_After_WorldPosComputed}
        vDirtEdges = world[1].y * terrainDirtEdges + world[3].y;
    `)
    material.Fragment_Definitions(`${material.CustomParts.Fragment_Definitions ?? ''}
        ${coverage ? '' : terrainNoiseShader}
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
        vec2 edgeDirt = ${coverage ?? 'vec2(1.0)'};
        normalW = roundDirtEdge(normalW, geometricNormalW, vDirtEdges.x - vPositionW.y, vDirtEdges.x, edgeDirt.x, vec2(0.13, 0.33), false);
        ${topOnly ? '' : 'normalW = roundDirtEdge(normalW, geometricNormalW, vPositionW.y - vDirtEdges.y, vDirtEdges.y, edgeDirt.y, vec2(0.09, 0.26), true);'}
    `)
}

export function configureRockDeposits(material: PBRCustomMaterial, atlasDeposit?: string) {
    if (!atlasDeposit) material.AddAttribute('terrainDeposit')
    material.Vertex_Definitions(`${material.CustomParts.Vertex_Definitions}
        ${atlasDeposit ? '' : 'attribute float terrainDeposit;'}
        varying float vTerrainDeposit;
    `)
    material.Vertex_MainBegin(`${material.CustomParts.Vertex_MainBegin ?? ''} vTerrainDeposit = ${atlasDeposit ?? 'terrainDeposit'};`)
    material.Fragment_Definitions(`${material.CustomParts.Fragment_Definitions ?? ''}
        varying float vTerrainDeposit;
        float oreVein;
        float oreGrain;
        vec3 oreEmission;
        float coalCoverage;
        float coalRoughness;

        float oreFractureNoise(vec2 p) {
            vec2 cell = floor(p);
            vec2 f = fract(p);
            float a = terrainHash(cell);
            float b = terrainHash(cell + vec2(1.0, 0.0));
            float c = terrainHash(cell + vec2(0.0, 1.0));
            float d = terrainHash(cell + 1.0);
            // Each half-cell is a facet, so the contour changes direction at the joins.
            float lower = a + dot(f, vec2(b - a, c - a));
            float upper = d + dot(1.0 - f, vec2(c - d, b - d));
            float faceted = mix(lower, upper, step(1.0, f.x + f.y));
            float softer = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            return mix(faceted, softer, 0.13);
        }

        vec3 coalShard(vec2 p, vec2 cell) {
            vec2 offset = vec2(terrainHash(cell + 12.0), terrainHash(cell - 8.0)) - 0.5;
            vec2 center = cell + 0.5 + offset * 0.82;
            vec2 q = p - center;
            if (max(abs(q.x), abs(q.y)) > 0.56) return vec3(0.0);

        float density = terrainProceduralNoise(center * 0.42 + vec2(6.7, 29.1));
            float chance = mix(0.16, 0.88, smoothstep(0.28, 0.72, density));
            if (terrainHash(cell + vec2(19.1, 2.3)) > chance) return vec3(0.0);

            float sizeSeed = terrainHash(cell + vec2(34.6, 14.2));
            float size = mix(0.08, 0.46, pow(sizeSeed, 1.45));
            float shape = terrainHash(cell + vec2(6.0, 25.0));
            float angle = shape * 6.2831853;
            q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * q;
            q /= size * vec2(1.0, mix(0.43, 0.78, shape));
            float outline = max(
                max(abs(q.x + q.y * 0.38), abs(q.y - q.x * 0.32)),
                max(-0.77 * q.x + 0.63 * q.y, 0.72 * q.x - 0.85 * q.y)
            );
            float coverage = 1.0 - smoothstep(0.89, 1.0, outline);
            float ridge = 1.0 - abs(q.y * 0.51 - q.x * 0.23 + 0.08);
            float height = max(0.0, 1.0 - outline) * (0.55 + 0.45 * ridge);
            return vec3(coverage, height * mix(0.48, 1.38, sizeSeed), shape);
        }

        vec3 coalShards(vec2 p) {
            // Let the jittered shards cross their sampling cells and touch other shards.
            vec2 cell = floor(p - 0.5);
            vec3 shard = vec3(0.0);
            for (int z = 0; z < 2; z++) {
                for (int x = 0; x < 2; x++) {
                    vec3 candidate = coalShard(p, cell + vec2(float(x), float(z)));
                    if (candidate.y > shard.y) shard = candidate;
                }
            }
            return shard;
        }

        vec3 depositSlope(float depth, vec3 surface) {
            vec3 dx = dFdx(vPositionW), dy = dFdy(vPositionW);
            vec3 crossX = cross(dy, surface), crossY = cross(surface, dx);
            float det = dot(dx, crossX);
            return sign(det) * (dFdx(depth) * crossX + dFdy(depth) * crossY) / max(abs(det), 1e-8);
        }
    `)
    material.Fragment_Before_Lights(`${material.CustomParts.Fragment_Before_Lights ?? ''}
        oreVein = 0.0;
        oreGrain = 0.0;
        oreEmission = vec3(0.0);
        coalCoverage = 0.0;
        coalRoughness = 0.0;
        if (vTerrainDeposit < -0.5) {
            vec2 p = vPositionW.xz + 0.5;
            vec3 shard = coalShards(p * 4.0);
            coalCoverage = shard.x;
            float grain = terrainProceduralNoise(p * 52.0);
            coalRoughness = mix(0.31, 0.49, shard.z * 0.7 + grain * 0.3);
            vec3 coalColor = mix(vec3(0.009, 0.009, 0.011), vec3(0.032, 0.031, 0.035), shard.z * 0.85 + grain * 0.15);
            surfaceAlbedo = mix(surfaceAlbedo, coalColor, coalCoverage);

            // Use the opposite sign from the recessed ore vein to make coal protrude from the rock.
            vec3 slope = depositSlope(-0.054 * shard.y, geometricNormalW);
            vec3 coalNormal = normalize(geometricNormalW + slope / max(1.0, length(slope) * 0.55)
                + (normalW - geometricNormalW) * 0.23);
            normalW = normalize(mix(normalW, coalNormal, coalCoverage));
        } else if (vTerrainDeposit > 0.5) {
            vec2 p = vPositionW.xz + vPositionW.y * vec2(0.31, -0.18);
            vec2 seamUV = mat2(0.87, -0.49, 0.49, 0.87) * p;
            float warp = terrainProceduralNoise(seamUV * 2.7 + vec2(3.0, 9.4));
            float mineral = terrainProceduralNoise(seamUV * 1.9 + vec2(17.8, 3.2));
            oreGrain = terrainProceduralNoise(p * 41.0);
            float seam = abs(oreFractureNoise(seamUV * vec2(2.4, 5.1) + vec2(warp * 0.36, 7.2)) - 0.53);
            float seamWidth = mix(0.021, 0.075, mineral);
            float width = seamWidth * mix(0.65, 1.2, oreGrain);
            float mainVein = 1.0 - smoothstep(width * 0.35, width, seam);
            float branch = abs(oreFractureNoise(seamUV * vec2(4.6, 3.0) + vec2(21.1, warp * 0.54)) - 0.49);
            float branchConnection = 1.0 - smoothstep(0.07, 0.21, seam);
            float branchVein = (1.0 - smoothstep(0.014, 0.045, branch)) * branchConnection;
            float mineralVeins = smoothstep(0.20, 0.50, mineral + oreGrain * 0.18);
            oreVein = max(mainVein, branchVein * 0.70) * mineralVeins;

            float mainGroove = 1.0 - smoothstep(seamWidth * 0.48, seamWidth * 1.65, seam);
            float branchGroove = (1.0 - smoothstep(0.025, 0.077, branch)) * branchConnection;
            float groove = max(mainGroove, branchGroove * 0.78);
            float rim = smoothstep(0.06, 0.63, groove * mineralVeins) * (1.0 - oreVein);
            surfaceAlbedo = mix(surfaceAlbedo, surfaceAlbedo * vec3(0.08, 0.065, 0.057), rim * 0.96);
            vec3 darkOre = vec3(0.34, 0.105, 0.038);
            vec3 brightOre = vec3(0.81, 0.40, 0.15);
            oreEmission = vec3(0.075, 0.031, 0.011);
            if (vTerrainDeposit < 1.5) {
                darkOre = vec3(0.19, 0.21, 0.24);
                brightOre = vec3(0.59, 0.65, 0.72);
                oreEmission = vec3(0.036, 0.046, 0.059);
            } else if (vTerrainDeposit < 2.5) {
                darkOre = vec3(0.37, 0.23, 0.036);
                brightOre = vec3(0.88, 0.64, 0.18);
                oreEmission = vec3(0.071, 0.050, 0.012);
            } else if (vTerrainDeposit > 4.5) {
                darkOre = vec3(0.046, 0.105, 0.28);
                brightOre = vec3(0.17, 0.44, 0.84);
                oreEmission = vec3(0.014, 0.037, 0.081);
            } else if (vTerrainDeposit > 3.5) {
                darkOre = vec3(0.19, 0.030, 0.053);
                brightOre = vec3(0.51, 0.09, 0.14);
                oreEmission = vec3(0.060, 0.012, 0.026);
            }
            vec3 oreColor = mix(darkOre, brightOre, smoothstep(0.14, 0.87, oreGrain));
            surfaceAlbedo = mix(surfaceAlbedo, oreColor, oreVein);

            // The positive depth represents a cut into the surface, so its gradient tilts the normals inward.
            float depth = 0.006 * groove * smoothstep(0.20, 0.44, mineral + 0.08);
            vec3 slope = depositSlope(depth, geometricNormalW);
            normalW = normalize(mix(normalW, geometricNormalW, oreVein * 0.36) + slope / max(1.0, length(slope) * 1.8));
        }
    `)
    material.Fragment_Custom_MetallicRoughness(`${material.CustomParts.Fragment_Custom_MetallicRoughness ?? ''}
        metallicRoughness.r = mix(metallicRoughness.r, 0.62, oreVein);
        metallicRoughness.g = mix(metallicRoughness.g, mix(0.24, 0.37, oreGrain), oreVein);
        metallicRoughness.r = mix(metallicRoughness.r, 0.0, coalCoverage);
        metallicRoughness.g = mix(metallicRoughness.g, coalRoughness, coalCoverage);
    `)
    material.Fragment_Before_FinalColorComposition(`${material.CustomParts.Fragment_Before_FinalColorComposition ?? ''}
        finalEmissive += oreEmission * oreVein * mix(0.75, 1.15, oreGrain);
    `)
}

export function configureMuddyDirtWetness(material: PBRCustomMaterial, mode: 'solid' | 'mixed' | 'walls' | 'cover', substrate = '1.0') {
    material.AddAttribute('terrainWetTile')
    material.Vertex_Definitions(`${material.CustomParts.Vertex_Definitions}
        attribute vec3 terrainWetTile;
        varying vec3 vWetTile;
    `)
    material.Vertex_After_WorldPosComputed(`${material.CustomParts.Vertex_After_WorldPosComputed}
        vec2 wetTileCenter = (world * vec4(terrainWetTile.x, 0.0, terrainWetTile.y, 1.0)).xz;
        vWetTile = vec3(worldPos.xz - wetTileCenter + 0.5, terrainWetTile.z);
    `)
    material.Fragment_Definitions(`${material.CustomParts.Fragment_Definitions}
        varying vec3 vWetTile;
        float mudWetness;

        float terraceFootMoisture(float detail) {
            float mask = floor(vWetTile.z + 0.5);
            if (mask < 1.0) return 0.0;
            vec2 uv = clamp(vWetTile.xy, 0.0, 1.0);
            vec4 corners = mod(floor(mask / vec4(1.0, 2.0, 4.0, 8.0)), 2.0);
            // Evaluate the falloff across the tile, including across its triangle diagonal.
            float foot = mix(mix(corners.x, corners.y, uv.x), mix(corners.w, corners.z, uv.x), uv.y);
            float staggered = foot + (detail - 0.5) * 0.62;
            return smoothstep(0.0, 0.26, foot) * smoothstep(0.12, 0.94, staggered) * mix(0.44, 1.0, detail);
        }
    `)
    const dirt = mode === 'solid' ? '1.0' : mode === 'walls' ? '(wall ? 1.0 - grassWeight - snowWeight : 0.0)'
        : mode === 'cover' ? 'grassWeight' : '1.0 - grassWeight'
    material.Fragment_Before_Lights(`${material.CustomParts.Fragment_Before_Lights}
        mudWetness = 0.0;
        float wetDirt = (${dirt}) * ${substrate};
        if (wetDirt > 0.0) {
            vec2 moistureUV = vPositionW.xz + vPositionW.y * vec2(0.73, -0.51);
            float detail = terrainNoise(moistureUV * 3.1 + vec2(7.9, 4.2));
            float moisture = 0.74 * terrainNoise(moistureUV * 0.83) + 0.26 * detail;
            bool wetWall = geometricNormalW.y < 0.01;
            float wallReach = mix(0.18, 0.43, detail);
            float foot = wetWall ? 1.0 - smoothstep(0.025, wallReach, abs(vPositionW.y - vDirtEdges.y))
                : terraceFootMoisture(detail);
            float wetPatches = smoothstep(0.41, 0.94, moisture + 0.19 * foot);
            mudWetness = wetDirt * wetPatches;
            surfaceAlbedo *= 1.0 - mudWetness * 0.22;
            // Standing moisture smooths the ground more than the vertical wall.
            normalW = normalize(mix(normalW, geometricNormalW, mudWetness * (wetWall ? 0.16 : 0.72)));
        }
    `)
    material.Fragment_Custom_MetallicRoughness('metallicRoughness.g = mix(metallicRoughness.g, 0.53, mudWetness);')
}

export function configureSnowmelt(material: PBRCustomMaterial, wallsOnly = false) {
    material.Fragment_Definitions(`${material.CustomParts.Fragment_Definitions}
        float snowmeltWetness;
    `)
    material.Fragment_Before_Lights(`${material.CustomParts.Fragment_Before_Lights}
        snowmeltWetness = 0.0;
        float exposedGround = ${wallsOnly ? '1.0 - grassWeight - snowWeight' : '1.0 - grassWeight'};
        if (${wallsOnly ? 'wall && snowWeight > 0.0 && ' : ''}exposedGround > 0.0) {
            vec2 p = vPositionW.xz + vPositionW.y * vec2(0.61, -0.47);
            float pooling = terrainNoise(p * 2.1 + vec2(3.7, 14.2));
            ${wallsOnly ? `float snowDistance = snowFringe.y >= 0.0 ? snowFringe.y / topFringeDepth : -snowFringe.y;
            float runoff = smoothstep(0.0, 0.24, snowWeight)
                * (1.0 - smoothstep(0.13, 0.54, snowDistance / ${SNOWMELT_DISTANCE_SCALE}));` : `
            float runoff;
            if (wall) {
                float contact = max(grassAtEdges.x, grassAtEdges.y);
                runoff = contact * (1.0 - smoothstep(0.13, 0.54, grassEdgeDistance / ${SNOWMELT_DISTANCE_SCALE}));
            } else {
                runoff = 1.0 - smoothstep(0.31 * ${SNOWMELT_DISTANCE_SCALE},
                    mix(1.55 * ${SNOWMELT_DISTANCE_SCALE}, ${SNOWMELT_MAX_DISTANCE}, pooling), max(0.0, -coverDistance));
            }`}
            snowmeltWetness = runoff * mix(0.63, 1.0, pooling) * 1.25;
            float exposedWetness = snowmeltWetness * exposedGround;
            surfaceAlbedo *= 1.0 - 0.21 * exposedWetness;
            normalW = normalize(mix(normalW, geometricNormalW, 0.20 * exposedWetness));
            ${wallsOnly ? 'snowmeltWetness *= (1.0 - grassWeight);' : ''}
        }
    `)
    material.Fragment_Custom_MetallicRoughness(`${material.CustomParts.Fragment_Custom_MetallicRoughness ?? ''}
        metallicRoughness.g = clamp(mix(metallicRoughness.g, 0.44, snowmeltWetness), 0.0, 1.0);
    `)
}

export function configureSnowGlints(material: PBRCustomMaterial, transition: 'standard' | 'grass' | undefined,
    renderPavingSnow: boolean, varyRoughness: boolean) {
    if (renderPavingSnow) {
        if (!transition) material.AddAttribute(PAVING_SNOW_ATTRIBUTE)
        material.Vertex_Definitions(`${material.CustomParts.Vertex_Definitions ?? ''}
            ${transition ? '' : 'attribute vec3 terrainPavingSnow;'}
            varying vec3 vPavingSnow;
        `)
        material.Vertex_After_WorldPosComputed(`${material.CustomParts.Vertex_After_WorldPosComputed ?? ''}
            ${transition ? `vPavingSnow = vec3(vTerrainTile.xy, floor(terrainSurface.w / ${PAVING_SNOW_FLAG_SHIFT}.0));` : `
            vec2 pavingCenter = (world * vec4(terrainPavingSnow.x, 0.0, terrainPavingSnow.y, 1.0)).xz;
            vPavingSnow = vec3(worldPos.xz - pavingCenter + 0.5, terrainPavingSnow.z);`}
        `)
    }
    material.Fragment_Definitions(`${material.CustomParts.Fragment_Definitions ?? ''}
        ${!transition && (renderPavingSnow || varyRoughness) ? terrainNoiseShader : ''}
        ${renderPavingSnow ? 'varying vec3 vPavingSnow;' : ''}
        float snowGlintCoverage;
        ${varyRoughness ? 'float snowGlintRoughness;' : ''}
    `)
    const coverage = transition === 'grass' ? 'wall ? snowWeight : grassWeight' : transition ? 'grassWeight' : '1.0'
    material.Fragment_Before_Lights(`${material.CustomParts.Fragment_Before_Lights ?? ''}
        snowGlintCoverage = ${coverage};
        ${renderPavingSnow ? `
        float pavingSnowFlags = floor(vPavingSnow.z + 0.5);
        if (${transition ? '!wall && ' : ''}pavingSnowFlags >= 16.0 && snowGlintCoverage > 0.0) {
            vec2 p = vPositionW.xz;
            float chunks = terrainNoise(p * 5.8 + vec2(4.9, 13.5));
            float grains = terrainNoise(p * 27.0 - vec2(1.7, 5.4));
            vec4 open = mod(floor(pavingSnowFlags / vec4(1.0, 2.0, 4.0, 8.0)), 2.0);
            vec2 uv = clamp(vPavingSnow.xy, 0.0, 1.0);
            vec4 distances = mix(vec4(1.0), vec4(uv.x, 1.0 - uv.x, uv.y, 1.0 - uv.y), open);
            float edgeDistance = min(min(distances.x, distances.y), min(distances.z, distances.w));
            // Also leave snow untouched around the inside corners of bends in the path.
            vec4 corners = mod(floor(pavingSnowFlags / vec4(32.0, 64.0, 128.0, 256.0)), 2.0);
            vec4 cornerX = vec4(uv.x, 1.0 - uv.x, uv.x, 1.0 - uv.x);
            vec4 cornerZ = vec4(uv.y, uv.y, 1.0 - uv.y, 1.0 - uv.y);
            vec4 cornerSquared = mix(vec4(1.0), cornerX * cornerX + cornerZ * cornerZ, corners);
            float distanceSquared = min(edgeDistance * edgeDistance,
                min(min(cornerSquared.x, cornerSquared.y), min(cornerSquared.z, cornerSquared.w)));
            float interior = smoothstep(0.42, mix(0.50, 0.61, chunks), sqrt(distanceSquared));
            float dirt = smoothstep(0.20, 0.80, chunks * 0.68 + grains * 0.32);
            float tracked = interior * snowGlintCoverage;
            surfaceAlbedo *= mix(vec3(1.0), vec3(0.46, 0.35, 0.25), tracked * mix(0.34, 0.70, dirt));
            snowGlintCoverage *= 1.0 - tracked * mix(0.70, 0.95, dirt);
        }
        ` : ''}
        ${varyRoughness ? `if (snowGlintCoverage > 0.0) {
            vec2 p = vPositionW.xz + vPositionW.y * vec2(0.61, -0.47);
            float variation = terrainNoise(p * 1.25 + vec2(13.2, 7.1));
            snowGlintRoughness = mix(0.64, 0.38, variation);
        }` : ''}
    `)
    if (varyRoughness) material.Fragment_Custom_MetallicRoughness(`${material.CustomParts.Fragment_Custom_MetallicRoughness ?? ''}
        if (snowGlintCoverage > 0.0) {
            // The existing bumped normal shapes the highlight on the slopes of each depression.
            metallicRoughness.g = mix(metallicRoughness.g, snowGlintRoughness, snowGlintCoverage);
        }
    `)
}
