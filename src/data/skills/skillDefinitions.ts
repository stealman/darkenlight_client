import type {SkillKey} from '@/network/messageIfs'

export type SkillCategoryKey = 'weapons' | 'armor' | 'utility' | 'gathering' | 'crafting'

export type SkillDefinition = {
    key: SkillKey
    category: SkillCategoryKey
    translationKey: string
    descriptionTranslationKey: string
    bonusDescriptionTranslationKey?: string
    bonusKind?: 'weaponAttack' | 'powerStrikeDamage' | 'preciseShotDamage' | 'armor' | 'campingRestingRegen' | 'bandageHealing' | 'mining'
    bonusTargetTranslationKey?: string
}

export const PhysicalWeaponSkillDefinitions: SkillDefinition[] = [
    {key: 'swords', category: 'weapons', translationKey: 'skills.weapons.swords', descriptionTranslationKey: 'skills.descriptions.swords', bonusKind: 'weaponAttack', bonusTargetTranslationKey: 'skills.bonuses.weaponTypes.swords'},
    {key: 'axes', category: 'weapons', translationKey: 'skills.weapons.axes', descriptionTranslationKey: 'skills.descriptions.axes', bonusKind: 'weaponAttack', bonusTargetTranslationKey: 'skills.bonuses.weaponTypes.axes'},
    {key: 'maces', category: 'weapons', translationKey: 'skills.weapons.maces', descriptionTranslationKey: 'skills.descriptions.maces', bonusKind: 'weaponAttack', bonusTargetTranslationKey: 'skills.bonuses.weaponTypes.maces'},
    {key: 'polearms', category: 'weapons', translationKey: 'skills.weapons.polearms', descriptionTranslationKey: 'skills.descriptions.polearms', bonusKind: 'weaponAttack', bonusTargetTranslationKey: 'skills.bonuses.weaponTypes.polearms'},
    {key: 'bows', category: 'weapons', translationKey: 'skills.weapons.bows', descriptionTranslationKey: 'skills.descriptions.bows', bonusKind: 'weaponAttack', bonusTargetTranslationKey: 'skills.bonuses.weaponTypes.bows'},
    {key: 'powerStrike', category: 'weapons', translationKey: 'skills.weapons.powerStrike', descriptionTranslationKey: 'skills.descriptions.powerStrike', bonusKind: 'powerStrikeDamage'},
    {key: 'preciseShot', category: 'weapons', translationKey: 'skills.weapons.preciseShot', descriptionTranslationKey: 'skills.descriptions.preciseShot', bonusKind: 'preciseShotDamage'},
]

export const ArmorSkillDefinitions: SkillDefinition[] = [
    {key: 'leatherArmor', category: 'armor', translationKey: 'skills.armor.leatherArmor', descriptionTranslationKey: 'skills.descriptions.leatherArmor', bonusKind: 'armor', bonusTargetTranslationKey: 'skills.armor.leatherArmor'},
    {key: 'chainArmor', category: 'armor', translationKey: 'skills.armor.chainArmor', descriptionTranslationKey: 'skills.descriptions.chainArmor', bonusKind: 'armor', bonusTargetTranslationKey: 'skills.armor.chainArmor'},
    {key: 'plateArmor', category: 'armor', translationKey: 'skills.armor.plateArmor', descriptionTranslationKey: 'skills.descriptions.plateArmor', bonusKind: 'armor', bonusTargetTranslationKey: 'skills.armor.plateArmor'},
    {key: 'shields', category: 'armor', translationKey: 'skills.armor.shields', descriptionTranslationKey: 'skills.descriptions.shields', bonusKind: 'armor', bonusTargetTranslationKey: 'skills.armor.shields'},
]

export const UtilitySkillDefinitions: SkillDefinition[] = [
    {key: 'camping', category: 'utility', translationKey: 'skills.utility.camping', descriptionTranslationKey: 'skills.descriptions.camping', bonusKind: 'campingRestingRegen'},
    {key: 'healing', category: 'utility', translationKey: 'skills.utility.healing', descriptionTranslationKey: 'skills.descriptions.healing', bonusKind: 'bandageHealing'},
]

export const GatheringSkillDefinitions: SkillDefinition[] = [
    {key: 'hunting', category: 'gathering', translationKey: 'skills.utility.hunting', descriptionTranslationKey: 'skills.descriptions.hunting'},
    {key: 'lumberjacking', category: 'gathering', translationKey: 'skills.utility.lumberjacking', descriptionTranslationKey: 'skills.descriptions.lumberjacking'},
    {key: 'mining', category: 'gathering', translationKey: 'skills.utility.mining', descriptionTranslationKey: 'skills.descriptions.mining', bonusKind: 'mining'},
]

export const CraftingSkillDefinitions: SkillDefinition[] = [
    {key: 'cooking', category: 'crafting', translationKey: 'skills.crafting.cooking', descriptionTranslationKey: 'skills.descriptions.cooking', bonusDescriptionTranslationKey: 'skills.bonuses.cooking'},
    {key: 'alchemy', category: 'crafting', translationKey: 'skills.crafting.alchemy', descriptionTranslationKey: 'skills.descriptions.alchemy', bonusDescriptionTranslationKey: 'skills.bonuses.alchemy'},
    {key: 'blacksmithy', category: 'crafting', translationKey: 'skills.crafting.blacksmithy', descriptionTranslationKey: 'skills.descriptions.blacksmithy', bonusDescriptionTranslationKey: 'skills.bonuses.blacksmithy'},
    {key: 'bowcraft', category: 'crafting', translationKey: 'skills.crafting.bowcraft', descriptionTranslationKey: 'skills.descriptions.bowcraft', bonusDescriptionTranslationKey: 'skills.bonuses.bowcraft'},
    {key: 'armorsmithy', category: 'crafting', translationKey: 'skills.crafting.armorsmithy', descriptionTranslationKey: 'skills.descriptions.armorsmithy', bonusDescriptionTranslationKey: 'skills.bonuses.armorsmithy'},
]

export const SkillDefinitions: SkillDefinition[] = [
    ...PhysicalWeaponSkillDefinitions,
    ...ArmorSkillDefinitions,
    ...UtilitySkillDefinitions,
    ...GatheringSkillDefinitions,
    ...CraftingSkillDefinitions,
]
