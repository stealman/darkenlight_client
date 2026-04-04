import { ParticleSystem, TransformNode, Vector3 } from '@babylonjs/core'
import { Renderer } from '@/babylon/scene/renderer'

export interface EffectTarget {
    id: number
    pos: Vector3
    insideView: boolean
    getBoxSize(): number
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

export interface MonsterEffect {
    target: EffectTarget
    positionOffset: Vector3
    onStart(actualTime: number): void
    onUpdate(actualTime: number): void
    onEnd(): void
    isFinished(actualTime: number): boolean
}

export abstract class AnchoredEffect implements CharacterEffect, MonsterEffect {
    target: EffectTarget
    positionOffset: Vector3

    protected emitter: TransformNode | null = null
    private disposeTimeoutId: number | null = null

    constructor(target: EffectTarget, positionOffset: Vector3 | null = null) {
        this.target = target
        this.positionOffset = positionOffset ?? new Vector3(0, 0, 0)
    }

    onStart(actualTime: number): void {
        this.ensureEffect(actualTime)
    }

    onUpdate(actualTime: number): void {
        if (!this.target.isEffectVisible()) {
            this.disposeEffect()
            return
        }

        this.ensureEffect(actualTime)
        this.syncEmitterScale()
        this.afterEffectUpdate()
    }

    onEnd(): void {
        this.stopEffect()
    }

    abstract isFinished(actualTime: number): boolean

    protected abstract ensureEffect(actualTime: number): void

    protected abstract stopParticleSystems(): void

    protected abstract disposeParticleSystems(): void

    protected afterEffectUpdate(): void {
    }

    protected getParticleFadeOutMs(): number {
        return 0
    }

    protected createBottomAnchoredDirectedCylinderEmitter(particleSystem: ParticleSystem, radius: number, height: number, direction1: Vector3, direction2: Vector3) {
        const emitterType = particleSystem.createDirectedCylinderEmitter(radius, height, 0, direction1, direction2)
        emitterType.startPositionFunction = (worldMatrix, positionToUpdate, _particle, isLocal) => {
            const yPos = Math.random() * height
            const angle = Math.random() * 2 * Math.PI
            const xPos = radius * Math.cos(angle)
            const zPos = radius * Math.sin(angle)

            if (isLocal) {
                positionToUpdate.copyFromFloats(xPos, yPos, zPos)
                return
            }

            Vector3.TransformCoordinatesFromFloatsToRef(xPos, yPos, zPos, worldMatrix, positionToUpdate)
        }
    }

    protected getOrCreateEmitter(name: string): TransformNode | null {
        if (this.emitter) {
            return this.emitter
        }

        if (!Renderer.scene) {
            return null
        }

        const anchorNode = this.target.getEffectAnchorNode()
        if (!anchorNode) {
            return null
        }

        this.emitter = new TransformNode(name, Renderer.scene)
        this.emitter.parent = anchorNode
        this.emitter.position.copyFrom(this.positionOffset)
        this.syncEmitterScale()

        return this.emitter
    }

    protected disposeEffect() {
        if (this.disposeTimeoutId !== null) {
            window.clearTimeout(this.disposeTimeoutId)
            this.disposeTimeoutId = null
        }

        this.disposeParticleSystems()
        this.emitter?.dispose()
        this.emitter = null
    }

    protected stopEffect() {
        this.stopParticleSystems()

        const fadeOutMs = this.getParticleFadeOutMs()
        if (fadeOutMs <= 0) {
            this.disposeEffect()
            return
        }

        if (this.disposeTimeoutId !== null) {
            return
        }

        this.disposeTimeoutId = window.setTimeout(() => {
            this.disposeTimeoutId = null
            this.disposeEffect()
        }, fadeOutMs)
    }

    private syncEmitterScale() {
        if (!this.emitter) {
            return
        }

        const anchorNode = this.target.getEffectAnchorNode()
        if (!anchorNode) {
            return
        }

        const absoluteScaling = anchorNode.absoluteScaling
        this.emitter.scaling.set(
            absoluteScaling.x !== 0 ? 1 / absoluteScaling.x : 1,
            absoluteScaling.y !== 0 ? 1 / absoluteScaling.y : 1,
            absoluteScaling.z !== 0 ? 1 / absoluteScaling.z : 1,
        )
    }
}
