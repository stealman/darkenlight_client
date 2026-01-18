import { Vector2, Vector3 } from '@babylonjs/core'

export class EquipCbItem {
    id: number
    name: string
    model: string
    pos: Vector3
    rot: Vector3
    scale: Vector3
    matCols: number = 1
    matRows: number = 1
    weaponTipPosition: Vector3 | null = null

    constructor(id: number, model: string, pos: Vector3, scale: Vector3, weaponTipPosition: Vector3 | null, matSize: Vector2 | null) {
        this.id = id
        this.model = model
        this.name = id + "_" + model
        this.pos = pos
        this.scale = scale
        if (matSize) {
            // Override material rows and cols if material set is specified
            this.matCols = matSize.x
            this.matRows = matSize.y
        }

        this.weaponTipPosition = weaponTipPosition
    }
}
