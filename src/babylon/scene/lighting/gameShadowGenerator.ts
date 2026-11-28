import { ShadowGenerator } from '@babylonjs/core'
import type { Effect, Scene } from '@babylonjs/core'

type ShadowBinding = {
    generator: ShadowGenerator
    effect: Effect
    renderId: number
}

// Light indices are effect slots. Different meshes using the same shader can
// put different light sources in the same slot.
const bindingsByScene = new WeakMap<Scene, Map<string, ShadowBinding>>()

export class GameShadowGenerator extends ShadowGenerator {
    override bindShadowLight(lightIndex: string, effect: Effect) {
        const scene = this.getLight().getScene()
        let bindings = bindingsByScene.get(scene)
        if (!bindings) {
            bindings = new Map()
            bindingsByScene.set(scene, bindings)
        }

        const renderId = scene.getRenderId()
        const last = bindings.get(lightIndex)
        // Only reuse the binding while the same effect is still bound and no
        // other light has replaced this slot during the current render pass.
        if (last?.generator === this && last.effect === effect && last.renderId === renderId
            && scene.getCachedEffect() === effect) return

        super.bindShadowLight(lightIndex, effect)
        if (last) {
            last.generator = this
            last.effect = effect
            last.renderId = renderId
        } else {
            bindings.set(lightIndex, {generator: this, effect, renderId})
        }
    }
}
