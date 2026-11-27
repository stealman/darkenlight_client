import type { PBRCustomMaterial } from '@babylonjs/materials'
import type { Matrix, Vector2 } from '@babylonjs/core'
import { BLOCK_TOP_GLOW_U_OFFSET, MaterialEnum1 } from '@/babylon/materials'
import { Settings } from '@/settings/settings'
import { woodPatinaShader } from '../woodPatina'
import { WOOD_PATINA_ONLY, WOOD_WEATHERING_MOISTURE_LEVELS } from './staticTerrainContact'
import { WOOD_BEAM_JOIN_BASE, WOOD_BRACE_JOIN_POSITIVE, WOOD_JOIN_MIN, WOOD_JOIN_STEP,
    WOOD_POST_TOP_MOISTURE } from './palisadeWoodJoin'

const stone = [
    'ROCK1', 'ROCK1_BEIGE', 'TERRAIN_ROCK', 'BRICK_RED', 'BRICK_GRAY', 'BRICK_BLACK', 'BRICK_DARK_GRAY',
] as const
const wood = [
    'WOOD_1', 'WOOD_2', 'WOOD_3', 'WOOD_PLANKS', 'WOOD_PLANKS_DARK', 'WOOD_CUT',
] as const
const matchesAtlasCells = (cells: readonly (typeof stone[number] | typeof wood[number])[]) => cells
    .map(cell => MaterialEnum1[cell].uv)
    .map(uv => `distance(blockAtlasOffset, vec2(${uv.x}, ${uv.y})) < 0.01`).join(' || ')

export const ALL_STONE_EDGES = 0xfff

const EDGE_AXES = [[1, 2], [0, 2], [0, 1]] as const
const EDGE_SAMPLES = [-0.64, 0.64]
const JOIN_TOLERANCE = 0.001

// A whole-atlas offset on U carries the same stone color on the lit variants.
function isStoneCell(uv: Vector2) {
    return stone.some(key => {
        const cell = MaterialEnum1[key].uv
        return uv.x % BLOCK_TOP_GLOW_U_OFFSET === cell.x && uv.y === cell.y
    })
}

function cardinalStoneBox(matrix: Matrix, index: number) {
    const m = matrix.m
    const center = [m[12], m[13], m[14]]
    const axes: number[] = [], signs: number[] = [], halfSize: number[] = []
    for (let axis = 0; axis < 3; axis++) {
        const column = axis * 4
        const worldAxis = Math.abs(m[column]) >= Math.abs(m[column + 1]) && Math.abs(m[column]) >= Math.abs(m[column + 2])
            ? 0 : Math.abs(m[column + 1]) >= Math.abs(m[column + 2]) ? 1 : 2
        const scale = m[column + worldAxis]
        if (Math.abs(scale) < JOIN_TOLERANCE || axes.includes(worldAxis)
            || Math.abs(m[column + (worldAxis + 1) % 3]) > JOIN_TOLERANCE
            || Math.abs(m[column + (worldAxis + 2) % 3]) > JOIN_TOLERANCE) return
        axes.push(worldAxis)
        signs.push(Math.sign(scale))
        halfSize[worldAxis] = Math.abs(scale) / 2
    }
    return {index, center, axes, signs, halfSize}
}

type CardinalStoneBox = NonNullable<ReturnType<typeof cardinalStoneBox>>

function touchesOtherStone(boxes: CardinalStoneBox[], block: CardinalStoneBox, probe: number[]) {
    for (const other of boxes) {
        if (other === block) continue
        if (Math.abs(probe[0] - other.center[0]) <= other.halfSize[0] + JOIN_TOLERANCE
            && Math.abs(probe[1] - other.center[1]) <= other.halfSize[1] + JOIN_TOLERANCE
            && Math.abs(probe[2] - other.center[2]) <= other.halfSize[2] + JOIN_TOLERANCE) return true
    }
    return false
}

// Sample just beyond each face to find stone sharing the edge. Taking two samples
// allows adjoining pieces to cover a longer edge without hiding a corner-only contact.
export function markJoinedStoneEdges(matrices: Matrix[], uvs: Vector2[], start: number,
    mark: (index: number, mask: number) => void) {
    const boxes: CardinalStoneBox[] = []
    for (let index = start; index < matrices.length; index++) {
        if (!isStoneCell(uvs[index])) continue
        const box = cardinalStoneBox(matrices[index], index)
        if (box) boxes.push(box)
    }
    if (boxes.length < 2) return
    const probe = [0, 0, 0]
    for (const block of boxes) {
        let mask = 0
        for (let axis = 0; axis < 3; axis++) {
            const tangent = block.axes[axis]
            const [first, second] = EDGE_AXES[axis]
            const u = block.axes[first], v = block.axes[second]
            for (let su = 0; su < 2; su++) for (let sv = 0; sv < 2; sv++) {
                const signU = (su * 2 - 1) * block.signs[first], signV = (sv * 2 - 1) * block.signs[second]
                const edgeU = block.center[u] + signU * block.halfSize[u]
                const edgeV = block.center[v] + signV * block.halfSize[v]
                let covered = true
                for (const sample of EDGE_SAMPLES) {
                    probe[tangent] = block.center[tangent] + sample * block.halfSize[tangent]
                    probe[u] = edgeU + signU * JOIN_TOLERANCE * 3
                    probe[v] = edgeV
                    if (touchesOtherStone(boxes, block, probe)) continue
                    probe[u] = edgeU
                    probe[v] = edgeV + signV * JOIN_TOLERANCE * 3
                    if (!touchesOtherStone(boxes, block, probe)) {
                        covered = false
                        break
                    }
                }
                if (covered) mask |= 1 << (axis * 4 + su * 2 + sv)
            }
        }
        if (mask) mark(block.index, mask)
    }
}

// The wrapped block's local coordinates and world matrix describe its edges even after rotation and scaling.
// Install after StaticTerrainContact to share its noise functions and mask damage against its snow coverage.
export function configureStaticBlockDamage(material: PBRCustomMaterial) {
    const varyings = `
        varying vec4 vStaticDamageLocal;
        varying vec4 vStaticDamageSizeSeed;
    `
    const parts = material.CustomParts
    material.AddUniform('staticDamageHigh', 'float', undefined)
    material.onBindObservable.add(() => material.getEffect()?.setFloat('staticDamageHigh', Settings.isDetalLevelHigh() ? 1 : 0))
    material.Vertex_Definitions(`${parts.Vertex_Definitions ?? ''}${varyings}`)
    material.Vertex_After_WorldPosComputed(`
        ${parts.Vertex_After_WorldPosComputed ?? ''}
        float damageKind = 0.0;
        vStaticDamageSizeSeed = vec4(0.0);
        if (staticJoinedEdges < ${ALL_STONE_EDGES}.0) {
            damageKind = (${matchesAtlasCells(stone)}) ? 1.0 : (${matchesAtlasCells(wood)}) ? 2.0 : 0.0;
            if (damageKind > 0.0) {
                vec3 damageSize = vec3(length(world[0].xyz), length(world[1].xyz), length(world[2].xyz));
                float damageSeed = dot(world[3].xyz, vec3(0.735, 1.137, 0.491));
                vStaticDamageSizeSeed = vec4(damageSize, damageSeed);
            }
        }
        vStaticDamageLocal = vec4(position, damageKind + 4.0 * staticJoinedEdges);
    `)
    material.Fragment_Definitions(`
        ${parts.Fragment_Definitions ?? ''}
        ${varyings}
        ${woodPatinaShader}

        float staticStoneEdge(vec2 distanceToEdge, float lengthwise, float edgeLength, float maxWidth, float seed) {
            float fromEdge = distanceToEdge.x + distanceToEdge.y;
            if (fromEdge > maxWidth) return 0.0;
            // Both sides of the edge use the same distances, seed and along-edge coordinate.
            float bands = max(2.0, ceil(edgeLength * 4.0));
            float along = lengthwise * bands;
            vec2 cell = vec2(floor(along), seed);
            float random = terrainHash(cell);
            float center = mix(0.29, 0.71, terrainHash(cell + vec2(7.3, 11.2)));
            float span = mix(0.15, 0.46, random);
            float alongChip = abs(fract(along) - center) / span;
            float reach = maxWidth * mix(0.28, 0.98, terrainHash(cell + vec2(19.7, 4.6)));
            float broken = fromEdge / max(reach, 0.001) + alongChip * 0.84;
            float chip = (1.0 - smoothstep(0.53, 1.0, broken)) * step(0.18, random);
            if (staticDamageHigh > 0.5) {
                float splinter = abs(fract(along * 2.7 + random) - 0.5);
                float grain = terrainNoise(vec2(along * 4.2, seed + fromEdge * 35.0));
                float flake = (1.0 - smoothstep(0.52, 1.0, fromEdge / max(maxWidth * 0.43, 0.001)
                    + splinter * 2.1 + grain * 0.30)) * step(0.27, grain);
                chip = max(chip, flake * 0.68);
            }
            return chip;
        }

        bool staticEdgeOpen(float mask, float index) {
            return mod(floor(mask / exp2(index)), 2.0) < 0.5;
        }

        float staticStoneDamage(vec3 p, vec3 size, float seed, float joinedEdges) {
            vec3 edge = max(vec3(0.0), 0.5 - abs(p)) * size;
            vec3 side = step(vec3(0.0), p);
            vec3 width = min(vec3(0.19), vec3(min(size.y, size.z), min(size.x, size.z), min(size.x, size.y)) * 0.32);
            float x = staticEdgeOpen(joinedEdges, side.y * 2.0 + side.z)
                ? staticStoneEdge(edge.yz, p.x + 0.5, size.x, width.x, seed + side.y * 7.1 + side.z * 13.3) : 0.0;
            float y = staticEdgeOpen(joinedEdges, 4.0 + side.x * 2.0 + side.z)
                ? staticStoneEdge(edge.xz, p.y + 0.5, size.y, width.y, seed + 19.1 + side.x * 7.1 + side.z * 13.3) : 0.0;
            float z = staticEdgeOpen(joinedEdges, 8.0 + side.x * 2.0 + side.y)
                ? staticStoneEdge(edge.xy, p.z + 0.5, size.z, width.z, seed + 37.9 + side.x * 7.1 + side.y * 13.3) : 0.0;
            return max(x, max(y, z));
        }

        float staticWoodDamage(vec3 p, vec3 size, float seed) {
            float pick = terrainHash(vec2(seed, 31.7));
            if (pick > (staticDamageHigh > 0.5 ? 0.46 : 0.34)) return 0.0;

            bool alongY = size.y >= 0.95 * max(size.x, size.z);
            bool alongX = !alongY && size.x >= size.z;
            float along = (alongY ? p.y : alongX ? p.x : p.z) + 0.5;
            if (along < 0.001 || along > 0.999) return 0.0;
            float lengthwise = alongY ? size.y : alongX ? size.x : size.z;
            float end = terrainHash(vec2(seed, 49.3));
            float fromEnd = (end < 0.5 ? along : 1.0 - along) * lengthwise;
            float span = min(lengthwise * 0.34, mix(0.08, 0.21, end));
            if (fromEnd >= span) return 0.0;

            // Local corner coordinates keep the split near the same corner after a part is rotated.
            vec2 sides = alongY ? p.xz : alongX ? p.yz : p.xy;
            vec2 corner = step(vec2(0.5), vec2(terrainHash(vec2(seed, 9.8)), terrainHash(vec2(seed, 75.2)))) - 0.5;
            vec2 fromCorner = abs(corner - sides);
            if (min(fromCorner.x, fromCorner.y) > 0.001 || fromCorner.x + fromCorner.y > 0.24) return 0.0;
            float reach = fromEnd / span;
            float angle = terrainHash(vec2(seed, 14.1));
            float center = mix(0.025, 0.082, angle) + reach * mix(0.032, 0.102, angle);
            float width = mix(0.010, 0.032, 1.0 - reach);
            float split = 1.0 - smoothstep(width * 0.22, width, abs(fromCorner.x + fromCorner.y - center));
            return split * smoothstep(0.0, 0.10, reach) * (1.0 - smoothstep(0.62, 1.0, reach));
        }

        float palisadeLongEdgeDamage(vec3 p, vec3 size, float seed) {
            float along = (p.y + 0.5) * size.y;
            float fromEnd = min(along, size.y - along);
            vec2 sides = max(vec2(0.0), 0.5 - abs(p.xz)) * size.xz;
            float fromEdge = sides.x + sides.y;
            float edgeWidth = min(0.042, min(size.x, size.z) * 0.29);
            if (fromEnd <= 0.025 || fromEdge >= edgeWidth) return 0.0;

            // Use the same pattern on both faces that share each long edge.
            vec2 corner = step(vec2(0.0), p.xz);
            float band = along * 5.4;
            vec2 cell = vec2(floor(band), seed + dot(corner, vec2(19.1, 37.7)));
            float pick = terrainHash(cell);
            if (pick < 0.43) return 0.0;
            float center = mix(0.30, 0.70, terrainHash(cell + vec2(7.1, 3.7)));
            float inset = edgeWidth * mix(0.34, 1.0, terrainHash(cell + vec2(4.5, 15.3)));
            float across = fromEdge / inset;
            if (across >= 1.0) return 0.0;
            float notch = step(0.72, pick);
            float span = mix(0.30, 0.14, notch) * mix(0.63, 1.0, terrainHash(cell + vec2(9.2, 22.3)));
            float slant = mix(-0.13, 0.13, terrainHash(cell + vec2(3.5, 11.1)));
            float alongCut = abs(fract(band) - center + across * slant) / span;
            float cut = 1.0 - smoothstep(0.54, 1.0, across + alongCut);
            return cut * smoothstep(0.025, 0.075, fromEnd);
        }

        float palisadeTopDamage(vec3 p, vec3 size, float seed, bool brace) {
            vec2 faceUV = (brace ? p.yz : p.xz) + 0.5;
            float bands = brace ? max(2.0, ceil(size.y * 4.6)) : 1.0;
            vec2 bandUV = faceUV * vec2(bands, 1.0);
            vec2 cell = vec2(floor(min(bandUV.x, bands - 0.001)), seed + 73.5);
            float pick = terrainHash(cell);
            if (pick < 0.28) return 0.0;
            vec2 center = vec2(
                mix(0.33, 0.67, terrainHash(cell + vec2(8.3, 3.4))),
                mix(0.24, 0.76, terrainHash(cell + vec2(4.1, 11.5)))
            );
            vec2 d = vec2(bandUV.x - cell.x, faceUV.y) - center;
            float slant = mix(-0.68, 0.68, terrainHash(cell + vec2(5.4, 17.1)));
            float reach = mix(0.14, 0.32, pick);
            float width = mix(0.035, 0.105, 1.0 - pick);
            return 1.0 - smoothstep(0.58, 1.0, abs(d.x) / reach + abs(d.y + d.x * slant) / width);
        }

        float palisadeWoodNoise(vec3 p, vec3 size, float seed) {
            vec3 metres = p * size;
            vec2 at = metres.xz + metres.y * vec2(0.19, 0.13) + mod(seed, 31.0) * vec2(0.21, -0.37);
            return terrainNoise(at * 54.0) * 0.64 + terrainNoise(at * 122.0 + vec2(8.1, 5.7)) * 0.36 - 0.5;
        }
    `)
    material.Fragment_Before_Lights(`
        ${parts.Fragment_Before_Lights ?? ''}
        float damageFlags = floor(vStaticDamageLocal.w + 0.5);
        float damageKind = mod(damageFlags, 4.0);
        bool patinaOnly = woodWeathering >= ${WOOD_PATINA_ONLY}.0;
        bool brace = woodWeathering > ${WOOD_PATINA_ONLY}.0 && woodWeathering < ${WOOD_BEAM_JOIN_BASE}.0;
        if (staticDamageHigh > 0.5 && woodWeathering > 0.0) {
            float exposure = 1.0 - smoothstep(0.16, 0.70, staticSnowCover);
            vec3 local = vStaticDamageLocal.xyz;
            vec2 woodPosition = mod(vPositionW.xz, 48.0) + mod(vPositionW.y, 48.0) * vec2(0.68, -0.47);
            float lengthwise = local.y * vStaticDamageSizeSeed.y;
            vec2 patinaUV = vec2(lengthwise * 1.4, (local.x + local.z) * 0.36) + woodPosition * 0.48;
            if (patinaOnly) {
                surfaceAlbedo = applyWoodPatina(surfaceAlbedo, patinaUV, exposure);
                float join = 0.0;
                float mossRim = 0.0;
                bool wetPostTop = woodWeathering == ${WOOD_POST_TOP_MOISTURE}.0;
                if (wetPostTop) {
                    float fromTop = 0.5 - local.y;
                    join = 1.0 - smoothstep(0.01, 0.16, fromTop);
                    mossRim = join * (1.0 - smoothstep(0.00, 0.11, fromTop));
                } else if (woodWeathering > ${WOOD_BEAM_JOIN_BASE}.0) {
                    bool facesX = abs(geometricNormalW.x) > abs(geometricNormalW.z);
                    float face = facesX ? step(0.0, geometricNormalW.x) : 2.0 + step(0.0, geometricNormalW.z);
                    float height = mod(floor((woodWeathering - ${WOOD_BEAM_JOIN_BASE}.0) / exp2(4.0 * face)), 16.0);
                    if (height > 0.0) {
                        float aboveBrace = lengthwise - (${WOOD_JOIN_MIN} + (height - 1.0) * ${WOOD_JOIN_STEP});
                        join = smoothstep(-0.060, -0.020, aboveBrace) * (1.0 - smoothstep(0.025, 0.17, aboveBrace));
                        join *= 1.0 - smoothstep(0.72, 0.97, abs(geometricNormalW.y));
                        mossRim = join * (1.0 - smoothstep(0.015, 0.065, abs(aboveBrace)));
                    }
                } else if (brace) {
                    float innerSide = woodWeathering == ${WOOD_BRACE_JOIN_POSITIVE}.0 ? 1.0 : -1.0;
                    float fromInnerEdge = 0.5 - innerSide * local.z;
                    join = smoothstep(0.64, 0.85, geometricNormalW.y);
                    mossRim = join * mix(0.18, 1.0, 1.0 - smoothstep(0.08, 0.63, fromInnerEdge));
                }
                if (join > 0.0) {
                    float patches = terrainNoise(woodPosition * 11.0 + vec2(3.1, 6.8));
                    float grain = terrainNoise(woodPosition * 37.0 + vec2(9.6, 2.4));
                    float wetPatches = smoothstep(0.20, 0.74, patches * 0.8 + grain * 0.2);
                    float wet = join * exposure * (brace || wetPostTop ? mix(0.80, 0.98, wetPatches) : wetPatches * 0.66);
                    surfaceAlbedo *= 1.0 - wet * 0.36;
                    float moss = mossRim * exposure * smoothstep(0.50, 0.81, patches * 0.78 + grain * 0.22);
                    surfaceAlbedo = mix(surfaceAlbedo, terrainContactMossColor(grain) * 0.74, moss * (brace || wetPostTop ? 0.34 : 0.12));
                }
            } else {
                float moisture = mix(0.24, 1.0, mod(woodWeathering - 1.0, ${WOOD_WEATHERING_MOISTURE_LEVELS}.0)
                    / ${WOOD_WEATHERING_MOISTURE_LEVELS - 1}.0);
                float patches = terrainNoise(woodPosition * 10.0 + vec2(7.7, 3.1));
                float grain = terrainNoise(woodPosition * 37.0 + vec2(2.4, 8.2));
                float variation = patches * 0.77 + grain * 0.23;
                float rim;
                bool uprightWood = woodWeathering > ${WOOD_WEATHERING_MOISTURE_LEVELS}.0;
                if (uprightWood) {
                    float fromTop = 0.5 - local.y;
                    rim = 1.0 - smoothstep(0.0, mix(0.12, 0.33, patches), fromTop);
                } else {
                    // Local Y follows the grain into the ends, even on a broken or rotated rail.
                    vec3 edge = max(vec3(0.0), vec3(0.5) - abs(local));
                    float railEdge = min(max(edge.x, edge.z), edge.y * 1.55);
                    rim = 1.0 - smoothstep(0.015, mix(0.12, 0.37, patches), railEdge);
                }
                float wet = rim * smoothstep(0.22, 0.72, variation) * mix(0.32, 0.90, moisture) * exposure;
                surfaceAlbedo = applyWoodPatina(surfaceAlbedo, patinaUV, exposure * (1.0 - wet * 0.65));
                surfaceAlbedo *= mix(vec3(1.0), vec3(0.35, 0.42, 0.39), wet);
                staticGroundWetness = max(staticGroundWetness, wet * 0.86);
                float moss = rim * exposure * smoothstep(mix(0.54, 0.34, moisture),
                    mix(0.84, 0.65, moisture), variation) * mix(0.14, 0.64, moisture);
                moss *= uprightWood ? 1.0 - 0.48 * smoothstep(0.70, 0.95, geometricNormalW.y) : 0.65;
                vec3 mossColor = terrainContactMossColor(grain);
                float mossLuma = dot(mossColor, vec3(0.2126, 0.7152, 0.0722));
                mossColor = mix(vec3(mossLuma), mossColor, 0.62) * 0.74;
                surfaceAlbedo = mix(surfaceAlbedo, mossColor, moss);
            }
        }
        float damageCut = 0.0;
        float damageSink = 0.0;
        if (damageKind == 1.0) {
            damageCut = staticStoneDamage(vStaticDamageLocal.xyz, vStaticDamageSizeSeed.xyz, vStaticDamageSizeSeed.w,
                floor(damageFlags * 0.25));
            damageSink = damageCut * 0.026;
        } else if (damageKind == 2.0) {
            if (patinaOnly && staticDamageHigh > 0.5) {
                vec3 local = vStaticDamageLocal.xyz;
                vec3 size = vStaticDamageSizeSeed.xyz;
                float seed = vStaticDamageSizeSeed.w;
                bool top = (brace ? -local.x : local.y) >= 0.499;
                damageCut = palisadeLongEdgeDamage(local, size, seed);
                if (top) damageCut = max(damageCut, palisadeTopDamage(local, size, seed, brace));
                damageSink = damageCut * 0.013 + palisadeWoodNoise(local, size, seed) * (top ? 0.0031 : 0.0020);
            } else if (!patinaOnly) {
                damageCut = staticWoodDamage(vStaticDamageLocal.xyz, vStaticDamageSizeSeed.xyz, vStaticDamageSizeSeed.w);
                damageSink = damageCut * 0.0085;
            }
        }
        // Compute derivatives after the material branches reconverge.
        vec2 damageGradient = vec2(dFdx(damageSink), dFdy(damageSink));
        vec3 damageDx = dFdx(vPositionW), damageDy = dFdy(vPositionW);
        float damageExposure = 1.0 - smoothstep(0.0, 0.32, staticSnowCover);
        if (damageExposure > 0.0 && (damageCut > 0.0 || dot(abs(damageGradient), vec2(1.0)) > 0.00001)) {
            vec3 damageCrossX = cross(damageDy, geometricNormalW), damageCrossY = cross(geometricNormalW, damageDx);
            float damageDet = dot(damageDx, damageCrossX);
            vec3 damageSlope = sign(damageDet) * (damageGradient.x * damageCrossX + damageGradient.y * damageCrossY)
                / max(abs(damageDet), 1e-8);
            normalW = normalize(normalW + damageExposure * damageSlope / max(1.0, length(damageSlope) * 1.65));
            float damageShade = damageKind == 1.0 ? 0.36 : (patinaOnly ? 0.68 : 0.49);
            surfaceAlbedo *= 1.0 - damageExposure * damageCut * damageShade;
        }
    `)
}
