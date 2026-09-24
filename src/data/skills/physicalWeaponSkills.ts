import type { PhysicalWeaponSkillKey } from '@/network/messageIfs'

export type PhysicalWeaponSkillDefinition = {
    key: PhysicalWeaponSkillKey
    translationKey: string
    descriptionTranslationKey: string
}

export const PhysicalWeaponSkillDefinitions: PhysicalWeaponSkillDefinition[] = [
    { key: 'swords', translationKey: 'skills.weapons.swords', descriptionTranslationKey: 'skills.descriptions.swords' },
    { key: 'axes', translationKey: 'skills.weapons.axes', descriptionTranslationKey: 'skills.descriptions.axes' },
    { key: 'maces', translationKey: 'skills.weapons.maces', descriptionTranslationKey: 'skills.descriptions.maces' },
    { key: 'polearms', translationKey: 'skills.weapons.polearms', descriptionTranslationKey: 'skills.descriptions.polearms' },
    { key: 'bows', translationKey: 'skills.weapons.bows', descriptionTranslationKey: 'skills.descriptions.bows' },
]
