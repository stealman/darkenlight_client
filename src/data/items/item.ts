import { ItemTO } from '@/network/messageIfs'

export class EquipSlotModel {
    modelId: number = 0
    slot: string
    weaponType: string | null

    constructor(modelId: number, slot: string, weaponType: string | null) {
        this.modelId = modelId
        this.slot = slot
        this.weaponType = weaponType
    }
}

export const EquipItemSlots = {
    R_HAND: "R_HAND",
    L_HAND: "L_HAND",
    HEAD: "HEAD",
    BODY: "BODY",
    PAULDRONS: "PAULDRONS",
    LEGS: "LEGS",
}

export const WeaponTypes = {
    SWORD: "SWORD",
    BOW: "BOW",
}

export const EquipSlotModelsCb = {
    LONGSWORD: new EquipSlotModel(10, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    BROADSWORD: new EquipSlotModel(20, EquipItemSlots.R_HAND, WeaponTypes.SWORD ),
    HUNTERBOW: new EquipSlotModel(510, EquipItemSlots.R_HAND, WeaponTypes.BOW),

    ARMOR_PLATE: new EquipSlotModel(1000, EquipItemSlots.BODY, null),

    HELM: new EquipSlotModel(1100, EquipItemSlots.HEAD, null),
    HELM_CLOSED: new EquipSlotModel(1110, EquipItemSlots.HEAD, null),

    PAULDRONS_PLATE: new EquipSlotModel(1200, EquipItemSlots.PAULDRONS, null),

    LEGS_PLATE: new EquipSlotModel(1300, EquipItemSlots.LEGS, null),

    getById(id: number): EquipSlotModel | null {
        for (const key in this) {
            const slotInfo = (this as any)[key]
            if (slotInfo instanceof EquipSlotModel && slotInfo.modelId === id) {
                return slotInfo
            }
        }
        return null
    }
}

export class Item {
    id: number
    cbId: number
    cbType: string
    modelId: number
    materialId: number | null = null
    name: string | null = null
    imgUrl: string | null = null
    slotInfo: EquipSlotModel

    atts: Map<string, number | string> = new Map()

    constructor(id: number, cbId: number, cbType: string, modelId: number, matId: number, name: string | null, imgUrl: string, atts: Map<string, number | string>) {
        this.id = id
        this.cbType = cbType
        this.cbId = cbId
        this.modelId = modelId
        this.materialId = matId
        this.name = name
        this.imgUrl = "images/items/" + imgUrl
        this.slotInfo = EquipSlotModelsCb.getById(modelId)!
        this.atts = atts
        if (!this.slotInfo && (cbType === 'W' || cbType === 'A' || cbType === 'J')) {
            throw new Error(`EquipSlotInfo not found for modelId: ${modelId}`)
        }
    }

    static fromData(data: ItemTO): Item {
        return new Item(data.id, data.cb, data.tp, data.mId, data.matId, data.name || null, data.img, data.atts)
    }

    is3DModel(): boolean {
        return this.modelId > 0
    }

    isEquippable(): boolean {
        return this.slotInfo !== null
    }

    isStackable(): boolean {
        return this.cbType === 'R'
    }

    isConsumable(): boolean {
        return false
    }
}
