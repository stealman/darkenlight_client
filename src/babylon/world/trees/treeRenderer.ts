import { Camera, Matrix, Mesh, Quaternion, Scene, TransformNode, Vector3, Vector4 } from '@babylonjs/core'
import type { Observer } from '@babylonjs/core'
import { createTreeGeometry } from './treeGeometry'
import type { TreePiece, TreeVariant } from './treeGenerator'
import { createTreeMaterial } from './treeMaterial'
import { TREE_SHAPE_FACES } from './treeSpecies'
import type { TreeDetail, TreeShape, TreeSurfaceDetail } from './treeSpecies'

export interface TreePlacement {
    id: number
    variant: TreeVariant
    position: Vector3
    size: number
    snow: number
    detail: TreeDetail
    shadowOnly?: boolean
    opacity?: number
}

interface Span { start: number, end: number }
const BUFFERS = {matrix: 16, treeStyle: 4, treeShape: 4, treeJointA: 4, treeJointB: 4, treeOpacity: 1} as const
type BufferName = keyof typeof BUFFERS
const bufferNames = Object.keys(BUFFERS) as BufferName[]

class TreeBatch {
    readonly spans = new Map<number, Span>()
    count = 0
    private padding = 0
    private capacity = 0
    private buffers = {matrix: new Float32Array(), treeStyle: new Float32Array(),
        treeShape: new Float32Array(), treeJointA: new Float32Array(), treeJointB: new Float32Array(), treeOpacity: new Float32Array()}

    constructor(readonly mesh: Mesh, readonly shape: TreeShape, readonly shadowOnly: boolean) {}

    start(count: number) {
        this.spans.clear()
        this.count = 0
        this.padding = 0
        if (count <= this.capacity) return
        this.capacity = Math.max(32, count, this.capacity * 2)
        for (const name of bufferNames) {
            const stride = BUFFERS[name]
            const buffer = this.buffers[name] = new Float32Array(this.capacity * stride)
            this.mesh.thinInstanceSetBuffer(name, buffer, stride, false)
        }
    }

    add(placement: TreePlacement, parts: readonly TreePiece[], transform: Matrix) {
        const start = this.count
        const {snow, position} = placement
        this.padding = Math.max(this.padding, placement.variant.rootRadius * 1.4 * placement.size)
        for (const part of parts) {
            part.matrix.multiplyToArray(transform, this.buffers.matrix, this.count * 16)
            const offset = this.count * 4
            const style = this.buffers.treeStyle
            style[offset] = part.palette
            style[offset + 1] = part.tint
            style[offset + 2] = snow
            style[offset + 3] = position.y
            const shape = this.buffers.treeShape
            shape[offset] = part.taper
            shape[offset + 1] = part.length
            shape[offset + 2] = part.grain
            shape[offset + 3] = part.radius / part.length
            part.startJoint?.toArray(this.buffers.treeJointA, offset)
            part.endJoint?.toArray(this.buffers.treeJointB, offset)
            this.buffers.treeOpacity[this.count++] = placement.opacity ?? 1
        }
        if (start !== this.count) this.spans.set(placement.id, {start, end: this.count})
    }

    upload() {
        if (this.capacity > 0) this.mesh.thinInstanceCount = this.count
        this.mesh.setEnabled(this.count > 0)
        if (!this.count) return
        for (const name of bufferNames) {
            this.mesh.thinInstancePartialBufferUpdate(name, this.buffers[name].subarray(0, this.count * BUFFERS[name]), 0)
        }
        this.mesh.thinInstanceRefreshBoundingInfo()
        // The shader tilts individual cross sections outside the source mesh's bounds.
        const bounds = this.mesh.getBoundingInfo()
        const pad = new Vector3(this.padding, this.padding, this.padding)
        bounds.reConstruct(bounds.minimum.subtract(pad), bounds.maximum.add(pad), this.mesh.getWorldMatrix())
    }

    setOpacity(id: number, opacity: number) {
        const span = this.spans.get(id)
        if (!span || this.shadowOnly) return
        const values = this.buffers.treeOpacity
        values.fill(opacity, span.start, span.end)
        this.mesh.thinInstancePartialBufferUpdate('treeOpacity', values.subarray(span.start, span.end), span.start)
    }
}

/** One source mesh per cross section or crown shape across all species. */
export class TreeRenderer {
    private readonly batches = new Map<string, TreeBatch>()
    private readonly materials = new Map<TreeSurfaceDetail, ReturnType<typeof createTreeMaterial>>()
    private surfaceDetail: TreeSurfaceDetail = 'LOW'
    private readonly transform = Matrix.Identity()
    private readonly scale = Vector3.One()
    private readonly rotation = Quaternion.Identity()
    private readonly reveal = Vector4.Zero()
    private readonly revealCenter = Vector3.Zero()
    private readonly revealProjection = Vector3.Zero()
    private revealRadius = 0
    private revealCamera?: Camera
    private readonly revealObserver: Observer<Camera>

    constructor(
        private readonly scene: Scene,
        private readonly parent: TransformNode,
        private readonly addShadowCaster: (mesh: Mesh) => void,
        private readonly removeShadowCaster: (mesh: Mesh) => void,
    ) {
        this.revealObserver = scene.onBeforeCameraRenderObservable.add(camera => this.projectReveal(camera))
    }

    setSurfaceDetail(detail: TreeSurfaceDetail) {
        if (detail === this.surfaceDetail) return
        this.surfaceDetail = detail
        const material = this.getMaterial()
        for (const {mesh} of this.batches.values()) mesh.material = material
    }

    rebuild(placements: readonly TreePlacement[]) {
        const counts = new Map<TreeBatch, number>()
        for (const placement of placements) {
            const shadowOnly = placement.shadowOnly === true
            for (const [shape, parts] of placement.variant.models[placement.detail].shapes) {
                const key = this.key(shape, shadowOnly)
                const batch = this.batches.get(key) ?? this.createBatch(key, shape, shadowOnly)
                counts.set(batch, (counts.get(batch) ?? 0) + parts.length)
            }
        }
        for (const batch of this.batches.values()) batch.start(counts.get(batch) ?? 0)
        for (const placement of placements) {
            this.scale.setAll(placement.size)
            Quaternion.RotationYawPitchRollToRef(placement.variant.yaw, 0, 0, this.rotation)
            Matrix.ComposeToRef(this.scale, this.rotation, placement.position, this.transform)
            for (const [shape, parts] of placement.variant.models[placement.detail].shapes) {
                this.batches.get(this.key(shape, placement.shadowOnly === true))!.add(placement, parts, this.transform)
            }
        }
        for (const batch of this.batches.values()) batch.upload()
    }

    setOpacity(id: number, opacity: number) {
        for (const batch of this.batches.values()) batch.setOpacity(id, opacity)
    }

    setRevealTarget(center: Vector3 | null, camera?: Camera, radius = 1.3) {
        this.revealRadius = center ? radius : 0
        this.revealCamera = camera
        if (center) this.revealCenter.copyFrom(center)
    }

    private projectReveal(camera: Camera) {
        this.reveal.z = 0
        if (this.revealRadius <= 0 || (this.revealCamera && this.revealCamera !== camera)) return

        const point = this.revealProjection
        const projection = camera.getProjectionMatrix()
        Vector3.TransformCoordinatesToRef(this.revealCenter, camera.getViewMatrix(), point)
        const depth = this.scene.useRightHandedSystem ? -point.z : point.z
        if (depth <= camera.minZ || depth >= camera.maxZ) return
        Vector3.TransformCoordinatesToRef(point, projection, point)
        const engine = this.scene.getEngine()
        const {x, y, width, height} = camera.viewport
        const pixelRadius = this.revealRadius * Math.abs(projection.m[5]) * height * engine.getRenderHeight() / 2
            / (camera.mode === Camera.PERSPECTIVE_CAMERA ? depth : 1)
        if (pixelRadius < 1) return
        const depthBuffer = engine.isNDCHalfZRange ? point.z : (point.z + 1) * 0.5
        this.reveal.set(
            (x + (point.x + 1) * width * 0.5) * engine.getRenderWidth(),
            (y + (point.y + 1) * height * 0.5) * engine.getRenderHeight(),
            1 / (pixelRadius * pixelRadius),
            engine.useReverseDepthBuffer ? -depthBuffer : depthBuffer,
        )
    }

    getStats() {
        let colorBatches = 0, casterBatches = 0, triangles = 0
        for (const batch of this.batches.values()) {
            if (!batch.count) continue
            casterBatches++
            if (!batch.shadowOnly) colorBatches++
            triangles += batch.count * TREE_SHAPE_FACES[batch.shape]
        }
        return {colorBatches, casterBatches, triangles}
    }

    dispose() {
        this.revealObserver.remove()
        for (const {mesh} of this.batches.values()) {
            this.removeShadowCaster(mesh)
            mesh.dispose()
        }
        this.batches.clear()
        for (const material of this.materials.values()) material.dispose()
        this.materials.clear()
    }

    private getMaterial() {
        let material = this.materials.get(this.surfaceDetail)
        if (!material) {
            material = createTreeMaterial(this.scene, this.surfaceDetail, this.reveal)
            this.materials.set(this.surfaceDetail, material)
        }
        return material
    }

    private key(shape: TreeShape, shadowOnly: boolean) {
        return shadowOnly ? shape + ':shadow' : shape
    }

    private createBatch(key: string, shape: TreeShape, shadowOnly: boolean) {
        const mesh = new Mesh('proceduralTree:' + key, this.scene)
        createTreeGeometry(mesh, shape)
        mesh.material = this.getMaterial()
        mesh.parent = this.parent
        mesh.isPickable = false
        mesh.doNotSyncBoundingInfo = true
        mesh.receiveShadows = !shadowOnly
        if (shadowOnly) mesh.layerMask = 0
        mesh.setEnabled(false)
        this.addShadowCaster(mesh)
        const batch = new TreeBatch(mesh, shape, shadowOnly)
        this.batches.set(key, batch)
        return batch
    }
}
