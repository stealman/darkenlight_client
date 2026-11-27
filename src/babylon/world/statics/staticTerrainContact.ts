import { Texture } from '@babylonjs/core'
import type { Mesh } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { configureTerrainNoiseTexture, terrainContactMossShader, terrainContactSnowShader, terrainFringeShader,
    terrainNoiseShader } from '@/babylon/world/terrainSurfaceShader'
import { terrainTextureUrls } from '@/babylon/world/terrainTextureUrls'

const ATTRIBUTE = 'staticSnowContact'
const ROOF_SNOW_PROFILE = -1
const JOINED_EDGE_STRIDE = 32
export const SNOW_CONTACT_MAX_HEIGHT = 0.24
export const GROUND_WEAR_MEDIUM_HEIGHT = 0.68
export const GROUND_WEAR_HIGH_HEIGHT = 1.0
export const WOOD_WEATHERING_MOISTURE_LEVELS = 4
export const WOOD_PATINA_ONLY = 2 * WOOD_WEATHERING_MOISTURE_LEVELS + 1
export type WoodMoisture = 0 | 1 | 2 | 3
const DAMP_CONTACT = {
    moss: 1, hay: 3, wellBase: 4, wellRim: 5, wellRoofMoss: 7, walkableEdges: 8, mossyWood: 9,
    woodTopWithMoss: 10, woodTopAndGroundMoss: 11, stumpCut: 12, groundWear: 14, groundWearHigh: 15,
    masonryGround: 16, masonrySnow: 17,
} as const
export type DampContact = keyof typeof DAMP_CONTACT

export class StaticTerrainContact {
    private readonly contacts = new Map<number, {
        height: number, snowReach: number, damp: number, joinedEdges?: number, woodWeathering?: number
    }>()
    private readonly snow: Texture
    private buffer = new Float32Array(0)

    constructor(material: PBRCustomMaterial, scatterOnTop = false) {
        this.snow = new Texture(terrainTextureUrls.snow, material.getScene())
        this.snow.wrapU = this.snow.wrapV = Texture.CLAMP_ADDRESSMODE
        material.onDisposeObservable.addOnce(() => this.snow.dispose())
        this.configureMaterial(material, false, scatterOnTop)
    }

    configureMaterial(material: PBRCustomMaterial, meshVertices = false, scatterOnTop = false) {
        const contactCode = (code: string, fallback = '') => meshVertices ? code : `
            #ifdef THIN_INSTANCES
                ${code}
            #else
                ${fallback}
            #endif
        `
        const blockPosition = meshVertices ? '' : 'varying vec3 vStaticBlockPosition;'
        material.AddUniform('staticSnowColor', 'sampler2D', this.snow)
        material.AddAttribute(ATTRIBUTE)
        material.Vertex_Definitions(`
            ${material.CustomParts.Vertex_Definitions ?? ''}
            ${contactCode(`attribute vec3 ${ATTRIBUTE};`)}
            varying vec3 vStaticSnowContact;
            ${blockPosition}
        `)
        material.Vertex_After_WorldPosComputed(`
            ${material.CustomParts.Vertex_After_WorldPosComputed ?? ''}
            float staticJoinedEdges = 0.0;
            ${contactCode(
                `// The roof profile is signed, so allow for -1 when unpacking the edge bits.
                staticJoinedEdges = max(0.0, floor((staticSnowContact.z + 1.0) / ${JOINED_EDGE_STRIDE}.0));
                vStaticSnowContact = vec3(worldPos.y - staticSnowContact.x, staticSnowContact.y,
                    staticSnowContact.z - staticJoinedEdges * ${JOINED_EDGE_STRIDE}.0);`,
                'vStaticSnowContact = vec3(0.0);',
            )}
            ${meshVertices ? '' : 'vStaticBlockPosition = positionUpdated;'}
        `)
        material.Fragment_Definitions(`
            ${material.CustomParts.Fragment_Definitions ?? ''}
            varying vec3 vStaticSnowContact;
            ${blockPosition}
            ${terrainNoiseShader}
            ${terrainFringeShader}
            ${terrainContactSnowShader}
            ${terrainContactMossShader}
            float staticGroundWetness;
        `)
        configureTerrainNoiseTexture(material, 4)
        material.Fragment_Before_Lights(`
            ${material.CustomParts.Fragment_Before_Lights ?? ''}
            float snowDistance = vStaticSnowContact.x;
            float snowReach = abs(vStaticSnowContact.y);
            float woodWeathering = max(0.0, -floor((vStaticSnowContact.z + 1.0) / ${JOINED_EDGE_STRIDE}.0));
            float dampContact = vStaticSnowContact.z + woodWeathering * ${JOINED_EDGE_STRIDE}.0;
            float dampProfile = floor(dampContact + 0.5);
            float staticSnowCover = 0.0;
            staticGroundWetness = 0.0;
            if (dampProfile == ${ROOF_SNOW_PROFILE}.0) {
                float belowLip = max(-snowDistance, 0.0);
                if (belowLip < 0.28 && geometricNormalW.y > -0.25) {
                    vec2 roofXZ = mod(vPositionW.xz, 48.0);
                    float top = smoothstep(0.35, 0.85, geometricNormalW.y);
                    // Use the terrain's fringe so the snow curls over the stone like it does on nearby cliffs.
                    float fringe = terrainFringeCoverage(roofXZ, belowLip * 2.0, vPositionW.y - snowDistance, 0.12, 0.44);
                    float cover = max(top, max(fringe, 1.0 - smoothstep(0.0, 0.065, belowLip)));
                    staticSnowCover = cover;
                    if (cover > 0.0) {
                        vec2 snowUV = terrainContactSnowUV(vPositionW.xz, belowLip);
                        vec3 snow = toLinearSpace(texture2D(staticSnowColor, snowUV).rgb);
                        vec2 grainUV = roofXZ * 16.0 + belowLip * vec2(9.2, 6.1);
                        float grain = terrainNoise(grainUV);
                        vec2 slope = vec2(terrainNoise(grainUV + vec2(0.28, 0.0)),
                            terrainNoise(grainUV + vec2(0.0, 0.28))) - grain;
                        vec3 rounded = normalize(geometricNormalW + vec3(slope.x * 0.23, 2.7, slope.y * 0.23));
                        surfaceAlbedo = mix(surfaceAlbedo, snow * mix(0.88, 0.96, grain), cover);
                        normalW = normalize(mix(normalW, rounded, cover));
                    }
                }
            }
            ${meshVertices ? '' : `
                if (dampProfile == ${DAMP_CONTACT.walkableEdges}.0) {
                    // Two adjacent face planes meet at each edge. The same distance and noise apply on both faces.
                    vec3 faceDistance = max(vec3(0.0), vec3(0.5) - abs(vStaticBlockPosition));
                    float edgeDistance = min(max(faceDistance.x, faceDistance.y),
                        min(max(faceDistance.x, faceDistance.z), max(faceDistance.y, faceDistance.z)));
                    if (edgeDistance < 0.24) {
                        vec2 surfacePosition = mod(vPositionW.xz, 48.0) + vec2(0.61, 0.83) * vStaticBlockPosition.y;
                        float patches = terrainNoise(surfacePosition * 5.5 + vec2(3.1, 11.7));
                        float grain = terrainNoise(surfacePosition * 26.0 + vec2(8.2, 2.6));
                        float reach = mix(0.07, 0.24, patches);
                        float wet = (1.0 - smoothstep(reach * 0.18, reach, edgeDistance))
                            * smoothstep(0.25, 0.67, patches * 0.82 + grain * 0.18);
                        surfaceAlbedo *= 1.0 - wet * mix(0.48, 0.73, grain);
                    }
                }
                bool woodTopMoss = dampProfile == ${DAMP_CONTACT.woodTopWithMoss}.0
                    || dampProfile == ${DAMP_CONTACT.woodTopAndGroundMoss}.0;
                bool stumpCut = dampProfile == ${DAMP_CONTACT.stumpCut}.0;
                if (woodTopMoss || stumpCut) {
                    float fromTop = max(0.0, 0.5 - vStaticBlockPosition.y);
                    if (fromTop < 0.44) {
                        vec2 woodPosition = mod(vPositionW.xz, 48.0);
                        float runoff = terrainNoise(woodPosition * 8.0 + vec2(6.7, 3.2));
                        float grain = terrainNoise(woodPosition * 31.0 + vec2(2.3, fromTop * 3.0));
                        float reach = mix(0.12, 0.44, runoff);
                        float wet = 1.0 - smoothstep(0.0, reach, fromTop);
                        if (stumpCut) {
                            vec2 localXZ = abs(vStaticBlockPosition.xz);
                            float fromEdge = 0.5 - max(localXZ.x, localXZ.y);
                            wet *= 1.0 - smoothstep(0.02, mix(0.07, 0.19, runoff), fromEdge);
                        }
                        surfaceAlbedo *= 1.0 - wet * mix(0.33, 0.66, runoff * 0.7 + grain * 0.3);

                        if (woodTopMoss && geometricNormalW.x < -0.55) {
                            float mossReach = mix(0.08, 0.34, runoff);
                            float moss = 1.0 - smoothstep(0.01, mossReach, fromTop);
                            moss *= smoothstep(0.29, 0.65, runoff * 0.76 + grain * 0.24);
                            surfaceAlbedo = mix(surfaceAlbedo, terrainContactMossColor(grain), moss * 0.78);
                        }
                    }
                }
            `}
            if (snowReach > 0.0) {
                float aboveSnow = max(snowDistance, 0.0);
                vec2 noiseXZ = mod(vPositionW.xz, 48.0) + vec2(3.31, 2.17);
                float contactCoverage = 0.0;
                if (snowDistance < ${SNOW_CONTACT_MAX_HEIGHT} * snowReach) {
                    float snowHeight = vPositionW.y - snowDistance;
                    float fringe = terrainFringeCoverage(noiseXZ, aboveSnow * 1.8 / snowReach, snowHeight, 0.07, 0.22);
                    float baseCoverage = 1.0 - smoothstep(0.0, 0.09 * min(snowReach, 1.0), aboveSnow);
                    contactCoverage = mix(fringe, 1.0, baseCoverage);
                }
                float snowCoverage = contactCoverage;
                ${scatterOnTop ? `
                    // A light dusting under larger snow patches keeps the top readable at gameplay zoom.
                    float upward = smoothstep(0.12, 0.62, geometricNormalW.y);
                    if (upward > 0.0) {
                        float patches = terrainNoise(noiseXZ * 15.0);
                        float grain = terrainNoise(noiseXZ * 48.0 + vec2(5.7, 9.1));
                        float dusting = smoothstep(0.36, 0.66, patches * 0.8 + grain * 0.2);
                        snowCoverage = max(snowCoverage, mix(0.30, 0.96, dusting) * upward);
                    }
                ` : ''}
                // Keep cracks out of the snow and soften them just beyond its feathered edge.
                float snowHeightReach = ${SNOW_CONTACT_MAX_HEIGHT} * snowReach;
                staticSnowCover = max(snowCoverage,
                    1.0 - smoothstep(snowHeightReach * 0.42, snowHeightReach + 0.035, aboveSnow));
                if (snowCoverage > 0.0) {
                    vec2 snowUV = terrainContactSnowUV(vPositionW.xz, aboveSnow);
                    vec3 snowTexel = texture2D(staticSnowColor, snowUV).rgb;
                    vec3 snowColor = toLinearSpace(snowTexel);
                    const float groundLightHeight = 0.22;
                    if (dampProfile == ${DAMP_CONTACT.masonrySnow}.0) {
                        // Match the snow under the wall's terrain contact shadow, then fade up the bank.
                        snowColor = masonrySnowAlbedo(snowTexel)
                            * (1.0 - 0.36 * (1.0 - smoothstep(0.02, groundLightHeight, aboveSnow)));
                    }
                    surfaceAlbedo = mix(surfaceAlbedo, snowColor, snowCoverage);
                    // A negative reach lets the snow at the base catch light like the ground.
                    if (vStaticSnowContact.y < 0.0 && contactCoverage > 0.0 && aboveSnow < groundLightHeight) {
                        float groundBlend = 0.9 * contactCoverage * (1.0 - smoothstep(0.02, groundLightHeight, aboveSnow))
                            * smoothstep(-0.8, -0.05, geometricNormalW.y);
                        normalW = normalize(mix(normalW, vec3(0.0, 1.0, 0.0), groundBlend));
                    }
                }
            }
            bool wellBase = dampProfile == ${DAMP_CONTACT.wellBase}.0;
            bool wellRim = dampProfile == ${DAMP_CONTACT.wellRim}.0;
            bool mossyWood = dampProfile == ${DAMP_CONTACT.mossyWood}.0;
            bool withMoss = dampProfile == ${DAMP_CONTACT.moss}.0 || dampProfile == ${DAMP_CONTACT.woodTopAndGroundMoss}.0;
            bool dampHay = dampProfile == ${DAMP_CONTACT.hay}.0;
            if ((mossyWood || wellBase || withMoss || dampHay)
                && snowDistance < (mossyWood ? 0.80 : wellBase ? 0.64 : 0.48)) {
                float aboveGround = max(snowDistance, 0.0);
                vec2 woodXZ = mod(vPositionW.xz, 48.0);
                float edge = terrainNoise(woodXZ * 6.0 + vec2(4.1, 9.7));
                float grain = terrainNoise(woodXZ * 23.0 + vec2(7.2, aboveGround * 19.0));
                float height = (withMoss ? mix(0.19, 0.34, edge) : mix(0.18, 0.36, edge)) + (grain - 0.5) * 0.08;
                if (dampHay) height += 0.08;
                if (wellBase) height = mix(0.36, 0.60, edge) + (grain - 0.5) * 0.08;
                if (mossyWood) height *= 2.0;
                float damp = 1.0 - smoothstep(height * 0.20, height, aboveGround);
                float dampStrength = withMoss ? mix(0.32, 0.50, grain) : mix(0.08, 0.34, grain);
                if (dampHay) dampStrength = mix(0.48, 0.74, grain);
                if (wellBase) dampStrength = mix(0.48, 0.66, grain);
                if (mossyWood) dampStrength += 0.10;
                surfaceAlbedo *= 1.0 - damp * dampStrength;
                if (withMoss) {
                    float moss = (1.0 - smoothstep(height * 0.10, height * 0.65, aboveGround)) * mix(0.10, 0.34, grain);
                    surfaceAlbedo = mix(surfaceAlbedo, terrainContactMossColor(grain), moss);
                }
            }
            float baseMossReach = mossyWood ? 0.27 : 0.23;
            if (wellRim || ((wellBase || mossyWood) && snowDistance < baseMossReach)) {
                vec2 mossPosition = mod(vPositionW.xz, 48.0) + vec2(0.73, 0.89) * snowDistance;
                float patches = terrainNoise(mossPosition * 8.0 + vec2(5.1, 13.7));
                float grain = terrainNoise(mossPosition * 42.0 + vec2(9.3, 2.7));
                float coverage = smoothstep(mossyWood ? 0.36 : 0.52, mossyWood ? 0.65 : 0.75,
                    patches * 0.76 + grain * 0.24);
                float exposure = wellRim ? mix(0.65, 1.0, max(geometricNormalW.y, 0.0))
                    : 1.0 - smoothstep(mossyWood ? 0.07 : 0.03, baseMossReach, snowDistance);
                surfaceAlbedo = mix(surfaceAlbedo, terrainContactMossColor(grain),
                    coverage * exposure * (mossyWood ? 0.78 : 0.52));
            }
            const float roofDampMaxHeight = 0.35;
            if (dampProfile == ${DAMP_CONTACT.wellRoofMoss}.0 && snowDistance < roofDampMaxHeight) {
                float aboveEave = max(snowDistance, 0.0);
                vec2 roofPosition = mod(vPositionW.xz, 48.0);
                float patches = terrainNoise(roofPosition * vec2(1.8, 7.0) + vec2(8.4, 2.1));
                float grain = terrainNoise(roofPosition * 41.0 + vec2(2.9, 6.7));
                float wetShape = smoothstep(0.16, 0.84, patches * 0.88 + grain * 0.12);
                float reach = mix(0.215, roofDampMaxHeight, wetShape);
                float wet = 1.0 - smoothstep(0.0, reach, aboveEave);
                surfaceAlbedo *= mix(vec3(1.0), vec3(0.08, 0.13, 0.16), wet * mix(0.92, 1.0, grain));

                float mossReach = mix(0.08, 0.19, patches);
                float mossEdge = 1.0 - smoothstep(mossReach * 0.18, mossReach, aboveEave);
                float mossFacing = 1.0 - 0.22 * smoothstep(-0.25, 0.65, geometricNormalW.y);
                float mossPatches = smoothstep(0.26, 0.58, patches * 0.78 + grain * 0.22);
                float moss = mossEdge * mossFacing * mossPatches;
                vec3 mossColor = terrainContactMossColor(grain) * vec3(0.73, 0.96, 0.70);
                surfaceAlbedo = mix(surfaceAlbedo, mossColor, moss * 0.84);
            }
            bool masonryGround = dampProfile == ${DAMP_CONTACT.masonryGround}.0;
            if (dampProfile == ${DAMP_CONTACT.groundWear}.0 || dampProfile == ${DAMP_CONTACT.groundWearHigh}.0 || masonryGround) {
                float aboveGround = max(snowDistance, 0.0);
                float wear = (dampContact - dampProfile) * 4.0;
                bool high = dampProfile == ${DAMP_CONTACT.groundWearHigh}.0 || masonryGround;
                if (aboveGround < (high ? ${GROUND_WEAR_HIGH_HEIGHT.toFixed(1)} : ${GROUND_WEAR_MEDIUM_HEIGHT})) {
                    vec2 base = mod(vPositionW.xz, 48.0);
                    vec2 p = base + aboveGround * vec2(0.67, -0.51);
                    float patches = terrainNoise(p * 5.8 + vec2(3.7, 5.2));
                    // Broad wet spots carry up from the soil, with broken edges and drier gaps.
                    float pockets = terrainNoise((base + aboveGround * vec2(0.18, -0.12)) * 4.6 + vec2(8.2, 2.6));
                    float blotches = smoothstep(0.25, 0.72, pockets * 0.74 + patches * 0.26);
                    float reach = mix(0.16, high ? 0.86 : ${GROUND_WEAR_MEDIUM_HEIGHT}, blotches)
                        * mix(0.68, 1.0, min(wear, 1.0));
                    float wetEdge = 1.0 - smoothstep(reach * 0.30, reach, aboveGround);
                    staticGroundWetness = min(0.9, wetEdge * mix(0.26, 1.0, blotches) * wear * 1.3);
                    surfaceAlbedo *= mix(vec3(1.0), vec3(0.32, 0.36, 0.38), staticGroundWetness);

                    if (masonryGround) {
                        if (aboveGround < 0.40) {
                            // The broad patches follow the foot of the wall and fade quickly above the first course.
                            vec2 growthUV = base + aboveGround * vec2(0.34, -0.28);
                            float clusters = terrainNoise(growthUV * 2.9 + vec2(3.2, 8.5));
                            float grain = terrainNoise(growthUV * 32.0 + vec2(2.7, 6.4));
                            float mossReach = mix(0.15, 0.40, clusters) * min(wear + 0.35, 1.0);
                            float moss = (1.0 - smoothstep(0.02, mossReach, aboveGround))
                                * smoothstep(0.19, 0.66, clusters * 0.83 + grain * 0.17) * wear;
                            surfaceAlbedo = mix(surfaceAlbedo, terrainContactMossColor(grain), min(0.82, moss));

                            float sites = terrainNoise(growthUV * 4.6 + vec2(15.2, 5.4));
                            if (sites > 0.57) {
                                float lobes = terrainNoise(growthUV * 18.0 + vec2(9.3, 2.6));
                                float lichen = smoothstep(0.57, 0.76, sites)
                                    * smoothstep(0.43, 0.72, lobes * 0.79 + grain * 0.21)
                                    * (1.0 - smoothstep(0.08, 0.32, aboveGround)) * min(wear, 1.0);
                                surfaceAlbedo = mix(surfaceAlbedo, terrainContactLichenColor(grain),
                                    lichen * (1.0 - 0.55 * min(moss, 1.0)) * 0.64);
                            }
                        }
                    } else {
                        float mossReach = mix(0.18, 0.48, patches) * min(wear + 0.25, 1.0);
                        float moss = (1.0 - smoothstep(0.025, mossReach, aboveGround))
                            * wear * smoothstep(0.32, 0.70, patches) * 0.78;
                        float grain = patches;
                        if (high) {
                            grain = terrainNoise(p * 36.0 + vec2(7.3, 1.2));
                            float climb = max(0.15, mix(0.34, 0.95, patches) * min(wear + 0.25, 1.0));
                            float shelter = mix(0.42, 1.0, smoothstep(-0.25, 0.72, -geometricNormalW.x));
                            float colonies = smoothstep(0.46, 0.78, patches * 0.78 + grain * 0.22);
                            moss = max(moss, colonies * (1.0 - smoothstep(0.12, climb, aboveGround)) * shelter * wear);
                        }
                        surfaceAlbedo = mix(surfaceAlbedo, terrainContactMossColor(grain), min(0.86, moss));
                    }
                }
            }
        `)
        material.Fragment_Custom_MetallicRoughness(`
            ${material.CustomParts.Fragment_Custom_MetallicRoughness ?? ''}
            metallicRoughness.g = mix(metallicRoughness.g, metallicRoughness.g * 0.56, staticGroundWetness);
        `)
    }

    clear() {
        this.contacts.clear()
    }

    addSnow(index: number, height: number, reach: number, blendGroundLighting = false, damp?: DampContact) {
        this.contacts.set(index, {height, snowReach: blendGroundLighting ? -reach : reach, damp: damp ? DAMP_CONTACT[damp] : 0})
    }

    addRoofSnow(index: number, height: number) {
        this.contacts.set(index, {height, snowReach: 0, damp: ROOF_SNOW_PROFILE})
    }

    addDamp(index: number, height: number, damp: DampContact, wear = 0) {
        // The integer selects the profile; the fraction carries wear without another instance attribute.
        this.contacts.set(index, {height, snowReach: 0, damp: DAMP_CONTACT[damp] + wear * 0.25})
    }

    addWoodWeathering(index: number, moisture: WoodMoisture | 'patina', upright = false, join?: number) {
        const contact = this.contacts.get(index) ?? {height: 0, snowReach: 0, damp: 0}
        contact.woodWeathering = moisture === 'patina' ? (join ?? WOOD_PATINA_ONLY)
            : 1 + moisture + (upright ? WOOD_WEATHERING_MOISTURE_LEVELS : 0)
        this.contacts.set(index, contact)
    }

    markJoinedEdges(index: number, joinedEdges: number) {
        const contact = this.contacts.get(index)
        if (contact) contact.joinedEdges = joinedEdges
        else this.contacts.set(index, {height: 0, snowReach: 0, damp: 0, joinedEdges})
    }

    setMeshContact(mesh: Mesh, height: number | undefined, reach = 0, blendGroundLighting = false, damp?: DampContact) {
        const data = new Float32Array(mesh.getTotalVertices() * 3)
        if (height !== undefined) {
            const signedReach = blendGroundLighting ? -reach : reach
            const dampProfile = damp ? DAMP_CONTACT[damp] : 0
            for (let i = 0; i < data.length; i += 3) {
                data[i] = height
                data[i + 1] = signedReach
                data[i + 2] = dampProfile
            }
        }
        mesh.setVerticesData(ATTRIBUTE, data, false, 3)
    }

    upload(mesh: Mesh, count: number) {
        if (!count) return
        const grow = count * 3 > this.buffer.length
        if (grow) this.buffer = new Float32Array(Math.max(48, count * 3, this.buffer.length * 2))
        else this.buffer.fill(0, 0, count * 3)
        for (const [index, {height, snowReach, damp, joinedEdges, woodWeathering}] of this.contacts) {
            this.buffer[index * 3] = height
            this.buffer[index * 3 + 1] = snowReach
            // Negative groups carry wood weathering, positive groups carry joined stone edges.
            this.buffer[index * 3 + 2] = damp + (woodWeathering ? -woodWeathering : (joinedEdges ?? 0)) * JOINED_EDGE_STRIDE
        }
        if (grow) mesh.thinInstanceSetBuffer(ATTRIBUTE, this.buffer, 3, false)
        else mesh.thinInstanceBufferUpdated(ATTRIBUTE)
    }
}
