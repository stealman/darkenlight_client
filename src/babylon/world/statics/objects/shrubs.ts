import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { StaticLeafPlanes } from '@/babylon/world/statics/staticLeafPlanes'
import { createLeafBlockPlaneMatrix } from '@/babylon/world/prefabs/leafBlockPlanes'

function createBlocks(layers: number[][][]): Matrix[] {
    const scale = Matrix.Scaling(0.5, 0.5, 0.5)
    return layers.flatMap((layer, y) => layer.map(([x, z]) =>
        scale.multiply(Matrix.Translation(x, y * 0.5, z)),
    ))
}

const SMALL_BLOCKS = createBlocks([
    [[0, -0.5], [-0.5, 0], [0, 0], [0.5, 0], [0, 0.5]],
    [[0, 0]],
])

const TALL_BLOCKS = createBlocks([
    [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0], [0.5, 0], [0, 0.5]],
    [[-0.5, -0.5], [0, -0.5], [0, 0], [0.5, 0], [0, 0.5]],
    [[-0.5, 0], [0, -0.5], [0, 0]],
    [[0, 0]],
])

const LARGE_BLOCKS = createBlocks([
    [[-1, -0.5], [-0.5, -1], [0.5, -1], [1, -0.5], [-1, 0.5], [-0.5, 0.5], [0.5, 0.5], [1, 0.5], [-0.5, 1], [0.5, 1], [0, 0]],
    [[-0.75, -0.25], [-0.25, -0.75], [0.25, -0.75], [0.75, -0.25], [-0.75, 0.25], [0.75, 0.25], [-0.25, 0.75], [0.25, 0.75], [0, 0]],
    [[-0.75, -0.25], [-0.25, -0.5], [0.25, -0.5], [0.75, -0.25], [-0.75, 0.25], [-0.25, 0.25], [0.25, 0.25], [0.75, 0.25], [-0.25, 0.6], [0.25, 0.6]],
    [[-0.35, -0.1], [0.35, -0.1], [-0.2, 0.25], [0.2, 0.25], [0, 0.5]],
])

function createLeafPlanes(blocks: Matrix[]): Matrix[] {
    const planes: Matrix[] = []
    const halfSize = new Vector3(0.25, 0.25, 0.25)
    const top = Math.max(...blocks.map(block => block.m[13]))
    blocks.forEach((block, index) => {
        const x = block.m[12], y = block.m[13], z = block.m[14]
        if (!(index % 3 === 0 && Math.hypot(x, z) >= 0.5) && y !== top) return
        // Block centres include the source mesh's fixed -0.5 Y offset.
        const position = Matrix.Translation(x, y - 0.5, z)
        for (let face = 0; face < 2; face++) {
            planes.push(createLeafBlockPlaneMatrix(halfSize, index, face).multiply(position))
        }
    })
    return planes
}

const SMALL_PLANES = createLeafPlanes(SMALL_BLOCKS)
const TALL_PLANES = createLeafPlanes(TALL_BLOCKS)
const LARGE_PLANES = createLeafPlanes(LARGE_BLOCKS)

abstract class Shrub extends BaseStaticObject {
    protected constructor(type: number, position: Vector3, rotation: number, material: Vector2,
        private readonly blocks: Matrix[], private readonly planes: Matrix[]) {
        super(type, position, rotation, material, StaticLeafPlanes.prefab)
    }

    render() {
        // The shared block mesh is offset down by 0.5; preserve the original
        // shrub centres at renderPosition.y + 0.3.
        const world = Matrix.RotationY(this.rotation).multiply(
            Matrix.Translation(this.renderPosition.x, this.renderPosition.y + 0.8, this.renderPosition.z),
        )
        for (const block of this.blocks) {
            WorldRenderer.blockWithAlpha1!.matrices.push(block.multiply(world))
            WorldRenderer.blockWithAlpha1!.uvData.push(this.material)
        }
        for (const plane of this.planes) {
            this.prefab!.matrices.push(plane.multiply(world))
            this.prefab!.uvData.push(this.material)
        }
    }
}

export class Shrub2x2 extends Shrub {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, LARGE_BLOCKS, LARGE_PLANES)
    }
}

export class Shrub1x1_tall extends Shrub {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, TALL_BLOCKS, TALL_PLANES)
    }
}

export class Shrub1x1_small extends Shrub {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, SMALL_BLOCKS, SMALL_PLANES)
    }
}
