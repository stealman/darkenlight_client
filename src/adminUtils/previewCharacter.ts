import { Vector3 } from '@babylonjs/core'
import type Character from '@/babylon/character/character'

export function createPreviewCharacter(gender: 'M' | 'F' = 'M'): Character {
    return {
        id: -1,
        gender,
        headTypeId: 1,
        hairTypeId: 1,
        hairColorId: 1,
        pos: Vector3.Zero(),
        logicYpos: 0,
        nameDisplayTime: 0,
        insideView: true,
        equipSet: new Map(),
        dead: false,
        attackAnimationTime: 1000,
        yMoveSpeed: 0,
        getModelHeight: () => 2,
        isMyChar: () => true,
        getMoveAngle: () => null,
        getLookAngle: () => null,
        getWeapon: () => null,
        isPushThroughVisualActive: () => false,
        getMoveType: () => 'W',
        getActualSpeed: () => 0,
        getFootStepSoundType: () => null,
        isRecentlyInCombat: () => false,
    } as unknown as Character
}
