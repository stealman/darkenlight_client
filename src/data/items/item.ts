import { ItemTO } from '@/network/messageIfs'
import { ConsumableHelper } from '@/data/items/consumableHelper'
import { t } from '@/i18n'

const itemTypeLocalizationSections: Record<string, string> = {
    W: 'weapons',
    A: 'armors',
    J: 'jewels',
    T: 'trinkets',
    R: 'resources',
}

export class Item {
    id: number
    cbId: number
    cbType: string
    modelId: number
    materialId: number | null = null
    nameKey: string | null = null
    imgUrl: string | null = null
    slotInfo: EquipSlotModel
    weaponCategory: string | null = null
    handsRequired: number | null = null
    weaponTags: string[] = []

    atts: Map<string, number | string> = new Map()

    constructor(id: number, cbId: number, cbType: string, modelId: number, matId: number, name: string | null, imgUrl: string, atts: Map<string, number | string>,
                weaponCategory: string | null = null, handsRequired: number | null = null, weaponTags: string[] = []) {
        this.id = id
        this.cbType = cbType
        this.cbId = cbId
        this.modelId = modelId
        this.materialId = matId
        this.nameKey = name
        this.imgUrl = "images/items/" + imgUrl + ".png"
        this.slotInfo = EquipSlotModelsCb.getById(modelId)!
        this.atts = atts
        this.weaponCategory = weaponCategory
        this.handsRequired = handsRequired
        this.weaponTags = weaponTags
        if (!this.slotInfo && (cbType === 'W' || cbType === 'A' || cbType === 'J')) {
            throw new Error(`EquipSlotInfo not found for modelId: ${modelId}`)
        }
    }

    get name(): string | null {
        if (!this.nameKey) {
            return null
        }

        const section = itemTypeLocalizationSections[this.cbType]
        const fullLocalizationKey = section ? `items.${section}.${this.nameKey}` : this.nameKey
        const localizedName = t(fullLocalizationKey)

        if (localizedName !== fullLocalizationKey) {
            return localizedName
        }

        const directLocalizedName = t(this.nameKey)
        return directLocalizedName === this.nameKey ? this.nameKey : directLocalizedName
    }

    static fromData(data: ItemTO): Item {
        return new Item(data.id, data.cb, data.tp, data.mId, data.matId, data.name || null, data.img, data.atts,
            data.wCat || null, data.hReq || null, data.tags || [])
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
        return ConsumableHelper.isItemConsumable(this)
    }

    hasWeaponTag(tag: string): boolean {
        return this.weaponCategory === tag || this.weaponTags.includes(tag)
    }

    isTwoHanded(): boolean {
        return this.handsRequired === 2
    }
}

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
    AXE: "AXE",
    PICKAXE: "PICKAXE",
    BOW: "BOW",
}

export const WeaponCategories = {
    SWORD: "SWORD",
    AXE: "AXE",
    BOW: "BOW",
}

export const WeaponTags = {
    MINING_TOOL: "MINING_TOOL",
    WOODCUTTING_TOOL: "WOODCUTTING_TOOL",
}

export const EquipSlotModelsCb = {
    LONGSWORD: new EquipSlotModel(10, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    BROADSWORD: new EquipSlotModel(20, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    GREATSWORD: new EquipSlotModel(30, EquipItemSlots.R_HAND, WeaponTypes.SWORD),

    HAND_AXE: new EquipSlotModel(110, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    BATTLE_AXE: new EquipSlotModel(120, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    GREATAXE: new EquipSlotModel(155, EquipItemSlots.R_HAND, WeaponTypes.SWORD),

    PICKAXE: new EquipSlotModel(150, EquipItemSlots.R_HAND, WeaponTypes.PICKAXE),
    LIGHT_MACE: new EquipSlotModel(210, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    FLANGED_MACE: new EquipSlotModel(220, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    WARHAMMER: new EquipSlotModel(230, EquipItemSlots.R_HAND, WeaponTypes.SWORD),

    HUNTING_SPEAR: new EquipSlotModel(310, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    WAR_SPEAR: new EquipSlotModel(320, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    HALBERD: new EquipSlotModel(330, EquipItemSlots.R_HAND, WeaponTypes.SWORD),

    KNIFE: new EquipSlotModel(410, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    STILETTO: new EquipSlotModel(420, EquipItemSlots.R_HAND, WeaponTypes.SWORD),
    RONDEL: new EquipSlotModel(430, EquipItemSlots.R_HAND, WeaponTypes.SWORD),

    HUNTINGBOW: new EquipSlotModel(510, EquipItemSlots.R_HAND, WeaponTypes.BOW),
    RECURVE_BOW: new EquipSlotModel(520, EquipItemSlots.R_HAND, WeaponTypes.BOW),
    LONGBOW: new EquipSlotModel(530, EquipItemSlots.R_HAND, WeaponTypes.BOW),

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
