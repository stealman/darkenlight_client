import { ShadowDepthWrapper } from '@babylonjs/core'
import type { Matrix, Scene, TransformNode, Vector2 } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials } from '@/babylon/materials'
import { Prefab, WorldRenderer } from './worldRenderer'
import { configureStaticBlockDamage } from './statics/staticBlockDamage'
import { StaticTerrainContact } from './statics/staticTerrainContact'
import type { DampContact } from './statics/staticTerrainContact'

// Each pair contains the -X and +X corners at the same local Z.
export type BlockSection = readonly [Vector2, Vector2, Vector2, Vector2]
export type TaperedBlockShape = {foot: BlockSection, top: BlockSection}
const CORNERS = ['blockFootNear', 'blockFootFar', 'blockTopNear', 'blockTopFar'] as const

function createMaterial(scene: Scene) {
    const material = Materials.createBlockMat1(scene)
    material.maxSimultaneousLights = Materials.blockMat1!.maxSimultaneousLights
    const parts = material.CustomParts
    for (const attribute of CORNERS) material.AddAttribute(attribute)
    material.Vertex_Definitions(`
        ${parts.Vertex_Definitions ?? ''}
        attribute vec4 ${CORNERS.join(', ')};
        vec2 blockCorner(vec4 nearPair, vec4 farPair, vec2 side) {
            vec4 pair = mix(nearPair, farPair, step(0.0, side.y));
            return mix(pair.xy, pair.zw, step(0.0, side.x));
        }
    `)
    material.Vertex_Before_PositionUpdated(`
        ${parts.Vertex_Before_PositionUpdated ?? ''}
        float upper = step(0.0, position.y);
        positionUpdated.xz = blockCorner(mix(blockFootNear, blockTopNear, upper),
            mix(blockFootFar, blockTopFar, upper), position.xz);
    `)
    // Average the two triangles of a side so slight warps do not expose the diagonal in the lighting.
    material.Vertex_Before_NormalUpdated(`
        ${parts.Vertex_Before_NormalUpdated ?? ''}
        #ifdef NORMAL
            if (abs(normal.y) < 0.5) {
                vec2 start = abs(normal.x) > 0.5 ? vec2(normal.x, -1.0) : vec2(-1.0, normal.z);
                vec2 end = abs(normal.x) > 0.5 ? vec2(normal.x, 1.0) : vec2(1.0, normal.z);
                vec2 footA = blockCorner(blockFootNear, blockFootFar, start);
                vec2 footB = blockCorner(blockFootNear, blockFootFar, end);
                vec2 topA = blockCorner(blockTopNear, blockTopFar, start);
                vec2 topB = blockCorner(blockTopNear, blockTopFar, end);
                vec2 across = 0.5 * (footB - footA + topB - topA);
                vec2 rise = 0.5 * (topA + topB - footA - footB);
                normalUpdated = cross(vec3(across.x, 0.0, across.y), vec3(rise.x, 1.0, rise.y)) * (normal.z - normal.x);
            }
        #endif
    `)
    const contact = new StaticTerrainContact(material)
    configureStaticBlockDamage(material)
    material.shadowDepthWrapper = new ShadowDepthWrapper(material, scene, { standalone: true })
    return {material, contact}
}

export const TaperedBlockBatch = {
    prefab: null as Prefab | null,
    contact: null as StaticTerrainContact | null,
    variant: null as ReturnType<typeof createMaterial> | null,
    shapes: [] as TaperedBlockShape[],
    buffers: CORNERS.map(() => new Float32Array(0)),

    initialize(scene: Scene, parent: TransformNode, useContact: boolean) {
        const mesh = Builder.createWrappedBlock(scene, parent)
        mesh.name = 'taperedStaticBlocks'
        mesh.receiveShadows = true
        mesh.setEnabled(false)
        this.prefab = new Prefab(mesh)
        this.variant = null
        this.buffers = CORNERS.map(() => new Float32Array(0))
        this.clear()
        this.setTerrainContactEnabled(useContact)
    },

    setTerrainContactEnabled(enabled: boolean) {
        const mesh = this.prefab!.mesh
        const variant = enabled ? (this.variant ??= createMaterial(mesh.getScene())) : null
        mesh.material = variant?.material ?? Materials.blockMat1!
        this.contact = variant?.contact ?? null
    },

    add(matrix: Matrix, uv: Vector2, shape: TaperedBlockShape | null, damp?: DampContact) {
        if (!shape) {
            WorldRenderer.addTerrainContactBlock(matrix, uv, false, undefined, damp)
            return
        }
        WorldRenderer.addTerrainContactBlock(matrix, uv, false, undefined, damp, undefined, this)
        this.shapes.push(shape)
    },

    clear() {
        this.prefab?.clearMatrices()
        this.contact?.clear()
        this.shapes.length = 0
    },

    flush() {
        const batch = this.prefab
        if (!batch) return
        const count = this.shapes.length
        batch.setThinInstanceBuffers()
        if (count) {
            for (const [attribute, name] of CORNERS.entries()) {
                const grow = this.buffers[attribute].length < count * 4
                if (grow) this.buffers[attribute] = new Float32Array(batch.matrixBuffer.length / 4)
                const buffer = this.buffers[attribute]
                const first = (attribute % 2) * 2
                for (const [index, {foot, top}] of this.shapes.entries()) {
                    const section = attribute < 2 ? foot : top
                    buffer[index * 4] = section[first].x
                    buffer[index * 4 + 1] = section[first].y
                    buffer[index * 4 + 2] = section[first + 1].x
                    buffer[index * 4 + 3] = section[first + 1].y
                }
                if (grow) batch.mesh.thinInstanceSetBuffer(name, buffer, 4, false)
                else batch.mesh.thinInstanceBufferUpdated(name)
            }
            this.contact?.upload(batch.mesh, count)
        }
        batch.mesh.setEnabled(count > 0)
    },
}
