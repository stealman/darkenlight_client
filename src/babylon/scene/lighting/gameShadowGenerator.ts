import { ShadowGenerator } from '@babylonjs/core'
import type { Effect, Matrix, Scene } from '@babylonjs/core'

type ShadowBinding = {
    generator: ShadowGenerator
    effect: Effect
    renderId: number
}

// Light indices are effect slots. Different meshes using the same shader can
// put different light sources in the same slot.
const bindingsByScene = new WeakMap<Scene, Map<string, ShadowBinding>>()

export class GameShadowGenerator extends ShadowGenerator {
    trackRenderedTransform = false
    private renderedTransform?: Matrix
    private bindingRenderedTransform = false

    protected override _initializeShadowMap() {
        super._initializeShadowMap()
        this.renderedTransform = undefined
        const shadowMap = this.getShadowMap()
        shadowMap?.onBeforeRenderObservable.add(() => {
            if (!this.trackRenderedTransform || shadowMap.refreshRate <= 1) return
            const transform = super.getTransformMatrix()
            if (this.renderedTransform) this.renderedTransform.copyFrom(transform)
            else this.renderedTransform = transform.clone()
        })
    }

    override getTransformMatrix() {
        return (this.bindingRenderedTransform ? this.renderedTransform : undefined) ?? super.getTransformMatrix()
    }

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

        // Sample a skipped map with the transform that produced its contents.
        this.bindingRenderedTransform = this.trackRenderedTransform && (this.getShadowMap()?.refreshRate ?? 0) > 1
        try {
            super.bindShadowLight(lightIndex, effect)
        } finally {
            this.bindingRenderedTransform = false
        }
        if (last) {
            last.generator = this
            last.effect = effect
            last.renderId = renderId
        } else {
            bindings.set(lightIndex, {generator: this, effect, renderId})
        }
    }
}
