import { Mesh, ShadowDepthWrapper, Texture, Vector2, Vector3, VertexData } from '@babylonjs/core'
import type { Matrix, Scene, TransformNode } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Settings } from '@/settings/settings'
import { Prefab, WorldRenderer } from './worldRenderer'
import { StaticTerrainContact } from './statics/staticTerrainContact'
import { stoneAtlasRow, stoneAtlasShader } from './stoneAtlas'
import { terrainTextureUrls } from './terrainTextureUrls'

const OUTLINE = [[-0.50, -0.44], [-0.43, -0.50], [0.44, -0.50], [0.50, -0.45],
    [0.50, 0.43], [0.43, 0.50], [-0.45, 0.50], [-0.50, 0.42]]

function createGeometry(mesh: Mesh) {
    const data = new VertexData()
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = []
    const ring = (y: number) => OUTLINE.map(([x, z]) => new Vector3(x, y, z))
    const bottom = ring(-0.5), top = ring(0.5)
    const face = (points: Vector3[], normal: Vector3, uv: (point: Vector3) => [number, number]) => {
        const start = positions.length / 3
        for (const point of points) {
            positions.push(point.x, point.y, point.z)
            normals.push(normal.x, normal.y, normal.z)
            uvs.push(...uv(point))
        }
        for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i, start + i + 1)
    }
    face(top, Vector3.Up(), p => [p.x + 0.5, p.z + 0.5])
    face(bottom.slice().reverse(), Vector3.Down(), p => [p.x + 0.5, 0.5 - p.z])
    for (let i = 0; i < top.length; i++) {
        const next = (i + 1) % top.length
        const along = top[next].subtract(top[i])
        const normal = new Vector3(along.z, 0, -along.x).normalize()
        face([top[next], top[i], bottom[i], bottom[next]], normal, p => [
            Math.abs(normal.x) > Math.abs(normal.z) ? p.z + 0.5 : p.x + 0.5, p.y + 0.5,
        ])
    }
    data.positions = positions
    data.normals = normals
    data.uvs = uvs
    data.indices = indices
    data.applyToMesh(mesh)
}

export const MasonryBatch = {
    prefab: null as Prefab | null,
    contact: null as StaticTerrainContact | null,

    initialize(scene: Scene, parent: TransformNode, weathering: boolean) {
        const mesh = new Mesh('masonryBlocks', scene)
        createGeometry(mesh)
        mesh.parent = parent
        // Weathered static blocks use the same half-unit vertical mesh offset.
        mesh.position.y = -0.5
        mesh.receiveShadows = Settings.isShadowsEnabled()
        mesh.isPickable = false
        mesh.alwaysSelectAsActiveMesh = true
        mesh.setEnabled(false)
        const material = new PBRCustomMaterial('masonryAtlas', scene)
        material.metallic = 0
        material.roughness = 0.96
        material.specularIntensity = 0
        material.usePhysicalLightFalloff = false
        const load = (url: string) => {
            const texture = new Texture(url, scene, true, false, Texture.BILINEAR_SAMPLINGMODE)
            texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
            material.onDisposeObservable.addOnce(() => texture.dispose())
            return texture
        }
        material.AddAttribute('uvc')
        if (weathering) material.AddUniform('masonryRelief', 'sampler2D', load(terrainTextureUrls.stonePathRelief))
        const varyings = 'varying vec2 vMasonryUV; varying float vMasonryRow;'
        material.Vertex_Definitions(`${stoneAtlasShader}${varyings} attribute vec2 uvc;`)
        material.Vertex_Before_PositionUpdated(`
            // The fractional parts carry distortion amplitude and a stable stone seed.
            vec2 cell = floor(uvc);
            vec2 shape = fract(uvc) * 2.0;
            uvUpdated = stoneAtlasUV(cell, uvUpdated);
            vMasonryUV = uvUpdated;
            vMasonryRow = cell.y;
            vec3 shear = (fract(shape.y * vec3(13.37, 57.23, 89.47)) * 2.0 - 1.0)
                * shape.x * vec3(0.32, 0.28, 0.34);
            vec2 slope = (fract(shape.y * vec2(31.57, 71.63)) * 2.0 - 1.0) * shape.x * 0.32;
            vec3 p = positionUpdated;
            float crown = dot(slope, p.xz);
            positionUpdated += vec3(p.y * (shear.x + p.z * shear.z), (0.55 + p.y) * crown,
                p.y * (shear.y - p.x * shear.z));
        `)
        material.Vertex_Before_NormalUpdated(`
            #ifdef NORMAL
                // Transform the existing face normal by the deformation's inverse transpose.
                vec3 dx = vec3(1.0, (0.55 + p.y) * slope.x, -p.y * shear.z);
                vec3 dy = vec3(shear.x + p.z * shear.z, 1.0 + crown, shear.y - p.x * shear.z);
                vec3 dz = vec3(p.y * shear.z, (0.55 + p.y) * slope.y, 1.0);
                normalUpdated = normalize(cross(dy, dz) * normalUpdated.x
                    + cross(dz, dx) * normalUpdated.y + cross(dx, dy) * normalUpdated.z);
            #endif
        `)
        material.albedoTexture = load(terrainTextureUrls.stonePath)
        material.Fragment_Definitions(varyings + stoneAtlasShader)
        material.Fragment_Before_Lights(`
            ${weathering ? `
                vec2 reliefUV = stoneReliefUV(vMasonryUV, vMasonryRow);
                vec2 bump = texture2D(masonryRelief, reliefUV).rg * 2.0 - 1.0;
                vec3 dpX = dFdx(vPositionW), dpY = dFdy(vPositionW);
                vec2 uvX = dFdx(vMasonryUV) * 8.0, uvY = dFdy(vMasonryUV) * 8.0;
                float detail = 1.0 - smoothstep(0.095, 0.34, max(length(uvX), length(uvY)));
                vec3 tangent = cross(dpY, normalW) * uvX.x + cross(normalW, dpX) * uvY.x;
                vec3 bitangent = cross(dpY, normalW) * uvX.y + cross(normalW, dpX) * uvY.y;
                float scale = inversesqrt(max(1e-10, max(dot(tangent, tangent), dot(bitangent, bitangent))));
                normalW = normalize(normalW + (tangent * bump.x + bitangent * bump.y) * scale * 0.84 * detail);
            ` : ''}
        `)
        this.contact = weathering ? new StaticTerrainContact(material) : null
        material.shadowDepthWrapper = new ShadowDepthWrapper(material, scene, {standalone: true})
        mesh.material = material
        mesh.onDisposeObservable.addOnce(() => material.dispose())
        this.prefab = new Prefab(mesh)
    },

    add(matrix: Matrix, anchor: Vector3, seed: number, beige = false, roughness = 0) {
        const uv = new Vector2(Math.floor(seed * 413) % 8 + roughness * 0.5, stoneAtlasRow(beige, seed) + seed * 0.5)
        WorldRenderer.addWeatheredBlock(matrix, uv, anchor, 0.82, {target: this, sampleAtCenter: true})
    },

    clear() {
        this.prefab?.clearMatrices()
        this.contact?.clear()
    },

    flush() {
        const batch = this.prefab
        if (!batch) return
        batch.setThinInstanceBuffers()
        this.contact?.upload(batch.mesh, batch.matrices.length)
        batch.mesh.setEnabled(batch.matrices.length > 0)
    },
}
