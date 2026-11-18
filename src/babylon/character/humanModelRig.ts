import type { Skeleton } from '@babylonjs/core'

export const HUMAN_MODEL_FILE = 'human_male.glb'
export const HUMAN_ANIMATION_SPEED = { idle: 1, walk: 3, run: 3.2, combatIdle: 1 } as const

// Blender 24 FPS -> imported glTF 60 FPS. All unauthored actions temporarily use JAB.
const authoredRanges: Record<string, { startFrame: number, endFrame: number }> = {
    Idle: { startFrame: 0, endFrame: 75 },
    Walk: { startFrame: 100, endFrame: 250 },
    Run: { startFrame: 275, endFrame: 425 },
    CombatIdle: { startFrame: 450, endFrame: 525 },
    Slash: { startFrame: 550, endFrame: 625 },
    Jab: { startFrame: 650, endFrame: 725 },
    LeftSlash: { startFrame: 750, endFrame: 825 },
    RightSlash: { startFrame: 850, endFrame: 925 },
    HighJab: { startFrame: 950, endFrame: 1025 },
    Slash2: { startFrame: 1050, endFrame: 1125 },
    BowAim: { startFrame: 1150, endFrame: 1225 },
    CombatIdleTwoHanded: { startFrame: 1250, endFrame: 1325 },
    GreatAxeAttack: { startFrame: 1350, endFrame: 1425 },
    OreMining: { startFrame: 1450, endFrame: 1525 },
    TwoHandedSwordAttack: { startFrame: 1550, endFrame: 1625 },
    TwoHandedSwordAttack2: { startFrame: 1650, endFrame: 1725 },
    Death: { startFrame: 1850, endFrame: 1925 },
    Pickup: { startFrame: 1950, endFrame: 1975 },
    SittingIdle: { startFrame: 2000, endFrame: 2075 },
}

export function getHumanAnimationRange(name: string) {
    return authoredRanges[name] ?? authoredRanges.Jab
}

export function prepareHumanSkeleton(skeleton: Skeleton) {
    const ids: Record<string, string> = {
        Body: 'Bone.001', Head: 'Bone.002',
        'Arm.L': 'Bone.010', 'Arml.L': 'Bone.011', 'Hand.L': 'Bone.012',
        'Arm.R': 'Bone.003', 'Arml.R': 'Bone.004', 'Hand.R': 'Bone.009',
        'UpperLeg.L': 'Bone.008', 'UpperLeg.R': 'Bone.006',
    }
    skeleton.bones.forEach(bone => {
        if (ids[bone.name]) bone.id = ids[bone.name]
    })
}
