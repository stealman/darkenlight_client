import { Vector3 } from '@babylonjs/core'

export class MobEquipItemData {
    id: number
    name: string
    model: string
    materialSetName: string
    pos: Vector3
    rot: Vector3
    scale: Vector3
    matsX: number
    matsY: number
    hasAlpha: boolean
    weaponTipPosition: Vector3 | null = null

    constructor(id: number, name: string, model: string | null, materialSetName: string, pos: Vector3, scale: Vector3, matsX: number, matsY: number, hasAlpha: boolean, weaponTipPosition: Vector3 | null) {
        this.id = id
        this.name = name
        this.model = model? model : name
        this.materialSetName = materialSetName
        this.pos = pos
        this.scale = scale
        this.matsX = matsX
        this.matsY = matsY
        this.hasAlpha = hasAlpha
        this.weaponTipPosition = weaponTipPosition
    }
}
