import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MonsterBonesAnims } from '@/babylon/monsters/codebook/monsterBonesAnims'
import { BabylonUtils, VectorY90 } from '@/babylon/utils'
import { Vector3 } from '@babylonjs/core'
import { Utils} from '@/utils/utils'
import { BodySoundTypes, MonsterAttackSoundTypes, MonsterSoundTypes, WeaponSoundTypes } from '@/babylon/audio/audioManager'
import { EquipSlotModelsCb } from '@/data/items/item'

export const MonsterCodebook = {

    getMonsterTypeById(id: number): MonsterType {
        return Object.values(MonsterTypes).find((monsterType: MonsterType) => monsterType.id === id)!
    },

    initializeEquipAndAnimations(model: MonsterModel) {
        // TemplateId 1 and 21 are skeletons types
        if ([1, 21].includes(model.type.templateId)) {
            MonsterBonesAnims.initSkeleton(model)
        }

        // TemplateId 11, 12 is a zombie type
        if ([11, 12, 13].includes(model.type.templateId)) {
            MonsterBonesAnims.initZombie(model)
        }

        if ([31, 32, 33].includes(model.type.templateId)) {
            MonsterBonesAnims.initWight(model)
        }

        // TemplateId 1001 is a cat type
        if (model.type.templateId === 1001) {
            MonsterBonesAnims.initCat(model)
        }

        if (model.type.templateId === 1101) {
            MonsterBonesAnims.initDeer(model)
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
    deathAnimSpeed: number
    weapon: MonsterEquipData | null
    armor:MonsterEquipData | null
    helmet: MonsterEquipData | null

    weaponSoundType: string
    bodySoundType: string
    parrySoundType: string | null
    monsterSoundType: string = ''
    attackSoundType: string | null
    attackSoundProgress: number

    aaType: string = MonsterAATypes.MELEE

    constructor(id: number, group: MonsterGroup, templateId: number, name: string, boxSize: number, boxHeight: number, walkAnimSpeed: number, weapon: MonsterEquipData | null, helmet: MonsterEquipData | null, armor: MonsterEquipData | null,
                weaponSoundType: string, bodySoundType: string, parrySoundType: string | null, monsterSoundType: string, aaType: string | null, deathAnimSpeed: number = 2.5, attackSoundType: string | null = null, attackSoundProgress: number = 0.5) {
        this.id = id
        this.group = group
        this.templateId = templateId
        this.name = name
        this.boxSize = boxSize
        this.walkAnimSpeed = walkAnimSpeed
        this.deathAnimSpeed = deathAnimSpeed
        this.boxHeight = boxHeight
        this.weapon = weapon
        this.armor = armor
        this.helmet = helmet
        this.weaponSoundType = weaponSoundType || WeaponSoundTypes.BONE
        this.bodySoundType = bodySoundType || BodySoundTypes.HARD
        this.parrySoundType = parrySoundType
        this.monsterSoundType = monsterSoundType
        this.attackSoundType = attackSoundType
        this.attackSoundProgress = Math.max(0, Math.min(1, attackSoundProgress))
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
    footsteps: boolean

    constructor(id: number, name: string, footsteps: boolean = false) {
        this.id = id
        this.name = name
        this.footsteps = footsteps
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
    ZOMBIE: new MonsterGroup(30, 'Zombie'),
    WIGHTS: new MonsterGroup(40, 'Wights'),
    CAT: new MonsterGroup(1000, 'Cat'),
    DEERS: new MonsterGroup(1100, 'Deers', true),

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
    SKELETON: new MonsterType(1, MonsterGroups.SKELETON_MELEE, 1, 'Skeleton', 0.6, 1.8, 3, null, null, null, WeaponSoundTypes.BONE, BodySoundTypes.HARD, null, MonsterSoundTypes.SKELETON, null),

    SKELETON_FIGHTER: new MonsterType(
        2,
        MonsterGroups.SKELETON_MELEE,
        1,
        'Skeleton Fighter',
        0.6,
        1.8,
        3,
        new MonsterEquipData([EquipSlotModelsCb.LONGSWORD.modelId], 0.8, null, null, 0),
        null,
        null,
        WeaponSoundTypes.SWORD,
        BodySoundTypes.HARD,
        WeaponSoundTypes.SWORD,
        MonsterSoundTypes.SKELETON,
        null,
    ),

    SKELETON_WARRIOR: new MonsterType(
        3,
        MonsterGroups.SKELETON_MELEE,
        1,
        'Skeleton Warrior',
        0.6,
        1.8,
        3,
        new MonsterEquipData([EquipSlotModelsCb.LONGSWORD.modelId], 0.8, null, null, 0),
        null,
        new MonsterEquipData([EquipSlotModelsCb.ARMOR_PLATE.modelId], new Vector3(0.86, 0.7, 0.95), VectorY90, new Vector3(-0.025, 0.1, -0.01), 10),
        WeaponSoundTypes.SWORD,
        BodySoundTypes.HARD,
        WeaponSoundTypes.SWORD,
        MonsterSoundTypes.SKELETON,
        null,
    ),

    // SKELETON RANGED
    SKELETON_ARCHER: new MonsterType(
        20,
        MonsterGroups.SKELETON_RANGED,
        1,
        'Skeleton Archer',
        0.6,
        1.8,
        3,
        new MonsterEquipData([EquipSlotModelsCb.HUNTINGBOW.modelId], 0.8, new Vector3(Math.PI, 0, Math.PI), null, 0),
        null,
        null,
        WeaponSoundTypes.SWORD,
        BodySoundTypes.HARD,
        WeaponSoundTypes.SWORD,
        MonsterSoundTypes.SKELETON,
        MonsterAATypes.RANGED_ARROW,
    ),

    // ZOMBIE
    ZOMBIE_ROTTEN: new MonsterType(50, MonsterGroups.ZOMBIE, 11, 'Rotten Zombie', 0.6, 1.8, 2.2, null, null, null, WeaponSoundTypes.BONE, BodySoundTypes.HARD, null, MonsterSoundTypes.ZOMBIE, null),
    ZOMBIE: new MonsterType(51, MonsterGroups.ZOMBIE, 12, 'Zombie', 0.6, 1.8, 2.2, null, null, null, WeaponSoundTypes.BONE, BodySoundTypes.HARD, null, MonsterSoundTypes.ZOMBIE, null),
    ZOMBIE_MUTANT: new MonsterType(52, MonsterGroups.ZOMBIE, 13, 'Zombie Mutant', 0.7, 2, 2, null, null, null, WeaponSoundTypes.BONE, BodySoundTypes.HARD, null, MonsterSoundTypes.ZOMBIE, null),

    // WIGHTS
    WIGHT: new MonsterType(60, MonsterGroups.WIGHTS, 31, 'Wight', 0.6, 2.8, 2.2, null, null, null, WeaponSoundTypes.BONE, BodySoundTypes.HARD, null, MonsterSoundTypes.WRAITH, null, 1.25, MonsterAttackSoundTypes.WRAITH, 0.5),
    WRAITH: new MonsterType(61, MonsterGroups.WIGHTS, 32, 'Wraith', 0.6, 2.8, 2.2, null, null, null, WeaponSoundTypes.BONE, BodySoundTypes.HARD, null, MonsterSoundTypes.WRAITH, null, 1.25, MonsterAttackSoundTypes.WRAITH, 0.5),
    WRAITH_LORD: new MonsterType(62, MonsterGroups.WIGHTS, 33, 'Wraith Lord', 0.6, 2.8, 2.2, null, null, null, WeaponSoundTypes.BONE, BodySoundTypes.HARD, null, MonsterSoundTypes.WRAITH, null, 1.25, MonsterAttackSoundTypes.WRAITH, 0.5),

    // WITHER MELEE
    WITHER: new MonsterType(200, MonsterGroups.WITHER_MELEE, 21, 'Wither', 0.6, 1.8, 3.2, null, null, null, WeaponSoundTypes.BONE, BodySoundTypes.HARD, null, MonsterSoundTypes.SKELETON, null),

    WITHER_CHAMPION: new MonsterType(
        201,
        MonsterGroups.WITHER_MELEE,
        21,
        'Wither Champion',
        0.6,
        1.8,
        3.2,
        new MonsterEquipData([EquipSlotModelsCb.LONGSWORD.modelId], 0.8, null, null, 0),
        null,
        null,
        WeaponSoundTypes.SWORD,
        BodySoundTypes.HARD,
        WeaponSoundTypes.SWORD,
        MonsterSoundTypes.SKELETON,
        null,
    ),

    WITHER_KNIGHT: new MonsterType(
        202,
        MonsterGroups.WITHER_MELEE,
        21,
        'Wither Knight',
        0.6,
        1.8,
        3.2,
        new MonsterEquipData([EquipSlotModelsCb.LONGSWORD.modelId], 0.9, null, null, 2),
        null,
        new MonsterEquipData([EquipSlotModelsCb.ARMOR_PLATE.modelId], new Vector3(0.86, 0.7, 0.95), VectorY90, new Vector3(-0.025, 0.1, -0.01), 6),
        WeaponSoundTypes.SWORD,
        BodySoundTypes.HARD,
        WeaponSoundTypes.SWORD,
        MonsterSoundTypes.SKELETON,
        null,
    ),

    // WITHER RANGED

    // CAT TYPES
    HOUSE_CAT: new MonsterType(1001, MonsterGroups.CAT, 1001, 'House Cat', 0.6, 1, 6, null, null, null, WeaponSoundTypes.BONE, BodySoundTypes.SOFT, null, MonsterSoundTypes.CAT, null),

    WILD_CAT: new MonsterType(1002, MonsterGroups.CAT, 1001, 'Wild Cat', 0.6, 1, 6, null, null, null, WeaponSoundTypes.BONE, BodySoundTypes.SOFT, null, MonsterSoundTypes.CAT, null),

    DEER: new MonsterType(1101, MonsterGroups.DEERS, 1101, 'Deer', 1, 1.8, 2.8, null, null, null, WeaponSoundTypes.BONE, BodySoundTypes.HARD, null, MonsterSoundTypes.DEER, null),
}
