import type {SkillKey} from '@/network/messageIfs'

export type SkillCategoryKey = 'weapons' | 'armor' | 'utility'

export type SkillDefinition = {
    key: SkillKey
    category: SkillCategoryKey
    translationKey: string
    descriptionTranslationKey: string
    bonusKind?: 'weaponAttack' | 'armor' | 'campingSetupSpeed' | 'bandageHealing'
    bonusTargetTranslationKey?: string
}

export const PhysicalWeaponSkillDefinitions: SkillDefinition[] = [
    {key: 'swords', category: 'weapons', translationKey: 'skills.weapons.swords', descriptionTranslationKey: 'skills.descriptions.swords', bonusKind: 'weaponAttack', bonusTargetTranslationKey: 'skills.bonuses.weaponTypes.swords'},
    {key: 'axes', category: 'weapons', translationKey: 'skills.weapons.axes', descriptionTranslationKey: 'skills.descriptions.axes', bonusKind: 'weaponAttack', bonusTargetTranslationKey: 'skills.bonuses.weaponTypes.axes'},
    {key: 'maces', category: 'weapons', translationKey: 'skills.weapons.maces', descriptionTranslationKey: 'skills.descriptions.maces', bonusKind: 'weaponAttack', bonusTargetTranslationKey: 'skills.bonuses.weaponTypes.maces'},
    {key: 'polearms', category: 'weapons', translationKey: 'skills.weapons.polearms', descriptionTranslationKey: 'skills.descriptions.polearms', bonusKind: 'weaponAttack', bonusTargetTranslationKey: 'skills.bonuses.weaponTypes.polearms'},
    {key: 'bows', category: 'weapons', translationKey: 'skills.weapons.bows', descriptionTranslationKey: 'skills.descriptions.bows', bonusKind: 'weaponAttack', bonusTargetTranslationKey: 'skills.bonuses.weaponTypes.bows'},
]

export const ArmorSkillDefinitions: SkillDefinition[] = [
    {key: 'leatherArmor', category: 'armor', translationKey: 'skills.armor.leatherArmor', descriptionTranslationKey: 'skills.descriptions.leatherArmor', bonusKind: 'armor', bonusTargetTranslationKey: 'skills.armor.leatherArmor'},
    {key: 'chainArmor', category: 'armor', translationKey: 'skills.armor.chainArmor', descriptionTranslationKey: 'skills.descriptions.chainArmor', bonusKind: 'armor', bonusTargetTranslationKey: 'skills.armor.chainArmor'},
    {key: 'plateArmor', category: 'armor', translationKey: 'skills.armor.plateArmor', descriptionTranslationKey: 'skills.descriptions.plateArmor', bonusKind: 'armor', bonusTargetTranslationKey: 'skills.armor.plateArmor'},
    {key: 'shields', category: 'armor', translationKey: 'skills.armor.shields', descriptionTranslationKey: 'skills.descriptions.shields', bonusKind: 'armor', bonusTargetTranslationKey: 'skills.armor.shields'},
]

export const UtilitySkillDefinitions: SkillDefinition[] = [
    {key: 'camping', category: 'utility', translationKey: 'skills.utility.camping', descriptionTranslationKey: 'skills.descriptions.camping', bonusKind: 'campingSetupSpeed'},
    {key: 'healing', category: 'utility', translationKey: 'skills.utility.healing', descriptionTranslationKey: 'skills.descriptions.healing', bonusKind: 'bandageHealing'},
]

export const SkillDefinitions: SkillDefinition[] = [
    ...PhysicalWeaponSkillDefinitions,
    ...ArmorSkillDefinitions,
    ...UtilitySkillDefinitions,
]
