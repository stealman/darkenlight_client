import { Vector3 } from '@babylonjs/core'

export class EquipCbItem {
    id: number
    name: string
    model: string
    materialSetName?: string
    pos: Vector3
    rot: Vector3
    scale: Vector3
    matCols: number = 16
    matRows: number = 8
    weaponTipPosition: Vector3 | null = null

    constructor(id: number, model: string, pos: Vector3, scale: Vector3, weaponTipPosition: Vector3 | null, materialSetName?: string) {
        this.id = id
        this.model = model
        this.name = id + "_" + model
        this.materialSetName = materialSetName
        this.pos = pos
        this.scale = scale
        if (this.materialSetName) {
            // Override material rows and cols if material set is specified
        }

        this.weaponTipPosition = weaponTipPosition
    }
}
