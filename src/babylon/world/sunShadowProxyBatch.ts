import { Mesh, MeshBuilder, VertexData } from '@babylonjs/core'
import type { Matrix, Scene, TransformNode } from '@babylonjs/core'
import { Lights } from '@/babylon/scene/lights'

export class SunShadowProxyBatch {
    private matrices = new Float32Array(0)
    private count = 0
    private uploadedCount = 0
    private bufferChanged = false

    constructor(private readonly mesh: Mesh, parent?: TransformNode) {
        if (parent) mesh.parent = parent
        mesh.layerMask = 0
        mesh.isPickable = false
        mesh.doNotSyncBoundingInfo = true
        mesh.setEnabled(false)
        Lights.addShadowCaster(mesh, false)
    }

    get scene() { return this.mesh.getScene() }

    clear() {
        this.count = 0
    }

    add(matrix: Matrix) {
        const offset = this.count * 16
        if (offset >= this.matrices.length) {
            const larger = new Float32Array(Math.max(16 * 8, this.matrices.length * 2))
            larger.set(this.matrices)
            this.matrices = larger
            this.bufferChanged = true
        }
        matrix.copyToArray(this.matrices, offset)
        this.count++
    }

    flush() {
        const {mesh, count} = this
        if (count === 0 && this.uploadedCount === 0) return
        if (count > 0) {
            if (this.bufferChanged) {
                mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false)
                this.bufferChanged = false
            } else {
                mesh.thinInstanceBufferUpdated('matrix')
            }
        }
        mesh.thinInstanceCount = count
        if ((count > 0) !== (this.uploadedCount > 0)) mesh.setEnabled(count > 0)
        this.uploadedCount = count
    }
}

export const StaticSunShadowBoxes = {
    walls: [] as Matrix[],
    buildings: [] as Matrix[],
    batch: null as SunShadowProxyBatch | null,

    initialize(scene: Scene, parent: TransformNode) {
        this.walls.length = 0
        this.buildings.length = 0
        const batch = this.batch = new SunShadowProxyBatch(MeshBuilder.CreateBox('staticSunShadowBoxes', {size: 1}, scene), parent)
        scene.onDisposeObservable.addOnce(() => {
            if (this.batch !== batch) return
            this.batch = null
            this.walls.length = 0
            this.buildings.length = 0
        })
    },

    flush() {
        const batch = this.batch
        if (!batch) return
        batch.clear()
        for (const matrix of this.walls) batch.add(matrix)
        for (const matrix of this.buildings) batch.add(matrix)
        batch.flush()
    },
}

export function createSunShadowGable(scene: Scene, parent: TransformNode) {
    const mesh = new Mesh('buildingGableSunShadows', scene)
    const positions = [-.5, 0, -.5, -.5, 0, .5, -.5, 1, 0, .5, 0, -.5, .5, 0, .5, .5, 1, 0]
    const indices = [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4]
    const normals: number[] = []
    VertexData.ComputeNormals(positions, indices, normals)
    const geometry = new VertexData()
    geometry.positions = positions
    geometry.indices = indices
    geometry.normals = normals
    geometry.applyToMesh(mesh)
    return new SunShadowProxyBatch(mesh, parent)
}
