import {Connector} from '@/network/connector'
import {NpcPurchaseMsg, NpcUseMsg} from '@/network/messages'
import type {NpcUseData, NpcVendorCatalogItem} from '@/network/messageIfs'

export const NpcInteractionManager = {
    useNpc(id: number) {
        Connector.sendMessage(new NpcUseMsg(id))
    },

    purchase(npcId: number, item: NpcVendorCatalogItem, quantity: number) {
        Connector.sendMessage(new NpcPurchaseMsg(npcId, item.tp, item.cb, quantity))
    },

    processNpcUse(data: NpcUseData) {
        window.dispatchEvent(new CustomEvent('ui:open-npc-use', {detail: data}))
    },
}
