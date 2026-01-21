import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MonsterBonesAnims } from '@/babylon/monsters/codebook/monsterBonesAnims'
import { BabylonUtils, VectorY90 } from '@/babylon/utils'
import { Vector3 } from '@babylonjs/core'
import { Utils} from '@/utils/utils'
import { BodySoundTypes, MonsterSoundTypes, WeaponSoundTypes } from '@/babylon/audio/audioManager'
import { FightSplatTypes, SplatType } from '@/babylon/world/fightSplatsRenderer'
import { EquipSlotsCb } from '@/data/items/item'

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
            model.assignRhand(mobType.weapon.ids[0], mobType.weapon.mat, mobType.weapon.scale, mobType.weapon.rotation, mobType.weapon.position)
       }

        if (mobType.armor) {
            model.assignChest(mobType.armor.getRandomId(), mobType.armor.mat, mobType.armor.scale, mobType.armor.rotation, mobType.armor.position)
        }

        if (mobType.helmet) {
            model.assignHelmet(mobType.helmet.getRandomId(), mobType.helmet.mat, mobType.helmet.scale, mobType.helmet.rotation, mobType.helmet.position)
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
    walkAnimSpeed: number = 4
    weapon: MonsterEquipData | null
    armor:MonsterEquipData | null
    helmet: MonsterEquipData | null

    weaponSoundType: string
    bodySoundType: string
    parrySoundType: string | null
    monsterSoundType: string = ''
    splatType: SplatType

    aaType: string = MonsterAATypes.MELEE

    constructor(id: number, group: MonsterGroup, templateId: number, name: string, boxSize: number, boxHeight: number, walkAnimSpeed: number, weapon: MonsterEquipData | null, helmet: MonsterEquipData | null, armor: MonsterEquipData | null,
                weaponSoundType: string, bodySoundType: string, parrySoundType: string | null, monsterSoundType: string, splatType: SplatType, aaType: string | null) {
        this.id = id
        this.group = group
        this.templateId = templateId
        this.name = name
        this.boxSize = boxSize
        this.walkAnimSpeed = walkAnimSpeed
        this.boxHeight = boxHeight
        this.weapon = weapon
        this.armor = armor
        this.helmet = helmet
        this.weaponSoundType = weaponSoundType || WeaponSoundTypes.BONE
        this.bodySoundType = bodySoundType || BodySoundTypes.HARD
        this.parrySoundType = parrySoundType
        this.monsterSoundType = monsterSoundType
        this.splatType = splatType
        if (aaType) {
            this.aaType = aaType
        }
    }
}

export class MonsterEquipData {
    ids: Array<number>
    scale: Vector3
    rotation: Vector3 | null
    position: Vector3 | null
    mat: number

    constructor(ids: Array<number>, scale: number | Vector3 | null, rotation: Vector3 | null, position: Vector3 | null, mat: number) {
        this.ids = ids
        this.scale = scale ? (typeof scale === 'number' ? BabylonUtils.getSymVector(scale) : scale) : Vector3.One()
        this.position = position
        this.rotation = rotation
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
    SKELETON_MELEE: new MonsterGroup(1, 'Skeleton_Melee'),
    SKELETON_RANGED: new MonsterGroup(2, 'Skeleton_Ranged'),
    WITHER_MELEE: new MonsterGroup(20, 'Wither_Melee'),
    WITHER_RANGED: new MonsterGroup(21, 'Wither_Ranged'),
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

export const MonsterAATypes = {
    MELEE: 'MELEE',
    RANGED_ARROW: 'RANGED_ARROW',
}

export const MonsterTypes = {

    // SKELETON MELEE

    SKELETON: new MonsterType( 1, MonsterGroups.SKELETON_MELEE, 1,'Skeleton', 0.6, 1.8, 3.2,null,null,  null,
        WeaponSoundTypes.BONE, BodySoundTypes.HARD, null, MonsterSoundTypes.SKELETON, FightSplatTypes.BONE, null),

    SKELETON_FIGHTER: new MonsterType( 2, MonsterGroups.SKELETON_MELEE, 1, 'Skeleton Fighter', 0.6, 1.8,  3.2,
        new MonsterEquipData([EquipSlotsCb.LONGSWORD.modelId], 0.8, null, null,0),null, null,
        WeaponSoundTypes.SWORD, BodySoundTypes.HARD, WeaponSoundTypes.SWORD, MonsterSoundTypes.SKELETON, FightSplatTypes.BONE, null),

    SKELETON_WARRIOR: new MonsterType( 3, MonsterGroups.SKELETON_MELEE, 1, 'Skeleton Warrior', 0.6, 1.8,  3.2,
        new MonsterEquipData([EquipSlotsCb.LONGSWORD.modelId], 0.8, null, null, 0),
        new MonsterEquipData([EquipSlotsCb.HELM.modelId], 0.94, VectorY90, null, 8),
        new MonsterEquipData([EquipSlotsCb.ARMOR_PLATE.modelId], new Vector3(0.8, 0.7, 0.65),  VectorY90, null, 8),
        WeaponSoundTypes.SWORD, BodySoundTypes.HARD, WeaponSoundTypes.SWORD, MonsterSoundTypes.SKELETON, FightSplatTypes.BONE, null),

    // SKELETON RANGED

    SKELETON_ARCHER: new MonsterType( 20, MonsterGroups.SKELETON_RANGED, 1, 'Skeleton Archer', 0.6, 1.8,  3.2,
        new MonsterEquipData([EquipSlotsCb.BOW.modelId], 0.8, new Vector3(Math.PI, 0, Math.PI), null, 0), null, null,
        WeaponSoundTypes.SWORD, BodySoundTypes.HARD, WeaponSoundTypes.SWORD, MonsterSoundTypes.SKELETON, FightSplatTypes.BONE, MonsterAATypes.RANGED_ARROW),

    // WITHER MELEE

    WITHER: new MonsterType( 200, MonsterGroups.WITHER_MELEE, 2,'Wither', 0.6, 1.8, 3.2, null,null,  null,
        WeaponSoundTypes.BONE, BodySoundTypes.HARD, null, MonsterSoundTypes.SKELETON, FightSplatTypes.DARK_BONE, null),

    WITHER_CHAMPION: new MonsterType( 201, MonsterGroups.WITHER_MELEE, 2, 'Wither Champion', 0.6, 1.8,3.2,
        new MonsterEquipData([EquipSlotsCb.LONGSWORD.modelId], 0.8, null, null, 0),null, null,
        WeaponSoundTypes.SWORD, BodySoundTypes.HARD, WeaponSoundTypes.SWORD, MonsterSoundTypes.SKELETON, FightSplatTypes.DARK_BONE, null),

    WITHER_KNIGHT: new MonsterType( 202, MonsterGroups.WITHER_MELEE, 2, 'Wither Knight', 0.6, 1.8,  3.2,
        new MonsterEquipData([EquipSlotsCb.LONGSWORD.modelId], 0.9, null, null, 2),
        new MonsterEquipData([EquipSlotsCb.HELM.modelId], 0.94, VectorY90, null,6),
        new MonsterEquipData([EquipSlotsCb.ARMOR_PLATE.modelId], new Vector3(0.8, 0.7, 0.65), VectorY90, null, 6),
        WeaponSoundTypes.SWORD, BodySoundTypes.HARD, WeaponSoundTypes.SWORD, MonsterSoundTypes.SKELETON, FightSplatTypes.DARK_BONE, null),

    // WITHER RANGED


    // CAT TYPES

    HOUSE_CAT : new MonsterType( 1001, MonsterGroups.CAT,  4,'House Cat', 0.6, 1, 6, null,null,  null,
        WeaponSoundTypes.BONE, BodySoundTypes.SOFT, null, MonsterSoundTypes.CAT, FightSplatTypes.BLOOD, null),

    WILD_CAT : new MonsterType( 1002, MonsterGroups.CAT, 4,'Wild Cat', 0.6, 1, 6, null,null,  null,
        WeaponSoundTypes.BONE, BodySoundTypes.SOFT, null, MonsterSoundTypes.CAT, FightSplatTypes.BLOOD, null),
}
