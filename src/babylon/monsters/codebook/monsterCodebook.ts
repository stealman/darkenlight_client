import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MonsterBonesAnims } from '@/babylon/monsters/codebook/monsterBonesAnims'
import { BabylonUtils } from '@/babylon/utils'
import { Vector3 } from '@babylonjs/core'
import { Utils } from '@/utils/utils'

export const MonsterCodebook = {

    getMonsterTypeById(id: number): MonsterType {
        return Object.values(MonsterTypes).find((monsterType: MonsterType) => monsterType.id === id)!
    },

    initializeEquipAndAnimations(model: MonsterModel) {
        // TemplateId 1 and 2 are skeletons types
        if ([1, 2].includes(model.type.templateId)) {
            MonsterBonesAnims.initSkeleton(model)
        }

        // TemplateId 4 is a cat type
        if (model.type.templateId === 4) {
            MonsterBonesAnims.initCat(model)
        }
    },

    initEquip(model: MonsterModel) {
        const mobType = model.type

        if (mobType.weapon) {
            model.assignRhand(mobType.weapon.getRandomId(), mobType.weapon.mat, mobType.weapon.scale)
        }

        if (mobType.armor) {
            model.assignChest(mobType.armor.getRandomId(), mobType.armor.mat, mobType.armor.scale)
        }

        if (mobType.helmet) {
            model.assignHelmet(mobType.helmet.getRandomId(), mobType.helmet.mat, mobType.helmet.scale)
        }
    }
}

export class MonsterType {
    id: number
    templateId: number
    name: string
    weapon: MonsterEquipData | null
    armor:MonsterEquipData | null
    helmet: MonsterEquipData | null

    constructor(id: number, templateId: number, name: string, weapon: MonsterEquipData | null, helmet: MonsterEquipData | null, armor: MonsterEquipData | null) {
        this.id = id
        this.templateId = templateId
        this.name = name
        this.weapon = weapon
        this.armor = armor
        this.helmet = helmet
    }
}

export class MonsterEquipData {
    ids: Array<number>
    scale: Vector3 | undefined
    mat: number

    constructor(ids: Array<number>, scale: number | Vector3 | undefined, mat: number) {
        this.ids = ids
        this.scale = typeof scale === 'number' ? BabylonUtils.getSymVector(scale) : scale
        this.mat = mat
    }

    getRandomId(): number {
        return this.ids[Utils.rollDice(this.ids.length, true)]
    }
}

export const MonsterTypes = {
    SKELETON: new MonsterType( 1, 1,'Skeleton', null,null,  null),
    SKELETON_FIGHTER: new MonsterType( 2, 1, 'Skeleton', new MonsterEquipData([1], 0.6, 0),null, null),
    SKELETON_KNIGHT: new MonsterType( 3, 1, 'Skeleton', new MonsterEquipData([1], 0.75, 0), new MonsterEquipData([1850], undefined, 8), new MonsterEquipData([1100], undefined, 8)),

    WITHER: new MonsterType( 10, 2,'Wither', null,null,  null),
    WITHER_FIGHTER: new MonsterType( 11, 2, 'Wither', new MonsterEquipData([1], 0.6, 0),null, null),
    WITHER_KNIGHT: new MonsterType( 12, 2, 'Wither', new MonsterEquipData([1], 0.75, 0), new MonsterEquipData([1850], undefined, 9), new MonsterEquipData([1100], undefined, 9)),

    CAT : new MonsterType( 1000, 4,'Cat', null,null,  null),
}

