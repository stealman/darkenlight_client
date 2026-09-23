import { Matrix, Vector2, Vector3 } from '@babylonjs/core'

export const VectorY90 = new Vector3(0, Math.PI / 2, 0)

export const BabylonUtils = {
    createPositionBuffer(matrices: Matrix[]): Float32Array {
        const buffer = new Float32Array(matrices.length * 16)

        matrices.forEach((matrix, index) => {
            matrix.copyToArray(buffer, index * 16)
        })

        return buffer
    },

    createUvBuffer(uvData: Vector2[]): Float32Array {
        const buffer = new Float32Array(uvData.length * 2)

        uvData.forEach((vec, index) => {
            buffer[index * 2] = vec.x
            buffer[index * 2 + 1] = vec.y
        })

        return buffer
    },

    getSymVector(s: number) {
        return new Vector3(s, s, s)
    }
}
