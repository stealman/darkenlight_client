import { RawTexture, Scene, Texture, Vector4 } from '@babylonjs/core'
import type { Matrix, Vector3 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import type { MapBlock } from '@/data/worldDataManager'
import { WATER_BLOCK_TYPE } from './terrainManager'
import { HOUSE_FOUNDATION_SURFACE } from './buildings/buildingWallDamp'
import type { TerrainStepField } from './terrainStepField'

const SAMPLES_PER_TILE = 16
export const CONTACT_SHADOW_STRENGTH = 0.42

export function contactShadowFalloff(distance: number, reach: number): number {
    const t = Math.min(1, distance / reach)
    return 1 - t * t * (3 - 2 * t)
}

export interface ContactShadowFootprint {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
    height: number
    reach: number
}

export type ContactShadowView = Pick<ContactShadowFootprint, 'minX' | 'minZ' | 'maxX' | 'maxZ'>

export function appendBoxContactShadow(footprints: ContactShadowFootprint[], {m}: Matrix, origin: Vector3,
    height: number, reach: number) {
    const x = origin.x + m[12], z = origin.z + m[14]
    const halfX = (Math.abs(m[0]) + Math.abs(m[4]) + Math.abs(m[8])) / 2
    const halfZ = (Math.abs(m[2]) + Math.abs(m[6]) + Math.abs(m[10])) / 2
    footprints.push({minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ, height, reach})
}

export function contactShadowView(center: {x: number, z: number}, viewport: ContactShadowView): ContactShadowView {
    const step = 16
    const x = Math.round(center.x / step) * step, z = Math.round(center.z / step) * step
    const margin = step / 2 + 2
    return {minX: x + viewport.minX - margin, minZ: z + viewport.minZ - margin,
        maxX: x + viewport.maxX + margin, maxZ: z + viewport.maxZ + margin}
}

export class TerrainContactShadow {
    private readonly bounds = new Vector4(0, 0, 0, 0)
    private texture: RawTexture
    private mask = new Uint8Array(1)
    private map?: MapBlock[][]
    private revision?: number
    private key?: string

    constructor(private readonly scene: Scene, private readonly terrainSteps?: TerrainStepField) {
        this.texture = this.createTexture(1, 1)
    }

    configure(material: PBRCustomMaterial, foundationOnly = false, shareStepTexture = false) {
        material.AddUniform('terrainContactShadowBounds', 'vec4', this.bounds)
        if (!shareStepTexture) {
            material.AddUniform('terrainContactShadowMask', 'sampler2D', null)
            const attach = material.AttachAfterBind.bind(material)
            material.AttachAfterBind = (mesh, effect) => {
                attach(mesh, effect)
                effect.setTexture('terrainContactShadowMask', this.texture)
            }
        }
        material.Fragment_Before_Lights(`
            ${material.CustomParts.Fragment_Before_Lights ?? ''}
            if (terrainContactShadowBounds.z > 0.0 && geometricNormalW.y > 0.65
                ${foundationOnly ? `&& buildingSurface.x == ${HOUSE_FOUNDATION_SURFACE}.0` : ''}) {
                vec2 contactUV = (vPositionW.xz - terrainContactShadowBounds.xy) * terrainContactShadowBounds.zw;
                if (all(greaterThanEqual(contactUV, vec2(0.0))) && all(lessThan(contactUV, vec2(1.0)))) {
                    float contactShade = ${shareStepTexture ? 'stepContactShadow(contactUV)' : 'texture2D(terrainContactShadowMask, contactUV).r'};
                    surfaceAlbedo *= 1.0 - contactShade * ${CONTACT_SHADOW_STRENGTH} * smoothstep(0.65, 0.95, geometricNormalW.y);
                }
            }
        `)
    }

    update(map: MapBlock[][], revision: number, footprints: ContactShadowFootprint[]) {
        const key = JSON.stringify(footprints)
        if (this.map === map && this.revision === revision && this.key === key) return
        this.map = map
        this.revision = revision
        this.key = key
        if (footprints.length === 0) {
            this.bounds.set(0, 0, 0, 0)
            return
        }

        // Keep an empty border so filtering fades cleanly at the edge of the mask.
        const minX = Math.floor(Math.min(...footprints.map(foot => foot.minX - foot.reach))) - 1
        const minZ = Math.floor(Math.min(...footprints.map(foot => foot.minZ - foot.reach))) - 1
        const spanX = Math.ceil(Math.max(...footprints.map(foot => foot.maxX + foot.reach))) + 1 - minX
        const spanZ = Math.ceil(Math.max(...footprints.map(foot => foot.maxZ + foot.reach))) + 1 - minZ
        const maxSize = this.scene.getEngine().getCaps().maxTextureSize
        const resolution = Math.min(SAMPLES_PER_TILE, maxSize / spanX, (this.terrainSteps?.maxShadowHeight ?? maxSize) / spanZ)
        const width = Math.ceil(spanX * resolution)
        const depth = Math.ceil(spanZ * resolution)
        const size = this.texture.getSize()
        if (size.width !== width || size.height !== depth) {
            this.texture.dispose()
            this.mask = new Uint8Array(width * depth)
            this.texture = this.createTexture(width, depth)
        } else {
            this.mask.fill(0)
        }
        for (const foot of footprints) {
            const {reach} = foot
            const left = Math.floor((foot.minX - reach - minX) * resolution)
            const right = Math.ceil((foot.maxX + reach - minX) * resolution)
            const near = Math.floor((foot.minZ - reach - minZ) * resolution)
            const far = Math.ceil((foot.maxZ + reach - minZ) * resolution)
            for (let z = near; z < far; z++) {
                const wz = minZ + (z + 0.5) / resolution
                const dz = Math.max(foot.minZ - wz, 0, wz - foot.maxZ)
                const tileZ = Math.floor(wz + 0.5)
                for (let x = left; x < right; x++) {
                    const wx = minX + (x + 0.5) / resolution
                    const tile = map[Math.floor(wx + 0.5)]?.[tileZ]
                    if (!tile || tile.type <= 0 || tile.type >= WATER_BLOCK_TYPE || Math.abs(tile.height - foot.height) > 0.15) continue
                    const dx = Math.max(foot.minX - wx, 0, wx - foot.maxX)
                    const index = z * width + x
                    this.mask[index] = Math.max(this.mask[index], Math.round(255 * contactShadowFalloff(Math.sqrt(dx * dx + dz * dz), reach)))
                }
            }
        }
        this.texture.update(this.mask)
        this.terrainSteps?.updateContactShadow(this.mask, width, depth)
        this.bounds.set(minX, minZ, resolution / width, resolution / depth)
    }

    private createTexture(width: number, depth: number) {
        const texture = RawTexture.CreateLuminanceTexture(this.mask, width, depth, this.scene, false, false, Texture.BILINEAR_SAMPLINGMODE)
        texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
        return texture
    }
}
