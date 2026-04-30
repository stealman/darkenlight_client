import { MyPlayer } from '@/data/myPlayer'
import { Item } from '@/data/items/item'
import { Connector } from '@/network/connector'
import { DropItemMsg, EquipItemMsg, MergeItemMsg, PickItemMsg, SplitItemMsg, UnequipItemMsg } from '@/network/messages'
import { AudioManager } from '@/babylon/audio/audioManager'
import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { ItemTO } from '@/network/messageIfs'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { ConsumableHelper } from '@/data/items/consumableHelper'

type WeaponSetup = {
    rhand: number | null
    lhand: number | null
}

type StoredWeaponSetups = {
    primary: WeaponSetup
    secondary: WeaponSetup
}

const EMPTY_WEAPON_SETUP: WeaponSetup = { rhand: null, lhand: null }
const createEmptyStoredWeaponSetups = (): StoredWeaponSetups => ({
    primary: { ...EMPTY_WEAPON_SETUP },
    secondary: { ...EMPTY_WEAPON_SETUP },
})

export const InventoryManager = {
    weaponSetupKey: "DARKENLIGHT_WEAPON_SETUP",
    inventory: [] as Item[],
    itemTypeSortOrder: ['W', 'A', 'J', 'T', 'R'],

    emitInventoryUpdated(reason: string, changedItemIds: number[] = []) {
        if (typeof window === 'undefined') {
            return
        }

        window.dispatchEvent(new CustomEvent('ui:inventory-updated', {
            detail: { reason, changedItemIds }
        }))
    },

    getItemTypeSortRank(cbType: string | null | undefined): number {
        if (!cbType) {
            return Number.MAX_SAFE_INTEGER
        }

        const normalizedType = String(cbType).toUpperCase()
        const cbTypeAliasMap = {
            WEAPON: 'W',
            ARMOR: 'A',
            JEWEL: 'J',
            TRINKET: 'T',
            RESOURCE: 'R',
        }

        const normalizedShortType = (cbTypeAliasMap as any)[normalizedType] ?? normalizedType
        const rank = this.itemTypeSortOrder.indexOf(normalizedShortType)
        return rank >= 0 ? rank : Number.MAX_SAFE_INTEGER
    },

    sortInventory() {
        this.inventory.sort((a, b) => {
            const typeRankDiff = this.getItemTypeSortRank(a.cbType) - this.getItemTypeSortRank(b.cbType)
            if (typeRankDiff !== 0) {
                return typeRankDiff
            }

            const cbIdA = Number(a.cbId)
            const cbIdB = Number(b.cbId)
            if (cbIdA !== cbIdB) {
                return cbIdA - cbIdB
            }

            // For resources of the same type/codebook, keep bigger stacks first.
            const resourceTypeRank = this.getItemTypeSortRank('R')
            const isResourcePair =
                this.getItemTypeSortRank(a.cbType) === resourceTypeRank
                && this.getItemTypeSortRank(b.cbType) === resourceTypeRank
            if (isResourcePair) {
                const qtyDiff = this.getItemQuantity(b) - this.getItemQuantity(a)
                if (qtyDiff !== 0) {
                    return qtyDiff
                }
            }

            return a.id - b.id
        })
    },

    getItemQuantity(item: Item): number {
        const qtyFromObject = Number((item.atts as any)?.qty)
        if (Number.isFinite(qtyFromObject)) {
            return qtyFromObject
        }

        const qtyFromMap = Number(item.atts?.get?.('qty'))
        if (Number.isFinite(qtyFromMap)) {
            return qtyFromMap
        }

        return 0
    },

    getResourceItemsByType(cbId: number): Item[] {
        return this.inventory.filter(item => item.cbType === 'R' && item.cbId === cbId)
    },

    getTotalResourceItemCountByType(cbId: number): number {
        let totalCount = 0
        for (const item of this.getResourceItemsByType(cbId)) {
            totalCount += this.getItemQuantity(item)
        }
        return totalCount
    },

    canMergeResourceItem(item: Item | null | undefined): boolean {
        if (!item || item.cbType !== 'R') {
            return false
        }

        const resourceItems = this.getResourceItemsByType(item.cbId)
        if (resourceItems.length < 2) {
            return false
        }

        const nonFullStacks = resourceItems.filter(resourceItem => this.getItemQuantity(resourceItem) < 999)
        return nonFullStacks.length >= 2
    },

    addItemToInventory(item: Item) {
        this.inventory.push(item)
    },

    addItemsToInventory(items: ItemTO[]) {
        AudioManager.playBackpackHandle2()
        for (const item of items) {
            this.addItemToInventory(Item.fromData(item))
        }
        this.sortInventory()
        ActionButtonsManager.refreshItemsAvailability()
    },

    removeItemsFromInventory(items: number[]) {
        for (const id of items) {
            this.inventory = this.inventory.filter(i => i.id !== id)
        }
        this.sortInventory()
        ActionButtonsManager.refreshItemsAvailability()
    },

    changeItemsInInventory(items: ItemTO[]) {
        let quantityIncreased = false

        for (const changedItem of items) {
            let existingItem = this.inventory.find(item => item.id === changedItem.id)

            if (!existingItem) {
                for (const equippedItem of MyPlayer.myChar.equipSet.values()) {
                    if (equippedItem.id === changedItem.id) {
                        existingItem = equippedItem
                        break
                    }
                }
            }

            if (!existingItem) {
                console.warn(`Inventory/equip item not found for change update: ${changedItem.id}`)
                continue
            }

            const nextItem = Item.fromData(changedItem)
            const previousQuantity = this.getItemQuantity(existingItem)
            const nextQuantity = this.getItemQuantity(nextItem)
            if (Number.isFinite(previousQuantity) && Number.isFinite(nextQuantity) && nextQuantity > previousQuantity) {
                quantityIncreased = true
            }

            Object.assign(existingItem, nextItem)
        }

        if (quantityIncreased) {
            AudioManager.playBackpackHandle2()
        }
        this.sortInventory()
        ActionButtonsManager.refreshItemsAvailability()
    },

    handleInventoryDoubleClick(index: number) {
        const item = this.inventory[index]
        if (!item) {
            return
        }

        if (item.isEquippable()) {
            this.equipItem(item)
            return
        }

        if (item.cbType === 'R') {
            this.useConsumableItem(item)
            return
        }

        if (item.isConsumable()) {
            this.useConsumableItem(item)
        }
    },

    equipItem(item: Item) {
        if (!item.isEquippable()) {
            return
        }

        // If slot is occupied, unequip current item first
        const currentlyEquipped = MyPlayer.myChar.equipSet.get(item.slotInfo.slot)
        if (currentlyEquipped) {
            this.unequipSlot(item.slotInfo.slot, true)
        }

        MyPlayer.myChar.equipSet.set(item.slotInfo.slot, item)
        MyPlayer.myChar.model!.assignEquippedItems()
        this.inventory = this.inventory.filter(i => i !== item)
        this.sortInventory()
        ActionButtonsManager.refreshItemsAvailability()

        Connector.sendMessage(new EquipItemMsg(item.slotInfo.slot, item.id))
        AudioManager.playBackpackHandle2()
        ActionButtonsManager.charEquipChanged()
        this.emitInventoryUpdated('equip-local', [item.id])
    },

    unequipSlot(slot: string, fromEquipAction: boolean = false) {
        const item = MyPlayer.myChar.equipSet.get(slot)
        if (!item) {
            return
        }

        MyPlayer.myChar.equipSet.delete(slot)
        MyPlayer.myChar.model?.removeEquippedItem(slot)

        this.addItemToInventory(item)
        this.sortInventory()
        ActionButtonsManager.refreshItemsAvailability()
        Connector.sendMessage(new UnequipItemMsg(item.id))

        if (!fromEquipAction) {
            AudioManager.playBackpackHandle2()
            ActionButtonsManager.charEquipChanged()
        }

        this.emitInventoryUpdated('unequip-local', [item.id])
    },

    useConsumableItem(item: Item) {
        ConsumableHelper.clickOnConsumeItem(item.cbId)
    },

    dropItem(item: Item) {
        AudioManager.playBackpackHandle2()
        Connector.sendMessage(new DropItemMsg(item.id))
        this.inventory = this.inventory.filter(i => i !== item)
        this.sortInventory()
        ActionButtonsManager.refreshItemsAvailability()
    },

    splitInventoryItem(itemId: number, splitCount: number) {
        Connector.sendMessage(new SplitItemMsg(itemId, splitCount))
    },

    mergeInventoryItem(itemId: number) {
        Connector.sendMessage(new MergeItemMsg(itemId))
    },

    pickItem() {
        const item = GroundItemsManager.nearbyItem
        if (!item) return
        Connector.sendMessage(new PickItemMsg(item.item.id))
    },

    getCurrentWeaponSetup(): WeaponSetup {
        return {
            rhand: MyPlayer.myChar?.equipSet?.get('R_HAND')?.id ?? null,
            lhand: MyPlayer.myChar?.equipSet?.get('L_HAND')?.id ?? null,
        }
    },

    hasAnyWeaponSetupItem(setup: WeaponSetup) {
        return setup.rhand !== null || setup.lhand !== null
    },

    isSameWeaponSetup(a: WeaponSetup, b: WeaponSetup) {
        return a.rhand === b.rhand && a.lhand === b.lhand
    },

    normalizeWeaponSetup(value: any): WeaponSetup {
        return {
            rhand: Number.isInteger(value?.rhand) ? value.rhand : null,
            lhand: Number.isInteger(value?.lhand) ? value.lhand : null,
        }
    },

    equipWeaponSetup(targetSetup: WeaponSetup) {
        if (!this.hasAnyWeaponSetupItem(targetSetup)) {
            return
        }

        const currentSetup = this.getCurrentWeaponSetup()

        for (const [slotKey, currentItemId, targetItemId] of [
            ['L_HAND', currentSetup.lhand, targetSetup.lhand],
            ['R_HAND', currentSetup.rhand, targetSetup.rhand],
        ] as const) {
            if (currentItemId !== null && currentItemId !== targetItemId) {
                this.unequipSlot(slotKey, true)
            }
        }

        for (const itemId of [targetSetup.rhand, targetSetup.lhand]) {
            if (itemId === null) {
                continue
            }

            const item = this.inventory.find(inventoryItem => inventoryItem.id === itemId)
            if (item) {
                this.equipItem(item)
            }
        }
    },

    clickOnEquipStoredWeaponsButton() {
        this.equipStoredWeaponSetups(this.getStoredWeaponSetups())
    },

    /**
     * Equips the primary or secondary weapon setup based on the currently equipped items.
    * If the currently equipped items match the primary setup, it will switch to the secondary setup, and vice versa.
     * If the target setup has no items, it will do nothing.
     */
    equipStoredWeaponSetups(storedSetups: StoredWeaponSetups) {
        const currentSetup = this.getCurrentWeaponSetup()
        this.equipWeaponSetup(
            this.isSameWeaponSetup(currentSetup, storedSetups.primary)
                ? storedSetups.secondary
                : storedSetups.primary
        )
    },

    equipStoredWeaponSetup(setupType: 'primary' | 'secondary') {
        this.equipWeaponSetup(this.getStoredWeaponSetups()[setupType])
    },

    hasStoredWeaponSetupEquipped() {
        const storedSetups = this.getStoredWeaponSetups()
        const currentSetup = this.getCurrentWeaponSetup()

        return this.isSameWeaponSetup(currentSetup, storedSetups.primary)
            || this.isSameWeaponSetup(currentSetup, storedSetups.secondary)
    },

    getStoredWeaponSetups(): StoredWeaponSetups {
        const storedValue = localStorage.getItem(this.weaponSetupKey)
        if (!storedValue) {
            return createEmptyStoredWeaponSetups()
        }

        try {
            const parsed = JSON.parse(storedValue)
            return {
                primary: this.normalizeWeaponSetup(parsed?.primary),
                secondary: this.normalizeWeaponSetup(parsed?.secondary),
            }
        } catch {
            return createEmptyStoredWeaponSetups()
        }
    },

    updateWeaponSetup(setupType: 'primary' | 'secondary') {
        const storedSetups = this.getStoredWeaponSetups()
        storedSetups[setupType] = this.getCurrentWeaponSetup()
        localStorage.setItem(this.weaponSetupKey, JSON.stringify(storedSetups))
    },
}
