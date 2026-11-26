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
const TOP_GLOW_ROW_OFFSET = 8
const PEDESTAL_ROW_OFFSET = 16
const HEADSTONE_ROW_OFFSET = 32
const GRAVE_ROW_OFFSET = 64
const POLISHED_ROW_OFFSET = 256
const EDGE_COORDS = 'masonryEdgeCoords'
const ARCH_HEIGHT = 0.24
const ARCH_SLICES = [...new Set([...OUTLINE.map(([x]) => x),
    ...Array.from({length: 11}, (_, index) => Math.cos(Math.PI * (index + 1) / 12) * 0.5),
])].sort((a, b) => a - b)
const capEdgeBends = OUTLINE.map(([x, z], index) => {
    const [nextX, nextZ] = OUTLINE[(index + 1) % OUTLINE.length]
    const dx = nextX - x, dz = nextZ - z
    const length = Math.hypot(dx, dz)
    return `{
        vec2 inward = vec2(${(-dz / length).toFixed(6)}, ${(dx / length).toFixed(6)});
        float distanceToEdge = dot(p - vec2(${x.toFixed(2)}, ${z.toFixed(2)}), inward);
        nearest = min(nearest, distanceToEdge);
        bend -= inward * (1.0 - smoothstep(0.0, radius, distanceToEdge));
    }`
}).join('\n')

function archRise(x: number) {
    return Math.sqrt(Math.max(0, 1 - 4 * x * x))
}

function createGeometry(mesh: Mesh, arched: boolean) {
    const data = new VertexData()
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = []
    const edgeCoords: number[] = []
    const ring = (y: number) => OUTLINE.map(([x, z]) => new Vector3(x, y, z))
    const flatTop = ring(0.5)
    const bottom = ring(-0.5)
    const topY = (x: number) => arched ? 0.5 - ARCH_HEIGHT * (1 - archRise(x)) : 0.5
    const face = (points: Vector3[], normal: Vector3 | ((p: Vector3) => Vector3), uv: (point: Vector3) => [number, number],
        side?: {from: number, to: number}) => {
        const start = positions.length / 3
        for (const [index, point] of points.entries()) {
            positions.push(point.x, point.y, point.z)
            const n = typeof normal === 'function' ? normal(point) : normal
            normals.push(n.x, n.y, n.z)
            uvs.push(...uv(point))
            if (side) edgeCoords.push(index === 0 || index === 3 ? side.to : side.from, index < 2 ? 1 : 0, 0)
            else edgeCoords.push(point.x, point.z, 1)
        }
        for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i, start + i + 1)
    }
    if (arched) {
        // Slice the existing octagonal stone so the top follows the arch across its full width.
        const sections = ARCH_SLICES.map(x => {
            const zAtX: number[] = []
            for (const [index, [ax, az]] of OUTLINE.entries()) {
                const [bx, bz] = OUTLINE[(index + 1) % OUTLINE.length]
                if (ax === bx || x < Math.min(ax, bx) || x > Math.max(ax, bx)) continue
                zAtX.push(az + (bz - az) * (x - ax) / (bx - ax))
            }
            return {near: new Vector3(x, topY(x), Math.min(...zAtX)), far: new Vector3(x, topY(x), Math.max(...zAtX))}
        })
        const normal = ({x}: Vector3) => new Vector3(4 * ARCH_HEIGHT * x, archRise(x), 0).normalize()
        for (let index = 1; index < sections.length; index++) {
            const left = sections[index - 1], right = sections[index]
            face([left.near, right.near, right.far, left.far], normal, p => [p.x + 0.5, p.z + 0.5])
        }
    } else {
        face(flatTop, Vector3.Up(), p => [p.x + 0.5, p.z + 0.5])
    }
    face(bottom.slice().reverse(), Vector3.Down(), p => [p.x + 0.5, 0.5 - p.z])
    for (let i = 0; i < flatTop.length; i++) {
        const begin = flatTop[i], end = flatTop[(i + 1) % flatTop.length]
        const along = end.subtract(begin)
        const normal = new Vector3(along.z, 0, -along.x).normalize()
        const edges = arched && along.x !== 0
            ? [0, ...ARCH_SLICES.map(x => (x - begin.x) / along.x).filter(ratio => ratio > 0 && ratio < 1).sort((a, b) => a - b), 1]
            : [0, 1]
        for (let index = 1; index < edges.length; index++) {
            const from = edges[index - 1], to = edges[index]
            const a = Vector3.Lerp(begin, end, from), b = Vector3.Lerp(begin, end, to)
            const lowerA = new Vector3(a.x, -0.5, a.z), lowerB = new Vector3(b.x, -0.5, b.z)
            a.y = topY(a.x)
            b.y = topY(b.x)
            // Use the complete side's coordinates across all strips so the shader sees only real edges.
            face([b, a, lowerA, lowerB], normal, p => [
                Math.abs(normal.x) > Math.abs(normal.z) ? p.z + 0.5 : p.x + 0.5, p.y + 0.5,
            ], {from, to})
        }
    }
    data.positions = positions
    data.normals = normals
    data.uvs = uvs
    data.indices = indices
    data.applyToMesh(mesh)
    mesh.setVerticesData(EDGE_COORDS, edgeCoords, false, 3)
}

function createMaterial(scene: Scene, weathering: boolean, topWeathering: boolean, existingContact: StaticTerrainContact | null) {
    const material = new PBRCustomMaterial('masonryAtlas', scene)
    material.metallic = 0
    material.roughness = 0.96
    material.specularIntensity = 0.45
    material.usePhysicalLightFalloff = false
    const load = (url: string) => {
        const texture = new Texture(url, scene, true, false, Texture.BILINEAR_SAMPLINGMODE)
        texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
        material.onDisposeObservable.addOnce(() => texture.dispose())
        return texture
    }
    material.AddAttribute('uvc')
    material.AddAttribute(EDGE_COORDS)
    if (weathering) material.AddUniform('masonryRelief', 'sampler2D', load(terrainTextureUrls.stonePathRelief))
    const varyings = 'varying vec2 vMasonryUV; varying float vMasonryRow; varying float vMasonryCrown; varying float vMasonryTopGlow;'
        + 'varying vec4 vMasonryEdges;'
        + (topWeathering ? 'varying vec4 vMasonryTop;' : '')
    if (topWeathering) material.AddAttribute(MASONRY_TOP_EXPOSURE)
    material.Vertex_Definitions(`${stoneAtlasShader}${varyings} attribute vec2 uvc;
        attribute vec3 ${EDGE_COORDS};
        ${topWeathering ? `attribute float ${MASONRY_TOP_EXPOSURE};` : ''}
        vec2 masonryCrownCorner(vec2 corner, float seed, float amount) {
            vec2 jitter = fract(seed * vec2(57.79, 33.17)
                + corner.x * vec2(0.37, 0.71) + corner.y * vec2(0.63, 0.29) + corner.x * corner.y * 0.19) - 0.5;
            return (corner - 0.5) * (1.0 - amount * 0.18) + jitter * amount * 0.30;
        }
    `)
    material.Vertex_Before_PositionUpdated(`
        // The atlas row packs instance flags. The fractional parts carry shape and seed.
        vec2 cell = floor(uvc);
        float polished = step(${POLISHED_ROW_OFFSET}.0, cell.y);
        cell.y -= polished * ${POLISHED_ROW_OFFSET}.0;
        float grave = floor(cell.y / ${GRAVE_ROW_OFFSET}.0);
        cell.y -= grave * ${GRAVE_ROW_OFFSET}.0;
        float headstone = step(${HEADSTONE_ROW_OFFSET}.0, cell.y);
        cell.y -= headstone * ${HEADSTONE_ROW_OFFSET}.0;
        float pedestal = step(${PEDESTAL_ROW_OFFSET}.0, cell.y);
        cell.y -= pedestal * ${PEDESTAL_ROW_OFFSET}.0;
        vMasonryEdges = vec4(${EDGE_COORDS}, pedestal + 2.0 * headstone + 3.0 * grave + 7.0 * polished);
        vMasonryTopGlow = step(${TOP_GLOW_ROW_OFFSET}.0, cell.y);
        cell.y -= vMasonryTopGlow * ${TOP_GLOW_ROW_OFFSET}.0;
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
    material.Fragment_Definitions(varyings + stoneAtlasShader + `
        vec2 masonryEdgeBend(vec3 coords, float radius, out float nearest) {
            vec2 p = coords.xy;
            if (coords.z < 0.5) {
                vec2 margin = min(p, 1.0 - p);
                nearest = min(margin.x, margin.y);
                // Half of the angle between the side faces is 22.5 degrees;
                // at the top and bottom the normal can turn up to 45 degrees.
                return (smoothstep(0.0, radius, p) - smoothstep(0.0, radius, 1.0 - p)) * vec2(0.414214, 1.0);
            }
            nearest = 1.0;
            vec2 bend = vec2(0.0);
            ${capEdgeBends}
            return bend / max(1.0, length(bend));
        }
    ` + (topWeathering ? masonryTopWeatheringFunctions : ''))
    material.Fragment_Before_Lights(`
        vec3 dpX = dFdx(vPositionW), dpY = dFdy(vPositionW);
        float masonryPedestal = 1.0 - step(0.5, abs(vMasonryEdges.w - 1.0));
        float masonryPolished = step(6.5, vMasonryEdges.w);
        float masonryGrave = step(2.5, vMasonryEdges.w) * (1.0 - masonryPolished);
        float masonryGraveCover = step(4.5, vMasonryEdges.w);
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
            float headstone = 1.0 - step(0.5, abs(vMasonryEdges.w - 2.0));
            float relief = mix(0.84, 0.54, headstone);
            relief = mix(relief, 0.14, masonryPedestal);
            relief = mix(relief, mix(0.36, 0.20, masonryGraveCover), masonryGrave);
            relief *= 1.0 - masonryPolished;
            normalW = normalize(normalW + (tangent * bump.x + bitangent * bump.y) * scale * relief * detail);
        ` : ''}
        float masonryEdgeShade = 0.0;
        if (masonryPedestal < 0.5) {
            float radius = 0.18;
            float edge;
            vec2 bend = masonryEdgeBend(vMasonryEdges.xyz, radius, edge);
            float detail = 1.0 - smoothstep(radius * 0.5, radius * 1.5, fwidth(edge));
            masonryEdgeShade = (1.0 - smoothstep(0.0, 0.11, edge)) * detail;
            vec2 dx = dFdx(vMasonryEdges.xy), dy = dFdy(vMasonryEdges.xy);
            if (dot(bend, bend) > 0.0) {
                // Map directions on the face to world space after the stone's distortion and scaling.
                vec3 planeNormal = cross(dpX, dpY);
                vec3 screenX = cross(dpY, planeNormal), screenY = cross(planeNormal, dpX);
                vec3 alongU = screenX * dx.x + screenY * dy.x;
                vec3 alongV = screenX * dx.y + screenY * dy.y;
                vec3 tilt;
                if (vMasonryEdges.z < 0.5) {
                    tilt = normalize(alongU) * bend.x + normalize(alongV) * bend.y;
                } else {
                    tilt = normalize(alongU * bend.x + alongV * bend.y) * length(bend);
                }
                float bendStrength = mix(1.0, mix(0.65, 0.45, masonryGraveCover), masonryGrave);
                normalW = normalize(normalW + tilt * detail * bendStrength);
            }
        }
    `)
    const contact = existingContact ?? (weathering ? new StaticTerrainContact(material) : null)
    existingContact?.configureMaterial(material)
    if (topWeathering) {
        material.Fragment_Before_Lights((material.CustomParts.Fragment_Before_Lights ?? '') + masonryTopWeatheringFragment)
    }
    material.Fragment_Custom_MetallicRoughness(`
        ${material.CustomParts.Fragment_Custom_MetallicRoughness ?? ''}
        ${topWeathering ? 'metallicRoughness.g = mix(metallicRoughness.g, 0.29, masonryPuddle);' : ''}
        metallicRoughness.g = mix(metallicRoughness.g, 0.23, step(6.5, vMasonryEdges.w));
    `)
    material.Fragment_Before_Lights(`
        ${material.CustomParts.Fragment_Before_Lights ?? ''}
        surfaceAlbedo *= 1.0 - 0.08 * masonryEdgeShade;
    `)
    material.Fragment_Before_FinalColorComposition(`
        float topGlow = vMasonryTopGlow * smoothstep(0.75, 0.95, geometricNormalW.y);
        finalEmissive += vec3(0.55, 0.18, 0.045) * (vec3(0.035) + surfaceAlbedo) * topGlow;
        #ifdef SPECULARTERM
            finalSpecularScaled *= max(masonryPolished, ${topWeathering ? 'masonryPuddle' : '0.0'});
        #endif
    `)
    material.shadowDepthWrapper = new ShadowDepthWrapper(material, scene, {standalone: true})
    return {material, contact}
}

function createMasonryBatch(arched: boolean) {
    return {
        prefab: null as Prefab | null,
        contact: null as StaticTerrainContact | null,
        weathering: false,
        topWeathering: false,
        variants: [] as ReturnType<typeof createMaterial>[],
        topExposure: [] as number[],
        topBuffer: new Float32Array(0),

        initialize(scene: Scene, parent: TransformNode, weathering: boolean) {
            const mesh = new Mesh(arched ? 'archedMasonryBlocks' : 'masonryBlocks', scene)
            createGeometry(mesh, arched)
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

        add(matrix: Matrix, anchor: Vector3, seed: number, beige = false, roughness = 0, exposedTop = false, crown = false,
            appearance?: 'headstone' | 'graveFrame' | 'graveCover' | 'polished' | 'wellBase' | 'wellRim'
                | {row: number, glowTop: boolean}) {
            const polished = appearance === 'polished'
            const shape = polished ? 0 : roughness * 0.25 + (crown ? 0.5 : 0)
            const pedestal = typeof appearance === 'object' ? appearance : undefined
            const row = pedestal ? pedestal.row + PEDESTAL_ROW_OFFSET : stoneAtlasRow(beige, seed)
            const glow = pedestal?.glowTop ? TOP_GLOW_ROW_OFFSET : 0
            const headstone = appearance === 'headstone' ? HEADSTONE_ROW_OFFSET : 0
            const grave = appearance === 'graveCover' ? 2 * GRAVE_ROW_OFFSET : appearance === 'graveFrame' ? GRAVE_ROW_OFFSET : 0
            const uv = new Vector2(Math.floor(seed * 413) % 8 + shape,
                row + glow + headstone + grave + (polished ? POLISHED_ROW_OFFSET : 0) + seed * 0.5)
            const batch = this.prefab!
            const index = batch.matrices.length
            if (polished) {
                batch.matrices.push(matrix)
                batch.uvData.push(uv)
                return index
            }
            if (appearance === 'wellRim') {
                WorldRenderer.addTerrainContactBlock(matrix, uv, false, 0, appearance, undefined, this)
                return index
            }
            if (this.topWeathering && exposedTop) this.topExposure[index] = FULL_TOP_EXPOSURE
            WorldRenderer.addWeatheredBlock(matrix, uv, anchor, 0.82,
                {target: this, sampleAtCenter: true, highGroundWear: 'masonryGround', snowProfile: 'masonrySnow',
                    groundDamp: appearance === 'wellBase' ? 'wellBase' : undefined})
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
}

export const MasonryBatch = createMasonryBatch(false)
export const ArchedMasonryBatch = createMasonryBatch(true)
