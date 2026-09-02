import {Connector} from '@/network/connector'
import {BankActionMsg, BankOpenMsg, NpcPurchaseMsg, NpcUseMsg} from '@/network/messages'
import type {NpcUseData, NpcVendorCatalogItem} from '@/network/messageIfs'

export const NpcInteractionManager = {
    useNpc(id: number) {
        Connector.sendMessage(new NpcUseMsg(id))
    },

    purchase(npcId: number, item: NpcVendorCatalogItem, quantity: number) {
        Connector.sendMessage(new NpcPurchaseMsg(npcId, item.tp, item.cb, quantity))
    },

    purchaseHealerService(npcId: number) {
        Connector.sendMessage(new NpcPurchaseMsg(npcId, 'H', 1, 1))
    },

    openBank(npcId: number) {
        Connector.sendMessage(new BankOpenMsg(npcId))
    },

    bankAction(npcId: number, action: string, itemId: number, splitCount?: number) {
        Connector.sendMessage(new BankActionMsg(npcId, action, itemId, splitCount))
    },

    processNpcUse(data: NpcUseData) {
        window.dispatchEvent(new CustomEvent('ui:open-npc-use', {detail: data}))
    },
}
