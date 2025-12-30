import { Color3, Mesh, Scene, StandardMaterial } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { WorldDataManager } from '@/data/worldDataManager'
import { Spawn } from '@/gm/GmSpawns'

export const GMSceneManager = {
    scene: null as Scene | null,
    hoverBlockMarker: null as Mesh | null,
    spawnMarker: null as Mesh | null,

    initialize (scene: Scene) {
        if (this.scene) {
            return
        }
        this.scene = scene

        // Hover Block Marker
        this.hoverBlockMarker = Builder.createHorizontalPlane(scene, null,1, 0)
        this.hoverBlockMarker.setEnabled(false)

        const material = new StandardMaterial("hoverBlockMat", scene)
        this.hoverBlockMarker.material = material
        this.hoverBlockMarker.material.diffuseColor = new Color3(1, 0, 0)
        this.hoverBlockMarker.material.alpha = 0.5

        // Spawn Marker
        this.spawnMarker = Builder.createSpawnMarker(scene)
        this.spawnMarker.setEnabled(false)

        const spawnMat = new StandardMaterial("spawnMarkerMat", scene)
        this.spawnMarker.material = spawnMat
        this.spawnMarker.material.diffuseColor = new Color3(0.65, 0, 0)
        this.spawnMarker.material.emissiveColor = new Color3(0.25, 0, 0)
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
    },

    renderSpawnMarkers(spawns: Spawn[]) {
        if (!this.spawnMarker) {
            return
        }
        this.spawnMarker!.setEnabled(true)
        for (const spawn of spawns) {
            if (!spawn.markerMesh) {
                spawn.markerMesh = this.spawnMarker!.createInstance("spawnMarker_" + spawn.id)
            }
            spawn.markerMesh.position.x = spawn.x
            spawn.markerMesh.position.z = spawn.z
            const block = WorldDataManager.getBlockMap()[Math.floor(spawn.x)][Math.floor(spawn.z)]
            spawn.markerMesh.position.y = block.totalHeight + 0.11
            spawn.origYPos = spawn.markerMesh.position.y
        }
    },
}
