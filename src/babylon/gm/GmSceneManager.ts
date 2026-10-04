import { Color3, Mesh, Ray, Scene, StandardMaterial } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { WorldDataManager } from '@/data/worldDataManager'
import { Spawn } from '@/gm/GmSpawns'
import { MyPlayer } from '@/data/myPlayer'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'

const HOVER_MARKER_TERRAIN_OFFSET = 0.11
const HOVER_MARKER_BUILDING_FLOOR_OFFSET = 0.121

export const GMSceneManager = {
    initialized: false,
    hoverBlockMarker: null as Mesh | null,
    hoverBlockMarkerTiles: [] as Array<{mesh: Mesh, offsetX: number, offsetZ: number}>,
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
        this.hoverBlockMarker.onEnabledStateChangedObservable.add(() => {
            const enabled = this.hoverBlockMarker!.isEnabled()
            this.hoverBlockMarkerTiles.forEach((tile) => tile.mesh.setEnabled(enabled))
        })

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

        this.hoverBlockMarker.position.set(markerX, markerHeight, markerZ)
        for (const tile of this.hoverBlockMarkerTiles) {
            const tileX = markerX + tile.offsetX
            const tileZ = markerZ + tile.offsetZ
            const tileHeight = this.getHoverBlockMarkerHeight(tileX, tileZ)
            tile.mesh.setEnabled(this.hoverBlockMarker.isEnabled() && tileHeight !== null)
            if (tileHeight !== null) tile.mesh.position.set(tileX, tileHeight, tileZ)
        }
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

        const hasBuildingFloor = BuildingManager.hasFloorAtTile(x, z)
        const surfaceHeight = hasBuildingFloor && Number.isFinite(block.totalHeight)
            ? block.totalHeight
            : block.height
        const surfaceOffset = hasBuildingFloor
            ? HOVER_MARKER_BUILDING_FLOOR_OFFSET
            : HOVER_MARKER_TERRAIN_OFFSET
        return surfaceHeight + (block.type === 0 ? 2 : 0) + surfaceOffset
    },

    setHoverBlockMarkerSize(size: number) {
        if (!this.hoverBlockMarker) {
            return
        }
        this.clearHoverBlockMarkerTiles()
        this.hoverBlockMarker!.scaling.x = size
        this.hoverBlockMarker!.scaling.z = size
    },

    setHoverBlockMarkerFootprint(offsets: Array<{x: number, z: number}>) {
        if (!this.hoverBlockMarker) return

        this.clearHoverBlockMarkerTiles()
        this.hoverBlockMarker.scaling.x = 1
        this.hoverBlockMarker.scaling.z = 1
        const uniqueOffsets = new Map(offsets.map((offset) => [`${offset.x};${offset.z}`, offset]))
        uniqueOffsets.delete('0;0')
        for (const offset of uniqueOffsets.values()) {
            const mesh = this.hoverBlockMarker.clone(`hoverBlockMarker_${offset.x}_${offset.z}`)
            if (!mesh) continue
            mesh.setEnabled(this.hoverBlockMarker.isEnabled())
            this.hoverBlockMarkerTiles.push({mesh, offsetX: offset.x, offsetZ: offset.z})
        }
        this.updateHoverBlockMarker(this.hoverBlockMarker.position.x, this.hoverBlockMarker.position.z)
    },

    clearHoverBlockMarkerTiles() {
        this.hoverBlockMarkerTiles.forEach((tile) => tile.mesh.dispose())
        this.hoverBlockMarkerTiles = []
    },

    setHoverBlockMarkerEnabled(enabled: boolean) {
        this.hoverBlockMarker?.setEnabled(enabled)
        this.hoverBlockMarkerTiles.forEach((tile) => tile.mesh.setEnabled(enabled))
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
