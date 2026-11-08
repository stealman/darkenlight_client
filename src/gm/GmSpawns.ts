import { ref } from 'vue'
import { Connector } from '@/network/connector'
import { GMLoadSpawns, GMSpawnAction } from '@/network/messages'
import { Color3, InstancedMesh, LinesMesh, MeshBuilder, Vector3 } from '@babylonjs/core'
import { ViewportManager } from '@/utils/viewport'
import { GMSceneManager } from '@/babylon/gm/GmSceneManager'
import { MyPlayer } from '@/data/myPlayer'
import { WorldDataManager } from '@/data/worldDataManager'
import type { GMSpawnStatusData } from '@/network/messageIfs'

const copyRequestPrefix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
let copyRequestSequence = 0

export const GMSpawns = {
    actualWorldId: 0,
    spawnStatuses: ref(new Map<number, GMSpawnStatusData['spawns'][number] & {receivedAt: number}>()),
    allSpawns: ref([] as Spawn[]),
    selectedSpawn: ref<Spawn | null>(null),
    selectedSpawnAction: ref<string>(''),
    pendingCopy: null as {requestId: string, worldId: number} | null,

    visibleSpawns: [] as Spawn[],
    rangeMarkersEnabled: false,
    rangeMarkers: new Map<string, {key: string, mesh: LinesMesh}>(),

    startCopy() {
        if (!this.selectedSpawn.value || this.selectedSpawn.value.id <= 0 || this.pendingCopy) return
        this.selectedSpawnAction.value = 'COPY'
    },

    onClick(x: number, z: number) {
        if (this.selectedSpawnAction.value === 'COPY_PENDING') return
        const source = this.selectedSpawn.value
        if (this.selectedSpawnAction.value === 'COPY' && source && source.id > 0) {
            const requestId = `${copyRequestPrefix}-${++copyRequestSequence}`
            this.pendingCopy = {requestId, worldId: this.actualWorldId}
            this.selectedSpawnAction.value = 'COPY_PENDING'
            Connector.sendMessage(new GMSpawnAction('CREATE', {
                requestId, x, z,
                mobGrpId: source.mobGrpId, mobTypeId: source.mobTypeId,
                maxCount: source.maxCount, power: source.power,
                spawnRange: source.spawnRange, aggroRange: source.aggroRange, pursueRange: source.pursueRange,
            }))
            return
        }
        // Check if clicked on a spawn - exact match of x and z
        const clickedSpawn = this.allSpawns.value.find(spawn => spawn.x === x && spawn.z === z)
        if (clickedSpawn) {
            if (this.selectedSpawn.value && this.selectedSpawn.value != clickedSpawn && this.selectedSpawn.value.markerMesh) {
                this.selectedSpawn.value.markerMesh!.position.y = this.selectedSpawn.value.origYPos
            }
            this.selectedSpawn.value = clickedSpawn
            this.selectedSpawnAction.value = 'EDIT'
        } else {

            // Move existing spawn
            if (this.selectedSpawnAction.value === 'MOVE' && this.selectedSpawn.value !== null && this.selectedSpawn.value.id > 0) {
                this.selectedSpawn.value!.x = x
                this.selectedSpawn.value!.z = z
                Connector.sendMessage(new GMSpawnAction(this.selectedSpawnAction.value, {id: this.selectedSpawn.value.id, pos: {x: x, z: z}}))
                this.renderSpawnMarkers()
                this.selectedSpawnAction.value = 'EDIT'
                return
            } else if (this.selectedSpawn.value !== null) {

                // Deselect current spawn
                if (this.selectedSpawn.value.markerMesh) {
                    this.selectedSpawn.value.markerMesh!.position.y = this.selectedSpawn.value.origYPos
                }
                this.selectedSpawn.value = null
            } else {
                // Create new spawn at clicked position
                const newSpawn = new Spawn({
                    id: 0,
                    x: x,
                    z: z,
                    mobGrpId: 1,
                    mobTypeId: 0,
                    maxCount: 3,
                    power: 5,
                    spawnRange: 4,
                    aggroRange: 5,
                    pursueRange: 30
                })
                this.selectedSpawn.value = newSpawn
            }
            this.selectedSpawnAction.value = ''
        }
    },

    saveEditedSpawn() {
        const spawn = this.selectedSpawn.value
        if (!spawn || spawn.id <= 0) return
        // Number inputs can temporarily be empty or outside their limits while typing.
        const fields = [[spawn.maxCount, 1, 32], [spawn.power, 1, 32], [spawn.spawnRange, 1, 32],
            [spawn.aggroRange, 0, 32], [spawn.pursueRange, 1, 128]]
        if (fields.some(([value, min, max]) => !Number.isInteger(value) || value < min || value > max)) return
        Connector.sendMessage(new GMSpawnAction('UPDATE', {
            id: spawn.id,
            mobGrpId: spawn.mobGrpId,
            mobTypeId: spawn.mobTypeId,
            maxCount: spawn.maxCount,
            power: spawn.power,
            spawnRange: spawn.spawnRange,
            aggroRange: spawn.aggroRange,
            pursueRange: spawn.pursueRange
        }))
    },

    saveCreatedSpawn() {
        if (this.selectedSpawn.value) {
            Connector.sendMessage(new GMSpawnAction('CREATE', {
                x: this.selectedSpawn.value.x,
                z: this.selectedSpawn.value.z,
                mobGrpId: this.selectedSpawn.value.mobGrpId,
                mobTypeId: this.selectedSpawn.value.mobTypeId,
                maxCount: this.selectedSpawn.value.maxCount,
                power: this.selectedSpawn.value.power,
                spawnRange: this.selectedSpawn.value.spawnRange,
                aggroRange: this.selectedSpawn.value.aggroRange,
                pursueRange: this.selectedSpawn.value.pursueRange
            }))
            this.selectedSpawn.value = null
        }
    },

    onFrame(timeRate: number, actualTime: number) {
        if (this.selectedSpawn.value && this.selectedSpawn.value.markerMesh) {
            this.selectedSpawn.value.markerMesh.position.y = this.selectedSpawn.value.origYPos + (Math.abs(Math.sin(actualTime / 200)) * 0.5)
        }
    },

    killAllSpawn() {
        if (this.selectedSpawn.value) {
            Connector.sendMessage(new GMSpawnAction('KILL_ALL', this.selectedSpawn.value.id))
        }
    },

    deleteSpawn() {
        if (this.selectedSpawn.value) {
            Connector.sendMessage(new GMSpawnAction('DELETE', {id: this.selectedSpawn.value.id}))
            this.selectedSpawn.value = null
        }
    },

    consumeAllSpawns(worldId: number, spawnData: any[]) {
        const enabled = this.rangeMarkersEnabled
        this.removeAllMarkers()
        this.rangeMarkersEnabled = enabled
        this.actualWorldId = worldId
        this.receiveSpawnStatuses({worldId, spawns: spawnData})
        this.selectedSpawn.value = null
        this.allSpawns.value = spawnData.map(spawn => new Spawn(spawn))
        this.renderSpawnMarkers()
    },

    spawnChange(worldId: number, spawnData: any, deleted: boolean) {
        if (this.actualWorldId !== worldId) {
            return
        }

        const existingSpawnIndex = this.allSpawns.value.findIndex(s => s.id === spawnData.id)
        if (existingSpawnIndex >= 0) {

            // Update or delete existing spawn
            if (deleted) {
                const spawnToDelete = this.allSpawns.value[existingSpawnIndex]
                if (spawnToDelete.markerMesh) {
                    spawnToDelete.markerMesh.dispose()
                    spawnToDelete.markerMesh = null
                }
                this.allSpawns.value.splice(existingSpawnIndex, 1)
                if (this.selectedSpawn.value && this.selectedSpawn.value.id === spawnData.id) {
                    this.selectedSpawn.value = null
                }
                this.renderSpawnMarkers()
                return
            } else {
                // Release the old instance before replacing the owning spawn object.
                this.allSpawns.value[existingSpawnIndex].markerMesh?.dispose()
                this.allSpawns.value[existingSpawnIndex] = new Spawn(spawnData)
            }
        } else if (!deleted) {
            // Add new spawn
            this.allSpawns.value.push( new Spawn(spawnData) )
        }
        if (!deleted && this.pendingCopy?.worldId === worldId && this.pendingCopy.requestId === spawnData.requestId) {
            this.pendingCopy = null
            if (this.selectedSpawnAction.value === 'COPY_PENDING' && this.rangeMarkersEnabled) {
                const previous = this.selectedSpawn.value
                if (previous?.markerMesh) previous.markerMesh.position.y = previous.origYPos
                this.selectedSpawn.value = this.allSpawns.value.find(spawn => spawn.id === spawnData.id) ?? null
                this.selectedSpawnAction.value = 'EDIT'
            }
        }
        this.renderSpawnMarkers()
    },

    receiveSpawnStatuses(data: GMSpawnStatusData) {
        if (data.worldId !== MyPlayer.worldId) return
        const receivedAt = Date.now()
        this.spawnStatuses.value = new Map(data.spawns
            .filter(status => typeof status.count === 'number')
            .map(status => [status.id, {...status, receivedAt}]))
    },

    checkAndLoadSpawns() {
        if (this.actualWorldId !== MyPlayer.worldId) {
            Connector.sendMessage(new GMLoadSpawns())
        }
    },

    renderSpawnMarkers() {
        if (!this.rangeMarkersEnabled || this.actualWorldId !== MyPlayer.worldId) return
        this.updateVisibleSpawns()
        GMSceneManager.renderSpawnMarkers(this.visibleSpawns)
        this.renderSpawnRanges()
    },

    renderSpawnRanges() {
        const scene = GMSceneManager.spawnMarker?.getScene()
        if (!this.rangeMarkersEnabled || !scene || this.actualWorldId !== MyPlayer.worldId) return
        const selected = this.selectedSpawn.value
        const spawns = this.allSpawns.value.filter(spawn => spawn.id !== selected?.id
            && ViewportManager.isPointNearVisibleBounds(spawn.x, spawn.z, Math.max(spawn.spawnRange, spawn.aggroRange)))
        if (selected) spawns.push(selected)
        const active = new Set<string>()
        const map = WorldDataManager.getBlockMap()
        for (const spawn of spawns) {
            const block = map[Math.floor(spawn.x)]?.[Math.floor(spawn.z)]
            if (!block) continue
            const selectedSpawn = spawn.id === selected?.id
            const ranges = [
                {kind: 'spawn', radius: spawn.spawnRange, height: 0.16,
                    color: selectedSpawn ? new Color3(1, 0.75, 0) : new Color3(0.5, 0.5, 0.5)},
                {kind: 'aggro', radius: spawn.aggroRange, height: 0.18,
                    color: selectedSpawn ? new Color3(1, 0, 0) : new Color3(1, 0.65, 0.35)},
            ]
            for (const range of ranges) {
                if (!Number.isFinite(range.radius) || range.radius <= 0) continue
                const id = `${spawn.id}:${range.kind}`
                const y = block.totalHeight + range.height
                const key = `${spawn.x}:${spawn.z}:${range.radius}:${y}`
                let marker = this.rangeMarkers.get(id)
                if (marker?.key !== key) {
                    marker?.mesh.dispose()
                    const points: Vector3[] = []
                    for (let index = 0; index <= 48; index++) {
                        const angle = index / 48 * Math.PI * 2
                        points.push(new Vector3(spawn.x + Math.cos(angle) * range.radius,
                            y, spawn.z + Math.sin(angle) * range.radius))
                    }
                    const mesh = MeshBuilder.CreateLines(`${range.kind}Range_${spawn.id}`, {points}, scene)
                    mesh.isPickable = false
                    marker = {key, mesh}
                    this.rangeMarkers.set(id, marker)
                }
                marker.mesh.color = range.color
                active.add(id)
            }
        }
        for (const [id, marker] of this.rangeMarkers) {
            if (!active.has(id)) {
                marker.mesh.dispose()
                this.rangeMarkers.delete(id)
            }
        }
    },

    updateVisibleSpawns() {
        this.visibleSpawns = []
        for (const spawn of this.allSpawns.value) {
            if (ViewportManager.isPointInVisibleMatrix(Math.floor(spawn.x), Math.floor(spawn.z), 2)) {
                this.visibleSpawns.push(spawn)
            } else {
                if (spawn.markerMesh) {
                    spawn.markerMesh.dispose()
                    spawn.markerMesh = null
                }
            }
        }
    },

    removeAllMarkers() {
        this.pendingCopy = null
        if (this.selectedSpawnAction.value === 'COPY' || this.selectedSpawnAction.value === 'COPY_PENDING') {
            this.selectedSpawnAction.value = 'EDIT'
        }
        this.rangeMarkersEnabled = false
        for (const marker of this.rangeMarkers.values()) marker.mesh.dispose()
        this.rangeMarkers.clear()
        for (const spawn of this.allSpawns.value) {
            if (spawn.markerMesh) {
                spawn.markerMesh.dispose()
                spawn.markerMesh = null
            }
        }
        // Also release orphaned instances from older/replaced spawn snapshots.
        for (const marker of GMSceneManager.spawnMarker?.instances.slice() ?? []) marker.dispose()
        GMSceneManager.spawnMarker?.setEnabled(false)
        this.visibleSpawns = []
    }
}

export class Spawn {
    id: number
    x: number
    z: number
    mobGrpId: number
    mobTypeId: number
    maxCount: number
    power: number
    spawnRange: number
    aggroRange: number
    pursueRange: number

    markerMesh: InstancedMesh | null = null
    origYPos: number = 0

    constructor(spawn: any) {
        this.id = spawn.id
        this.x = spawn.x
        this.z = spawn.z
        this.mobGrpId = spawn.mobGrpId
        this.mobTypeId = spawn.mobTypeId
        this.maxCount = spawn.maxCount
        this.power = spawn.power
        this.spawnRange = spawn.spawnRange
        this.aggroRange = spawn.aggroRange
        this.pursueRange = spawn.pursueRange
    }
}
