import type {PhysicalWeaponSkillKey, SkillSetTO} from '@/network/messageIfs'
import {WeaponTags} from './item'
import type {Item} from './item'

const requiredSkillByWeaponCategory: Partial<Record<string, PhysicalWeaponSkillKey>> = {
    SWORD: 'swords',
    AXE: 'axes',
    MACE: 'maces',
    POLEARM: 'polearms',
    BOW: 'bows',
}

const SteelMaterialId = 1

export const WeaponSkillRequirements = {
    getMissingSkill(item: Item, skillSet: SkillSetTO): PhysicalWeaponSkillKey | undefined {
        if (item.weaponTags.includes(WeaponTags.PICKAXE) ||
            item.materialId === SteelMaterialId && item.weaponTags.includes(WeaponTags.GREAT_AXE)) {
            return undefined
        }
        const requiredSkill = item.cbType === 'W' && item.weaponCategory
            ? requiredSkillByWeaponCategory[item.weaponCategory]
            : undefined
        return requiredSkill && (skillSet[requiredSkill]?.rank ?? 0) < 1 ? requiredSkill : undefined
    },
}
