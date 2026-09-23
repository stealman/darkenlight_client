import { Color3, Mesh, Ray, Scene, StandardMaterial } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { WorldDataManager } from '@/data/worldDataManager'
import { Spawn } from '@/gm/GmSpawns'
import { MyPlayer } from '@/data/myPlayer'

export const GMSceneManager = {
    initialized: false,
    hoverBlockMarker: null as Mesh | null,
    spawnMarker: null as Mesh | null,

    initialize (scene: Scene) {
        if (this.initialized) {
            return
        }

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

        this.initialized = true
    },

    updateHoverBlockMarker(x, z) {
        if (!this.hoverBlockMarker) {
            return
        }

        const markerX = Math.round(x)
        const markerZ = Math.round(z)
        const markerHeight = this.getHoverBlockMarkerHeight(markerX, markerZ)
        if (markerHeight === null) {
            return
        }

        this.hoverBlockMarker!.position.x = markerX
        this.hoverBlockMarker!.position.z = markerZ
        this.hoverBlockMarker!.position.y = markerHeight
    },

    updateHoverBlockMarkerFromRay(ray: Ray) {
        if (!this.hoverBlockMarker || Math.abs(ray.direction.y) < 0.0001) {
            return
        }

        // A void tile has no mesh, so normal scene picking cannot provide a
        // point. Refine the ray against its map height a few times to obtain
        // the same tile that would have been picked if it had a terrain mesh.
        let height = MyPlayer.myChar?.pos.y ?? 0
        let point = null
        for (let i = 0; i < 4; i++) {
            const distance = (height - ray.origin.y) / ray.direction.y
            if (distance < 0) {
                return
            }

            point = ray.origin.add(ray.direction.scale(distance))
            const markerHeight = this.getHoverBlockMarkerHeight(Math.round(point.x), Math.round(point.z))
            if (markerHeight === null) {
                return
            }
            height = markerHeight
        }

        this.updateHoverBlockMarker(point!.x, point!.z)
    },

    getHoverBlockMarkerHeight(x: number, z: number): number | null {
        const block = WorldDataManager.getBlockMap()[x]?.[z]
        if (!block) {
            return null
        }

        const blockHeight = Number.isFinite(block.totalHeight) ? block.totalHeight : block.height
        return blockHeight + (block.type === 0 ? 2.11 : 0.11)
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
