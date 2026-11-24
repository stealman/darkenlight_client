import { Texture } from '@babylonjs/core'
import type { Mesh } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { terrainContactSnowShader, terrainFringeShader, terrainNoiseShader } from '@/babylon/world/terrainSurfaceShader'
import snowColorUrl from '@/adminUtils/assets/snow-atlas.png'

const ATTRIBUTE = 'staticSnowContact'
export const SNOW_CONTACT_MAX_HEIGHT = 0.24

export class StaticTerrainContact {
    private readonly snowContacts = new Map<number, {height: number, reach: number}>()
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
            ${contactCode(`attribute vec2 ${ATTRIBUTE};`)}
            varying vec2 vStaticSnowContact;
        `)
        material.Vertex_After_WorldPosComputed(`
            ${material.CustomParts.Vertex_After_WorldPosComputed ?? ''}
            ${contactCode(
                'vStaticSnowContact = vec2(worldPos.y - staticSnowContact.x, staticSnowContact.y);',
                'vStaticSnowContact = vec2(0.0);',
            )}
        `)
        material.Fragment_Definitions(`
            ${material.CustomParts.Fragment_Definitions}
            varying vec2 vStaticSnowContact;
            ${terrainNoiseShader}
            ${terrainFringeShader}
            ${terrainContactSnowShader}
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
        `)
    }

    clear() {
        this.snowContacts.clear()
    }

    addSnow(index: number, height: number, reach: number, blendGroundLighting = false) {
        this.snowContacts.set(index, {height, reach: blendGroundLighting ? -reach : reach})
    }

    setMeshSnow(mesh: Mesh, height: number | undefined, reach: number, blendGroundLighting = false) {
        const data = new Float32Array(mesh.getTotalVertices() * 2)
        if (height !== undefined) {
            const signedReach = blendGroundLighting ? -reach : reach
            for (let i = 0; i < data.length; i += 2) {
                data[i] = height
                data[i + 1] = signedReach
            }
        }
        mesh.setVerticesData(ATTRIBUTE, data, false, 2)
    }

    upload(mesh: Mesh, count: number) {
        if (!count) return
        const grow = count * 2 > this.buffer.length
        if (grow) this.buffer = new Float32Array(Math.max(32, count * 2, this.buffer.length * 2))
        else this.buffer.fill(0, 0, count * 2)
        for (const [index, {height, reach}] of this.snowContacts) {
            this.buffer[index * 2] = height
            this.buffer[index * 2 + 1] = reach
        }
        if (grow) mesh.thinInstanceSetBuffer(ATTRIBUTE, this.buffer, 2, false)
        else mesh.thinInstanceBufferUpdated(ATTRIBUTE)
    }
}
