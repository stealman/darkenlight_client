import { Vector2 } from '@babylonjs/core'
import type { Texture } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'

const PATCH_SIZE = 3
const BOUNDARY_AMPLITUDE = 2
const BOUNDARY_FREQUENCY = 0.32
export const TERRAIN_TRANSITION_REACH = 4

export function terrainBoundaryOffset(z: number) {
    return BOUNDARY_AMPLITUDE * Math.sin(z * BOUNDARY_FREQUENCY)
}

export function createTerrainTransitionMaterial(
    name: string,
    grass: PBRCustomMaterial,
    dirt: PBRCustomMaterial,
    grassOrigin: readonly number[],
    dirtOrigin: readonly number[],
    boundary: Vector2,
) {
    const material = new PBRCustomMaterial(name, grass.getScene())
    material.metallic = grass.metallic
    material.roughness = grass.roughness
    material.twoSidedLighting = grass.twoSidedLighting
    material.directIntensity = grass.directIntensity
    material.environmentIntensity = grass.environmentIntensity
    material.usePhysicalLightFalloff = grass.usePhysicalLightFalloff
    const addSurface = (name: string, surface: PBRCustomMaterial, [left, top]: readonly number[]) => {
        const color = surface.albedoTexture as Texture
        const normal = surface.bumpTexture!
        material.AddUniform(name + 'Color', 'sampler2D', color)
        material.AddUniform(name + 'Normal', 'sampler2D', normal)
        material.AddUniform(name + 'Origin', 'vec2', new Vector2(
            left * color.uScale, 1 - (top + PATCH_SIZE) * color.vScale,
        ))
        material.AddUniform(name + 'Scale', 'float', color.uScale)
        material.AddUniform(name + 'Strength', 'float', normal.level)
    }
    addSurface('grass', grass, grassOrigin)
    addSurface('dirt', dirt, dirtOrigin)
    // X is the preview's center in map coordinates. Y is the direction from dirt to grass.
    material.AddUniform('transitionBoundary', 'vec2', boundary)

    material.AddAttribute('uvc')
    material.AddAttribute('terrainSurface')
    material.AddAttribute('terrainWallContact')
    material.Vertex_Definitions(`
        attribute vec2 uvc;
        attribute vec4 terrainSurface;
        attribute vec4 terrainWallContact;
        varying vec2 vSurfacePatchUV;
        varying vec2 vPlacedSurfaceUV;
        varying vec4 vPlacedSurface;
        varying vec4 vWallContact;
    `)
    material.Vertex_After_WorldPosComputed(`
        vec2 tileCenter = (world * vec4(terrainSurface.x, 0.0, terrainSurface.y, 1.0)).xz;
        vec2 tileUV = worldPos.xz - tileCenter + 0.5;
        vSurfacePatchUV = mod(floor(tileCenter + 0.5), ${PATCH_SIZE.toFixed(1)}) + tileUV;
        vPlacedSurfaceUV = terrainAtlasUV(positionUpdated);
        vec2 axis = (world * vec4(cos(terrainSurface.z), 0.0, sin(terrainSurface.z), 0.0)).xz;
        float corners = floor(terrainSurface.w * 0.5);
        vec4 open = mod(floor(corners / vec4(1.0, 2.0, 4.0, 8.0)), 2.0);
        vec2 withinTile = clamp(tileUV, 0.0, 1.0);
        float islandSupport = mix(mix(open.x, open.y, withinTile.x), mix(open.z, open.w, withinTile.x), withinTile.y);
        vPlacedSurface = vec4(axis, mod(terrainSurface.w, 2.0), islandSupport);
        vWallContact = terrainWallContact;
    `)
    material.Fragment_Definitions(`
        varying vec2 vSurfacePatchUV;
        varying vec2 vPlacedSurfaceUV;
        varying vec4 vPlacedSurface;
        varying vec4 vWallContact;

        float transitionHash(vec2 p) {
            vec3 h = fract(vec3(p.xyx) * 0.1031);
            h += dot(h, h.yzx + 33.33);
            return fract((h.x + h.y) * h.z);
        }

        float transitionNoise(vec2 p) {
            vec2 cell = floor(p);
            vec2 f = fract(p);
            vec2 t = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(transitionHash(cell), transitionHash(cell + vec2(1.0, 0.0)), t.x),
                mix(transitionHash(cell + vec2(0.0, 1.0)), transitionHash(cell + 1.0), t.x),
                t.y
            );
        }

        const float islandSpacing = 1.28;

        float transitionIsland(float section, float z, float inward, float grain, bool dirtIsland) {
            float seedSection = section + (dirtIsland ? 37.0 : 0.0);
            float seed = transitionHash(vec2(seedSection, 17.0));
            float depth = transitionHash(vec2(seedSection, 29.0));
            float centerZ = (section + transitionHash(vec2(seedSection, 43.0))) * islandSpacing;
            float along = z - centerZ;
            float across = mix(0.83, 1.97, depth) - inward;
            if (dirtIsland) {
                float size = transitionHash(vec2(seedSection, 61.0));
                float shape = transitionHash(vec2(seedSection, 73.0));
                float radius = mix(0.16, 0.43, size);
                vec2 local = vec2(across + along * (shape - 0.5), along);
                float core = length(local * vec2(mix(0.80, 1.24, shape), 1.16)) - radius;
                vec2 offset = vec2((depth - 0.5) * 1.8, shape < 0.5 ? -0.55 : 0.55) * radius;
                float lobe = length((local - offset) * vec2(1.08, 1.48)) - radius * mix(0.40, 0.70, shape);
                // Round the join between the overlapping shapes while retaining a soft material edge.
                float join = max(0.12 - abs(core - lobe), 0.0) / 0.12;
                float contour = min(core, lobe) - 0.03 * join * join - grain * 0.35;
                float coverage = 1.0 - smoothstep(-radius * 0.62, 0.11, contour);
                return coverage * mix(0.68, 1.0, depth) * step(0.43, seed);
            }
            float distanceFromCenter = length(vec2(across + along * (seed - 0.5), along * mix(0.83, 1.22, seed)));
            float radius = mix(0.17, 0.29, seed);
            float edge = 1.0 - smoothstep(radius * 0.24, radius + 0.11, distanceFromCenter - grain * 0.22);
            return edge * mix(0.68, 1.0, depth) * step(0.19, seed);
        }

        float transitionGrassWeight(vec2 p, float grassIslandSupport) {
            float line = ${BOUNDARY_AMPLITUDE.toFixed(1)} * sin(p.y * ${BOUNDARY_FREQUENCY});
            float towardGrass = (p.x - line) * transitionBoundary.y;
            float clumps = transitionNoise(p * vec2(1.35, 1.95));
            float shape = sin(p.y * 1.45 + 0.4) * 0.58 + sin(p.y * 3.1) * 0.24 + (clumps - 0.5) * 1.65;
            // Compress only the longest excursions, leaving the small contours and grain intact.
            shape -= sign(shape) * max(abs(shape) - 0.65, 0.0) * 0.32;
            float grain = (transitionNoise(p * 6.8) - 0.5) * 0.58;
            float halfWidth = mix(0.26, 0.68, clumps);
            float grass = smoothstep(-halfWidth, halfWidth, towardGrass + shape + grain);
            // The continuous boundary and dirt islands are independent of the height-step mask.
            bool dirtIsland = towardGrass > 0.0;
            if (!dirtIsland && grassIslandSupport <= 0.0) return grass;

            // Evaluate the nearest neighboring section so islands can cross section edges.
            float sectionPosition = p.y / islandSpacing;
            float section = floor(sectionPosition);
            float neighbor = section + (fract(sectionPosition) < 0.5 ? -1.0 : 1.0);
            // Islands stay on their own side, so each pixel only needs one set of candidates.
            float inward = abs(towardGrass);
            float islands = max(
                transitionIsland(section, p.y, inward, grain, dirtIsland),
                transitionIsland(neighbor, p.y, inward, grain, dirtIsland)
            );
            return dirtIsland ? min(grass, 1.0 - islands) : max(grass, islands * grassIslandSupport);
        }

        float wallGrassCoverage(vec2 terrainXZ, float fromEdge, float edgeHeight, float maxReach) {
            // Anchor the fringe to the world so it crosses wall joins.
            vec2 noisePosition = terrainXZ + vec2(edgeHeight * 1.17, -edgeHeight * 0.79);
            float clusters = transitionNoise(noisePosition * 2.55);
            float lobes = transitionNoise(noisePosition * 8.2 + vec2(4.7, 9.3));
            float shape = smoothstep(0.17, 0.86, clusters) * 0.78 + lobes * 0.22;
            float reach = mix(0.09, maxReach, shape);
            float grain = transitionNoise(noisePosition * 19.0 + vec2(fromEdge * 11.0, -fromEdge * 13.0)) - 0.5;
            float edge = fromEdge + grain * 0.10;
            float feather = mix(0.085, 0.15, lobes);
            float thickness = mix(0.68, 1.0, smoothstep(0.18, 0.62, clusters));
            return thickness * (1.0 - smoothstep(max(0.015, reach - feather), reach + feather, edge));
        }

        const float topFringeDepth = 0.62;

        vec2 wallGrassFringe(vec3 position, vec2 terrainXZ) {
            vec2 fromEdge = max(vec2(vWallContact.x - position.y, position.y - vWallContact.y), vec2(0.0));
            // Keep the grass connected at the lip while shortening how far it hangs down.
            float topDistance = fromEdge.x / topFringeDepth;
            bool byTop = vWallContact.z > 0.5 && topDistance < 0.70;
            bool byBottom = vWallContact.w > 0.5 && fromEdge.y < 0.58;
            if (!byTop && !byBottom) return vec2(0.0);
            float horizontalGrass = ((byTop && vWallContact.z > 1.5) || (byBottom && vWallContact.w > 1.5))
                ? transitionGrassWeight(terrainXZ, 0.0) : 0.0;
            vec2 grassAtContact = mix(vWallContact.zw, vec2(horizontalGrass), step(1.5, vWallContact.zw));
            vec2 fringe = vec2(
                byTop ? grassAtContact.x * wallGrassCoverage(terrainXZ, topDistance, vWallContact.x, 0.50) : 0.0,
                byBottom ? grassAtContact.y * wallGrassCoverage(terrainXZ + vec2(3.31, 2.17), fromEdge.y, vWallContact.y, 0.38) : 0.0
            );
            return vec2(max(fringe.x, fringe.y), fringe.x >= fringe.y ? fromEdge.x : -fromEdge.y);
        }

        vec3 wallBumpNormal(vec3 normal, vec3 position, vec2 uv, vec3 bump) {
            vec3 dpX = dFdx(position), dpY = dFdy(position);
            vec2 duvX = dFdx(uv), duvY = dFdy(uv);
            vec3 dpYperp = cross(dpY, normal), dpXperp = cross(normal, dpX);
            vec3 tangent = dpYperp * duvX.x + dpXperp * duvY.x;
            vec3 bitangent = dpYperp * duvX.y + dpXperp * duvY.y;
            float scale = inversesqrt(max(max(dot(tangent, tangent), dot(bitangent, bitangent)), 1e-12));
            return normalize(normal * bump.z + (tangent * bump.x + bitangent * bump.y) * scale);
        }
    `)
    material.Fragment_Before_Lights(`
        vec2 terrainXZ = vPositionW.xz + vec2(0.0, transitionBoundary.x);
        bool wall = max(vWallContact.z, vWallContact.w) > 0.5;
        float placedGrass = vPlacedSurface.z;
        vec2 grassUV = mix(grassOrigin + vSurfacePatchUV * grassScale, vPlacedSurfaceUV * grassScale, placedGrass);
        vec2 dirtUV = mix(vPlacedSurfaceUV * dirtScale, dirtOrigin + vSurfacePatchUV * dirtScale, placedGrass);
        float grassWeight;
        float grassEdgeDistance = 0.0;
        if (wall) {
            vec2 fringe = wallGrassFringe(vPositionW, terrainXZ);
            grassWeight = fringe.x;
            grassEdgeDistance = fringe.y >= 0.0 ? fringe.y / topFringeDepth : -fringe.y;
            vec2 grassPatch = vSurfacePatchUV + geometricNormalW.xz * fringe.y;
            // Mirror at the borders of the atlas patch so steep fringes keep their texture detail.
            grassPatch = ${PATCH_SIZE.toFixed(1)} - abs(mod(grassPatch, ${(2 * PATCH_SIZE).toFixed(1)}) - ${PATCH_SIZE.toFixed(1)});
            grassUV = grassOrigin + clamp(grassPatch, 0.004, ${(PATCH_SIZE - .004).toFixed(3)}) * grassScale;
        } else {
            float grassIslandSupport = smoothstep(0.2, 0.85, vPlacedSurface.w);
            grassWeight = transitionGrassWeight(terrainXZ, grassIslandSupport);
        }
        surfaceAlbedo = mix(
            toLinearSpace(texture2D(dirtColor, dirtUV).rgb),
            toLinearSpace(texture2D(grassColor, grassUV).rgb),
            grassWeight
        );
        vec3 grassBump = texture2D(grassNormal, grassUV).xyz * 2.0 - 1.0;
        vec3 dirtBump = texture2D(dirtNormal, dirtUV).xyz * 2.0 - 1.0;
        vec2 axis = vPlacedSurface.xy;
        mat2 placedRotation = mat2(axis, vec2(-axis.y, axis.x));
        grassBump.xy = mix(grassBump.xy, placedRotation * grassBump.xy, placedGrass);
        dirtBump.xy = mix(placedRotation * dirtBump.xy, dirtBump.xy, placedGrass);
        grassBump = normalize(vec3(grassBump.xy * grassStrength, grassBump.z));
        dirtBump = normalize(vec3(dirtBump.xy * dirtStrength, dirtBump.z));
        vec3 blendedBump = mix(dirtBump, grassBump, grassWeight);
        if (wall) {
            vec2 uv = gl_FrontFacing ? vPlacedSurfaceUV : -vPlacedSurfaceUV;
            vec3 wallNormal = wallBumpNormal(geometricNormalW, vPositionW, uv, blendedBump);
            // Grass near each contact catches light like the terrace it grows from.
            vec3 terraceNormal = vec3(-grassBump.x, grassBump.z, -grassBump.y);
            float wrapLighting = 0.84 * grassWeight * (1.0 - smoothstep(0.025, 0.26, grassEdgeDistance));
            normalW = normalize(mix(wallNormal, terraceNormal, wrapLighting));
        } else {
            // Project the planar UV axes onto the roof, including its sloped bevels.
            vec3 roofNormal = geometricNormalW;
            vec3 tangentX = vec3(1.0, 0.0, 0.0) - roofNormal * roofNormal.x;
            vec3 tangentZ = vec3(0.0, 0.0, 1.0) - roofNormal * roofNormal.z;
            float tangentScale = inversesqrt(max(dot(tangentX, tangentX), dot(tangentZ, tangentZ)));
            // Match Babylon's cotangent-frame signs for the horizontal projection.
            normalW = normalize(roofNormal * blendedBump.z
                - (tangentX * blendedBump.x + tangentZ * blendedBump.y) * tangentScale);
        }
    `)
    return material
}
