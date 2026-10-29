import { ConsumablesCodebook } from './consumablesCodebook'
import { InventoryManager } from '@/data/inventoryManager'
import { MyPlayer } from '@/data/myPlayer'
import { Connector } from '@/network/connector'
import { ConsumeItemMsg, CreateCampMsg } from '@/network/messages'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { t } from '@/i18n'

export const ConsumableHelper = {

    ...ConsumablesCodebook,

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

    clickOnConsumeStaminaPotion() {
        const highestId = [...this.getStaminaPotionIds()]
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

        if (this.getStaminaPotionIds().includes(cbId) && MyPlayer.myChar.st < MyPlayer.myChar.maxSt) {
            Connector.sendMessage(new ConsumeItemMsg(cbId))
        }

        if (this.getFoodIds().includes(cbId)) {
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
