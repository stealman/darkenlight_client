import { Mesh, Vector2, VertexData } from '@babylonjs/core'
import type { Matrix, Scene, TransformNode } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { FoliageManager } from '@/babylon/world/foliageManager'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'

export type PreviewGrassTuft = {matrix: Matrix, tone: 0 | 1 | 2 | 3}
export type PreviewGrassDetail = 'high' | 'medium' | 'low'

const BUDGETS = {high: 25_000, medium: 15_000, low: 5_000}
const DISTANCE_DETAIL = {high: 0, medium: 1, low: 2}
const BLADE_ROWS = [[0, 0.36, 0.72], [0, 0.36, 0.72], [0, 0.56]] as const
const SHAPES = [
    {height: 1, width: 0.105, bend: 0.25, spread: 0.22},
    {height: 0.81, width: 0.125, bend: 0.42, spread: 0.26},
    {height: 1.07, width: 0.079, bend: 0.34, spread: 0.29},
]

function createGrassMesh(scene: Scene, parent: TransformNode, material: PBRCustomMaterial, variant: number, lod: number) {
    const shape = SHAPES[variant]
    const mesh = new Mesh(`adminUtilsGrass-${variant}-${lod}`, scene, parent)
    const positions: number[] = [], indices: number[] = [], normals: number[] = [], bladeUV: number[] = []
    const hasRidge = lod === 0
    const columns = hasRidge ? 3 : 2
    const rows = BLADE_ROWS[lod]
    for (let blade = 0; blade < 6; blade++) {
        const roll = (salt: number) => FoliageManager.roll(1700 + variant, blade, salt)
        const angle = (blade + roll(1) * 0.75) * Math.PI / 3
        const dx = Math.cos(angle), dz = Math.sin(angle)
        const root = shape.spread * (0.25 + 0.75 * roll(2))
        const height = shape.height * (0.57 + 0.43 * roll(3))
        const width = shape.width * (0.65 + 0.7 * roll(4))
        const bend = shape.bend * (0.48 + 0.52 * roll(5))
        const start = positions.length / 3
        const addVertex = (t: number, u: number, ridge: number) => {
            const along = root + bend * t ** 1.75 + ridge
            const across = (u - 0.5) * width * (0.65 + 1.5 * t) * (1 - t) + (roll(6) - 0.5) * t * 0.16
            positions.push(dx * along - dz * across, height * t, dz * along + dx * across)
            bladeUV.push(u, t)
        }
        for (const t of rows) {
            addVertex(t, 0, 0)
            if (hasRidge) addVertex(t, 0.5, width * (1 - t) * 0.16)
            addVertex(t, 1, 0)
        }
        addVertex(1, 0.5, 0)
        for (let row = 0; row < rows.length - 1; row++) {
            for (let column = 0; column < columns - 1; column++) {
                const base = start + row * columns + column
                indices.push(base, base + 1, base + columns, base + 1, base + columns + 1, base + columns)
            }
        }
        const last = start + (rows.length - 1) * columns
        for (let column = 0; column < columns - 1; column++) {
            indices.push(last + column, last + column + 1, last + columns)
        }
    }
    VertexData.ComputeNormals(positions, indices, normals)
    const data = new VertexData()
    data.positions = positions
    data.indices = indices
    data.normals = normals
    data.applyToMesh(mesh)
    mesh.setVerticesData('grassBladeUV', bladeUV, false, 2)
    mesh.material = material
    mesh.receiveShadows = true
    mesh.isPickable = false
    mesh.setEnabled(false)
    return {mesh, triangles: indices.length / 3, matrices: [] as Matrix[], styles: [] as Vector2[]}
}

export function createTerrainPreviewGrass(scene: Scene, parent: TransformNode) {
    const material = new PBRCustomMaterial('adminUtilsGrassMaterial', scene)
    material.backFaceCulling = false
    material.twoSidedLighting = true
    material.metallic = 0
    material.roughness = 0.89
    material.AddAttribute('grassBladeUV').AddAttribute('uvc')
    material.Vertex_Definitions(`
        attribute vec2 grassBladeUV;
        attribute vec2 uvc;
        varying vec4 vGrassStyle;
    `)
    material.Vertex_MainBegin('vGrassStyle = vec4(grassBladeUV, uvc);')
    material.Fragment_Definitions('varying vec4 vGrassStyle;')
    material.Fragment_Before_Lights(`
        float bladeHeight = vGrassStyle.y;
        float tone = vGrassStyle.z;
        vec3 root = vec3(0.045, 0.082, 0.019);
        vec3 tip = vec3(0.28, 0.43, 0.095);
        if (tone > 0.5) {
            root = vec3(0.070, 0.082, 0.029);
            tip = vec3(0.32, 0.37, 0.13);
        }
        if (tone > 1.5) {
            root = vec3(0.095, 0.064, 0.022);
            tip = vec3(0.43, 0.35, 0.135);
        }
        if (tone > 2.5) {
            root = vec3(0.21, 0.19, 0.13);
            tip = vec3(0.46, 0.39, 0.22);
        }
        float fiber = sin(vGrassStyle.x * 28.0 + sin(bladeHeight * 8.0) + vGrassStyle.w * 6.0);
        float vein = 1.0 - smoothstep(0.0, 0.15, abs(vGrassStyle.x - 0.5));
        float contrast = 1.0 - smoothstep(0.2, 0.95, fwidth(vGrassStyle.x) * 9.0);
        surfaceAlbedo *= mix(root, tip, smoothstep(0.0, 1.0, bladeHeight)) *
            (0.85 + vGrassStyle.w * 0.30 + contrast * (0.05 * fiber + 0.09 * vein));
        normalW = normalize(normalW + vec3(0.0, 0.45, 0.0));
    `)

    const batches = SHAPES.map((_, variant) => BLADE_ROWS.map((_, lod) => createGrassMesh(scene, parent, material, variant, lod)))
    const allBatches = batches.flat()
    let candidates: {matrix: Matrix, style: Vector2, variant: number, rank: number, distance: number}[] = []
    return {
        setTufts(tufts: PreviewGrassTuft[]) {
            candidates = tufts.map(({matrix, tone}) => {
                const x = Math.round(matrix.m[12] * 1024), z = Math.round(matrix.m[14] * 1024)
                return {
                    matrix, style: new Vector2(tone, FoliageManager.roll(x, z, 12200)),
                    variant: FoliageManager.hashTile(x, z, 12201) % SHAPES.length,
                    rank: FoliageManager.roll(x, z, 12202), distance: 0,
                }
            })
        },
        render(centerX: number, centerZ: number, detail: PreviewGrassDetail, density: number) {
            for (const batch of allBatches) batch.matrices.length = batch.styles.length = 0
            for (const tuft of candidates) {
                const dx = tuft.matrix.m[12] - centerX, dz = tuft.matrix.m[14] - centerZ
                tuft.distance = dx * dx + dz * dz
            }
            candidates.sort((a, b) => a.distance - b.distance || a.rank - b.rank)
            let triangles = 0, count = 0
            const budget = BUDGETS[detail]
            for (const tuft of candidates) {
                if (tuft.rank >= density) continue
                const lod = Math.max(DISTANCE_DETAIL[detail], tuft.distance < 25 ? 0 : tuft.distance < 100 ? 1 : 2)
                const variants = batches[tuft.variant]
                const batch = variants[lod].triangles <= budget - triangles ? variants[lod] : variants[2]
                if (batch.triangles > budget - triangles) break
                batch.matrices.push(tuft.matrix)
                batch.styles.push(tuft.style)
                triangles += batch.triangles
                count++
            }
            for (const batch of allBatches) {
                updateWorldInstanceBuffers(batch.mesh, batch.matrices, batch.styles)
                batch.mesh.setEnabled(batch.matrices.length > 0)
            }
            return {triangles, count, budget}
        },
    }
}
