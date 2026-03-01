import { Matrix, Mesh, Quaternion, Scene, Vector2, Vector3 } from '@babylonjs/core'
import { ViewportManager } from '@/utils/viewport'
import { Item } from '@/data/items/item'
import { Utils } from '@/utils/utils'
import { EquipManager } from '@/babylon/item/equipManager'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'

export const GroundItemsManager = {
    scene: null as Scene | null,
    itemTypes: new Map<number, GroundItemType>(),
    items: new Array<GroundItem>(),
    visibleItems: new Array<GroundItem>(),

    _tmpPos: new Matrix(),
    _tmpRot: new Matrix(),
    _tmpWorld: new Matrix(),
    _tmpQuat: Quaternion.Identity(),

    ITEM_BOX_SIZE: 0.2,
    ITEM_Y_OFFSET: 0.02,

    initialize(scene: Scene) {
        this.scene = scene
        this.itemTypes.clear()

        EquipManager.itemTypes.forEach((equipType, modelId) => {
            if (!equipType.mesh) {
                return
            }

            const sourceMesh = equipType.mesh
            const groundMesh = new Mesh(`ground-item-${modelId}`, scene)
            const groundGeometry = sourceMesh.geometry?.copy(`ground-item-geo-${modelId}`)
            groundGeometry?.applyToMesh(groundMesh)
            groundMesh.material = sourceMesh.material
            groundMesh.position.copyFrom(sourceMesh.position)
            groundMesh.rotation.copyFrom(sourceMesh.rotation)
            groundMesh.scaling.copyFrom(sourceMesh.scaling)
            if (sourceMesh.rotationQuaternion) {
                groundMesh.rotationQuaternion = sourceMesh.rotationQuaternion.clone()
            }

            groundMesh.setEnabled(false)
            groundMesh.alwaysSelectAsActiveMesh = true
            groundMesh.isPickable = false
            groundMesh.thinInstanceCount = 0

            this.itemTypes.set(modelId, new GroundItemType(modelId, equipType.cbData, groundMesh))
        })
    },

    addItems(data: Array<{ item: Item, x: number, z: number }>) {
        for (const dt of data) {
            const y = Utils.calculateYPos(dt.x, dt.z, this.ITEM_BOX_SIZE) + this.ITEM_Y_OFFSET
            const item = new GroundItem(dt.item, new Vector3(dt.x, y, dt.z))
            this.items.push(item)
        }
    },

    removeItems(data: unknown[]) {

    },

    update(_timeRate: number, time: number) {
        this.updateVisibleItems()
        this.renderItems(time)
    },

    updateVisibleItems() {
        this.visibleItems = []
        for (const item of this.items) {
            if (ViewportManager.isPointInVisibleMatrix(Math.floor(item.pos.x), Math.floor(item.pos.z), 2)) {
                this.visibleItems.push(item)
            }
        }
    },

    renderItems(_time: number) {
        const itemsByType = new Map<GroundItemType, Array<GroundItem>>()

        for (const item of this.visibleItems) {
            const type = this.itemTypes.get(item.item.modelId)
            if (!type) {
                continue
            }

            if (!itemsByType.has(type)) {
                itemsByType.set(type, [])
            }
            itemsByType.get(type)!.push(item)
        }

        this.itemTypes.forEach((type) => {
            const typeItems = itemsByType.get(type) || []
            type.updateCount(typeItems.length)
            if (!type.mesh || typeItems.length === 0) {
                return
            }

            type.ensureThinBuffers(type)
            let i = 0
            for (const item of typeItems) {
                Matrix.TranslationToRef(item.pos.x, item.pos.y, item.pos.z, this._tmpPos)
                Quaternion.FromEulerAnglesToRef(0, item.rotationY, 0, this._tmpQuat)
                Matrix.FromQuaternionToRef(this._tmpQuat, this._tmpRot)
                this._tmpRot.multiplyToRef(this._tmpPos, this._tmpWorld)

                this._tmpWorld.copyToArray(type.instanceBuffer, i * 16)
                type.uvBuffer[i * 2] = item.matVector.x
                type.uvBuffer[i * 2 + 1] = item.matVector.y
                i++
            }

            type.mesh.thinInstanceCount = i
            type.mesh.thinInstanceBufferUpdated('matrix')
            type.mesh.thinInstanceBufferUpdated('uvc')
            type.mesh.thinInstanceRefreshBoundingInfo()
        })
    },
}

class GroundItem {
    item: Item
    pos: Vector3
    matVector: Vector2
    rotationY: number = 0

    constructor(item: Item, pos: Vector3) {
        this.item = item
        this.pos = pos

        const type = GroundItemsManager.itemTypes.get(item.modelId)
        const matIndex = Math.max((item.materialId || 1) - 1, 0)
        this.matVector = this.getAtlasUvcOffsets(type?.cbData.matCols || 1, type?.cbData.matRows || 1, matIndex)
        this.rotationY = (item.id % 8) * (Math.PI / 8)
    }

    getAtlasUvcOffsets(matCols: number, matRows: number, matIndex: number, pad = 0) {
        const tileX = matIndex % matCols
        const tileY = Math.floor(matIndex / matCols)

        const matCol = tileX + pad
        const matRow = matRows - (tileY + (1 - pad))
        return new Vector2(matCol, matRow)
    }
}

class GroundItemType {
    id: number
    mesh: Mesh | null = null
    count: number = -1

    instanceBuffer: Float32Array = new Float32Array(0)
    uvBuffer: Float32Array = new Float32Array(0)
    cbData: EquipCbItem
    _thinReady: boolean = false

    constructor(id: number, cbData: EquipCbItem, mesh: Mesh) {
        this.id = id
        this.cbData = cbData
        this.mesh = mesh
    }

    ensureThinBuffers(type: GroundItemType) {
        if (!type.mesh) return
        if (type._thinReady) return

        type.mesh.thinInstanceSetBuffer('matrix', type.instanceBuffer, 16, false)
        type.mesh.thinInstanceRegisterAttribute('uvc', 2)
        type.mesh.thinInstanceSetBuffer('uvc', type.uvBuffer, 2, false)
        type._thinReady = true
    }

    updateCount(count: number) {
        if (count === this.count) {
            return
        }

        this.count = count
        this.instanceBuffer = new Float32Array(16 * count)
        this.uvBuffer = new Float32Array(2 * count)

        if (!this.mesh) return
        if (count === 0) {
            this.mesh.setEnabled(false)
            this.mesh.thinInstanceCount = 0
            return
        }

        this.mesh.setEnabled(true)
        this.mesh.alwaysSelectAsActiveMesh = true
        this._thinReady = false
        this.ensureThinBuffers(this)
    }
}
