import Character from '@/babylon/character/character'
import { Item, EquipSlotModelsCb, WeaponCategories, WeaponTypes } from '@/data/items/item'
import { getLocale, t } from '@/i18n'
import { Vector3 } from '@babylonjs/core'
import { Utils } from '@/utils/utils'

type NpcEquipmentItem = {
    modelId: number
    materialId: number
}

type NpcEquipment = Partial<Record<'head' | 'arms' | 'legs' | 'body' | 'weapon' | 'shield', NpcEquipmentItem>>

export class Npc extends Character {
    type: string
    titleCZ: string
    titleEN: string
    bodyType: string
    equipment: NpcEquipment
    wanderingRange: number
    private movementTarget: Vector3 | null = null

    constructor(data: any) {
        super({
            ...data,
            cls: 'FIGHTER',
            bsz: data.bsz ?? 0.8,
            equipSet: {}
        })
        this.type = data.type
        const legacyTitle = data.title ?? ''
        this.titleCZ = data.titleCZ ?? legacyTitle
        this.titleEN = data.titleEN ?? legacyTitle
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
            ['shield', 6],
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
            const weaponCategory = slotInfo.weaponType === WeaponTypes.BOW ? WeaponCategories.BOW : null
            this.equipSet.set(slotInfo.slot, new Item(-(this.id * 10 + itemId), itemData.modelId, slot === 'weapon' ? 'W' : 'A', itemData.modelId, itemData.materialId, null, '', new Map(), weaponCategory))
        }

        if (this.model?.initialized) {
            this.model.clearAllEquippedItems()
            this.model.assignEquippedItems()
        }
    }

    onFrame(timeRate: number, actualTime: number, myChar: boolean) {
        if (!this.dead && this.movementTarget && this.getMoveAngle() !== null) {
            const remainingDistance = Math.hypot(
                this.pos.x - this.movementTarget.x,
                this.pos.z - this.movementTarget.z,
            )
            if (remainingDistance <= this.getActualSpeed() * timeRate) {
                this.pos.x = this.movementTarget.x
                this.pos.z = this.movementTarget.z
                this.logicYpos = Utils.calculateWalkYPos(this.pos.x, this.pos.z, this.getBoxSize())
                this.pos.y = this.logicYpos
                this.clearMovementTarget()
                this.stopMovementLocally()
            }
        }
        super.onFrame(timeRate, actualTime, myChar)
        this.nameDisplayTime = Number.MAX_SAFE_INTEGER
    }

    setMovementTarget(x: number, z: number) {
        this.movementTarget = new Vector3(x, this.pos.y, z)
    }

    clearMovementTarget() {
        this.movementTarget = null
    }

    getObjectType(): string {
        return 'N'
    }

    getTitle(): string {
        return getLocale() === 'cs' ? this.titleCZ : this.titleEN
    }

    getRelationToMyPlayer(): 'ALLY' | 'ENEMY' | 'NEUTRAL' {
        return 'ALLY'
    }
}

export class Guard extends Npc {
    definitionId: number
    alignment: 'neutral' | 'friendly'
    level: number
    guardMetadata: any
    killedTime: number = 0

    constructor(data: any) {
        super({
            ...data.guard,
            id: data.id,
            x: data.x,
            z: data.z,
            hpp: data.hpp,
            bsz: 0.8,
            wr: data.guard?.wanderingRange ?? 0,
        })
        this.definitionId = data.guard.definitionId
        this.alignment = data.alignment === 'friendly' ? 'friendly' : 'neutral'
        this.level = data.guard.level ?? 1
        this.guardMetadata = data.guard.metadata ?? {}
        this.type = 'guard'
        this.hpPercent = Number(data.hpp ?? 100)
    }

    getObjectType(): string {
        return 'M'
    }

    getName(): string {
        return this.name === 'Guard' ? t('npcs.defaultGuardName') : this.name
    }

    getRelationToMyPlayer(): 'ALLY' | 'ENEMY' | 'NEUTRAL' {
        return this.alignment === 'friendly' ? 'ALLY' : 'NEUTRAL'
    }

    isMyChar(): boolean {
        return false
    }
}
