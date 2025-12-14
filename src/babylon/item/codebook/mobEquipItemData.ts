import { Vector3 } from '@babylonjs/core'

export class MobEquipItemData {
    id: number
    name: string
    model: string
    texture: string
    pos: Vector3
    rot: Vector3
    scale: Vector3
    matsX: number
    matsY: number
    hasAlpha: boolean

    constructor(id: number, name: string, model: string | null, texture: string | null, pos: Vector3, rot: Vector3, scale: Vector3, matsX: number, matsY: number, hasAlpha: boolean = false) {
        this.id = id
        this.name = name
        this.model = model? model : name
        this.texture = texture? texture : name
        this.pos = pos
        this.rot = rot
        this.scale = scale
        this.matsX = matsX
        this.matsY = matsY
        this.hasAlpha = hasAlpha
    }
}
