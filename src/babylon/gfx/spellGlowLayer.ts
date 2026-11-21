import {Constants, GlowLayer, Mesh, Scene} from '@babylonjs/core'

class SpellGlowLayer extends GlowLayer {
    private declare spellMeshes: Mesh[]

    protected override _createMainTexture() {
        super._createMainTexture()
        // Babylon creates the texture during construction and recreates it on resize.
        this._mainTexture.renderList = this.spellMeshes ??= []
        this._mainTexture.forceLayerMaskCheck = true
    }

    track(mesh: Mesh) {
        this.spellMeshes.push(mesh)
        this.referenceMeshToUseItsOwnMaterial(mesh)
    }

    untrack(mesh: Mesh) {
        const index = this.spellMeshes.indexOf(mesh)
        if (index === -1) return
        this.spellMeshes.splice(index, 1)
        this.unReferenceMeshFromUsingItsOwnMaterial(mesh)
    }
}

class SceneSpellGlow {
    readonly meshes = new Set<Mesh>()
    layer: SpellGlowLayer | null = null
    enabled = false
    transparent = false

    constructor(private readonly scene: Scene) {}

    refresh() {
        if (this.scene.isDisposed) return
        const enabled = this.enabled && this.meshes.size > 0
        if (enabled && !this.layer) {
            const layer = new SpellGlowLayer('spellGlow', this.scene, {
                mainTextureRatio: 0.5, blurKernelSize: 32,
                alphaBlendingMode: this.transparent ? Constants.ALPHA_PREMULTIPLIED_PORTERDUFF : Constants.ALPHA_ADD,
            })
            if (this.transparent) layer.neutralColor.a = 0
            layer.intensity = 0.75
            for (const mesh of this.meshes) layer.track(mesh)
            this.layer = layer
        }
        if (this.layer) this.layer.isEnabled = enabled
    }
}

const stateByScene = new WeakMap<Scene, SceneSpellGlow>()

function getState(scene: Scene) {
    let state = stateByScene.get(scene)
    if (!state) {
        state = new SceneSpellGlow(scene)
        stateByScene.set(scene, state)
    }
    return state
}

export function configureSpellGlowLayer(scene: Scene, enabled: boolean, transparent: boolean) {
    const state = getState(scene)
    if (state.transparent !== transparent) {
        state.transparent = transparent
        state.layer?.dispose()
        state.layer = null
    }
    state.enabled = enabled
    state.refresh()
}

export function trackSpellGlowMesh(mesh: Mesh) {
    const state = getState(mesh.getScene())
    if (!state.meshes.has(mesh)) {
        state.meshes.add(mesh)
        state.layer?.track(mesh)
        state.refresh()
    }
}

export function untrackSpellGlowMesh(mesh: Mesh) {
    const scene = mesh.getScene()
    const state = stateByScene.get(scene)
    if (state?.meshes.delete(mesh) && !scene.isDisposed) {
        state.layer?.untrack(mesh)
        state.refresh()
    }
}
