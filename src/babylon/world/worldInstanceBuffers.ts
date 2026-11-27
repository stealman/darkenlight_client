import { Matrix, Mesh, Vector2 } from '@babylonjs/core'
import type { Material } from '@babylonjs/core'

// Mesh lifetime owns the retained CPU/GPU capacity, including empty batches.
const buffersByMesh = new WeakMap<Mesh, {matrices: Float32Array, uv: Float32Array}>()

async function warmUpWorldInstanceMaterial(mesh: Mesh, material: Material) {
    const count = mesh.thinInstanceCount
    const temporary = !mesh.getVertexBuffer('world0')
    const skipBounds = mesh.doNotSyncBoundingInfo
    try {
        if (temporary) {
            mesh.doNotSyncBoundingInfo = true
            mesh.thinInstanceSetBuffer('matrix', new Float32Array(Matrix.Identity().m), 16, false)
        } else if (!count) mesh.thinInstanceCount = 1
        await material.forceCompilationAsync(mesh, {useInstances: true})
        if (material.needDepthPrePass) {
            const engine = mesh.getEngine()
            const colorWrite = engine.getColorWrite()
            engine.setColorWrite(false)
            try {
                await material.forceCompilationAsync(mesh, {useInstances: true})
            } finally {
                engine.setColorWrite(colorWrite)
            }
        }
    } finally {
        if (temporary) mesh.thinInstanceSetBuffer('matrix', null)
        else mesh.thinInstanceCount = count
        mesh.doNotSyncBoundingInfo = skipBounds
    }
}

export async function warmUpWorldInstanceMaterials(meshes: Iterable<Mesh | null | undefined>,
    onProgress?: (completed: number, total: number) => void) {
    const parallel = new Map<Material, Mesh[]>()
    const depthPrePass: [Mesh, Material][] = []
    let total = 0
    for (const mesh of meshes) {
        const material = mesh?.material
        if (!mesh || !material) continue
        total++
        if (material.needDepthPrePass) {
            depthPrePass.push([mesh, material])
        } else {
            let group = parallel.get(material)
            if (!group) parallel.set(material, group = [])
            group.push(mesh)
        }
    }
    let completed = 0
    onProgress?.(completed, total)
    const warm = async (mesh: Mesh, material: Material) => {
        try {
            await warmUpWorldInstanceMaterial(mesh, material)
        } catch (error) {
            console.warn('World material warm-up failed', material.name, error)
        } finally {
            onProgress?.(++completed, total)
        }
    }
    const groups = parallel.entries()
    const supportsParallel = parallel.values().next().value?.[0]?.getEngine().getCaps().parallelShaderCompile
    // A compilation temporarily changes the material's hot-swapping state.
    // Each concurrent group owns a different material.
    await Promise.all(Array.from({length: Math.min(parallel.size, supportsParallel ? 8 : 1)}, async () => {
        for (const [material, group] of groups) {
            for (const mesh of group) await warm(mesh, material)
        }
    }))
    // The depth pre-pass changes the engine's color-write state.
    for (const [mesh, material] of depthPrePass) await warm(mesh, material)
}

export function updateWorldInstanceBuffers(mesh: Mesh, matrices: Matrix[], uvData: Vector2[], refreshBounds = true): Float32Array {
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
        if (!refreshBounds && !mesh.isPickable) {
            // The caller supplies bounds and the mesh never needs Babylon's picking cache.
            for (let i = 0; i < count; i++) matrices[i].copyToArray(buffers.matrices, i * 16)
        } else {
            matrices.forEach((matrix, index) => mesh.thinInstanceSetMatrixAt(index, matrix, false))
        }
        mesh.thinInstanceBufferUpdated('matrix')
        mesh.thinInstanceBufferUpdated('uvc')
    }
    if (count > 0 && refreshBounds) mesh.thinInstanceRefreshBoundingInfo(false)
    return buffers.matrices
}
