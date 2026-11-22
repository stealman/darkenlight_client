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
    material.Vertex_Definitions(`
        attribute vec2 uvc;
        attribute float terrainSurface;
        varying vec2 vSurfacePatchUV;
        varying vec2 vPlacedSurfaceUV;
        varying vec3 vPlacedSurfaceAxis;
    `)
    material.Vertex_After_WorldPosComputed(`
        vec2 tileCenter = finalWorld[3].xz;
        vSurfacePatchUV = mod(floor(tileCenter + 0.5), ${PATCH_SIZE.toFixed(1)})
            + worldPos.xz - tileCenter + 0.5;
        vPlacedSurfaceUV = uvc + positionUpdated.xz + 0.5;
        vPlacedSurfaceAxis = vec3(finalWorld[0].xz, terrainSurface);
    `)
    material.Fragment_Definitions(`
        varying vec2 vSurfacePatchUV;
        varying vec2 vPlacedSurfaceUV;
        varying vec3 vPlacedSurfaceAxis;

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

        float transitionGrassWeight(vec2 p) {
            float line = ${BOUNDARY_AMPLITUDE.toFixed(1)} * sin(p.y * ${BOUNDARY_FREQUENCY});
            float towardGrass = (p.x - line) * transitionBoundary.y;
            float clumps = transitionNoise(p * vec2(1.35, 1.95));
            float shape = sin(p.y * 1.45 + 0.4) * 0.58 + sin(p.y * 3.1) * 0.24 + (clumps - 0.5) * 1.65;
            // Compress only the longest excursions, leaving the small contours and grain intact.
            shape -= sign(shape) * max(abs(shape) - 0.65, 0.0) * 0.32;
            float grain = (transitionNoise(p * 6.8) - 0.5) * 0.58;
            float halfWidth = mix(0.26, 0.68, clumps);
            float grass = smoothstep(-halfWidth, halfWidth, towardGrass + shape + grain);

            // Evaluate the nearest neighboring section so islands can cross section edges.
            float sectionPosition = p.y / islandSpacing;
            float section = floor(sectionPosition);
            float neighbor = section + (fract(sectionPosition) < 0.5 ? -1.0 : 1.0);
            // Islands stay on their own side, so each pixel only needs one set of candidates.
            bool dirtIsland = towardGrass > 0.0;
            float inward = abs(towardGrass);
            float islands = max(
                transitionIsland(section, p.y, inward, grain, dirtIsland),
                transitionIsland(neighbor, p.y, inward, grain, dirtIsland)
            );
            return dirtIsland ? min(grass, 1.0 - islands) : max(grass, islands);
        }
    `)
    material.Fragment_Before_Lights(`
        float grassWeight = transitionGrassWeight(vPositionW.xz + vec2(0.0, transitionBoundary.x));
        float placedGrass = vPlacedSurfaceAxis.z;
        vec2 grassUV = mix(grassOrigin + vSurfacePatchUV * grassScale, vPlacedSurfaceUV * grassScale, placedGrass);
        vec2 dirtUV = mix(vPlacedSurfaceUV * dirtScale, dirtOrigin + vSurfacePatchUV * dirtScale, placedGrass);
        surfaceAlbedo = mix(
            toLinearSpace(texture2D(dirtColor, dirtUV).rgb),
            toLinearSpace(texture2D(grassColor, grassUV).rgb),
            grassWeight
        );
        vec3 grassBump = texture2D(grassNormal, grassUV).xyz * 2.0 - 1.0;
        vec3 dirtBump = texture2D(dirtNormal, dirtUV).xyz * 2.0 - 1.0;
        vec2 axis = vPlacedSurfaceAxis.xy;
        mat2 placedRotation = mat2(axis, vec2(-axis.y, axis.x));
        grassBump.xy = mix(grassBump.xy, placedRotation * grassBump.xy, placedGrass);
        dirtBump.xy = mix(placedRotation * dirtBump.xy, dirtBump.xy, placedGrass);
        grassBump = normalize(vec3(grassBump.xy * grassStrength, grassBump.z));
        dirtBump = normalize(vec3(dirtBump.xy * dirtStrength, dirtBump.z));
        vec3 blendedBump = mix(dirtBump, grassBump, grassWeight);
        // Match Babylon's cotangent frame on the preview plane: -X, -Z, +Y.
        normalW = normalize(vec3(-blendedBump.x, blendedBump.z, -blendedBump.y));
    `)
    return material
}
