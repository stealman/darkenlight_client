import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { Prefab } from '@/babylon/world/worldRenderer'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'

export class Shrub2x2 extends BaseStaticObject {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2, prefab: Prefab) {
        super(type, position, rotation, material, prefab)
    }

    render() {
        const matrix = Matrix.Translation(this.renderPosition.x, this.renderPosition.y + 0.3, this.renderPosition.z)
        this.prefab!.matrices.push(Matrix.RotationY(this.rotation).multiply(matrix))
        this.prefab!.uvData.push(this.material)
    }
}

export class Shrub1x1_tall extends BaseStaticObject {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2, prefab: Prefab) {
        super(type, position, rotation, material, prefab)
    }

    render() {
        const matrix = Matrix.Translation(this.renderPosition.x, this.renderPosition.y + 0.3, this.renderPosition.z)
        this.prefab!.matrices.push(Matrix.RotationY(this.rotation).multiply(matrix))
        this.prefab!.uvData.push(this.material)
    }
}

export class Shrub1x1_small extends BaseStaticObject {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2, prefab: Prefab) {
        super(type, position, rotation, material, prefab)
    }

    render() {
        const matrix = Matrix.Translation(this.renderPosition.x, this.renderPosition.y + 0.3, this.renderPosition.z)
        this.prefab!.matrices.push(Matrix.RotationY(this.rotation).multiply(matrix))
        this.prefab!.uvData.push(this.material)
    }
}
