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
    /** Maps the zero-based server material index to an atlas tile index. */
    materialAtlasIndices: Map<number, number> | null = null
    materialAtlasFallbackIndex: number = 0
    weaponTipPosition: Vector3 | null = null

    constructor(id: number, model: string, pos: Vector3, scale: Vector3, weaponTipPosition: Vector3 | null, matSize: Vector2 | null,
                materialAtlasIndices: Map<number, number> | null = null, materialAtlasFallbackIndex: number = 0) {
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

        this.materialAtlasIndices = materialAtlasIndices
        this.materialAtlasFallbackIndex = materialAtlasFallbackIndex
        this.weaponTipPosition = weaponTipPosition
    }

    resolveMaterialAtlasIndex(materialIndex: number): number {
        return this.materialAtlasIndices
            ? (this.materialAtlasIndices.get(materialIndex) ?? this.materialAtlasFallbackIndex)
            : materialIndex
    }
}
