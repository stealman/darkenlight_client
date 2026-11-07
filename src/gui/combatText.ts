import type {AutoAttackResult} from '@/network/messageIfs'

export function getDamagePositionSuffix(direction?: AutoAttackResult['a'], heightBlocks?: number): string {
    const side = direction === 's' ? ' >' : direction === 'b' ? ' ^' : ''
    return side + getDamageHeightSuffix(heightBlocks)
}

export function getDamageHeightSuffix(heightBlocks?: number): string {
    return heightBlocks ? ` ${heightBlocks > 0 ? Math.min(3, heightBlocks) : Math.abs(heightBlocks)}▣` : ''
}

export function getHeightColorToken(heightBlocks: number): string {
    return heightBlocks > 0 ? '--ui-attribute-agility' : '--ui-accent-red'
}
