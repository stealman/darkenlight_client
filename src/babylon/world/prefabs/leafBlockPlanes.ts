import { Matrix, Mesh, MeshBuilder, Vector3 } from '@babylonjs/core'

export function createLeafBlockPlaneMatrix(halfSize: Vector3, seed: number, face: number): Matrix {
    const variation = (seed % 5) / 4
    const side = face === 0 ? -1 : 1
    const reach = 1.48 + variation * 0.1
    // A horizontal diamond puts its four corners at the centres of the
    // block's side faces. Opposing small tilts keep the two planes irregular.
    return Matrix.RotationZ(Math.PI / 4)
        .multiply(Matrix.RotationX(Math.PI / 2))
        .multiply(Matrix.Scaling(halfSize.x * Math.SQRT2 * reach, 1, halfSize.z * Math.SQRT2 * reach))
        .multiply(Matrix.RotationYawPitchRoll(
            (variation - 0.5) * 0.1,
            side * (0.12 + variation * 0.06),
            -side * (0.08 + variation * 0.05),
        ))
        .multiply(Matrix.Translation(0, side * halfSize.y * 0.12, 0))
}

export function addLeafBlockPlanes(parts: Mesh[], block: Mesh, seed: number) {
    const halfSize = block.getBoundingInfo().boundingBox.extendSize
    for (let face = 0; face < 2; face++) {
        const plane = MeshBuilder.CreatePlane('leafBlockTips', {
            size: 1,
            sideOrientation: Mesh.DOUBLESIDE,
        }, block.getScene())
        plane.bakeTransformIntoVertices(createLeafBlockPlaneMatrix(halfSize, seed, face))
        plane.position.copyFrom(block.position)
        // Keep the tips aligned with the block's own side faces when it is tilted.
        plane.rotation.copyFrom(block.rotation)
        parts.push(plane)
    }
}
