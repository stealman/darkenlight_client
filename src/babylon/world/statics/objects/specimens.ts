import { Matrix, Mesh, MeshBuilder, PBRMaterial, Scene, Texture, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from './baseStaticObject'
import { Prefab, WorldRenderer } from '../../worldRenderer'
import { MaterialEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'

// Shared banner cloth batches, grouped by texture.
export const SpecimenPrefabs = {
    all: new Set<Prefab>(),
    clear() { this.all.forEach(p => p.clearMatrices()) },
    flush() { this.all.forEach(p => {p.setThinInstanceBuffers(); p.mesh.setEnabled(p.matrices.length > 0)}) },
}
export interface BannerMetadata { textureUrl?: string }
const banners = new WeakMap<Scene, Map<string, Prefab>>()
export class StandingBanner extends BaseStaticObject {
    constructor(type: number, pos: Vector3, metadata?: BannerMetadata) {
        const scene = WorldRenderer.worldParentNode!.getScene()
        const url = metadata?.textureUrl || '/textures/statics/darkenlight-banner.svg'
        let cache = banners.get(scene)
        if (!cache) { cache = new Map(); banners.set(scene, cache) }
        let prefab = cache.get(url)
        if (!prefab) {
            const mesh = MeshBuilder.CreatePlane('standingBannerCloth', {width: 1.2, height: 2.2, sideOrientation: Mesh.DOUBLESIDE}, scene)
            mesh.parent = WorldRenderer.worldParentNode
            const material = new PBRMaterial('bannerCloth', scene)
            material.albedoTexture = new Texture(url, scene)
            material.albedoTexture.hasAlpha = true
            material.useAlphaFromAlbedoTexture = true
            material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST
            material.metallic = 0; material.roughness = 1; material.backFaceCulling = false
            mesh.material = material
            mesh.setEnabled(false)
            mesh.alwaysSelectAsActiveMesh = true
            prefab = new Prefab(mesh); cache.set(url, prefab); SpecimenPrefabs.all.add(prefab)
            Lights.addShadowCaster(mesh, true)
        }
        super(type, pos, 0, MaterialEnum1.WOOD_3.uv, prefab)
    }
    render() {
        const p = this.renderPosition
        for (const [w,h,d,x,y] of [[0.7,0.15,0.7,0,0.075],[0.12,3.3,0.12,0,1.65],[1.5,0.1,0.12,0,3.15]]) {
            WorldRenderer.block1!.matrices.push(Matrix.Scaling(w,h,d).multiply(Matrix.Translation(p.x+x,p.y+y+0.5,p.z)))
            WorldRenderer.block1!.uvData.push(this.material)
        }
        this.prefab!.matrices.push(Matrix.Translation(p.x,p.y+2,p.z-0.09))
        this.prefab!.uvData.push(Vector2.Zero())

    }

}
