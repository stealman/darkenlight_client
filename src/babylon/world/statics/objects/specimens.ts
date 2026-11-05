import { Matrix, Mesh, MeshBuilder, PBRMaterial, Scene, Texture, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from './baseStaticObject'
import { Prefab, WorldRenderer } from '../../worldRenderer'
import { MaterialAlphaEnum1, MaterialEnum1, Materials } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'

// Separate shared leaf meshes allow day shadows without local/night shadow casting.
export const SpecimenPrefabs = {
    all: new Set<Prefab>(),
    clear() { this.all.forEach(p => p.clearMatrices()) },
    flush() { this.all.forEach(p => {p.setThinInstanceBuffers(); p.mesh.setEnabled(p.matrices.length > 0)}) },
}
const crowns = new WeakMap<Scene, Prefab>()
function crown(): Prefab {
    const scene = WorldRenderer.worldParentNode!.getScene()
    const cached = crowns.get(scene)
    if (cached) return cached
    const parts: Mesh[] = []
    for (let i = 0; i < 12; i++) {
        const angle = i * 2.39996
        const mesh = MeshBuilder.CreateBox('leaf', {width: 0.65, height: 1.6 + (i % 3) * 0.3, depth: 0.65}, scene)
        mesh.position.set(Math.cos(angle) * 1.25, 2.3 + (i % 3) * 0.2, Math.sin(angle) * 1.25)
        mesh.rotation.z = Math.sin(angle) * 0.15
        parts.push(mesh)
    }
    const mesh = Mesh.MergeMeshes(parts, true)!
    mesh.parent = WorldRenderer.worldParentNode
    mesh.material = Materials.blockMatAlpha1
    mesh.alwaysSelectAsActiveMesh = true
    mesh.setEnabled(false)
    Lights.addShadowCaster(mesh, true)
    const prefab = new Prefab(mesh)
    SpecimenPrefabs.all.add(prefab)
    crowns.set(scene, prefab)
    return prefab
}

export class SpecimenTree extends BaseStaticObject {
    constructor(type: number, pos: Vector3) {
        super(type, pos, 0, MaterialEnum1.WILLOW_BARK.uv, crown())
    }
    render() {
        const p = this.renderPosition
        const part = (w: number, h: number, d: number, x: number, y: number, z: number, roll = 0, material = this.material) => {
            WorldRenderer.block1!.matrices.push(Matrix.Scaling(w, h, d).multiply(Matrix.RotationZ(roll)).multiply(Matrix.Translation(p.x + x, p.y + y + 0.5, p.z + z)))
            WorldRenderer.block1!.uvData.push(material)
        }
        part(0.32, 3.4, 0.32, 0, 1.7, 0)
        for (const side of [-1, 1]) part(0.16, 1.5, 0.16, side * 0.45, 2.6, 0, side * -0.65)
        this.prefab!.matrices.push(Matrix.Translation(p.x, p.y, p.z))
        this.prefab!.uvData.push(MaterialAlphaEnum1.WILLOW_LEAVES.uv)

    }

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
