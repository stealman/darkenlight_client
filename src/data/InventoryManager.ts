import { MyPlayer } from '@/data/myPlayer'
import { Item } from '@/data/items/item'
import { Connector } from '@/network/connector'
import { EquipItemMsg, UnequipItemMsg } from '@/network/messages'
import { AudioManager } from '@/babylon/audio/audioManager'

export const InventoryManager = {
    inventory: [] as Item[],

    addItemToInventory(item: Item) {
        this.inventory.push(item)
    },

    equipItem(item: Item) {
        MyPlayer.myChar.equipSet.set(item.slotInfo.slot, item)
        MyPlayer.myChar.model!.assignEquippedItems()
        this.inventory = this.inventory.filter(i => i !== item)

        Connector.sendMessage(new EquipItemMsg(item.slotInfo.slot, item.id))
        AudioManager.playBackpackHandle2()
    },

    unequipSlot(slot: string) {
        const item = MyPlayer.myChar.equipSet.get(slot)
        MyPlayer.myChar.equipSet.delete(slot)
        MyPlayer.myChar.model?.removeEquippedItem(slot)

        this.addItemToInventory(item!)
        Connector.sendMessage(new UnequipItemMsg(item!.id))
        AudioManager.playBackpackHandle2()
    }
}
