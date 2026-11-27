import { Matrix } from '@babylonjs/core'
import type { Vector3 } from '@babylonjs/core'
import type { TreeModel, TreePiece, TreeVariant } from './treeGenerator'
import type { TreeDetail, TreeShape } from './treeSpecies'

type TreeShapeTemplate = {
    count: number
    matrix: Float32Array
    treeStyle: Float32Array
    treeShape: Float32Array
    treeJointA: Float32Array
    treeJointB: Float32Array
    trunk: Uint8Array
}

const templates = new WeakMap<TreeModel, Map<TreeShape, TreeShapeTemplate>>()

function prepareShape(parts: readonly TreePiece[], rotation: Matrix): TreeShapeTemplate {
    const count = parts.length
    const matrix = new Float32Array(count * 16)
    const treeStyle = new Float32Array(count * 4)
    const treeShape = new Float32Array(count * 4)
    const treeJointA = new Float32Array(count * 4)
    const treeJointB = new Float32Array(count * 4)
    const trunk = new Uint8Array(count)
    for (let i = 0; i < count; i++) {
        const part = parts[i]
        const offset = i * 4
        part.matrix.multiplyToArray(rotation, matrix, i * 16)
        treeStyle[offset] = part.palette
        treeStyle[offset + 1] = part.tint
        treeShape[offset] = part.taper
        treeShape[offset + 1] = part.length
        treeShape[offset + 2] = part.grain
        treeShape[offset + 3] = part.radius / part.length
        part.startJoint?.toArray(treeJointA, offset)
        part.endJoint?.toArray(treeJointB, offset)
        trunk[i] = Number(!!part.trunk)
    }
    return {count, matrix, treeStyle, treeShape, treeJointA, treeJointB, trunk}
}

export function getTreeInstanceTemplates(variant: TreeVariant, detail: TreeDetail) {
    const model = variant.models[detail]
    let shapes = templates.get(model)
    if (shapes) return shapes
    shapes = new Map()
    const rotation = Matrix.RotationY(variant.yaw)
    for (const [shape, parts] of model.shapes) shapes.set(shape, prepareShape(parts, rotation))
    templates.set(model, shapes)
    return shapes
}

export function placeTreeShape(template: TreeShapeTemplate, position: Vector3, size: number, style: number,
    fullBarkDetail: boolean, trunkBarkLimit: number) {
    const {count, matrix: local, treeShape, treeJointA, treeJointB, trunk} = template
    const matrix = new Float32Array(local.length)
    const treeStyle = new Float32Array(template.treeStyle)
    const treeBarkLimit = new Float32Array(count)
    const {x, y, z} = position
    for (let i = 0; i < count; i++) {
        const start = i * 16
        for (let j = start; j < start + 12; j++) matrix[j] = local[j] * size
        matrix[start + 12] = local[start + 12] * size + x
        matrix[start + 13] = local[start + 13] * size + y
        matrix[start + 14] = local[start + 14] * size + z
        matrix[start + 15] = 1
        treeStyle[i * 4 + 2] = style
        treeStyle[i * 4 + 3] = y
        treeBarkLimit[i] = fullBarkDetail ? -1 : trunk[i] * trunkBarkLimit
    }
    return {count, buffers: {matrix, treeStyle, treeShape, treeJointA, treeJointB, treeBarkLimit}}
}
