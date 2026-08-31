import Character from '@/babylon/character/character'
import { Item, EquipSlotModelsCb } from '@/data/items/item'

type NpcEquipmentItem = {
    modelId: number
    materialId: number
}

type NpcEquipment = Partial<Record<'head' | 'arms' | 'legs' | 'body' | 'weapon', NpcEquipmentItem>>

export class Npc extends Character {
    type: string
    title: string
    bodyType: string
    equipment: NpcEquipment
    wanderingRange: number

    constructor(data: any) {
        super({
            ...data,
            cls: 'FIGHTER',
            bsz: data.bsz ?? 0.8,
            equipSet: {}
        })
        this.type = data.type
        this.title = data.title ?? ''
        this.bodyType = data.bodyType ?? 'steve'
        this.equipment = {}
        this.wanderingRange = data.wr ?? 0
        this.changeAppearance(this.bodyType, data.equipment)
        this.nameDisplayTime = Number.MAX_SAFE_INTEGER
    }

    changeAppearance(bodyType: string, equipment: NpcEquipment | undefined) {
        this.bodyType = bodyType || 'steve'
        this.equipment = equipment || {}
        this.equipSet.clear()

        const slots: Array<[keyof NpcEquipment, number]> = [
            ['weapon', 1],
            ['body', 2],
            ['head', 3],
            ['arms', 4],
            ['legs', 5],
        ]
        for (const [slot, itemId] of slots) {
            const itemData = this.equipment[slot]
            if (!itemData || !Number.isInteger(itemData.modelId) || !Number.isInteger(itemData.materialId)) {
                continue
            }
            const slotInfo = EquipSlotModelsCb.getById(itemData.modelId)
            if (!slotInfo) {
                continue
            }
            this.equipSet.set(slotInfo.slot, new Item(-(this.id * 10 + itemId), itemData.modelId, slot === 'weapon' ? 'W' : 'A', itemData.modelId, itemData.materialId, null, '', new Map()))
        }

        if (this.model?.initialized) {
            this.model.clearAllEquippedItems()
            this.model.assignEquippedItems()
        }
    }

    onFrame(timeRate: number, actualTime: number, myChar: boolean) {
        super.onFrame(timeRate, actualTime, myChar)
        this.nameDisplayTime = Number.MAX_SAFE_INTEGER
    }

    getObjectType(): string {
        return 'N'
    }

    getRelationToMyPlayer(): 'ALLY' | 'ENEMY' | 'NEUTRAL' {
        return 'NEUTRAL'
    }
}
