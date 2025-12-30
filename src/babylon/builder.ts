import {
    Scene,
    MeshBuilder,
    VertexBuffer,
    Mesh,
    TransformNode,
} from '@babylonjs/core'

export const Builder = {
    createBlockWithFaces(scene: Scene, parent: TransformNode, size = 1) {
        const cube = MeshBuilder.CreateBox("block", { width: size, depth: size, height: size }, scene);

        const uvs = [
            // Front face
            1/4, 3/3,  // Bottom-left (T1)
            2/4, 3/3,  // Bottom-right
            2/4, 2/3,  // Top-right
            1/4, 2/3,  // Top-left

            // Back face
            1/4, 1/3,  // Bottom-left (T1)
            2/4, 1/3,  // Bottom-right
            2/4, 0,    // Top-right
            1/4, 0,    // Top-left

            // Left face
            1/4, 2/3,  // Bottom-left (T1)
            0, 2/3,    // Bottom-right
            0, 1/3,    // Top-right
            1/4, 1/3,  // Top-left

            // Right face
            2/4, 2/3,  // Bottom-left (T1)
            3/4, 2/3,  // Bottom-right
            3/4, 1/3,  // Top-right
            2/4, 1/3,  // Top-left

            // Top face
            1/4, 2/3,  // Bottom-left (T1)
            2/4, 2/3,  // Bottom-right
            2/4, 1/3,  // Top-right
            1/4, 1/3,  // Top-left

            // Bottom face
            1/4, 2/3,  // Bottom-left (D1)
            2/4, 2/3,  // Bottom-right
            2/4, 1.0,  // Top-right
            1/4, 1.0   // Top-left
        ];

        cube.setVerticesData(VertexBuffer.UVKind, uvs);
        cube.parent = parent
        cube.position.y = -0.5
        cube.convertToUnIndexedMesh()
        cube.alwaysSelectAsActiveMesh = true
        return cube;
    },

    createWrappedBlock(
        scene: Scene,
        parent: TransformNode | null,
        size = 1
    ) {
        const cube = MeshBuilder.CreateBox('block', { width: size, height: size, depth: size, wrap: true }, scene)
        cube.parent = parent
        cube.position.y = -0.5
        cube.convertToUnIndexedMesh()
        cube.alwaysSelectAsActiveMesh = true
        return cube
    },

    createBlock(scene: Scene, parent: TransformNode | null, size = 1) {
        const cube = MeshBuilder.CreateBox("block", { width: size, depth: size, height: size }, scene);
        cube.parent = parent
        cube.position.y = -0.5
        cube.convertToUnIndexedMesh()
        cube.alwaysSelectAsActiveMesh = true
        return cube;
    },

    createHorizontalPlane(scene: Scene, parent: TransformNode | null, size: number, yPos: number): Mesh {
        const plane = MeshBuilder.CreatePlane('hPlane', {width: size, height: size}, scene)
        plane.rotation.x = Math.PI / 2
        plane.position.y = yPos
        const mesh = Mesh.MergeMeshes([plane], true) as Mesh
        mesh.parent = parent
        mesh.thinInstanceEnablePicking = true
        mesh.alwaysSelectAsActiveMesh = true
        return mesh
    }
}
