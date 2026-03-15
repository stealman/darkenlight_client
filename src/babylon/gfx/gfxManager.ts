import { Scene } from '@babylonjs/core'
import { CharacterEffect } from '@/babylon/gfx/characterEffect'

export const GfxManager = {
    scene: null as Scene | null,
    activeEffects: [] as CharacterEffect[],

    initialize(scene: Scene) {
        this.clear()
        this.scene = scene
    },

    addEffect(effect: CharacterEffect, actualTime: number = Date.now()) {
        if (!this.scene) {
            return
        }

        this.activeEffects.push(effect)
        effect.onStart(actualTime)
    },

    onFrame(actualTime: number) {
        for (let i = this.activeEffects.length - 1; i >= 0; i--) {
            const effect = this.activeEffects[i]
            effect.onUpdate(actualTime)

            if (!effect.isFinished(actualTime)) {
                continue
            }

            effect.onEnd()
            this.activeEffects.splice(i, 1)
        }
    },

    clear() {
        this.activeEffects.forEach(effect => effect.onEnd())
        this.activeEffects = []
    },
}
