import {Connector} from '@/network/connector'
import {BankActionMsg, BankOpenMsg, NpcCraftingMenuMsg, NpcLearnSkillMsg, NpcPurchaseMsg, NpcRepairMsg, NpcUseMsg} from '@/network/messages'
import type {NpcUseData, NpcVendorCatalogItem, SkillKey} from '@/network/messageIfs'

export const NpcInteractionManager = {
    preferredFeature: null as {npcId: number, type: string} | null,

    useNpc(id: number, featureType?: string) {
        this.preferredFeature = featureType ? {npcId: id, type: featureType} : null
        Connector.sendMessage(new NpcUseMsg(id))
    },

    purchase(npcId: number, item: NpcVendorCatalogItem, quantity: number) {
        Connector.sendMessage(new NpcPurchaseMsg(npcId, item.tp, item.cb, quantity))
    },

    purchaseHealerService(npcId: number) {
        Connector.sendMessage(new NpcPurchaseMsg(npcId, 'H', 1, 1))
    },

    repair(npcId: number, itemId: number) {
        Connector.sendMessage(new NpcRepairMsg(npcId, itemId))
    },

    learnSkill(npcId: number, skill: SkillKey) {
        Connector.sendMessage(new NpcLearnSkillMsg(npcId, skill))
    },

    openCrafting(npcId: number, category: string) {
        Connector.sendMessage(new NpcCraftingMenuMsg(npcId, category))
    },

    openBank(npcId: number) {
        Connector.sendMessage(new BankOpenMsg(npcId))
    },

    bankAction(npcId: number, action: string, itemId: number, splitCount?: number) {
        Connector.sendMessage(new BankActionMsg(npcId, action, itemId, splitCount))
    },

    processNpcUse(data: NpcUseData) {
        const initialFeature = this.preferredFeature?.npcId === data.id ? this.preferredFeature.type : undefined
        this.preferredFeature = null
        window.dispatchEvent(new CustomEvent('ui:open-npc-use', {detail: {...data, initialFeature}}))
    },
}
