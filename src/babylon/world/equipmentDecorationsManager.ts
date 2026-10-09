import { Matrix, Quaternion, Vector2, Vector3 } from '@babylonjs/core'
import { EquipItemType, EquipManager, EquipThinInstance } from '@/babylon/item/equipManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'

export interface EquipmentDecorationData {
    id: number
    category: 'WEAPON' | 'ARMOR'
    codebookId: number
    modelId: number
    materialId: number
    x: number
    z: number
    offset: {x: number, y: number, z: number}
    rotation: {x: number, y: number, z: number}
}

class EquipmentDecorationInstance implements EquipThinInstance {
    type: EquipItemType
    matVector: Vector2
    position = Vector3.Zero()
    quaternion: Quaternion
    scaleMatrix = Matrix.Identity()

    constructor(public data: EquipmentDecorationData) {
        this.type = EquipManager.itemTypes.get(data.modelId)!
        const materialIndex = Math.max(0, data.materialId - 1)
        const tileX = materialIndex % this.type.cbData.matCols
        const tileY = Math.floor(materialIndex / this.type.cbData.matCols)
        this.matVector = new Vector2(tileX, this.type.cbData.matRows - tileY - 1)
        const radians = Math.PI / 180
        this.quaternion = Quaternion.FromEulerAngles(
            data.rotation.x * radians,
            data.rotation.y * radians,
            data.rotation.z * radians,
        )
        this.recountPosition()
    }

    recountPosition() {
        const block = WorldDataManager.getBlockMap()[this.data.x]?.[this.data.z]
        const surfaceY = (block?.totalHeight ?? 0) + BuildingManager.getFloorHeightAtTile(this.data.x, this.data.z)
        this.position.set(
            this.data.x + this.data.offset.x,
            surfaceY + this.data.offset.y,
            this.data.z + this.data.offset.z,
        )
    }
}

export const EquipmentDecorationsManager = {
    decorations: new Map<number, EquipmentDecorationInstance>(),
    previewId: -1,

    add(data: EquipmentDecorationData) {
        this.remove(data.id)
        if (!EquipManager.itemTypes.has(data.modelId)) {
            console.warn(`Equipment decoration ${data.id} uses unknown model ${data.modelId}`)
            return
        }
        const decoration = new EquipmentDecorationInstance(data)
        this.decorations.set(data.id, decoration)
        EquipManager.addThinInstance(decoration)
    },

    consume(items: EquipmentDecorationData[]) {
        items.forEach((item) => this.add(item))
    },

    remove(id: number) {
        const decoration = this.decorations.get(id)
        if (!decoration) return
        EquipManager.removeThinInstance(decoration)
        this.decorations.delete(id)
    },

    removeMany(ids: number[]) {
        ids.forEach((id) => this.remove(id))
    },

    getFirstOnTile(x: number, z: number): EquipmentDecorationData | null {
        for (const decoration of this.decorations.values()) {
            if (decoration.data.id !== this.previewId && decoration.data.x === x && decoration.data.z === z) {
                return decoration.data
            }
        }
        return null
    },

    setPreview(data: Omit<EquipmentDecorationData, 'id'>) {
        this.add({id: this.previewId, ...data})
    },

    clearPreview() {
        this.remove(this.previewId)
    },

    recountYPositions() {
        this.decorations.forEach((decoration) => decoration.recountPosition())
    },

    clearWorld() {
        Array.from(this.decorations.keys()).forEach((id) => this.remove(id))
    },
}
