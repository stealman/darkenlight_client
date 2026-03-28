import { Item } from '@/data/items/item'
import { InventoryManager } from '@/data/InventoryManager'
import { MyPlayer } from '@/data/myPlayer'
import { Connector } from '@/network/connector'
import { ConsumeItemMsg, CreateCampMsg } from '@/network/messages'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { t } from '@/i18n'

export const ConsumableHelper = {

    healingPotionIds: [1001, 1002, 1003],
    manaPotionIds: [1011, 1012, 1013],
    woodIds: Array.from({ length: 20 }, (_, index) => 201 + index),

    isItemConsumable(item: Item): boolean {
        return this.getHealingPotionIds().includes(item.cbId) || this.getManaPotionIds().includes(item.cbId)
    },

    getHealingPotionIds(): number[] {
        return this.healingPotionIds
    },

    getManaPotionIds(): number[] {
        return this.manaPotionIds
    },

    getCampWoodIds(): number[] {
        return this.woodIds
    },

    isItemCampWood(item: Item): boolean {
        return this.getCampWoodIds().includes(item.cbId)
    },

    isItemPotion(cbId: number): boolean {
        return this.getHealingPotionIds().includes(cbId) || this.getManaPotionIds().includes(cbId)
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
        if (this.isItemPotion(cbId)) {
            const nextPotionUseTime = MyPlayer.nextPotionUseTime
            const now = Date.now()
            if (nextPotionUseTime > now) {
                const remainingSeconds = Math.ceil((nextPotionUseTime - now) / 1000)
                OnScreenMessageManager.addMessage(t('messages.nextPotionIn', { seconds: remainingSeconds }))
                return
            }
        }

        if (this.getHealingPotionIds().includes(cbId) && MyPlayer.myChar.hpPercent < 100) {
            Connector.sendMessage(new ConsumeItemMsg(cbId))
        }

        if (this.getManaPotionIds().includes(cbId) && MyPlayer.myChar.mpPercent < 100) {
            Connector.sendMessage(new ConsumeItemMsg(cbId))
        }
    },

    clickOnCreateCamp(cbId: number) {
        if (!this.getCampWoodIds().includes(cbId)) {
            return
        }

        Connector.sendMessage(new CreateCampMsg(cbId))
    }
}
