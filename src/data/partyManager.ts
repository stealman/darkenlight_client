import {ref} from 'vue'
import type {PartyStateData} from '@/network/messageIfs'

export const PartyManager = {
    state: ref<PartyStateData | null>(null),
    receiveState(state: PartyStateData | null): boolean {
        const previous = this.state.value
        const memberJoined = !!state && state.members.some(member =>
            !previous?.members.some(existing => existing.id === member.id))
        this.state.value = state
        return memberJoined
    },
    async invite(targetId: number) {
        const [{Connector}, {PartyInviteMsg}] = await Promise.all([
            import('@/network/connector'), import('@/network/messages'),
        ])
        Connector.sendMessage(new PartyInviteMsg(targetId))
    },
    async leave() {
        const [{Connector}, {PartyLeaveMsg}] = await Promise.all([
            import('@/network/connector'), import('@/network/messages'),
        ])
        Connector.sendMessage(new PartyLeaveMsg())
    },
    async selectMember(id: number) {
        const [{CharacterManager}, {TargetingManager}, {MyPlayer}] = await Promise.all([
            import('@/babylon/character/characterManager'), import('@/gui/targettingManager'), import('@/data/myPlayer'),
        ])
        const member = this.state.value?.members.find(member => member.id === id)
        if (!member || member.worldId !== MyPlayer.worldId) return
        const character = id === MyPlayer.myChar?.id ? MyPlayer.myChar : CharacterManager.characters.get(id)
        if (character) TargetingManager.setSelectedTarget(character)
    },
    reset() {
        this.state.value = null
    },
}
