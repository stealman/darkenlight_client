import {Item} from '@/data/items/item'
import type {BankStateData, ItemTO} from '@/network/messageIfs'
import {InventoryManager} from '@/data/inventoryManager'

export const BankManager = {
    items: [] as Item[],
    capacity: 100,

    replaceState(data: BankStateData) {
        this.items = (data.items || []).map((item: ItemTO) => Item.fromData(item))
        this.capacity = Number.isInteger(data.capacity) ? data.capacity : 100
        this.sortItems()
        this.emitUpdated()
    },

    clear() {
        this.items = []
        this.capacity = 100
        this.emitUpdated()
    },

    sortItems() {
        this.items.sort((first, second) => InventoryManager.compareItemsForDisplay(first, second))
    },

    canMergeResourceItem(item: Item | null | undefined): boolean {
        if (!item || item.cbType !== 'R') {
            return false
        }
        const stacks = this.items.filter(candidate => candidate.cbType === 'R' && candidate.cbId === item.cbId)
        return stacks.filter(candidate => Number(candidate.atts?.qty) < 999).length >= 2
    },

    emitUpdated() {
        window.dispatchEvent(new CustomEvent('ui:bank-updated'))
    }
}
