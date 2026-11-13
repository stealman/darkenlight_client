import type { Skeleton } from '@babylonjs/core'

export const HUMAN_MODEL_FILE = 'human_male_new.glb'
export const HUMAN_ANIMATION_SPEED = { idle: 1, walk: 3, run: 3.2, combatIdle: 1 } as const

// Blender 24 FPS -> imported glTF 60 FPS. All unauthored actions temporarily use IDLE.
const authoredRanges: Record<string, { startFrame: number, endFrame: number }> = {
    Idle: { startFrame: 0, endFrame: 75 },
    Walk: { startFrame: 100, endFrame: 250 },
    Run: { startFrame: 275, endFrame: 425 },
    CombatIdle: { startFrame: 450, endFrame: 525 },
}

export function getHumanAnimationRange(name: string) {
    return authoredRanges[name] ?? authoredRanges.Idle
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
