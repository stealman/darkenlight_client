import { MyPlayer } from '@/data/myPlayer'
import { Item } from '@/data/items/item'

export const InventoryManager = {
    inventory: [] as Item[],

    addItem(item: Item) {
        this.inventory.push(item)
        console.log("Added item to inventory: ", item)
    },

    equipItem(item: Item) {
        console.log("Equipping item: ", item)
        MyPlayer.myChar.equipSet.set(item.slotInfo.slot, item)
        MyPlayer.myChar.model!.assignEquippedItems()
        this.inventory = this.inventory.filter(i => i !== item)
    },

    unequipSlot(slot: string) {
        console.log("Unequipping item: ", MyPlayer.myChar.equipSet.get(slot))
        const item = MyPlayer.myChar.equipSet.get(slot)
        MyPlayer.myChar.equipSet.delete(slot)
        MyPlayer.myChar.model?.removeEquippedItem(slot)

        this.addItem(item!)
    }
}

