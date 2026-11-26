import { Mesh, ShadowDepthWrapper, Texture, Vector2, Vector3, VertexData } from '@babylonjs/core'
import type { Matrix, Scene, TransformNode } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Settings } from '@/settings/settings'
import { Prefab, WorldRenderer } from './worldRenderer'
import { StaticTerrainContact } from './statics/staticTerrainContact'
import { stoneAtlasRow, stoneAtlasShader } from './stoneAtlas'
import { terrainTextureUrls } from './terrainTextureUrls'
import { FULL_TOP_EXPOSURE, MASONRY_TOP_EXPOSURE, markMasonryTopExposure, masonryTopWeatheringFragment,
    masonryTopWeatheringFunctions, TOP_CENTER_EXPOSURE } from './masonryTopWeathering'

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

function createMaterial(scene: Scene, weathering: boolean, topWeathering: boolean, existingContact: StaticTerrainContact | null) {
    const material = new PBRCustomMaterial('masonryAtlas', scene)
    material.metallic = 0
    material.roughness = 0.96
    material.specularIntensity = topWeathering ? 0.45 : 0
    material.usePhysicalLightFalloff = false
    const load = (url: string) => {
        const texture = new Texture(url, scene, true, false, Texture.BILINEAR_SAMPLINGMODE)
        texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
        material.onDisposeObservable.addOnce(() => texture.dispose())
        return texture
    }
    material.AddAttribute('uvc')
    if (weathering) material.AddUniform('masonryRelief', 'sampler2D', load(terrainTextureUrls.stonePathRelief))
    const varyings = 'varying vec2 vMasonryUV; varying float vMasonryRow; varying float vMasonryCrown;'
        + (topWeathering ? 'varying vec4 vMasonryTop;' : '')
    if (topWeathering) material.AddAttribute(MASONRY_TOP_EXPOSURE)
    material.Vertex_Definitions(`${stoneAtlasShader}${varyings} attribute vec2 uvc;
        ${topWeathering ? `attribute float ${MASONRY_TOP_EXPOSURE};` : ''}
        vec2 masonryCrownCorner(vec2 corner, float seed, float amount) {
            vec2 jitter = fract(seed * vec2(57.79, 33.17)
                + corner.x * vec2(0.37, 0.71) + corner.y * vec2(0.63, 0.29) + corner.x * corner.y * 0.19) - 0.5;
            return (corner - 0.5) * (1.0 - amount * 0.18) + jitter * amount * 0.30;
        }
    `)
    material.Vertex_Before_PositionUpdated(`
        // The fractional parts carry distortion, the crown profile and a stable stone seed.
        vec2 cell = floor(uvc);
        vec2 packedShape = fract(uvc);
        float crownProfile = step(0.5, packedShape.x);
        vec2 shape = vec2(mod(packedShape.x, 0.5) * 4.0, packedShape.y * 2.0);
        uvUpdated = stoneAtlasUV(cell, uvUpdated);
        vMasonryUV = uvUpdated;
        vMasonryRow = cell.y;
        ${topWeathering ? `vMasonryTop = vec4(positionUpdated.xz + 0.5, ${MASONRY_TOP_EXPOSURE}, 0.5 - positionUpdated.y);` : ''}
        vec3 shear = (fract(shape.y * vec3(13.37, 57.23, 89.47)) * 2.0 - 1.0)
            * shape.x * vec3(0.32, 0.28, 0.34);
        vec2 slope = (fract(shape.y * vec2(31.57, 71.63)) * 2.0 - 1.0) * shape.x * 0.32;
        vec3 p = positionUpdated;
        float crown = dot(slope, p.xz);
        float crownAmount = crownProfile * shape.x;
        float topWeight = 0.5 + p.y;
        vec3 crownOffset = vec3(0.0);
        vMasonryCrown = crownAmount;
        if (crownAmount > 0.0) {
            // The two vertices of each chamfer run along different edges of the same skewed corner.
            vec2 corner = step(vec2(0.0), p.xz);
            bool onXEdge = abs(p.x) > abs(p.z);
            vec2 neighbor = onXEdge ? vec2(corner.x, 1.0 - corner.y) : vec2(1.0 - corner.x, corner.y);
            float vertexSeed = shape.y + dot(corner, vec2(0.23, 0.47)) + (onXEdge ? 0.16 : 0.0);
            float originalCut = 0.5 - min(abs(p.x), abs(p.z));
            float cut = mix(originalCut, mix(0.06, 0.33, fract(vertexSeed * 37.19)), crownAmount);
            vec2 topXZ = mix(masonryCrownCorner(corner, shape.y, crownAmount),
                masonryCrownCorner(neighbor, shape.y, crownAmount), cut);
            float lift = (fract(vertexSeed * 73.31) - 0.5) * 1.08 * crownAmount;
            crownOffset = vec3(topXZ.x - p.x, lift, topXZ.y - p.z);
        }
        vec2 shapedXZ = p.xz + topWeight * crownOffset.xz;
        positionUpdated += vec3(p.y * (shear.x + shapedXZ.y * shear.z), (0.55 + p.y) * crown,
            p.y * (shear.y - shapedXZ.x * shear.z)) + topWeight * crownOffset;
    `)
    material.Vertex_Before_NormalUpdated(`
        #ifdef NORMAL
            // Transform the existing face normal by the deformation's inverse transpose.
            vec3 dx = vec3(1.0, (0.55 + p.y) * slope.x, -p.y * shear.z);
            vec3 dy = vec3(shear.x + (shapedXZ.y + p.y * crownOffset.z) * shear.z, 1.0 + crown,
                shear.y - (shapedXZ.x + p.y * crownOffset.x) * shear.z) + crownOffset;
            vec3 dz = vec3(p.y * shear.z, (0.55 + p.y) * slope.y, 1.0);
            normalUpdated = normalize(cross(dy, dz) * normalUpdated.x
                + cross(dz, dx) * normalUpdated.y + cross(dx, dy) * normalUpdated.z);
        #endif
    `)
    material.albedoTexture = load(terrainTextureUrls.stonePath)
    material.Fragment_Definitions(varyings + stoneAtlasShader + (topWeathering ? masonryTopWeatheringFunctions : ''))
    material.Fragment_Before_Lights(`
        vec3 dpX = dFdx(vPositionW), dpY = dFdy(vPositionW);
        if (vMasonryCrown > 0.0) {
            vec3 faceNormal = cross(dpX, dpY);
            faceNormal *= inversesqrt(max(1e-16, dot(faceNormal, faceNormal)));
            if (dot(faceNormal, normalW) < 0.0) faceNormal = -faceNormal;
            normalW = normalize(mix(normalW, faceNormal, vMasonryCrown * 0.57));
        }
        ${weathering ? `
            vec2 reliefUV = stoneReliefUV(vMasonryUV, vMasonryRow);
            vec2 bump = texture2D(masonryRelief, reliefUV).rg * 2.0 - 1.0;
            vec2 uvX = dFdx(vMasonryUV) * 8.0, uvY = dFdy(vMasonryUV) * 8.0;
            float detail = 1.0 - smoothstep(0.095, 0.34, max(length(uvX), length(uvY)));
            vec3 tangent = cross(dpY, normalW) * uvX.x + cross(normalW, dpX) * uvY.x;
            vec3 bitangent = cross(dpY, normalW) * uvX.y + cross(normalW, dpX) * uvY.y;
            float scale = inversesqrt(max(1e-10, max(dot(tangent, tangent), dot(bitangent, bitangent))));
            normalW = normalize(normalW + (tangent * bump.x + bitangent * bump.y) * scale * 0.84 * detail);
        ` : ''}
    `)
    const contact = existingContact ?? (weathering ? new StaticTerrainContact(material) : null)
    existingContact?.configureMaterial(material)
    if (topWeathering) {
        material.Fragment_Before_Lights((material.CustomParts.Fragment_Before_Lights ?? '') + masonryTopWeatheringFragment)
        material.Fragment_Custom_MetallicRoughness(`
            ${material.CustomParts.Fragment_Custom_MetallicRoughness ?? ''}
            metallicRoughness.g = mix(metallicRoughness.g, 0.29, masonryPuddle);
        `)
        material.Fragment_Before_FinalColorComposition(`
            #ifdef SPECULARTERM
                finalSpecularScaled *= masonryPuddle;
            #endif
        `)
    }
    material.shadowDepthWrapper = new ShadowDepthWrapper(material, scene, {standalone: true})
    return {material, contact}
}

export const MasonryBatch = {
    prefab: null as Prefab | null,
    contact: null as StaticTerrainContact | null,
    weathering: false,
    topWeathering: false,
    variants: [] as ReturnType<typeof createMaterial>[],
    topExposure: [] as number[],
    topBuffer: new Float32Array(0),

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
        const variants = this.variants = [] as ReturnType<typeof createMaterial>[]
        mesh.onDisposeObservable.addOnce(() => variants.forEach(variant => variant.material.dispose()))
        this.prefab = new Prefab(mesh)
        this.contact = null
        this.weathering = weathering
        this.topBuffer = new Float32Array(0)
        this.topExposure.length = 0
        this.setTopWeatheringEnabled(Settings.isDetalLevelHigh())
    },

    setTopWeatheringEnabled(enabled: boolean) {
        const mesh = this.prefab!.mesh
        this.topWeathering = enabled && this.weathering
        const index = Number(this.topWeathering)
        const variant = this.variants[index] ??= createMaterial(mesh.getScene(), this.weathering, this.topWeathering, this.contact)
        mesh.material = variant.material
        this.contact = variant.contact
    },

    add(matrix: Matrix, anchor: Vector3, seed: number, beige = false, roughness = 0, exposedTop = false, crown = false) {
        const shape = roughness * 0.25 + (crown ? 0.5 : 0)
        const uv = new Vector2(Math.floor(seed * 413) % 8 + shape, stoneAtlasRow(beige, seed) + seed * 0.5)
        const index = this.prefab!.matrices.length
        if (this.topWeathering && exposedTop) this.topExposure[index] = FULL_TOP_EXPOSURE
        WorldRenderer.addWeatheredBlock(matrix, uv, anchor, 0.82,
            {target: this, sampleAtCenter: true, highGroundWear: 'masonryGround', snowProfile: 'masonrySnow'})
        return index
    },

    markExposedTops(layers: number[][], anchor: Vector3, irregular: boolean, firstRevealedLayer: number) {
        const capLayer = layers.length - 1
        if (!this.topWeathering && firstRevealedLayer === capLayer) return
        const batch = this.prefab!
        const x = Math.round(anchor.x), z = Math.round(anchor.z)
        const terrain = !this.topWeathering ? undefined
            : irregular && WorldRenderer.getSnowSurfaceHeight(x, z) !== undefined ? 'snow'
                : WorldRenderer.getMuddyDirtContactHeight(x, z) !== undefined ? 'mud' : undefined
        const masks = this.topWeathering ? this.topExposure : []
        markMasonryTopExposure(batch.matrices, layers, masks, terrain, this.topWeathering ? 0 : firstRevealedLayer)
        for (let layer = firstRevealedLayer; layer < capLayer; layer++) {
            for (const index of layers[layer]) {
                if (Math.abs(masks[index]) & TOP_CENTER_EXPOSURE) batch.uvData[index].x += 0.5
            }
        }
    },

    clear() {
        this.prefab?.clearMatrices()
        this.contact?.clear()
        this.topExposure.length = 0
    },

    flush() {
        const batch = this.prefab
        if (!batch) return
        batch.setThinInstanceBuffers()
        const count = batch.matrices.length
        if (count && this.topWeathering) {
            const grow = count > this.topBuffer.length
            if (grow) this.topBuffer = new Float32Array(batch.matrixBuffer.length / 16)
            for (let i = 0; i < count; i++) this.topBuffer[i] = this.topExposure[i] ?? 0
            if (grow) batch.mesh.thinInstanceSetBuffer(MASONRY_TOP_EXPOSURE, this.topBuffer, 1, false)
            else batch.mesh.thinInstanceBufferUpdated(MASONRY_TOP_EXPOSURE)
        }
        this.contact?.upload(batch.mesh, count)
        batch.mesh.setEnabled(count > 0)
    },
}
