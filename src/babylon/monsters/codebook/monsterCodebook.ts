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
            model.assignRhand(1, mobType.weapon.mat, mobType.weapon.scale)
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
    group: MonsterGroup
    templateId: number
    name: string
    boxSize: number
    boxHeight: number = 2
    weapon: MonsterEquipData | null
    armor:MonsterEquipData | null
    helmet: MonsterEquipData | null

    constructor(id: number, group: MonsterGroup, templateId: number, name: string, boxSize: number, boxHeight: number, weapon: MonsterEquipData | null, helmet: MonsterEquipData | null, armor: MonsterEquipData | null) {
        this.id = id
        this.group = group
        this.templateId = templateId
        this.name = name
        this.boxSize = boxSize
        this.boxHeight = boxHeight
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

export class MonsterGroup {
    id: number
    name: string

    constructor(id: number, name: string) {
        this.id = id
        this.name = name
    }

    getAllTypes(): MonsterType[] {
        const types: MonsterType[] = []
        for (const key in MonsterTypes) {
            const type = MonsterTypes[key]
            if (type.group.id === this.id) {
                types.push(type)
            }
        }
        return types
    }
}

export const MonsterGroups = {
    SKELETON: new MonsterGroup(1, 'Skeleton'),
    WITHER: new MonsterGroup(2, 'Wither'),
    CAT: new MonsterGroup(1000, 'Cat'),

    getAsArray(): MonsterGroup[] {
        const groups: MonsterGroup[] = []
        for (const key in this) {
            if (typeof this[key] !== 'function') {
                groups.push(this[key])
            }
        }
        return groups
    },

    getById(id: number): MonsterGroup | null {
        for (const key in this) {
            if (typeof this[key] !== 'function' && this[key].id === id) {
                return this[key]
            }
        }
        return null
    }
}

export const MonsterTypes = {
    SKELETON: new MonsterType( 1, MonsterGroups.SKELETON, 1,'Skeleton', 0.6, 1.8,null,null,  null),
    SKELETON_FIGHTER: new MonsterType( 2, MonsterGroups.SKELETON, 1, 'Skeleton Fighter', 0.6, 1.8, new MonsterEquipData([1], 0.15, 0),null, null),
    SKELETON_WARRIOR: new MonsterType( 3, MonsterGroups.SKELETON, 1, 'Skeleton Warrior', 0.6, 1.8, new MonsterEquipData([1], 0.15, 0), new MonsterEquipData([1850], undefined, 8), new MonsterEquipData([1100], undefined, 8)),

    WITHER: new MonsterType( 10, MonsterGroups.WITHER, 2,'Wither', 0.6, 1.8,null,null,  null),
    WITHER_CHAMPION: new MonsterType( 11, MonsterGroups.WITHER, 2, 'Wither Champion', 0.6, 1.8, new MonsterEquipData([1], 0.15, 0),null, null),
    WITHER_KNIGHT: new MonsterType( 12, MonsterGroups.WITHER, 2, 'Wither Knight', 0.6, 1.8, new MonsterEquipData([1], 0.15, 0), new MonsterEquipData([1850], undefined, 9), new MonsterEquipData([1100], undefined, 9)),

    HOUSE_CAT : new MonsterType( 1001, MonsterGroups.CAT,  4,'House Cat', 0.6, 1,null,null,  null),
    WILD_CAT : new MonsterType( 1002, MonsterGroups.CAT, 4,'Wild Cat', 0.6, 1,null,null,  null),
}
