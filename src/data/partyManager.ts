import {ref} from 'vue'
import type {PartyStateData, PartyInvitationData} from '@/network/messageIfs'

export const PartyManager = {
    state: ref<PartyStateData | null>(null),
    invitation: ref<(PartyInvitationData & {deadline: number}) | null>(null),
    receiveState(state: PartyStateData | null): boolean {
        const previous = this.state.value
        const memberJoined = !!state && state.members.some(member =>
            !previous?.members.some(existing => existing.id === member.id))
        this.state.value = state
        return memberJoined
    },
    receiveInvitation(invitation: PartyInvitationData | null) {
        this.invitation.value = invitation ? {...invitation, deadline: Date.now() + invitation.remainingMs} : null
    },
    async invite(targetId: number) {
        const [{Connector}, {PartyInviteMsg}] = await Promise.all([
            import('@/network/connector'), import('@/network/messages'),
        ])
        Connector.sendMessage(new PartyInviteMsg(targetId))
    },
    async respond(accept: boolean) {
        const invitation = this.invitation.value
        if (!invitation) return
        this.invitation.value = null
        const [{Connector}, {PartyRespondMsg}] = await Promise.all([
            import('@/network/connector'), import('@/network/messages'),
        ])
        Connector.sendMessage(new PartyRespondMsg(invitation.id, accept))
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
        if (!member || !member.nearby || member.worldId !== MyPlayer.worldId) return
        const character = id === MyPlayer.myChar?.id ? MyPlayer.myChar : CharacterManager.characters.get(id)
        if (character) TargetingManager.setSelectedTarget(character)
    },
    reset() {
        this.state.value = null
        this.invitation.value = null
    },
}
