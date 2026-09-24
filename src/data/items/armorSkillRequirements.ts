import type {ArmorSkillKey, SkillSetTO} from '@/network/messageIfs'
import type {Item} from './item'

const requiredSkillByArmorCategory: Partial<Record<string, ArmorSkillKey>> = {
    PLATE: 'plateArmor',
    CHAIN: 'chainArmor',
    LEATHER: 'leatherArmor',
    SHIELD: 'shields',
}

export const ArmorSkillRequirements = {
    getMissingSkill(item: Item, skillSet: SkillSetTO): ArmorSkillKey | undefined {
        const requiredSkill = item.cbType === 'A' && item.armorCategory
            ? requiredSkillByArmorCategory[item.armorCategory]
            : undefined
        return requiredSkill && (skillSet[requiredSkill]?.rank ?? 0) < 1 ? requiredSkill : undefined
    },
}
