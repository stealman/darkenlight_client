import {Item} from '@/data/items/item'
import {InventoryManager} from '@/data/inventoryManager'
import {Connector} from '@/network/connector'
import type {ContainerStateData, ItemTO} from '@/network/messageIfs'
import {ContainerActionMsg, ContainerOpenMsg} from '@/network/messages'

export const ContainerManager = {
    containerId: null as string | null,
    items: [] as Item[],
    capacity: 100,

    open(containerId: string) {
        this.containerId = containerId
        this.items = []
        this.emitUpdated()
        Connector.sendMessage(new ContainerOpenMsg(containerId))
    },

    action(action: string, itemId: number, splitCount?: number) {
        if (this.containerId) {
            Connector.sendMessage(new ContainerActionMsg(this.containerId, action, itemId, splitCount))
        }
    },

    replaceState(data: ContainerStateData) {
        if (!data.open && data.containerId !== this.containerId) {
            return
        }
        this.containerId = data.containerId
        this.items = (data.items || []).map((item: ItemTO) => Item.fromData(item))
        this.capacity = Number.isInteger(data.capacity) ? data.capacity : 100
        this.items.sort((first, second) => InventoryManager.compareItemsForDisplay(first, second))
        this.emitUpdated()
        if (data.open) {
            window.dispatchEvent(new CustomEvent('ui:open-container'))
        }
    },

    close() {
        this.containerId = null
        this.items = []
        this.capacity = 100
        this.emitUpdated()
    },

    canMergeResourceItem(item: Item | null | undefined): boolean {
        if (!item || item.cbType !== 'R') return false
        const stacks = this.items.filter((candidate) => candidate.cbType === 'R' && candidate.cbId === item.cbId)
        return stacks.filter((candidate) => Number(candidate.atts?.qty) < 999).length >= 2
    },

    emitUpdated() {
        window.dispatchEvent(new CustomEvent('ui:container-updated'))
    },
}
