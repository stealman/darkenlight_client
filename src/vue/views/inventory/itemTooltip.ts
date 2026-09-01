import type {Item} from '@/data/items/item'
import {t} from '@/i18n'

const getAttribute = (item: Item, key: string) => (item.atts as any)?.[key] ?? item.atts?.get?.(key) ?? null

export type ItemDurabilityStatus = 'worn' | 'warning' | 'danger' | 'critical'

export const getItemTooltipData = (item: Item) => ({
    name: item.name || t('inventory.unknownItem'),
    id: item.id ?? null,
    cbId: item.cbId ?? null,
    quality: getAttribute(item, 'qual'),
    durability: getAttribute(item, 'dur'),
    durabilityMax: getAttribute(item, 'durM'),
    quantity: getAttribute(item, 'qty'),
    weaponAttack: item.cbType === 'W' ? getAttribute(item, 'patk') : null,
    weaponDamageTypes: item.cbType === 'W' ? item.damageTypes ?? [] : [],
    weaponSpeed: item.cbType === 'W' ? getAttribute(item, 'speed') : null,
    weaponRange: item.cbType === 'W' ? getAttribute(item, 'range') : null,
    weaponArmorPen: item.cbType === 'W' ? getAttribute(item, 'armorPen') ?? 0 : null,
    weaponDefense: item.cbType === 'W' ? getAttribute(item, 'defense') ?? 0 : null,
    armorStats: item.cbType === 'A' ? {
        pdef: getAttribute(item, 'pdef') ?? 0,
        defense: getAttribute(item, 'defense') ?? 0,
        str: getAttribute(item, 'str') ?? 0,
        agi: getAttribute(item, 'agi') ?? 0,
        int: getAttribute(item, 'int') ?? 0,
        wis: getAttribute(item, 'wis') ?? 0,
        maxHp: getAttribute(item, 'maxHp') ?? 0,
        arcaneInterference: getAttribute(item, 'arcaneInterference') ?? 0,
    } : null,
})

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
