import { Matrix, Mesh, Vector2 } from '@babylonjs/core'

// Mesh lifetime owns the retained CPU/GPU capacity, including empty batches.
const buffersByMesh = new WeakMap<Mesh, {matrices: Float32Array, uv: Float32Array}>()

export function updateWorldInstanceBuffers(mesh: Mesh, matrices: Matrix[], uvData: Vector2[]): Float32Array {
    let buffers = buffersByMesh.get(mesh)
    if (!buffers) {
        buffers = {matrices: new Float32Array(0), uv: new Float32Array(0)}
        buffersByMesh.set(mesh, buffers)
    }
    const count = matrices.length
    const capacity = buffers.matrices.length / 16
    const grow = count > capacity
    if (grow) {
        const nextCapacity = Math.max(16, count, capacity * 2)
        buffers.matrices = new Float32Array(nextCapacity * 16)
        buffers.uv = new Float32Array(nextCapacity * 2)
        matrices.forEach((matrix, index) => matrix.copyToArray(buffers!.matrices, index * 16))
    }
    uvData.forEach((uv, index) => {
        buffers!.uv[index * 2] = uv.x
        buffers!.uv[index * 2 + 1] = uv.y
    })
    if (grow) {
        // Binding exposes capacity as the instance count. Refresh bounds only
        // after restoring the occupied count, excluding unused capacity slots.
        const skipBounds = mesh.doNotSyncBoundingInfo
        mesh.doNotSyncBoundingInfo = true
        try {
            mesh.thinInstanceSetBuffer('matrix', buffers.matrices, 16, false)
            mesh.thinInstanceSetBuffer('uvc', buffers.uv, 2, false)
        } finally {
            mesh.doNotSyncBoundingInfo = skipBounds
        }
    }
    mesh.thinInstanceCount = count
    if (!grow && count > 0) {
        // Use Babylon's setter to also keep its lazy picking-matrix cache in
        // sync. Upload once, after all matrices have been copied.
        matrices.forEach((matrix, index) => mesh.thinInstanceSetMatrixAt(index, matrix, false))
        mesh.thinInstanceBufferUpdated('matrix')
        mesh.thinInstanceBufferUpdated('uvc')
    }
    if (count > 0) mesh.thinInstanceRefreshBoundingInfo(false)
    return buffers.matrices
}
