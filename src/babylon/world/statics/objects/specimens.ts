import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from './baseStaticObject'
import { WorldRenderer } from '../../worldRenderer'
import { MaterialEnum1 } from '@/babylon/materials'
import { StaticSurfaceAtlas, StaticSurfacePlanes } from '../staticSurfacePlanes'

export { StaticSurfacePlanes as SpecimenPrefabs } from '../staticSurfacePlanes'
export interface BannerMetadata { bannerIndex?: number }
export class StandingBanner extends BaseStaticObject {
    private readonly bannerUV: Vector2
    constructor(type: number, pos: Vector3, metadata?: BannerMetadata) {
        super(type, pos, 0, MaterialEnum1.WOOD_3.uv, StaticSurfacePlanes.getPrefab())
        this.bannerUV = StaticSurfaceAtlas.banner(metadata?.bannerIndex ?? 0)
        this.status = {bannerIndex: this.bannerUV.x}
    }
    render() {
        const p = this.renderPosition
        for (const [w,h,d,x,y] of [[0.7,0.15,0.7,0,0.075],[0.12,3.3,0.12,0,1.65],[1.5,0.1,0.12,0,3.15]]) {
            WorldRenderer.block1!.matrices.push(Matrix.Scaling(w,h,d).multiply(Matrix.Translation(p.x+x,p.y+y+0.5,p.z)))
            WorldRenderer.block1!.uvData.push(this.material)
        }
        this.prefab!.matrices.push(Matrix.Scaling(1.2, 2.2, 1).multiply(Matrix.Translation(p.x,p.y+2,p.z-0.09)))
        this.prefab!.uvData.push(this.bannerUV)

    }

}
