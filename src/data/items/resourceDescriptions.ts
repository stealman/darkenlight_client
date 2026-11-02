import {t} from '@/i18n'

const descriptionKeys: Record<number, string> = {
    1: 'bandages',
    51: 'purityPowder', 52: 'purityStone', 53: 'purityCrystal',
    119: 'coal',
    120: 'ingotEquipment', 121: 'ingotUnused', 122: 'ingotArmor', 123: 'ingotArmor',
    124: 'ingotArmor', 125: 'ingotWeapons', 126: 'ingotWeapons', 127: 'ingotArmor',
    128: 'ingotArmor', 129: 'ingotEquipment', 130: 'ingotUnused', 131: 'ingotWeapons',
    201: 'wood', 202: 'campWood', 203: 'campWood', 204: 'campWood', 205: 'campWood', 206: 'campWood',
    301: 'meat', 351: 'steak',
}

export const getResourceDescription = (codebookId: number): string | null => {
    if (codebookId >= 101 && codebookId <= 112) {
        return t('items.resourceDescriptions.ore')
    }
    for (const [firstId, key] of [[1001, 'healingPotion'], [1011, 'manaPotion'], [1021, 'staminaPotion']] as const) {
        if (codebookId >= firstId && codebookId <= firstId + 2) {
            return t(`items.resourceDescriptions.${key}`, {amount: (codebookId - firstId + 1) * 25})
        }
    }
    const key = descriptionKeys[codebookId]
    return key ? t(`items.resourceDescriptions.${key}`) : null
}
