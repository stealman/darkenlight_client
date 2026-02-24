import { MyPlayer } from '@/data/myPlayer'

export const InventoryManager = {

    unequipSlot(slot: string) {
        MyPlayer.myChar.equipSet.delete(slot)
        MyPlayer.myChar.model?.removeEquippedItem(slot)
    }
}

