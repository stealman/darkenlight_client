import type {Item} from '@/data/items/item'
import type {ItemTO} from '@/network/messageIfs'
import {t} from '@/i18n'

type ItemTooltipSource = Item | ItemTO

const getAttribute = (item: ItemTooltipSource, key: string) => (item.atts as any)?.[key] ?? item.atts?.get?.(key) ?? null
const getItemType = (item: ItemTooltipSource) => (item as Item).cbType ?? (item as ItemTO).tp
const getWeaponCategory = (item: ItemTooltipSource) => (item as Item).weaponCategory ?? (item as ItemTO).wCat ?? null
const getWeaponDamageTypes = (item: ItemTooltipSource) => (item as Item).damageTypes ?? (item as ItemTO).dmgTypes ?? []
const weaponCategoryLabels: Record<string, string> = {SWORD: 'skills.weapons.swords', AXE: 'skills.weapons.axes', MACE: 'skills.weapons.maces', POLEARM: 'skills.weapons.polearms', BOW: 'skills.weapons.bows'}

export type ItemDurabilityStatus = 'worn' | 'warning' | 'danger' | 'critical'

export const getWeaponCategoryLabel = (category: string | null | undefined): string | null => {
    if (!category) {
        return null
    }

    return t(weaponCategoryLabels[category] ?? category)
}

export const getItemTooltipData = (item: ItemTooltipSource) => {
    const itemType = getItemType(item)

    return {
    name: item.name || t('inventory.unknownItem'),
    id: item.id ?? null,
    cbId: (item as Item).cbId ?? item.cb ?? null,
    quality: getAttribute(item, 'qual'),
    durability: getAttribute(item, 'dur'),
    durabilityMax: getAttribute(item, 'durM'),
    quantity: getAttribute(item, 'qty'),
    weaponCategory: itemType === 'W' ? getWeaponCategory(item) : null,
    weaponAttack: itemType === 'W' ? getAttribute(item, 'patk') : null,
    weaponDamageTypes: itemType === 'W' ? getWeaponDamageTypes(item) : [],
    weaponSpeed: itemType === 'W' ? getAttribute(item, 'speed') : null,
    weaponRange: itemType === 'W' ? getAttribute(item, 'range') : null,
    weaponArmorPen: itemType === 'W' ? getAttribute(item, 'armorPen') ?? 0 : null,
    weaponDefense: itemType === 'W' ? getAttribute(item, 'defense') ?? 0 : null,
    armorStats: itemType === 'A' ? {
        pdef: getAttribute(item, 'pdef') ?? 0,
        defense: getAttribute(item, 'defense') ?? 0,
        str: getAttribute(item, 'str') ?? 0,
        agi: getAttribute(item, 'agi') ?? 0,
        int: getAttribute(item, 'int') ?? 0,
        wis: getAttribute(item, 'wis') ?? 0,
        maxHp: getAttribute(item, 'maxHp') ?? 0,
        arcaneInterference: getAttribute(item, 'arcaneInterference') ?? 0,
    } : null,
    }
}

export const getItemImage = (item: Item | null | undefined) => {
    if (!item?.imgUrl) {
        return '/images/icons/buttons/btn_backpack.png'
    }
    return item.imgUrl.startsWith('/') ? item.imgUrl : `/${item.imgUrl}`
}

export const getItemStackCount = (item: Item | null | undefined): number | null => {
    if (!item?.isStackable?.()) {
        return null
    }
    const quantity = Number(getAttribute(item, 'qty'))
    return Number.isFinite(quantity) && quantity > 0 ? quantity : null
}

export const getItemDurabilityStatus = (item: Item | null | undefined): ItemDurabilityStatus | null => {
    if (!item || (item.cbType !== 'W' && item.cbType !== 'A')) {
        return null
    }

    const durability = Number(getAttribute(item, 'dur'))
    const maxDurability = Number(getAttribute(item, 'durM'))
    if (!Number.isFinite(durability) || !Number.isFinite(maxDurability) || maxDurability <= 0 || durability >= maxDurability) {
        return null
    }

    if (durability < 5) return 'critical'
    if (durability < 15) return 'danger'
    if (durability < 25) return 'warning'
    return 'worn'
}

export const getItemDurabilityPercent = (item: Item | null | undefined): number | null => {
    if (!item || (item.cbType !== 'W' && item.cbType !== 'A')) {
        return null
    }

    const durability = Number(getAttribute(item, 'dur'))
    const maxDurability = Number(getAttribute(item, 'durM'))
    if (!Number.isFinite(durability) || !Number.isFinite(maxDurability) || maxDurability <= 0 || durability >= maxDurability) {
        return null
    }

    return Math.max(4, Math.min(100, (durability / maxDurability) * 100))
}
