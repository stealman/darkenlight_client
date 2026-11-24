import { Mesh, Scene } from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { terrainFringeShader } from '../terrainSurfaceShader'
import { configureBuildingRoofSnow } from './buildingRoofSnow'

const ATTRIBUTE = 'buildingGroundContact'

export class BuildingGroundContact {
    readonly material
    private readonly contacts = new Map<number, {height: number, reach: number}>()
    private buffer = new Float32Array(0)

    constructor(scene: Scene) {
        const material = Materials.createBlockMat1(scene)
        this.material = material
        material.name = 'building_opaque_material'
        material.maxSimultaneousLights = Materials.blockMat1!.maxSimultaneousLights
        configureBuildingRoofSnow(material)
        material.AddAttribute(ATTRIBUTE)
        material.Vertex_Definitions(`
            ${material.CustomParts.Vertex_Definitions}
            #ifdef THIN_INSTANCES
                attribute vec2 ${ATTRIBUTE};
            #endif
            varying vec2 vBuildingGroundContact;
        `)
        material.Vertex_After_WorldPosComputed(`
            ${material.CustomParts.Vertex_After_WorldPosComputed ?? ''}
            #ifdef THIN_INSTANCES
                vBuildingGroundContact = vec2(worldPos.y - ${ATTRIBUTE}.x, ${ATTRIBUTE}.y);
            #else
                vBuildingGroundContact = vec2(0.0);
            #endif
        `)
        material.Fragment_Definitions(`
            ${material.CustomParts.Fragment_Definitions}
            varying vec2 vBuildingGroundContact;
            ${terrainFringeShader}
        `)
        material.Fragment_Before_Lights(`
            ${material.CustomParts.Fragment_Before_Lights}
            float contactReach = abs(vBuildingGroundContact.y);
            if (contactReach > 0.0 && vBuildingGroundContact.x < contactReach) {
                float aboveGround = max(vBuildingGroundContact.x, 0.0);
                float groundHeight = vPositionW.y - vBuildingGroundContact.x;
                vec2 contactXZ = mod(vPositionW.xz, 48.0);
                bool snowy = vBuildingGroundContact.y > 0.0;
                float coverage = terrainFringeCoverage(contactXZ * 2.0, aboveGround * 0.36 / contactReach,
                    groundHeight, 0.09, 0.29);
                float atBase = 1.0 - smoothstep(0.0, contactReach * 0.24, aboveGround);
                coverage = mix(coverage, 1.0, atBase) * (1.0 - smoothstep(contactReach * 0.8, contactReach, aboveGround));
                if (snowy && coverage > 0.0) {
                    vec2 snowUV = terrainContactSnowUV(vPositionW.xz, aboveGround);
                    surfaceAlbedo = mix(surfaceAlbedo, toLinearSpace(texture2D(buildingSnowColor, snowUV).rgb), coverage);
                } else if (coverage > 0.0) {
                    float grain = terrainNoise(contactXZ * 61.0 + vec2(0.0, vPositionW.y * 47.0));
                    vec3 moss = mix(vec3(0.20, 0.25, 0.14), vec3(0.34, 0.41, 0.24), grain);
                    surfaceAlbedo = mix(surfaceAlbedo, toLinearSpace(moss), coverage * mix(0.55, 0.88, grain));
                }
            }
        `)
    }

    clear() {
        this.contacts.clear()
    }

    add(index: number, height: number, snowy: boolean) {
        // The sign selects snow or moss, the magnitude controls the height of the effect.
        this.contacts.set(index, {height, reach: snowy ? 0.21 : -0.31})
    }

    upload(mesh: Mesh, count: number) {
        if (!count) return
        const grow = count * 2 > this.buffer.length
        if (grow) this.buffer = new Float32Array(Math.max(32, count * 2, this.buffer.length * 2))
        else this.buffer.fill(0, 0, count * 2)
        for (const [index, {height, reach}] of this.contacts) {
            this.buffer[index * 2] = height
            this.buffer[index * 2 + 1] = reach
        }
        if (grow) mesh.thinInstanceSetBuffer(ATTRIBUTE, this.buffer, 2, false)
        else mesh.thinInstanceBufferUpdated(ATTRIBUTE)
    }
}
