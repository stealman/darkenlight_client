import { Matrix, Mesh, Scene, ShadowDepthWrapper, Texture, TransformNode, Vector2, Vector3, VertexData } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Materials } from '@/babylon/materials'
import { Prefab } from './worldRenderer'

// Each profile uses the same triangle layout. The lopsided shoulder and
// off-center crown give the stones different silhouettes as they rotate.
const OUTLINE = [[-0.20, -0.49], [0.27, -0.44], [0.48, -0.22], [0.44, 0.23],
    [0.18, 0.48], [-0.28, 0.42], [-0.48, 0.19], [-0.43, -0.24]]
const PROFILES = [
    { rim: [0.44, 0.61, 0.50, 0.35, 0.39, 0.51, 0.57, 0.40], inset: 0.66, crown: [-0.14, 0.94, -0.05] },
    { rim: [0.27, 0.32, 0.44, 0.39, 0.34, 0.28, 0.37, 0.30], inset: 0.85, crown: [0.15, 0.66, 0.10] },
    { rim: [0.54, 0.45, 0.38, 0.58, 0.67, 0.55, 0.39, 0.44], inset: 0.52, crown: [0.20, 1.00, -0.12] },
]

function createGeometry(mesh: Mesh) {
    const data = new VertexData()
    const uv: number[] = []
    for (const [variant, {rim, inset, crown}] of PROFILES.entries()) {
        const positions: number[] = []
        const normals: number[] = []
        const foot = OUTLINE.map(([x, z]) => new Vector3(x * 0.72, -0.08, z * 0.72))
        const edge = OUTLINE.map(([x, z], i) => new Vector3(x, rim[i], z))
        const shoulder = OUTLINE.map(([x, z], i) => new Vector3(
            x * inset + crown[0] * 0.35,
            rim[i] + (crown[1] - rim[i]) * (i % 2 === 0 ? 0.55 : 0.72),
            z * inset + crown[2] * 0.35,
        ))
        const top = new Vector3(crown[0], crown[1], crown[2])
        // Reverse the triangle winding for Babylon's left-handed meshes.
        const triangle = (a: Vector3, b: Vector3, c: Vector3) => {
            const normal = Vector3.Cross(b.subtract(a), c.subtract(a)).normalize()
            for (const p of [a, c, b]) {
                positions.push(p.x, p.y, p.z)
                normals.push(normal.x, normal.y, normal.z)
                if (variant !== 0) continue
                if (normal.y > 0.55) uv.push(p.x + 0.5, p.z + 0.5)
                else if (Math.abs(normal.x) > Math.abs(normal.z)) uv.push(p.z + 0.5, Math.max(0, p.y))
                else uv.push(p.x + 0.5, Math.max(0, p.y))
            }
        }
        for (let i = 0; i < OUTLINE.length; i++) {
            const next = (i + 1) % OUTLINE.length
            triangle(foot[i], edge[i], edge[next])
            triangle(foot[i], edge[next], foot[next])
            triangle(edge[i], shoulder[i], shoulder[next])
            triangle(edge[i], shoulder[next], edge[next])
            triangle(shoulder[i], top, shoulder[next])
        }
        if (variant === 0) {
            data.positions = positions
            data.normals = normals
            data.uvs = uv
            data.indices = Array.from({length: positions.length / 3}, (_, i) => i)
            data.applyToMesh(mesh)
        } else {
            mesh.setVerticesData('stonePosition' + variant, positions, false, 3)
            mesh.setVerticesData('stoneNormal' + variant, normals, false, 3)
        }
    }
}

function createMaterial(scene: Scene) {
    const block = Materials.blockMat1!
    const terrain = Materials.terrainMaterial!
    const material = new PBRCustomMaterial('stoneAtlas', scene)
    material.albedoTexture = block.albedoTexture
    material.bumpTexture = block.bumpTexture
    material.emissiveTexture = block.emissiveTexture
    material.emissiveColor = block.emissiveColor.clone()
    material.metallic = block.metallic
    material.roughness = block.roughness
    material.directIntensity = block.directIntensity
    material.environmentIntensity = block.environmentIntensity
    material.usePhysicalLightFalloff = block.usePhysicalLightFalloff
    material.maxSimultaneousLights = block.maxSimultaneousLights
    material.AddUniform('stoneTerrainColor', 'sampler2D', terrain.albedoTexture)
    material.AddUniform('stoneTerrainEmissive', 'sampler2D', terrain.emissiveTexture)
    for (const attribute of ['uvc', 'stonePosition1', 'stonePosition2', 'stoneNormal1', 'stoneNormal2']) {
        material.AddAttribute(attribute)
    }
    const varyings = 'varying vec2 vStoneTerrainUV; varying float vStoneAtlas;'
    material.Vertex_Definitions(`
        attribute vec2 uvc;
        attribute vec3 stonePosition1, stonePosition2, stoneNormal1, stoneNormal2;
        ${varyings}
    `)
    material.Vertex_Before_PositionUpdated(`
        float stoneShape = floor(uvc.x / 16.0);
        positionUpdated = stoneShape < 0.5 ? position : (stoneShape < 1.5 ? stonePosition1 : stonePosition2);
        vStoneAtlas = floor(uvc.y / 16.0);
        vec2 stoneCell = mod(uvc, 16.0);
        // Keep the terrain sample within the atlas patch used by tile tops.
        vStoneTerrainUV = (stoneCell + vec2(0.25, 0.3333333) + mix(vec2(0.05), vec2(0.95), uv) * vec2(0.25, 0.3333333))
            * vec2(${(terrain.albedoTexture as Texture).uScale}, ${(terrain.albedoTexture as Texture).vScale});
        uvUpdated = stoneCell + mix(vec2(0.06), vec2(0.94), uv) *
            (vStoneAtlas > 1.5 ? 0.5 : 1.0) + (vStoneAtlas > 1.5 ? 0.25 : 0.0);
    `)
    material.Vertex_Before_NormalUpdated(`
        #ifdef NORMAL
        normalUpdated = stoneShape < 0.5 ? normal : (stoneShape < 1.5 ? stoneNormal1 : stoneNormal2);
        #endif
    `)
    material.Fragment_Definitions(varyings)
    material.Fragment_Before_Lights(`
        if (vStoneAtlas > 0.5 && vStoneAtlas < 1.5) {
            surfaceAlbedo = toLinearSpace(texture2D(stoneTerrainColor, vStoneTerrainUV).rgb);
            normalW = geometricNormalW;
        }
    `)
    material.Fragment_Before_FinalColorComposition(`
        if (vStoneAtlas > 0.5 && vStoneAtlas < 1.5) {
            finalEmissive = vEmissiveColor * toLinearSpace(texture2D(stoneTerrainEmissive, vStoneTerrainUV).rgb) * vLightingIntensity.y;
        }
    `)
    material.shadowDepthWrapper = new ShadowDepthWrapper(material, scene, { standalone: true })
    return material
}

export const StoneBatch = {
    prefab: null as Prefab | null,

    initialize(scene: Scene, parent: TransformNode) {
        const mesh = new Mesh('stoneFragments', scene)
        createGeometry(mesh)
        mesh.material = createMaterial(scene)
        mesh.parent = parent
        mesh.isPickable = false
        mesh.alwaysSelectAsActiveMesh = true
        mesh.receiveShadows = true
        mesh.setEnabled(false)
        this.prefab = new Prefab(mesh)
    },

    add(matrix: Matrix, shape: number, uv: Vector2, atlas: 'block' | 'terrain' | 'smallBlock') {
        const batch = this.prefab!
        const atlasIndex = atlas === 'terrain' ? 1 : atlas === 'smallBlock' ? 2 : 0
        batch.matrices.push(matrix)
        // Atlas cells occupy less than 16 units per axis. Pack the selectors
        // in multiples of 16 so the existing matrix and uvc buffers can be reused.
        batch.uvData.push(new Vector2(uv.x + 16 * shape, uv.y + 16 * atlasIndex))
    },

    flush() {
        const batch = this.prefab!
        batch.setThinInstanceBuffers()
        batch.mesh.setEnabled(batch.matrices.length > 0)
    },
}

export const STONE_SHAPE_COUNT = PROFILES.length
