import { Texture } from '@babylonjs/core'
import type { Mesh } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { terrainContactMossShader, terrainContactSnowShader, terrainFringeShader, terrainNoiseShader } from '@/babylon/world/terrainSurfaceShader'
import snowColorUrl from '@/adminUtils/assets/snow-atlas.png'

const ATTRIBUTE = 'staticSnowContact'
export const SNOW_CONTACT_MAX_HEIGHT = 0.24
const DAMP_CONTACT = {moss: 1, plain: 2, hay: 3} as const
export type DampContact = keyof typeof DAMP_CONTACT

export class StaticTerrainContact {
    private readonly contacts = new Map<number, {height: number, snowReach: number, damp: number}>()
    private readonly snow: Texture
    private buffer = new Float32Array(0)

    constructor(material: PBRCustomMaterial, scatterOnTop = false) {
        this.snow = new Texture(snowColorUrl, material.getScene())
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
        material.AddUniform('staticSnowColor', 'sampler2D', this.snow)
        material.AddAttribute(ATTRIBUTE)
        material.Vertex_Definitions(`
            ${material.CustomParts.Vertex_Definitions}
            ${contactCode(`attribute vec3 ${ATTRIBUTE};`)}
            varying vec3 vStaticSnowContact;
        `)
        material.Vertex_After_WorldPosComputed(`
            ${material.CustomParts.Vertex_After_WorldPosComputed ?? ''}
            ${contactCode(
                'vStaticSnowContact = vec3(worldPos.y - staticSnowContact.x, staticSnowContact.yz);',
                'vStaticSnowContact = vec3(0.0);',
            )}
        `)
        material.Fragment_Definitions(`
            ${material.CustomParts.Fragment_Definitions}
            varying vec3 vStaticSnowContact;
            ${terrainNoiseShader}
            ${terrainFringeShader}
            ${terrainContactSnowShader}
            ${terrainContactMossShader}
        `)
        material.Fragment_Before_Lights(`
            ${material.CustomParts.Fragment_Before_Lights ?? ''}
            float snowDistance = vStaticSnowContact.x;
            float snowReach = abs(vStaticSnowContact.y);
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
                if (snowCoverage > 0.0) {
                    vec2 snowUV = terrainContactSnowUV(vPositionW.xz, aboveSnow);
                    surfaceAlbedo = mix(surfaceAlbedo, toLinearSpace(texture2D(staticSnowColor, snowUV).rgb), snowCoverage);
                    // A negative reach lets the snow at the base catch light like the ground.
                    const float groundLightHeight = 0.22;
                    if (vStaticSnowContact.y < 0.0 && contactCoverage > 0.0 && aboveSnow < groundLightHeight) {
                        float groundBlend = 0.9 * contactCoverage * (1.0 - smoothstep(0.02, groundLightHeight, aboveSnow))
                            * smoothstep(-0.8, -0.05, geometricNormalW.y);
                        normalW = normalize(mix(normalW, vec3(0.0, 1.0, 0.0), groundBlend));
                    }
                }
            }
            if (vStaticSnowContact.z > 0.0 && snowDistance < 0.48) {
                float aboveGround = max(snowDistance, 0.0);
                vec2 woodXZ = mod(vPositionW.xz, 48.0);
                float edge = terrainNoise(woodXZ * 6.0 + vec2(4.1, 9.7));
                float grain = terrainNoise(woodXZ * 23.0 + vec2(7.2, aboveGround * 19.0));
                bool withMoss = vStaticSnowContact.z < 1.5;
                bool dampHay = vStaticSnowContact.z > 2.5;
                float height = (withMoss ? mix(0.19, 0.34, edge) : mix(0.18, 0.36, edge)) + (grain - 0.5) * 0.08;
                if (dampHay) height += 0.08;
                float damp = 1.0 - smoothstep(height * 0.20, height, aboveGround);
                float dampStrength = withMoss ? mix(0.32, 0.50, grain) : mix(0.08, 0.34, grain);
                if (dampHay) dampStrength = mix(0.48, 0.74, grain);
                surfaceAlbedo *= 1.0 - damp * dampStrength;
                if (withMoss) {
                    float moss = (1.0 - smoothstep(height * 0.10, height * 0.65, aboveGround)) * mix(0.10, 0.34, grain);
                    surfaceAlbedo = mix(surfaceAlbedo, terrainContactMossColor(grain), moss);
                }
            }
        `)
    }

    clear() {
        this.contacts.clear()
    }

    addSnow(index: number, height: number, reach: number, blendGroundLighting = false) {
        this.contacts.set(index, {height, snowReach: blendGroundLighting ? -reach : reach, damp: 0})
    }

    addDamp(index: number, height: number, damp: DampContact) {
        this.contacts.set(index, {height, snowReach: 0, damp: DAMP_CONTACT[damp]})
    }

    setMeshSnow(mesh: Mesh, height: number | undefined, reach: number, blendGroundLighting = false) {
        const data = new Float32Array(mesh.getTotalVertices() * 3)
        if (height !== undefined) {
            const signedReach = blendGroundLighting ? -reach : reach
            for (let i = 0; i < data.length; i += 3) {
                data[i] = height
                data[i + 1] = signedReach
            }
        }
        mesh.setVerticesData(ATTRIBUTE, data, false, 3)
    }

    upload(mesh: Mesh, count: number) {
        if (!count) return
        const grow = count * 3 > this.buffer.length
        if (grow) this.buffer = new Float32Array(Math.max(48, count * 3, this.buffer.length * 2))
        else this.buffer.fill(0, 0, count * 3)
        for (const [index, {height, snowReach, damp}] of this.contacts) {
            this.buffer[index * 3] = height
            this.buffer[index * 3 + 1] = snowReach
            this.buffer[index * 3 + 2] = damp
        }
        if (grow) mesh.thinInstanceSetBuffer(ATTRIBUTE, this.buffer, 3, false)
        else mesh.thinInstanceBufferUpdated(ATTRIBUTE)
    }
}
