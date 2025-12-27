import { Color3, Mesh, Scene, StandardMaterial } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { WorldDataManager } from '@/data/worldDataManager'

export const GMSceneManager = {
    scene: null as Scene | null,
    hoverBlockMarker: null as Mesh | null,

    initialize (scene: Scene) {
        if (this.scene) {
            return
        }
        this.scene = scene
        this.hoverBlockMarker = Builder.createHorizontalPlane(scene, null,1, 0)
        this.hoverBlockMarker.setEnabled(false)
        // Semi transparent red
        const material = new StandardMaterial("hoverBlockMat", scene)
        this.hoverBlockMarker.material = material
        this.hoverBlockMarker.material.diffuseColor = new Color3(1, 0, 0)
        this.hoverBlockMarker.material.alpha = 0.5
    },

    updateHoverBlockMarker(x, z) {
        if (!this.hoverBlockMarker) {
            return
        }

        this.hoverBlockMarker!.position.x = Math.round(x)
        this.hoverBlockMarker!.position.z = Math.round(z)
        const block = WorldDataManager.getBlockMap()[Math.round(x)][Math.round(z)]
        this.hoverBlockMarker!.position.y = block.totalHeight + 0.11
    },

    setHoverBlockMarkerSize(size: number) {
        if (!this.hoverBlockMarker) {
            return
        }
        this.hoverBlockMarker!.scaling.x = size
        this.hoverBlockMarker!.scaling.z = size
    }
}
