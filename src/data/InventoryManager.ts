import { MyPlayer } from '@/data/myPlayer'
import { Item } from '@/data/items/item'
import { Connector } from '@/network/connector'
import { DropItemMsg, EquipItemMsg, PickItemMsg, UnequipItemMsg } from '@/network/messages'
import { AudioManager } from '@/babylon/audio/audioManager'
import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { ItemTO } from '@/network/messageIfs'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'

export const InventoryManager = {
    inventory: [] as Item[],

    addItemToInventory(item: Item) {
        this.inventory.push(item)
    },

    addItemsToInventory(items: ItemTO[]) {
        AudioManager.playBackpackHandle2()
        for (const item of items) {
            this.addItemToInventory(Item.fromData(item))
        }
    },

    removeItemsFromInventory(items: number[]) {
        for (const id of items) {
            this.inventory = this.inventory.filter(i => i.id !== id)
        }
    },

    changeItemsInInventory(items: ItemTO[]) {
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
            Object.assign(existingItem, Item.fromData(changedItem))
        }
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

        Connector.sendMessage(new EquipItemMsg(item.slotInfo.slot, item.id))
        AudioManager.playBackpackHandle2()
        ActionButtonsManager.charEquipChanged()
    },

    unequipSlot(slot: string, fromEquipAction: boolean = false) {
        const item = MyPlayer.myChar.equipSet.get(slot)
        if (!item) {
            return
        }

        MyPlayer.myChar.equipSet.delete(slot)
        MyPlayer.myChar.model?.removeEquippedItem(slot)

        this.addItemToInventory(item)
        Connector.sendMessage(new UnequipItemMsg(item.id))

        if (!fromEquipAction) {
            AudioManager.playBackpackHandle2()
            ActionButtonsManager.charEquipChanged()
        }
    },

    useConsumableItem(item: Item) {
        console.log(`Consumable use not implemented yet for item ${item.id}`)
    },

    dropItem(item: Item) {
        AudioManager.playBackpackHandle2()
        Connector.sendMessage(new DropItemMsg(item.id))
        this.inventory = this.inventory.filter(i => i !== item)
    },

    pickItem() {
        const item = GroundItemsManager.nearbyItem
        if (!item) return
        Connector.sendMessage(new PickItemMsg(item.item.id))
    }
}
