import { Camera, Matrix, Mesh, PBRMaterial, Quaternion, Scene, TransformNode, Vector2, Vector3, Vector4 } from '@babylonjs/core'
import type { Material, Observer } from '@babylonjs/core'
import { createTreeGeometry } from './treeGeometry'
import type { TreePiece, TreeVariant } from './treeGenerator'
import { createTreeMaterial } from './treeMaterial'
import type { TreeBarkMode } from './treeMaterial'
import { buildTreeRevealIndex, collectTreeRevealCandidates, getTreeModelBounds, overlapsTreeReveal,
    projectTreeBounds, TreeRevealFrustum } from './treeRevealBounds'
import type { TreeRevealEntry } from './treeRevealBounds'
import { ALL_TREE_SHADER_FEATURES, TREE_SHADER, TREE_SHAPE_FACES } from './treeSpecies'
import type { TreeDetail, TreeShape, TreeSurfaceDetail } from './treeSpecies'

export interface TreePlacement {
    id: number
    variant: TreeVariant
    position: Vector3
    size: number
    snow: number
    groundType?: number
    detail: TreeDetail
    shadowOnly?: boolean
    fullBarkDetail?: boolean
    opacity?: number
}

interface Span { start: number, end: number, offsetY: number }
const BUFFERS = {matrix: 16, treeStyle: 4, treeShape: 4, treeJointA: 4, treeJointB: 4, treeOpacity: 1, treeBarkLimit: 1} as const
type BufferName = keyof typeof BUFFERS
const namedBuffers = Object.keys(BUFFERS) as BufferName[]
const regularBuffers = namedBuffers.filter(name => name !== 'treeBarkLimit')
const SHAPE_BITS = {wood3: 1, wood6: 2, wood16: 4, leaf: 8, needles: 16, needlesShadow: 32,
    foliageCard: 64, birchCard: 128} satisfies Record<TreeShape, number>
function foliageAtlasForShape(shape: TreeShape) {
    if (shape === 'foliageCard') return 'standard'
    if (shape === 'birchCard') return 'birch'
    return undefined
}
const ALL_SHAPES = Object.values(SHAPE_BITS).reduce((mask, bit) => mask | bit, 0)
const REVEAL_START_RADIUS = .55
const REVEAL_KEEP_RADIUS = .65

class TreeBatch {
    readonly spans = new Map<number, Span>()
    count = 0
    private padding = 0
    private capacity = 0
    private buffers = {matrix: new Float32Array(), treeStyle: new Float32Array(),
        treeShape: new Float32Array(), treeJointA: new Float32Array(), treeJointB: new Float32Array(),
        treeOpacity: new Float32Array(), treeBarkLimit: new Float32Array()}

    private readonly bufferNames: readonly BufferName[]

    constructor(readonly mesh: Mesh, readonly shape: TreeShape, readonly shadowOnly: boolean, readonly cutout: boolean,
        private readonly barkLimits: boolean) {
        this.bufferNames = barkLimits ? namedBuffers : regularBuffers
    }

    start(count: number) {
        this.spans.clear()
        this.count = 0
        this.padding = 0
        if (count <= this.capacity) return
        this.capacity = Math.max(32, count, this.capacity * 2)
        for (const name of this.bufferNames) {
            const stride = BUFFERS[name]
            const buffer = this.buffers[name] = new Float32Array(this.capacity * stride)
            this.mesh.thinInstanceSetBuffer(name, buffer, stride, false)
        }
    }

    add(placement: TreePlacement, parts: readonly TreePiece[], transform: Matrix) {
        const start = this.count
        const {snow, groundType, position, fullBarkDetail} = placement
        const trunkBarkLimit = placement.variant.height * placement.size / 3
        this.padding = Math.max(this.padding, placement.variant.rootRadius * 1.4 * placement.size)
        for (const part of parts) {
            part.matrix.multiplyToArray(transform, this.buffers.matrix, this.count * 16)
            const offset = this.count * 4
            const style = this.buffers.treeStyle
            style[offset] = part.palette
            style[offset + 1] = part.tint
            style[offset + 2] = groundType ? groundType + snow * .5 : 0
            style[offset + 3] = position.y
            const shape = this.buffers.treeShape
            shape[offset] = part.taper
            shape[offset + 1] = part.length
            shape[offset + 2] = part.grain
            shape[offset + 3] = part.radius / part.length
            part.startJoint?.toArray(this.buffers.treeJointA, offset)
            part.endJoint?.toArray(this.buffers.treeJointB, offset)
            if (this.barkLimits) this.buffers.treeBarkLimit[this.count] = fullBarkDetail ? -1 : part.trunk ? trunkBarkLimit : 0
            this.buffers.treeOpacity[this.count++] = placement.opacity ?? 1
        }
        if (start !== this.count) this.spans.set(placement.id, {start, end: this.count, offsetY: 0})
    }

    upload() {
        if (this.capacity > 0) this.mesh.thinInstanceCount = this.count
        this.mesh.setEnabled(this.count > 0)
        if (!this.count) return
        for (const name of this.bufferNames) {
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

    setYOffset(id: number, offsetY: number) {
        const span = this.spans.get(id)
        if (!span || span.offsetY === offsetY) return
        const start = span.start * 16, end = span.end * 16
        const delta = offsetY - span.offsetY
        const matrices = this.buffers.matrix
        for (let i = start + 13; i < end; i += 16) matrices[i] += delta
        span.offsetY = offsetY
        this.mesh.thinInstancePartialBufferUpdate('matrix', matrices.subarray(start, end), start)
    }
}

/** One source mesh per cross section or crown shape across all species. */
export class TreeRenderer {
    private readonly batches = new Map<string, TreeBatch>()
    private readonly materials = new Map<string, Material>()
    private surfaceDetail: TreeSurfaceDetail = 'LOW'
    private features = ALL_TREE_SHADER_FEATURES & ~TREE_SHADER.patina
    private castsShadows = true
    private readonly transform = Matrix.Identity()
    private readonly scale = Vector3.One()
    private readonly rotation = Quaternion.Identity()
    private readonly viewProjection = Matrix.Identity()
    private readonly treeProjection = Matrix.Identity()
    private readonly adjustedPosition = Vector3.Zero()
    private readonly projectedBounds = {min: Vector3.Zero(), max: Vector3.Zero()}
    private readonly projectedPoint = Vector3.Zero()
    private readonly revealNdc = Vector4.Zero()
    private readonly targetNdc = Vector4.Zero()
    private readonly revealFrustum = new TreeRevealFrustum()
    private readonly targetFrustum = new TreeRevealFrustum()
    private readonly localRevealFrustum = new TreeRevealFrustum()
    private readonly localTargetFrustum = new TreeRevealFrustum()
    private readonly pieceBounds = {min: Vector3.Zero(), max: Vector3.Zero()}
    private readonly previousQueryMatrix = Matrix.Identity()
    private readonly previousQueryPlayer = Vector4.Zero()
    private readonly previousQueryTarget = Vector4.Zero()
    private readonly previousQueryViewport = Vector4.Zero()
    private queryValid = false
    private readonly candidates: TreeRevealEntry[] = []
    private readonly revealEntries = new Map<number, TreeRevealEntry>()
    private revealIndex: ReturnType<typeof buildTreeRevealIndex>
    private readonly manualCutoutIds = new Set<number>()
    private skipInactiveLights = true
    private barkMode: TreeBarkMode = 'procedural'
    private placements: readonly TreePlacement[] = []
    private cutoutTrees = new Map<number, number>()
    private nextCutoutTrees = new Map<number, number>()
    private readonly offsets = new Map<number, number>()
    private readonly reveal = Vector4.Zero()
    private readonly revealCenter = Vector3.Zero()
    private readonly targetReveal = Vector4.Zero()
    private readonly vertexMaskProjection = {viewport: Vector4.Zero(), depth: Vector2.Zero()}
    private readonly targetRevealCenter = Vector3.Zero()
    private readonly revealProjection = Vector3.Zero()
    private revealRadius = 0
    private targetRevealRadius = 0
    private revealCamera?: Camera
    private readonly revealObserver: Observer<Camera>
    private readonly partitionObserver: Observer<Scene>

    constructor(
        private readonly scene: Scene,
        private readonly parent: TransformNode,
        private readonly addShadowCaster: (mesh: Mesh, shape: TreeShape, shadowOnly: boolean) => void,
        private readonly removeShadowCaster: (mesh: Mesh, shape: TreeShape, shadowOnly: boolean) => void,
        private readonly setSharedLighting?: (mesh: Mesh, enabled: boolean) => void,
    ) {
        this.partitionObserver = scene.onBeforeRenderObservable.add(() => {
            if (!(this.features & TREE_SHADER.reveal)) return
            const changedShapes = this.selectCutoutTrees()
            if (changedShapes) this.uploadPlacements(changedShapes)
        })
        this.revealObserver = scene.onBeforeCameraRenderObservable.add(camera => {
            if (!this.cutoutTrees.size) return
            this.projectReveal(camera, this.revealCenter, this.revealRadius, this.reveal)
            this.projectReveal(camera, this.targetRevealCenter, this.targetRevealRadius, this.targetReveal)
            if (this.usesVertexMask(this.features)) {
                const engine = this.scene.getEngine()
                const {x, y, width, height} = camera.viewport
                const w = engine.getRenderWidth(), h = engine.getRenderHeight()
                this.vertexMaskProjection.viewport.set((x + width * .5) * w, (y + height * .5) * h, width * .5 * w, height * .5 * h)
                this.vertexMaskProjection.depth.set(engine.isNDCHalfZRange ? 1 : .5, engine.isNDCHalfZRange ? 0 : .5)
            }
        })
    }

    setSurfaceDetail(detail: TreeSurfaceDetail, features = ALL_TREE_SHADER_FEATURES, skipInactiveLights = true,
        barkMode: TreeBarkMode = 'procedural') {
        if (detail === 'LOW') features &= ~TREE_SHADER.patina
        if (detail === this.surfaceDetail && features === this.features && skipInactiveLights === this.skipInactiveLights
            && barkMode === this.barkMode) return
        this.surfaceDetail = detail
        this.features = features
        this.skipInactiveLights = skipInactiveLights
        this.barkMode = barkMode
        for (const {mesh, shape, cutout, shadowOnly} of this.batches.values()) mesh.material = this.getMaterial(cutout, shape, shadowOnly)
    }

    setShadowCasting(enabled: boolean) {
        if (this.castsShadows === enabled) return
        this.castsShadows = enabled
        for (const {mesh, shape, shadowOnly} of this.batches.values()) {
            if (enabled) this.addShadowCaster(mesh, shape, shadowOnly)
            else this.removeShadowCaster(mesh, shape, shadowOnly)
        }
    }

    rebuild(placements: readonly TreePlacement[]) {
        this.placements = placements
        this.offsets.clear()
        this.rebuildRevealIndex()
        if (this.features & TREE_SHADER.reveal) this.selectCutoutTrees()
        else this.cutoutTrees.clear()
        this.uploadPlacements()
    }

    private rebuildRevealIndex() {
        this.queryValid = false
        this.candidates.length = 0
        this.revealEntries.clear()
        this.manualCutoutIds.clear()
        this.revealIndex = undefined
        if (!(this.features & TREE_SHADER.reveal)) return
        for (const placement of this.placements) {
            if (placement.shadowOnly) continue
            if ((placement.opacity ?? 1) < .999) this.manualCutoutIds.add(placement.id)
            this.composePlacement(placement, placement.position)
            const transform = this.transform.clone()
            const bounds = {min: Vector3.Zero(), max: Vector3.Zero()}
            projectTreeBounds(getTreeModelBounds(placement.variant.models[placement.detail]), transform, this.projectedPoint, bounds)
            this.revealEntries.set(placement.id, {placement, transform, bounds})
        }
        this.revealIndex = buildTreeRevealIndex([...this.revealEntries.values()])
    }

    private uploadPlacements(changedShapes?: number) {
        const counts = new Map<TreeBatch, number>()
        for (const placement of this.placements) {
            const shadowOnly = placement.shadowOnly === true
            if (shadowOnly && changedShapes !== undefined) continue
            const mask = shadowOnly ? 0 : this.cutoutTrees.get(placement.id) ?? 0
            for (const [shape, parts] of placement.variant.models[placement.detail].shapes) {
                if (changedShapes !== undefined && !(changedShapes & SHAPE_BITS[shape])) continue
                const cutout = (mask & SHAPE_BITS[shape]) !== 0
                const key = this.key(shape, shadowOnly, cutout)
                const batch = this.batches.get(key) ?? this.createBatch(key, shape, shadowOnly, cutout)
                counts.set(batch, (counts.get(batch) ?? 0) + parts.length)
            }
        }
        const affected = this.affectedBatches(changedShapes)
        for (const batch of affected) batch.start(counts.get(batch) ?? 0)
        for (const placement of this.placements) {
            const shadowOnly = placement.shadowOnly === true
            if (shadowOnly && changedShapes !== undefined) continue
            const mask = shadowOnly ? 0 : this.cutoutTrees.get(placement.id) ?? 0
            this.composePlacement(placement, placement.position)
            for (const [shape, parts] of placement.variant.models[placement.detail].shapes) {
                if (changedShapes !== undefined && !(changedShapes & SHAPE_BITS[shape])) continue
                const cutout = (mask & SHAPE_BITS[shape]) !== 0
                this.batches.get(this.key(shape, shadowOnly, cutout))!.add(placement, parts, this.transform)
            }
        }
        for (const batch of affected) {
            batch.upload()
            for (const [id, offset] of this.offsets) batch.setYOffset(id, offset)
        }
    }

    private affectedBatches(changedShapes?: number) {
        return [...this.batches.values()].filter(batch => changedShapes === undefined
            || (!batch.shadowOnly && (changedShapes & SHAPE_BITS[batch.shape])))
    }

    private composePlacement(placement: TreePlacement, position: Vector3) {
        this.scale.setAll(placement.size)
        Quaternion.RotationYawPitchRollToRef(placement.variant.yaw, 0, 0, this.rotation)
        Matrix.ComposeToRef(this.scale, this.rotation, position, this.transform)
    }

    setOpacity(id: number, opacity: number) {
        const placement = this.placements.find(item => item.id === id)
        if (!placement) return
        placement.opacity = opacity
        this.queryValid = false
        if (!placement.shadowOnly && opacity < .999) this.manualCutoutIds.add(id)
        else this.manualCutoutIds.delete(id)
        for (const batch of this.batches.values()) batch.setOpacity(id, opacity)
    }

    setYOffset(id: number, offsetY: number) {
        if ((this.offsets.get(id) ?? 0) !== offsetY) this.queryValid = false
        if (offsetY) this.offsets.set(id, offsetY)
        else this.offsets.delete(id)
        for (const batch of this.batches.values()) batch.setYOffset(id, offsetY)
    }

    setRevealTargets(center: Vector3 | null, target: Vector3 | null = null, camera?: Camera, radius = 1.3, targetRadius = radius) {
        this.revealRadius = center ? radius : 0
        this.targetRevealRadius = target ? targetRadius : 0
        this.revealCamera = camera
        if (center) this.revealCenter.copyFrom(center)
        if (target) this.targetRevealCenter.copyFrom(target)
    }

    private selectCutoutTrees() {
        const {cutoutTrees, nextCutoutTrees, manualCutoutIds} = this
        nextCutoutTrees.clear()
        for (const id of manualCutoutIds) nextCutoutTrees.set(id, ALL_SHAPES)
        const camera = this.revealCamera ?? this.scene.activeCamera
        if (camera && this.revealIndex && (this.revealRadius > 0 || this.targetRevealRadius > 0)) {
            if (!this.findCameraCutouts(camera)) return 0
        } else {
            this.queryValid = false
            this.candidates.length = 0
        }
        let changedShapes = 0
        for (const [id, mask] of nextCutoutTrees) changedShapes |= mask ^ (cutoutTrees.get(id) ?? 0)
        for (const [id, mask] of cutoutTrees) if (!nextCutoutTrees.has(id)) changedShapes |= mask
        if (changedShapes) {
            this.cutoutTrees = nextCutoutTrees
            this.nextCutoutTrees = cutoutTrees
        }
        return changedShapes
    }

    private findCameraCutouts(camera: Camera) {
        this.projectReveal(camera, this.revealCenter, this.revealRadius, this.reveal)
        this.projectReveal(camera, this.targetRevealCenter, this.targetRevealRadius, this.targetReveal)
        this.revealNdc.z = this.targetNdc.z = 0
        this.toRevealNdc(camera, this.reveal, this.revealNdc)
        this.toRevealNdc(camera, this.targetReveal, this.targetNdc)
        if (!this.revealNdc.z && !this.targetNdc.z) {
            this.queryValid = false
            this.candidates.length = 0
            return true
        }
        camera.getViewMatrix().multiplyToRef(camera.getProjectionMatrix(), this.viewProjection)
        const engine = this.scene.getEngine()
        const radiusX = 2 / (camera.viewport.width * engine.getRenderWidth())
        const radiusY = 2 / (camera.viewport.height * engine.getRenderHeight())
        const reverseDepth = engine.useReverseDepthBuffer
        const {previousQueryMatrix, previousQueryPlayer, previousQueryTarget, previousQueryViewport} = this
        if (this.queryValid && previousQueryMatrix.equals(this.viewProjection) && previousQueryPlayer.equals(this.revealNdc)
            && previousQueryTarget.equals(this.targetNdc) && previousQueryViewport.x === radiusX
            && previousQueryViewport.y === radiusY && previousQueryViewport.z === Number(reverseDepth)) return false
        this.queryValid = true
        previousQueryMatrix.copyFrom(this.viewProjection)
        previousQueryPlayer.copyFrom(this.revealNdc)
        previousQueryTarget.copyFrom(this.targetNdc)
        previousQueryViewport.set(radiusX, radiusY, Number(reverseDepth), 0)

        this.candidates.length = 0
        const margin = this.cutoutTrees.size ? REVEAL_KEEP_RADIUS : REVEAL_START_RADIUS
        this.revealFrustum.update(this.viewProjection, this.revealNdc, radiusX * margin, radiusY * margin, reverseDepth)
        this.targetFrustum.update(this.viewProjection, this.targetNdc, radiusX * margin, radiusY * margin, reverseDepth)
        collectTreeRevealCandidates(this.revealIndex, this.revealFrustum, this.targetFrustum, this.candidates)
        for (const entry of this.candidates) {
            const id = entry.placement.id
            if (this.offsets.has(id) || this.nextCutoutTrees.has(id)) continue
            this.findTreeCutout(entry, radiusX, radiusY, reverseDepth, 0)
        }
        // Only the object with a GM deletion preview can move between world rebuilds.
        for (const [id, offset] of this.offsets) {
            const entry = this.revealEntries.get(id)
            if (!entry || this.nextCutoutTrees.has(id)) continue
            this.findTreeCutout(entry, radiusX, radiusY, reverseDepth, offset)
        }
        return true
    }

    private toRevealNdc(camera: Camera, reveal: Vector4, ndc: Vector4) {
        if (!reveal.z) return
        const engine = this.scene.getEngine()
        const {x, y, width, height} = camera.viewport
        const depth = Math.abs(reveal.w)
        ndc.set((reveal.x / engine.getRenderWidth() - x) * 2 / width - 1,
            (reveal.y / engine.getRenderHeight() - y) * 2 / height - 1,
            1 / Math.sqrt(reveal.z), engine.isNDCHalfZRange ? depth : depth * 2 - 1)
    }

    private findTreeCutout(entry: TreeRevealEntry, radiusX: number, radiusY: number, reverseDepth: boolean, offset: number) {
        const {placement} = entry
        let transform = entry.transform
        if (offset) {
            this.adjustedPosition.copyFrom(placement.position).addInPlaceFromFloats(0, offset, 0)
            this.composePlacement(placement, this.adjustedPosition)
            transform = this.transform
        }
        transform.multiplyToRef(this.viewProjection, this.treeProjection)
        const {pieces} = getTreeModelBounds(placement.variant.models[placement.detail])
        const margin = this.cutoutTrees.has(placement.id) ? REVEAL_KEEP_RADIUS : REVEAL_START_RADIUS
        // Outer falloff stays available once a branch actually overlaps the actor's screen-space area.
        if (!this.hasOverlappingPiece(pieces, radiusX * margin, radiusY * margin, reverseDepth)) return

        this.updatePieceFrusta(radiusX, radiusY, reverseDepth)
        let mask = 0
        for (const [shape, packed] of pieces) {
            if (this.overlapsAnyPiece(packed, radiusX, radiusY, reverseDepth)) mask |= SHAPE_BITS[shape]
        }
        if (mask) this.nextCutoutTrees.set(placement.id, mask)
    }

    private hasOverlappingPiece(pieces: ReadonlyMap<TreeShape, Float32Array>, radiusX: number, radiusY: number, reverseDepth: boolean) {
        this.updatePieceFrusta(radiusX, radiusY, reverseDepth)
        for (const packed of pieces.values()) {
            if (this.overlapsAnyPiece(packed, radiusX, radiusY, reverseDepth)) return true
        }
        return false
    }

    private updatePieceFrusta(radiusX: number, radiusY: number, reverseDepth: boolean) {
        this.localRevealFrustum.update(this.treeProjection, this.revealNdc, radiusX, radiusY, reverseDepth)
        this.localTargetFrustum.update(this.treeProjection, this.targetNdc, radiusX, radiusY, reverseDepth)
    }

    private overlapsAnyPiece(packed: Float32Array, radiusX: number, radiusY: number, reverseDepth: boolean) {
        const {localRevealFrustum, localTargetFrustum, treeProjection, revealNdc, targetNdc, pieceBounds, projectedBounds} = this
        for (let i = 0; i < packed.length; i += 6) {
            pieceBounds.min.fromArray(packed, i)
            pieceBounds.max.fromArray(packed, i + 3)
            if (!localRevealFrustum.intersects(pieceBounds) && !localTargetFrustum.intersects(pieceBounds)) continue
            if (projectTreeBounds(pieceBounds, treeProjection, this.projectedPoint, projectedBounds)
                && !overlapsTreeReveal(projectedBounds, revealNdc, radiusX, radiusY, reverseDepth)
                && !overlapsTreeReveal(projectedBounds, targetNdc, radiusX, radiusY, reverseDepth)) continue
            return true
        }
        return false
    }

    private projectReveal(camera: Camera, center: Vector3, radius: number, reveal: Vector4) {
        reveal.z = 0
        if (radius <= 0 || (this.revealCamera && this.revealCamera !== camera)) return

        const point = this.revealProjection
        const projection = camera.getProjectionMatrix()
        Vector3.TransformCoordinatesToRef(center, camera.getViewMatrix(), point)
        const depth = this.scene.useRightHandedSystem ? -point.z : point.z
        if (depth <= camera.minZ || depth >= camera.maxZ) return
        Vector3.TransformCoordinatesToRef(point, projection, point)
        const engine = this.scene.getEngine()
        const {x, y, width, height} = camera.viewport
        const viewportX = x * engine.getRenderWidth(), viewportY = y * engine.getRenderHeight()
        const viewportWidth = width * engine.getRenderWidth(), viewportHeight = height * engine.getRenderHeight()
        const pixelRadius = radius * Math.abs(projection.m[5]) * viewportHeight / 2
            / (camera.mode === Camera.PERSPECTIVE_CAMERA ? depth : 1)
        if (pixelRadius < 1) return
        const pixelX = (point.x + 1) * viewportWidth * .5, pixelY = (point.y + 1) * viewportHeight * .5
        if (pixelX + pixelRadius < 0 || pixelX - pixelRadius > viewportWidth
            || pixelY + pixelRadius < 0 || pixelY - pixelRadius > viewportHeight) return
        const depthBuffer = engine.isNDCHalfZRange ? point.z : (point.z + 1) * 0.5
        reveal.set(
            viewportX + pixelX,
            viewportY + pixelY,
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

    async warmUp() {
        const active = [...this.batches.values()].filter(batch => batch.count > 0)
        const options = {useInstances: true}
        const compile = active.map(({mesh}) => mesh.material?.forceCompilationAsync(mesh, options))
        if (this.features & TREE_SHADER.reveal) {
            for (const atlas of [undefined, 'standard', 'birch']) {
                const opaque = active.find(batch => !batch.shadowOnly && !batch.cutout && foliageAtlasForShape(batch.shape) === atlas)
                if (opaque) compile.push(this.getMaterial(true, opaque.shape).forceCompilationAsync(opaque.mesh, options))
            }
        }
        await Promise.all(compile)
    }

    dispose() {
        this.revealObserver.remove()
        this.partitionObserver.remove()
        for (const {mesh, shape, shadowOnly} of this.batches.values()) {
            if (this.castsShadows) this.removeShadowCaster(mesh, shape, shadowOnly)
            if (!shadowOnly) this.setSharedLighting?.(mesh, false)
            mesh.dispose()
        }
        this.batches.clear()
        for (const material of this.materials.values()) material.dispose()
        this.materials.clear()
    }

    private getMaterial(cutout: boolean, shape: TreeShape, shadowOnly = false) {
        const wood = !shadowOnly && shape.startsWith('wood')
        let features = shadowOnly ? 0 : cutout ? this.features : this.features & ~TREE_SHADER.reveal
        if (!wood) features &= ~TREE_SHADER.snow
        const vertexMask = this.usesVertexMask(features) ? this.vertexMaskProjection : undefined
        const atlas = foliageAtlasForShape(shape)
        const barkMode = wood ? this.barkMode : 'procedural'
        const groundContact = wood && (features & ~TREE_SHADER.reveal) !== 0
        const baseKey = (features ? `${this.surfaceDetail}:${features}` : 'SIMPLE')
            + (atlas ? ':' + atlas + '-card' : barkMode !== 'procedural' ? ':' + barkMode : '')
            + (groundContact ? ':ground' : '')
        const skipInactiveLights = this.skipInactiveLights || !(features & TREE_SHADER.lighting)
        const baselineKey = baseKey + ':all-light-slots'
        const key = skipInactiveLights ? baseKey : baselineKey
        let material = this.materials.get(key)
        if (!material) {
            material = createTreeMaterial(this.scene, this.surfaceDetail, features, this.reveal, this.targetReveal,
                vertexMask, skipInactiveLights, atlas, barkMode, groundContact)
            this.materials.set(key, material)
        }
        const comparison = this.materials.get(skipInactiveLights ? baselineKey : baseKey)
        if (material instanceof PBRMaterial && comparison instanceof PBRMaterial
            && material.maxSimultaneousLights < comparison.maxSimultaneousLights) {
            material.maxSimultaneousLights = comparison.maxSimultaneousLights
        }
        return material
    }

    private usesVertexMask(features: number) {
        const pbrReveal = TREE_SHADER.lighting | TREE_SHADER.reveal
        return (features & pbrReveal) === pbrReveal
    }

    private key(shape: TreeShape, shadowOnly: boolean, cutout: boolean) {
        return shadowOnly ? shape + ':shadow' : cutout ? shape + ':cutout' : shape
    }

    private createBatch(key: string, shape: TreeShape, shadowOnly: boolean, cutout: boolean) {
        const mesh = new Mesh('proceduralTree:' + key, this.scene)
        createTreeGeometry(mesh, shape)
        mesh.material = this.getMaterial(cutout, shape, shadowOnly)
        mesh.parent = this.parent
        mesh.isPickable = false
        mesh.doNotSyncBoundingInfo = true
        mesh.receiveShadows = !shadowOnly
        if (shadowOnly) mesh.layerMask = 0
        mesh.setEnabled(false)
        if (this.castsShadows) this.addShadowCaster(mesh, shape, shadowOnly)
        if (!shadowOnly) this.setSharedLighting?.(mesh, true)
        const batch = new TreeBatch(mesh, shape, shadowOnly, cutout, !shadowOnly && shape.startsWith('wood'))
        this.batches.set(key, batch)
        return batch
    }
}
