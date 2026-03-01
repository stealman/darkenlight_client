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
    itemType: number
    modelId: number
    materialId: number | null = null
    name: string | null = null
    imgUrl: string | null = null
    slotInfo: EquipSlotModel

    constructor(id: number, itemId: number, modelId: number, matId: number, name: string | null, imgUrl: string) {
        this.id = id
        this.itemType = itemId
        this.modelId = modelId
        this.materialId = matId
        this.name = name
        this.imgUrl = "images/items/" + imgUrl
        this.slotInfo = EquipSlotModelsCb.getById(modelId)!
        if (!this.slotInfo) {
            throw new Error(`EquipSlotInfo not found for modelId: ${modelId}`)
        }
    }

    static fromData(data: any): Item {
        return new Item(data.id, data.tp, data.mId, data.matId, data.name || null, data.img)
    }
}
