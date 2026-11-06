import { PartyManager } from '@/data/partyManager'

export const PARTY_TARGET_COLOR = '#58ef83'

export function isPartyTarget(target: { id: number; getObjectType(): string }): boolean {
    return target.getObjectType() === 'C'
        && !!PartyManager.state.value?.members.some(member => member.id === target.id)
}
