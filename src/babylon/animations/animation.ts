import { AnimationGroup } from '@babylonjs/core'
import { Renderer } from '@/babylon/scene/renderer'

export class MeshAnimation {
    animation: AnimationGroup
    fromFrame: number
    toFrame: number
    actualFrame: number = 0
    loop: boolean = false
    speed: number = 1
    running: boolean = false

    weight: number = 1
    weightChange: number = 0

    constructor(animGroup: AnimationGroup, fromFrame: number, toFrame: number) {
        this.animation = animGroup
        this.animation.play(true)
        this.animation.pause()
        this.fromFrame = fromFrame
        this.toFrame = toFrame
    }

    onAnimFrame() {
        if (this.running) {
            this.animation.goToFrame(this.fromFrame + this.actualFrame % (this.toFrame - this.fromFrame))
            this.actualFrame += Renderer.animationSpeedRatio * this.speed

            if (!this.loop && this.actualFrame >= this.toFrame) {
                this.stop()
            }

            if (this.weightChange !== 0) {
                this.weight += this.weightChange

                if (this.weight < Math.abs(this.weightChange)) {
                    this.stop()
                } else if (this.weight > 1) {
                    this.weight = 1
                    this.weightChange = 0
                }
                this.animation.setWeightForAllAnimatables(this.weight)
            }
        }
    }

    start(fadeIn: boolean, speed: number = 1, loop: boolean = false) {
        this.speed = speed
        this.loop = loop
        this.actualFrame = this.fromFrame
        this.running = true
        this.weightChange = 0

        if (fadeIn) {
            this.weight = 0
            this.weightChange = 0.2
        } else {
            this.weight = 1
            this.animation.setWeightForAllAnimatables(this.weight)
        }
    }

    stop() {
        this.running = false
        this.actualFrame = 0
        this.weightChange = 0
        this.animation.setWeightForAllAnimatables(0)
    }

    fadeOut() {
        this.weightChange = -0.2
    }
}

export class AnimTransition {
    duration: number
    fromAnimation: AnimationGroup
    toAnimation: AnimationGroup
    loop: boolean
    speed: number

    fromWeight: number
    toWeight: number
    ended: boolean

    constructor(duration: number, fromAnimation: AnimationGroup, toAnimation: AnimationGroup, loop = false, speed = 1.0) {
        this.duration = duration
        this.fromAnimation = fromAnimation
        this.toAnimation = toAnimation
        this.loop = loop
        this.speed = speed
        this.ended = false

        this.fromWeight = 1
        this.toWeight = 0

        // Start target animation but set its weight to 0 initially
        this.toAnimation.start(loop, speed, this.toAnimation['startFrame'], this.toAnimation['endFrame'])
        this.toAnimation.setWeightForAllAnimatables(0)
        this.fromAnimation.setWeightForAllAnimatables(1)
    }

    onFrame(timeRate: number) {
        const weightChange = timeRate / this.duration

        this.fromWeight = Math.max(0, this.fromWeight - weightChange)
        this.toWeight = Math.min(1, this.toWeight + weightChange)

        this.fromAnimation.setWeightForAllAnimatables(this.fromWeight)
        this.toAnimation.setWeightForAllAnimatables(this.toWeight)

        if (this.fromWeight === 0 && this.toWeight === 1) {
            this.fromAnimation.stop()
            this.ended = true
        }
    }

    forceEnd() {
        this.fromAnimation.stop()
        this.toAnimation.setWeightForAllAnimatables(1)
    }
}
