export class EquipSlotInfo {
    slot: string
    weaponType: string | null
    modelId: number = 0

    constructor(modelId: number, slot: string, weaponType: string | null) {
        this.slot = slot
        this.weaponType = weaponType
        this.modelId = modelId
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

export const EquipSlotsCb = {
    LONGSWORD: new EquipSlotInfo(10, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    BROADSWORD: new EquipSlotInfo(20, EquipItemSlots.R_HAND, WeaponTypes.SWORD ),
    BOW: new EquipSlotInfo(500, EquipItemSlots.R_HAND, WeaponTypes.BOW),

    ARMOR_PLATE: new EquipSlotInfo(1000, EquipItemSlots.BODY, null),

    HELM: new EquipSlotInfo(1100, EquipItemSlots.HEAD, null),
    HELM_CLOSED: new EquipSlotInfo(1110, EquipItemSlots.HEAD, null),

    PAULDRONS_PLATE: new EquipSlotInfo(1200, EquipItemSlots.PAULDRONS, null),

    LEGS_PLATE: new EquipSlotInfo(1300, EquipItemSlots.LEGS, null),

    getById(id: number): EquipSlotInfo | null {
        for (const key in this) {
            const slotInfo = (this as any)[key]
            if (slotInfo instanceof EquipSlotInfo && slotInfo.modelId === id) {
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
    slotInfo: EquipSlotInfo

    constructor(id: number, itemId: number, modelId: number, matId: number, name: string | null) {
        this.id = id
        this.itemType = itemId
        this.modelId = modelId
        this.materialId = matId
        this.name = name
        this.slotInfo = EquipSlotsCb.getById(modelId)!

        if (!this.slotInfo) {
            throw new Error(`EquipSlotInfo not found for modelId: ${modelId}`)
        }
    }

    static fromData(data: any): Item {
        return new Item(data.id, data.tp, data.mId, data.matId, data.name || null)
    }
}
