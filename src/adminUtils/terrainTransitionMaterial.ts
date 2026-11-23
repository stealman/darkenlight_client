import { Vector2, Vector3 } from '@babylonjs/core'
import type { Texture } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { terrainNoiseShader } from './terrainPreviewBatch'
import { terrainCoverPatterns } from './terrainAtlasPreview'
import { POND_DISTANCE_RANGE } from './terrainPreviewWater'
import type { createTerrainPreviewWater } from './terrainPreviewWater'

const PATCH_SIZE = 3
const BOUNDARY_AMPLITUDE = 2
const BOUNDARY_FREQUENCY = 0.32
export const TERRAIN_TRANSITION_REACH = 4
export const POND_BANK_FLAG = 32

export function terrainBoundaryOffset(z: number) {
    return BOUNDARY_AMPLITUDE * Math.sin(z * BOUNDARY_FREQUENCY)
}

export function createTerrainTransitionMaterial(
    name: string,
    grass: PBRCustomMaterial,
    dirt: PBRCustomMaterial,
    grassOrigin: readonly number[],
    dirtOrigin: readonly number[],
    boundary: Vector3,
    wallDirt?: PBRCustomMaterial,
    rockSubstrate = false,
    pondBank?: Pick<ReturnType<typeof createTerrainPreviewWater>, 'field' | 'bounds'> & {coverOnBank: boolean},
    soilRockWalls = false,
    snowWallRock?: PBRCustomMaterial,
) {
    const material = new PBRCustomMaterial(name, grass.getScene())
    material.metallic = grass.metallic
    material.roughness = grass.roughness
    material.twoSidedLighting = grass.twoSidedLighting
    material.directIntensity = grass.directIntensity
    material.environmentIntensity = grass.environmentIntensity
    material.usePhysicalLightFalloff = grass.usePhysicalLightFalloff
    const addSurface = (name: string, surface: PBRCustomMaterial, origin?: readonly number[]) => {
        const color = surface.albedoTexture as Texture
        const normal = surface.bumpTexture!
        material.AddUniform(name + 'Color', 'sampler2D', color)
        material.AddUniform(name + 'Normal', 'sampler2D', normal)
        if (origin) material.AddUniform(name + 'Origin', 'vec2', new Vector2(
            origin[0] * color.uScale, 1 - (origin[1] + PATCH_SIZE) * color.vScale,
        ))
        material.AddUniform(name + 'Scale', 'float', color.uScale)
        material.AddUniform(name + 'Strength', 'float', normal.level)
    }
    addSurface('grass', grass, grassOrigin)
    addSurface('dirt', dirt, dirtOrigin)
    // In the snow/grass pair, the horizontal substrate supplies the grass on muddy walls.
    if (wallDirt) addSurface('wallDirt', wallDirt)
    if (snowWallRock) addSurface('snowWallRock', snowWallRock, terrainCoverPatterns[0].origins[0])
    // X is the map center, Y is the demo boundary direction, Z enables map-derived distances.
    material.AddUniform('transitionBoundary', 'vec3', boundary)
    if (pondBank) {
        material.AddUniform('pondBankDistance', 'sampler2D', pondBank.field)
        material.AddUniform('pondBankBounds', 'vec4', pondBank.bounds)
    }

    material.AddAttribute('uvc')
    material.AddAttribute('terrainSurface')
    material.AddAttribute('terrainWallContact')
    material.AddAttribute('terrainBoundaryCorners')
    material.Vertex_Definitions(`
        attribute vec2 uvc;
        attribute vec4 terrainSurface;
        attribute vec4 terrainWallContact;
        attribute vec4 terrainBoundaryCorners;
        varying vec4 vTerrainBoundaryCorners;
        varying vec2 vTerrainTileUV;
        varying vec2 vSurfacePatchUV;
        varying vec2 vPlacedSurfaceUV;
        varying vec4 vPlacedSurface;
        varying vec4 vWallContact;
    `)
    material.Vertex_After_WorldPosComputed(`
        vec2 tileCenter = (world * vec4(terrainSurface.x, 0.0, terrainSurface.y, 1.0)).xz;
        vec2 tileUV = worldPos.xz - tileCenter + 0.5;
        vTerrainTileUV = tileUV;
        vTerrainBoundaryCorners = terrainBoundaryCorners;
        vSurfacePatchUV = mod(floor(tileCenter + 0.5), ${PATCH_SIZE.toFixed(1)}) + tileUV;
        vPlacedSurfaceUV = terrainAtlasUV(positionUpdated);
        vec2 axis = (world * vec4(cos(terrainSurface.z), 0.0, sin(terrainSurface.z), 0.0)).xz;
        float corners = floor(terrainSurface.w * 0.5);
        vec4 open = mod(floor(corners / vec4(1.0, 2.0, 4.0, 8.0)), 2.0);
        vec2 withinTile = clamp(tileUV, 0.0, 1.0);
        float islandSupport = mix(mix(open.x, open.y, withinTile.x), mix(open.z, open.w, withinTile.x), withinTile.y);
        vPlacedSurface = vec4(axis, mod(terrainSurface.w, 2.0)${pondBank ? ` + 2.0 * floor(terrainSurface.w / ${POND_BANK_FLAG}.0)` : ''}, islandSupport);
        vWallContact = terrainWallContact;
    `)
    material.Fragment_Definitions(`
        varying vec2 vSurfacePatchUV;
        varying vec2 vPlacedSurfaceUV;
        varying vec4 vPlacedSurface;
        varying vec4 vWallContact;
        varying vec4 vTerrainBoundaryCorners;
        varying vec2 vTerrainTileUV;

        ${terrainNoiseShader}

        const float islandSpacing = 1.28;

        float transitionIsland(float section, float z, float inward, float grain, bool dirtIsland) {
            float seedSection = section + (dirtIsland ? 37.0 : 0.0);
            float seed = terrainHash(vec2(seedSection, 17.0));
            float depth = terrainHash(vec2(seedSection, 29.0));
            float centerZ = (section + terrainHash(vec2(seedSection, 43.0))) * islandSpacing;
            float along = z - centerZ;
            float across = mix(0.83, 1.97, depth) - inward;
            if (dirtIsland) {
                float size = terrainHash(vec2(seedSection, 61.0));
                float shape = terrainHash(vec2(seedSection, 73.0));
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

        float transitionGrassWeight(vec2 p, float grassIslandSupport, bool bank, out float coverDistance) {
            float line = ${BOUNDARY_AMPLITUDE.toFixed(1)} * sin(p.y * ${BOUNDARY_FREQUENCY});
            float towardGrass = (p.x - line) * transitionBoundary.y;
            if (transitionBoundary.z > 0.5) {
                vec2 uv = clamp(vTerrainTileUV, 0.0, 1.0);
                towardGrass = mix(mix(vTerrainBoundaryCorners.x, vTerrainBoundaryCorners.y, uv.x),
                    mix(vTerrainBoundaryCorners.z, vTerrainBoundaryCorners.w, uv.x), uv.y);
            }
            ${pondBank ? `if (bank) {
                vec2 bankUV = (p + vec2(transitionBoundary.x, 0.0) - pondBankBounds.xy) / pondBankBounds.zw;
                float bankDistance = (texture2D(pondBankDistance, bankUV).g - 0.5) * ${POND_DISTANCE_RANGE * 2}.0;
                // Fit the shared blend within the one-tile bank so the water still meets bare soil.
                towardGrass = bankDistance * ${pondBank.coverOnBank ? '2.35' : '-2.35'};
            }` : ''}
            float clumps = terrainNoise(p * vec2(1.35, 1.95));
            float shape = sin(p.y * 1.45 + 0.4) * 0.58 + sin(p.y * 3.1) * 0.24 + (clumps - 0.5) * 1.65;
            // Compress only the longest excursions, leaving the small contours and grain intact.
            shape -= sign(shape) * max(abs(shape) - 0.65, 0.0) * 0.32;
            float grain = (terrainNoise(p * 6.8) - 0.5) * 0.58;
            float halfWidth = mix(0.26, 0.68, clumps);
            coverDistance = towardGrass + ${rockSubstrate ? 'shape * 0.64 + grain * 0.78' : 'shape + grain'};
            float grass = smoothstep(-halfWidth, halfWidth, coverDistance);
            ${rockSubstrate ? 'return grass;' : `
            if (bank) return grass;
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
            return dirtIsland ? min(grass, 1.0 - islands) : max(grass, islands * grassIslandSupport);`}
        }

        float wallGrassCoverage(vec2 terrainXZ, float fromEdge, float edgeHeight, float maxReach) {
            // Anchor the fringe to the world so it crosses wall joins.
            vec2 noisePosition = terrainXZ + vec2(edgeHeight * 1.17, -edgeHeight * 0.79);
            float clusters = terrainNoise(noisePosition * 2.55);
            float lobes = terrainNoise(noisePosition * 8.2 + vec2(4.7, 9.3));
            float shape = smoothstep(0.17, 0.86, clusters) * 0.78 + lobes * 0.22;
            float reach = mix(0.09, maxReach, shape);
            float grain = terrainNoise(noisePosition * 19.0 + vec2(fromEdge * 11.0, -fromEdge * 13.0)) - 0.5;
            float edge = fromEdge + grain * 0.10;
            float feather = mix(0.085, 0.15, lobes);
            float thickness = mix(0.68, 1.0, smoothstep(0.18, 0.62, clusters));
            return thickness * (1.0 - smoothstep(max(0.015, reach - feather), reach + feather, edge));
        }

        const float topFringeDepth = 0.62;

        vec2 wallFringeSample(vec2 fringe, vec2 fromEdge) {
            return vec2(max(fringe.x, fringe.y), fringe.x >= fringe.y ? fromEdge.x : -fromEdge.y);
        }

        vec4 wallGrassFringe(vec3 position, vec2 terrainXZ${wallDirt ? ', out vec2 snowFringe' : ''}) {
            ${wallDirt ? 'snowFringe = vec2(0.0);' : ''}
            vec2 fromEdge = max(vec2(vWallContact.x - position.y, position.y - vWallContact.y), vec2(0.0));
            // Keep the grass connected at the lip while shortening how far it hangs down.
            float topDistance = fromEdge.x / topFringeDepth;
            bool byTop = vWallContact.z > 0.5 && topDistance < 0.70;
            bool byBottom = vWallContact.w > 0.5 && fromEdge.y < 0.58;
            if (!byTop && !byBottom) return vec4(0.0);
            vec2 modes = vWallContact.zw;
            vec2 mixedContact = step(1.5, modes) * (1.0 - step(2.5, modes));
            float coverDistance;
            float horizontalCover = ((byTop && mixedContact.x > 0.0) || (byBottom && mixedContact.y > 0.0))
                ? transitionGrassWeight(terrainXZ, 0.0, false, coverDistance) : 0.0;
            vec2 coverAtContact = step(0.5, modes) * (1.0 - step(1.5, modes)) + mixedContact * horizontalCover;
            vec2 fringe = vec2(
                byTop ? wallGrassCoverage(terrainXZ, topDistance, vWallContact.x, ${rockSubstrate ? '0.34' : '0.50'}) : 0.0,
                byBottom ? wallGrassCoverage(terrainXZ + vec2(3.31, 2.17), fromEdge.y, vWallContact.y, ${rockSubstrate ? '0.26' : '0.38'}) : 0.0
            );
            ${wallDirt ? `vec2 grassAtContact = step(2.5, modes) + mixedContact * (1.0 - horizontalCover);
            snowFringe = wallFringeSample(fringe * coverAtContact, fromEdge);` : 'vec2 grassAtContact = coverAtContact;'}
            vec2 contactCover = ${wallDirt ? 'grassAtContact + coverAtContact' : 'coverAtContact'};
            return vec4(wallFringeSample(fringe * grassAtContact, fromEdge),
                byTop ? contactCover.x : 0.0, byBottom ? contactCover.y : 0.0);
        }

        vec2 wallFringeUV(vec2 tilePatch, vec2 normalXZ, float offset) {
            vec2 uv = tilePatch + normalXZ * offset;
            // Mirror at the borders of the atlas patch so steep fringes retain texture detail.
            uv = ${PATCH_SIZE.toFixed(1)} - abs(mod(uv, ${(2 * PATCH_SIZE).toFixed(1)}) - ${PATCH_SIZE.toFixed(1)});
            return clamp(uv, 0.004, ${(PATCH_SIZE - .004).toFixed(3)});
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
        bool wall = ${snowWallRock ? 'true' : 'max(vWallContact.z, vWallContact.w) > 0.5'};
        // Recover the integer flags before decoding. Interpolation can put an encoded 2 just below 2.
        float placedGrass = ${pondBank ? 'mod(floor(vPlacedSurface.z + 0.5), 2.0)' : 'vPlacedSurface.z'};
        vec2 grassUV = mix(grassOrigin + vSurfacePatchUV * grassScale, vPlacedSurfaceUV * grassScale, placedGrass);
        vec2 dirtUV = mix(vPlacedSurfaceUV * dirtScale, dirtOrigin + vSurfacePatchUV * dirtScale, placedGrass);
        float grassWeight;
        float coverDistance;
        vec2 grassAtEdges = vec2(0.0);
        float grassEdgeDistance = 0.0;
        ${snowWallRock ? 'float wallRockWeight = 0.0; vec2 snowWallRockUV = vec2(0.0);' : ''}
        ${wallDirt ? 'vec2 snowFringe = vec2(0.0);' : ''}
        if (wall) {
            ${soilRockWalls ? `grassWeight = transitionGrassWeight(terrainXZ, 0.0, false, coverDistance);
            // Sample the original wall tile on its own side, projecting only the second material onto it.
            vec2 alongWall = vec2(-geometricNormalW.z, geometricNormalW.x);
            vec2 wallPatch = wallFringeUV(vec2(dot(vPositionW.xz, alongWall), vPositionW.y + 0.5), vec2(0.0), 0.0);
            grassUV = mix(grassOrigin + wallPatch * grassScale, vPlacedSurfaceUV * grassScale, placedGrass);
            dirtUV = mix(vPlacedSurfaceUV * dirtScale, dirtOrigin + wallPatch * dirtScale, placedGrass);` : `
            vec4 fringe = wallGrassFringe(vPositionW, terrainXZ${wallDirt ? ', snowFringe' : ''});
            grassWeight = fringe.x;
            grassAtEdges = fringe.zw;
            grassEdgeDistance = fringe.y >= 0.0 ? fringe.y / topFringeDepth : -fringe.y;
            vec2 grassPatch = wallFringeUV(vSurfacePatchUV, geometricNormalW.xz, fringe.y);
            grassUV = ${wallDirt ? 'dirtOrigin' : 'grassOrigin'}
                + grassPatch * ${wallDirt ? 'dirtScale' : 'grassScale'};
            ${snowWallRock ? `wallRockWeight = transitionGrassWeight(terrainXZ, 0.0, false, coverDistance);
            vec2 alongWall = vec2(-geometricNormalW.z, geometricNormalW.x);
            vec2 wallPatch = wallFringeUV(vec2(dot(vPositionW.xz, alongWall), vPositionW.y + 0.5), vec2(0.0), 0.0);
            // The placed bit identifies which of the two substrates owns the wall UV.
            dirtUV = mix(vPlacedSurfaceUV, dirtOrigin / dirtScale + wallPatch, placedGrass) * dirtScale;
            snowWallRockUV = mix(snowWallRockOrigin / snowWallRockScale + wallPatch, vPlacedSurfaceUV, placedGrass) * snowWallRockScale;` : ''}
            ${wallDirt ? 'dirtUV = vPlacedSurfaceUV * wallDirtScale;' : ''}`}
        } else {
            float grassIslandSupport = smoothstep(0.2, 0.85, vPlacedSurface.w);
            grassWeight = transitionGrassWeight(terrainXZ, grassIslandSupport, ${pondBank ? 'vPlacedSurface.z > 1.5' : 'false'}, coverDistance);
        }
        ${wallDirt ? 'float snowWeight = min(snowFringe.x, 1.0 - grassWeight);' : ''}
        vec2 dirtCoverage = 1.0 - max(vec2(grassWeight${wallDirt ? ' + snowWeight' : ''}), grassAtEdges);
        vec3 grassSample;
        vec3 dirtSample;
        vec3 grassBump;
        vec3 dirtBump;
        float grassRelief = grassStrength;
        float dirtRelief = dirtStrength;
        ${wallDirt ? `if (wall) {
            grassSample = texture2D(dirtColor, grassUV).rgb;
            dirtSample = texture2D(wallDirtColor, dirtUV).rgb;
            grassBump = texture2D(dirtNormal, grassUV).xyz;
            dirtBump = texture2D(wallDirtNormal, dirtUV).xyz;
            grassRelief = dirtStrength;
            dirtRelief = wallDirtStrength;
        } else` : ''} {
            grassSample = texture2D(grassColor, grassUV).rgb;
            dirtSample = texture2D(dirtColor, dirtUV).rgb;
            grassBump = texture2D(grassNormal, grassUV).xyz;
            dirtBump = texture2D(dirtNormal, dirtUV).xyz;
        }
        vec3 substrateAlbedo = toLinearSpace(dirtSample);
        ${snowWallRock ? 'substrateAlbedo = mix(substrateAlbedo, toLinearSpace(texture2D(snowWallRockColor, snowWallRockUV).rgb), wallRockWeight);' : ''}
        ${wallDirt ? `if (!wall) {
            // Carry the tint onto uncovered grass, and use coverage to catch isolated snow patches.
            float grassward = -coverDistance;
            float edgeTint = smoothstep(-0.25, 0.20, grassward) * (1.0 - smoothstep(0.32, 1.12, grassward));
            float patchTint = smoothstep(0.005, 0.15, grassWeight) * (1.0 - smoothstep(0.38, 0.82, grassWeight));
            substrateAlbedo *= mix(vec3(1.0), vec3(1.62, 1.21, 0.43), max(edgeTint, patchTint));
        }` : ''}
        surfaceAlbedo = mix(substrateAlbedo, toLinearSpace(grassSample), grassWeight);
        grassBump = grassBump * 2.0 - 1.0;
        dirtBump = dirtBump * 2.0 - 1.0;
        vec2 axis = vPlacedSurface.xy;
        mat2 placedRotation = mat2(axis, vec2(-axis.y, axis.x));
        grassBump.xy = mix(grassBump.xy, placedRotation * grassBump.xy, placedGrass);
        dirtBump.xy = mix(placedRotation * dirtBump.xy, dirtBump.xy, placedGrass);
        grassBump = normalize(vec3(grassBump.xy * grassRelief, grassBump.z));
        dirtBump = normalize(vec3(dirtBump.xy * dirtRelief, dirtBump.z));
        ${snowWallRock ? `vec3 rockBump = texture2D(snowWallRockNormal, snowWallRockUV).xyz * 2.0 - 1.0;
        rockBump = normalize(vec3(rockBump.xy * snowWallRockStrength, rockBump.z));
        dirtBump = mix(dirtBump, rockBump, wallRockWeight);` : ''}
        vec3 blendedBump = mix(dirtBump, grassBump, grassWeight);
        if (wall) {
            ${wallDirt ? `vec3 snowBump = vec3(0.0, 0.0, 1.0);
            if (snowWeight > 0.0) {
                vec2 snowUV = grassOrigin + wallFringeUV(vSurfacePatchUV, geometricNormalW.xz, snowFringe.y) * grassScale;
                vec3 snowColor = toLinearSpace(texture2D(grassColor, snowUV).rgb);
                surfaceAlbedo += (snowColor - substrateAlbedo) * snowWeight;
                snowBump = texture2D(grassNormal, snowUV).xyz * 2.0 - 1.0;
                snowBump = normalize(vec3(snowBump.xy * grassStrength, snowBump.z));
                blendedBump += (snowBump - dirtBump) * snowWeight;
            }` : ''}
            vec2 uv = gl_FrontFacing ? vPlacedSurfaceUV : -vPlacedSurfaceUV;
            vec3 wallNormal = wallBumpNormal(geometricNormalW, vPositionW, uv, blendedBump);
            ${soilRockWalls ? 'normalW = wallNormal;' : `
            // Grass near each contact catches light like the terrace it grows from.
            vec3 terraceNormal = vec3(-grassBump.x, grassBump.z, -grassBump.y);
            float wrapLighting = 0.84 * grassWeight * (1.0 - smoothstep(0.025, 0.26, grassEdgeDistance));
            ${wallDirt ? `float snowDistance = snowFringe.y >= 0.0 ? snowFringe.y / topFringeDepth : -snowFringe.y;
            float snowWrap = 0.84 * snowWeight * (1.0 - smoothstep(0.025, 0.26, snowDistance));
            vec3 snowTerraceNormal = vec3(-snowBump.x, snowBump.z, -snowBump.y);
            normalW = normalize(wallNormal * (1.0 - wrapLighting - snowWrap)
                + terraceNormal * wrapLighting + snowTerraceNormal * snowWrap);` : 'normalW = normalize(mix(wallNormal, terraceNormal, wrapLighting));'}`}
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
