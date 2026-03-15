import { TransformNode, Vector3 } from '@babylonjs/core'

export interface EffectTarget {
    pos: Vector3
    insideView: boolean
    getModelHeight(): number
    getEffectAnchorNode(): TransformNode | null
    isEffectVisible(): boolean
}

export interface CharacterEffect {
    target: EffectTarget
    positionOffset: Vector3
    onStart(actualTime: number): void
    onUpdate(actualTime: number): void
    onEnd(): void
    isFinished(actualTime: number): boolean
}
