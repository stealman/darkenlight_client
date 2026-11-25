import { Matrix, Mesh, Vector2, Vector4, VertexData } from '@babylonjs/core'
import type { Camera, Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { FoliageManager, GRASS_ROOT_INSET } from '@/babylon/world/foliageManager'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'
import { createGrassContactShade, GRASS_CONTACT_TRIANGLES } from './grassContactShade'

export type GrassTuft = {matrix: Matrix, tone: 0 | 1 | 2, snowed?: boolean}
export type GrassDetail = 'high' | 'medium' | 'low'
export const GAME_GRASS_ENABLED = true // Toggle for the FPS comparison.
export const GRASS_CONTACT_LIMIT = 4
export const GRASS_MAX_BEND = 0.45
const GRASS_BEND_IN_SECONDS = 0.079
const GRASS_RELEASE_SECONDS = 0.245
export const GRASS_TRAIL_SECONDS = GRASS_BEND_IN_SECONDS + GRASS_RELEASE_SECONDS

const BUDGETS = {high: 25_000, medium: 15_000, low: 5_000}
const DISTANCE_DETAIL = {high: 0, medium: 1, low: 2}
const BLADE_ROWS = [[0, 0.36, 0.72], [0, 0.36, 0.72], [0, 0.56]] as const
const BLADES_PER_TUFT = 6
const TALLEST_BLADE_SCALE = 1.24
const SHAPES = [
    {height: 1, width: 0.105, bend: 0.25, spread: 0.22},
    {height: 0.81, width: 0.125, bend: 0.42, spread: 0.26},
    {height: 1.07, width: 0.079, bend: 0.34, spread: 0.29},
]

function createGrassMesh(scene: Scene, parent: TransformNode, material: PBRCustomMaterial, variant: number, lod: number,
    roots?: Vector2[]) {
    const shape = SHAPES[variant]
    const mesh = new Mesh(`grass-${variant}-${lod}`, scene, parent)
    const positions: number[] = [], indices: number[] = [], normals: number[] = [], bladeUV: number[] = []
    const hasRidge = lod === 0
    const columns = hasRidge ? 3 : 2
    const rows = BLADE_ROWS[lod]
    const heightRolls = Array.from({length: BLADES_PER_TUFT}, (_, blade) => FoliageManager.roll(1700 + variant, blade, 3))
    const tallestBlade = heightRolls.indexOf(Math.max(...heightRolls))
    for (let blade = 0; blade < heightRolls.length; blade++) {
        const roll = (salt: number) => FoliageManager.roll(1700 + variant, blade, salt)
        const angle = (blade + roll(1) * 0.75) * Math.PI / 3
        const dx = Math.cos(angle), dz = Math.sin(angle)
        const root = shape.spread * (0.25 + 0.75 * roll(2))
        roots?.push(new Vector2(dx * root, dz * root))
        const baseHeight = shape.height * (0.57 + 0.43 * heightRolls[blade])
        const height = blade === tallestBlade ? baseHeight * TALLEST_BLADE_SCALE : baseHeight
        const width = shape.width * (0.65 + 0.7 * roll(4))
        const bend = shape.bend * (0.48 + 0.52 * roll(5))
        const start = positions.length / 3
        const addVertex = (t: number, u: number, ridge: number) => {
            const along = root + bend * t ** 1.75 + ridge
            const across = (u - 0.5) * width * (0.65 + 1.5 * t) * (1 - t) + (roll(6) - 0.5) * t * 0.16
            positions.push(dx * along - dz * across, height * t, dz * along + dx * across)
            bladeUV.push(u, t, dx * root, dz * root)
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
    mesh.setVerticesData('grassBladeUV', bladeUV, false, 4)
    mesh.material = material
    mesh.receiveShadows = true
    mesh.isPickable = false
    mesh.setEnabled(false)
    return {mesh, triangles: indices.length / 3, matrices: [] as Matrix[], styles: [] as Vector2[]}
}

export function createGrassRenderer(scene: Scene, parent: TransformNode, contactCount = 1, interactionRadius = 0, rootShade = false) {
    const material = new PBRCustomMaterial('grassMaterial', scene)
    material.backFaceCulling = false
    material.twoSidedLighting = true
    material.metallic = 0
    material.roughness = 0.89
    // Match terrain attenuation for player and campfire spotlights.
    material.usePhysicalLightFalloff = false
    const usesTimedContacts = interactionRadius > 0
    const contacts = Array.from({length: contactCount}, (_, index) => {
        const start = new Vector4(), end = new Vector4()
        material.AddUniform(`grassContactStart${index}`, 'vec4', start)
        material.AddUniform(`grassContactEnd${index}`, 'vec4', end)
        const previousStart = usesTimedContacts ? new Vector4() : undefined
        if (previousStart) material.AddUniform(`grassPreviousStart${index}`, 'vec4', previousStart)
        return {start, end, previousStart}
    })
    const interactionArea = new Vector4(0, 0, Math.max(0, interactionRadius - 1.5) ** 2, interactionRadius ** 2)
    const interactionClock = Vector2.Zero()
    if (usesTimedContacts) {
        material.AddUniform('grassInteractionArea', 'vec4', interactionArea)
        material.AddUniform('grassInteractionClock', 'vec2', interactionClock)
    }
    material.AddAttribute('grassBladeUV').AddAttribute('uvc')
    material.Vertex_Definitions(`
        attribute vec4 grassBladeUV;
        attribute vec2 uvc;
        varying vec4 vGrassStyle;
        varying float vGrassSnowRim;
        ${contacts.length ? `vec3 grassContact(vec3 root, vec4 start, vec4 end) {
            if (end.w <= 0.0) return vec3(0.0);
            ${usesTimedContacts ? `float age = grassInteractionClock.x - start.w;
            if (age <= 0.0 || age >= ${GRASS_TRAIL_SECONDS.toFixed(3)}) return vec3(0.0);
            float attack = smoothstep(0.0, ${GRASS_BEND_IN_SECONDS}, age);
            float release = 1.0 - smoothstep(${GRASS_BEND_IN_SECONDS}, ${GRASS_TRAIL_SECONDS.toFixed(3)}, age);
            float strength = end.w * attack * release;
            float radiusSq = 0.49;` : `float strength = end.w;
            float radiusSq = start.w * start.w;`}
            vec2 travel = end.xz - start.xz;
            float travelSq = dot(travel, travel);
            float alongTrail = travelSq > 0.00001
                ? clamp(dot(root.xz - start.xz, travel) / travelSq, 0.0, 1.0) : 1.0;
            vec3 foot = mix(start.xyz, end.xyz, alongTrail);
            vec2 away = root.xz - foot.xz;
            float distanceSq = dot(away, away);
            if (distanceSq >= radiusSq || abs(root.y - foot.y) >= 0.65) return vec3(0.0);
            float influence = (1.0 - smoothstep(0.0, radiusSq, distanceSq))
                * ${usesTimedContacts ? 'mix(0.65, 1.0, alongTrail)' : 'smoothstep(0.0, 1.0, alongTrail)'}
                * (1.0 - smoothstep(0.20, 0.65, abs(root.y - foot.y)));
            float bend = strength * influence;
            return vec3(away * inversesqrt(max(distanceSq, 0.0025)) * bend, bend);
        }` : ''}
        ${interactionRadius > 0 ? `float grassRangeWeight(vec2 root) {
            vec2 offset = root - grassInteractionArea.xy;
            return 1.0 - smoothstep(grassInteractionArea.z, grassInteractionArea.w, dot(offset, offset));
        }
        vec3 grassMovementContact(vec3 root, vec4 previousStart, vec4 start, vec4 end) {
            vec3 current = grassContact(root, start, end);
            vec3 previous = grassContact(root, previousStart, vec4(start.xyz, end.w));
            // Cross over between segments without flattening the same blade twice.
            vec3 combined = current + previous;
            return combined * (max(current.z, previous.z) / max(0.0001, combined.z));
        }` : ''}
    `)
    material.Vertex_MainBegin(`
        vGrassStyle = vec4(grassBladeUV.xy, uvc);
        vGrassSnowRim = uvc.x > 3.5 ? 0.14 + 0.10 * fract(dot(grassBladeUV.zw, vec2(7.7, 13.1)) + uvc.y) : 0.0;
    `)
    if (contacts.length) material.Vertex_After_WorldPosComputed(`
        if (grassBladeUV.y > 0.0${usesTimedContacts ? ' && grassInteractionClock.x < grassInteractionClock.y' : ''}) {
            vec3 rootW = (finalWorld * vec4(grassBladeUV.z, 0.0, grassBladeUV.w, 1.0)).xyz;
            float rangeWeight = ${interactionRadius > 0 ? 'grassRangeWeight(rootW.xz)' : '1.0'};
            if (rangeWeight > 0.0) {
                vec3 displacement = vec3(0.0);
                ${contacts.map((_, index) => usesTimedContacts
                    ? `displacement += grassMovementContact(rootW, grassPreviousStart${index}, grassContactStart${index}, grassContactEnd${index});`
                    : `displacement += grassContact(rootW, grassContactStart${index}, grassContactEnd${index});`).join('\n                ')}
                float h = grassBladeUV.y;
                displacement *= rangeWeight * h * h * min(1.0, ${GRASS_MAX_BEND} / max(displacement.z, 0.0001));
                worldPos.xz += displacement.xy;
                worldPos.y -= min(worldPos.y - rootW.y, displacement.z * 0.28);
                vPositionW = worldPos.xyz;
                #ifdef NORMAL
                    vNormalW = normalize(vec3(vNormalW.x,
                        vNormalW.y - dot(vNormalW.xz, displacement.xy) * 2.0, vNormalW.z));
                #endif
            }
        }
    `)
    material.Fragment_Definitions('varying vec4 vGrassStyle; varying float vGrassSnowRim;')
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
        if (tone > 3.5 && bladeHeight < 0.30) {
            // Use blade-local coordinates so the coating bends with the blade.
            float rim = vGrassSnowRim + 0.022 * sin(vGrassStyle.x * 15.0 + vGrassSnowRim * 33.0);
            float cover = (1.0 - smoothstep(rim - 0.055, rim + 0.035, bladeHeight)) * 0.88;
            vec3 snow = vec3(0.66, 0.72, 0.80) * (0.96 + 0.04 * fiber * contrast);
            surfaceAlbedo = mix(surfaceAlbedo, snow, cover);
        }
        normalW = normalize(normalW + vec3(0.0, 0.45, 0.0));
    `)

    const roots = rootShade ? SHAPES.map(() => [] as Vector2[]) : undefined
    const batches = SHAPES.map((_, variant) => BLADE_ROWS.map((_, lod) =>
        createGrassMesh(scene, parent, material, variant, lod, lod === 0 ? roots?.[variant] : undefined)))
    const allBatches = batches.flat()
    const shade = roots ? createGrassContactShade(scene, parent, roots, GRASS_ROOT_INSET + 0.006) : undefined
    let footprintRadius = shade ? Math.SQRT1_2 : 0
    let bladeHeight = 0
    for (const {mesh} of allBatches) {
        const {minimum, maximum} = mesh.getBoundingInfo().boundingBox
        footprintRadius = Math.max(footprintRadius, Math.hypot(
            Math.max(-minimum.x, maximum.x), Math.max(-minimum.z, maximum.z),
        ))
        bladeHeight = Math.max(bladeHeight, maximum.y)
    }
    const shadeMatrices: Matrix[] = [], shadeStyles: Vector2[] = []
    const shadeStylesByVariant = shade ? SHAPES.map((_, variant) => [new Vector2(variant, 0.155), new Vector2(variant, 0.19)]) : undefined
    type Candidate = {
        matrix: Matrix, style: Vector2, snowStyles?: {high: Vector2, medium: Vector2}, shadeStyle?: Vector2,
        variant: number, rank: number, distance: number, priority: number, lod: number
    }
    const candidateByTuft = new WeakMap<GrassTuft, Candidate>()
    const parentToView = Matrix.Identity()
    const eligible: Candidate[] = []
    let candidates: Candidate[] = []
    return {
        meshes: allBatches.map(batch => batch.mesh),
        interactionRadius,
        footprintRadius,
        bladeHeight,
        setInteractionCenter(center: Vector3) {
            interactionArea.x = center.x
            interactionArea.y = center.z
        },
        setInteractionClock(seconds: number, expiresAt?: number) {
            interactionClock.x = seconds
            if (expiresAt !== undefined) interactionClock.y = expiresAt
        },
        setMovementContact(index: number, start: Vector3, end: Vector3, sampledAt: number,
            previousStart: Vector3, previousSampledAt?: number) {
            contacts[index].start.set(start.x, start.y, start.z, sampledAt)
            contacts[index].end.set(end.x, end.y, end.z, 0.3)
            contacts[index].previousStart!.set(previousStart.x, previousStart.y, previousStart.z, previousSampledAt ?? -1)
        },
        setInteraction(index: number, start: Vector3, end: Vector3, radius: number, strength: number) {
            contacts[index].start.set(start.x, start.y, start.z, radius)
            contacts[index].end.set(end.x, end.y, end.z, strength)
        },
        clearInteractions(from = 0) {
            for (let index = from; index < contacts.length; index++) contacts[index].end.w = 0
        },
        dispose() {
            shade?.dispose()
            material.dispose()
        },
        setTufts(tufts: GrassTuft[]) {
            candidates = tufts.map(tuft => {
                const cached = candidateByTuft.get(tuft)
                if (cached) return cached
                const {matrix, tone, snowed} = tuft
                const x = Math.round(matrix.m[12] * 1024), z = Math.round(matrix.m[14] * 1024)
                const variant = FoliageManager.hashTile(x, z, 12201) % SHAPES.length
                const colorVariation = FoliageManager.roll(x, z, 12200)
                const candidate = {
                    matrix, style: new Vector2(tone, colorVariation),
                    snowStyles: snowed ? {high: new Vector2(4, colorVariation), medium: new Vector2(3, colorVariation)} : undefined,
                    shadeStyle: shadeStylesByVariant?.[variant][snowed ? 1 : 0],
                    variant,
                    rank: FoliageManager.roll(x, z, 12202), distance: 0, priority: 0, lod: 0,
                }
                candidateByTuft.set(tuft, candidate)
                return candidate
            })
        },
        render(centerX: number, centerZ: number, detail: GrassDetail, density: number, camera?: Camera | null) {
            for (const batch of allBatches) batch.matrices.length = batch.styles.length = 0
            shadeMatrices.length = shadeStyles.length = 0
            eligible.length = 0
            const budget = BUDGETS[detail]
            const minimumLod = DISTANCE_DETAIL[detail]
            const showShade = !!shade && detail !== 'low'
            const shadeTriangles = showShade ? GRASS_CONTACT_TRIANGLES : 0
            if (camera) parent.computeWorldMatrix().multiplyToRef(camera.getViewMatrix(), parentToView)
            const view = parentToView.m
            const depthSign = scene.useRightHandedSystem ? -1 : 1
            let requestedTriangles = 0
            for (const tuft of candidates) {
                if (tuft.rank >= density) continue
                const m = tuft.matrix.m
                const dx = m[12] - centerX, dz = m[14] - centerZ
                tuft.distance = dx * dx + dz * dz
                // Perspective size follows depth along the view axis, including height above the player.
                const depth = camera ? depthSign * (m[12] * view[2] + m[13] * view[6] + m[14] * view[10] + view[14]) : tuft.distance
                if (depth < 0) continue
                tuft.priority = depth
                tuft.lod = Math.max(minimumLod, tuft.distance < 25 ? 0 : tuft.distance < 100 ? 1 : 2)
                requestedTriangles += batches[tuft.variant][tuft.lod].triangles + shadeTriangles
                eligible.push(tuft)
            }
            if (requestedTriangles > budget) {
                eligible.sort((a, b) => a.priority - b.priority || a.distance - b.distance || a.rank - b.rank)
            }
            let triangles = 0, count = 0
            for (const tuft of eligible) {
                const variants = batches[tuft.variant]
                const available = budget - triangles - shadeTriangles
                const batch = variants[tuft.lod].triangles <= available ? variants[tuft.lod] : variants[2]
                if (batch.triangles > available) break
                batch.matrices.push(tuft.matrix)
                batch.styles.push(detail === 'low' ? tuft.style : tuft.snowStyles?.[detail] ?? tuft.style)
                if (showShade && tuft.shadeStyle) {
                    shadeMatrices.push(tuft.matrix)
                    shadeStyles.push(tuft.shadeStyle)
                }
                triangles += batch.triangles + shadeTriangles
                count++
            }
            for (const batch of allBatches) {
                updateWorldInstanceBuffers(batch.mesh, batch.matrices, batch.styles)
                batch.mesh.setEnabled(batch.matrices.length > 0)
            }
            shade?.render(shadeMatrices, shadeStyles)
            return {triangles, count, blades: count * BLADES_PER_TUFT, budget}
        },
    }
}
