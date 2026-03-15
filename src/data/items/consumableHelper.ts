import { Item } from '@/data/items/item'
import { InventoryManager } from '@/data/InventoryManager'
import { MyPlayer } from '@/data/myPlayer'

export const ConsumableHelper = {

    isItemConsumable(item: Item): boolean {
        return this.getHealingPotionIds().includes(item.cbId) || this.getManaPotionIds().includes(item.cbId)
    },

    getHealingPotionIds(): number[] {
        return [1001, 1002, 1003]
    },

    getManaPotionIds(): number[] {
        return [1011, 1012, 1013]
    },

    clickOnConsumeHealingPotion() {
        const highestId = [...this.getHealingPotionIds()]
            .sort((a, b) => b - a)
            .find(cbId => InventoryManager.getTotalResourceItemCountByType(cbId) > 0)

        if (!highestId) return
        this.clickOnConsumeItem(highestId)
    },

    clickOnConsumeManaPotion() {
        const highestId = [...this.getManaPotionIds()]
            .sort((a, b) => b - a)
            .find(cbId => InventoryManager.getTotalResourceItemCountByType(cbId) > 0)

        if (!highestId) return
        this.clickOnConsumeItem(highestId)
    },

    clickOnConsumeItem(cbId: number) {
        console.log(`Clicked on consume item with cbId: ${cbId}`)

        // IF clicked on healig potion
        if (this.getHealingPotionIds().includes(cbId) && MyPlayer.myChar.hpPercent < 100) {
            console.log(`Using healing potion with cbId: ${cbId}`)
            //Connector.sendMessage(new UseConsumableItemMsg(cbId))
            //AudioManager.playHealingPotion()
        }
        if (this.getManaPotionIds().includes(cbId) && MyPlayer.myChar.mpPercent < 100) {
            console.log(`Using mana potion with cbId: ${cbId}`)
        }
    }
}
