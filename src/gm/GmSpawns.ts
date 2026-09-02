import { ref } from 'vue'
import { Connector } from '@/network/connector'
import { GMLoadSpawns, GMSpawnAction } from '@/network/messages'
import { InstancedMesh } from '@babylonjs/core'
import { ViewportManager } from '@/utils/viewport'
import { GMSceneManager } from '@/babylon/gm/GmSceneManager'
import { MyPlayer } from '@/data/myPlayer'

export const GMSpawns = {
    actualWorldId: 0,
    allSpawns: ref([] as Spawn[]),
    selectedSpawn: ref<Spawn | null>(null),
    selectedSpawnAction: ref<string>(''),

    visibleSpawns: [] as Spawn[],

    onClick(x: number, z: number) {
        // Check if clicked on a spawn - exact match of x and z
        const clickedSpawn = this.allSpawns.value.find(spawn => spawn.x === x && spawn.z === z)
        if (clickedSpawn) {
            if (this.selectedSpawn.value && this.selectedSpawn.value != clickedSpawn && this.selectedSpawn.value.markerMesh) {
                this.selectedSpawn.value.markerMesh!.position.y = this.selectedSpawn.value.origYPos
            }
            this.selectedSpawn.value = clickedSpawn
            this.selectedSpawnAction.value = ''
        } else {

            // Move existing spawn
            if (this.selectedSpawnAction.value === 'MOVE' && this.selectedSpawn.value !== null && this.selectedSpawn.value.id > 0) {
                this.selectedSpawn.value!.x = x
                this.selectedSpawn.value!.z = z
                Connector.sendMessage(new GMSpawnAction(this.selectedSpawnAction.value, {id: this.selectedSpawn.value.id, pos: {x: x, z: z}}))
                this.renderSpawnMarkers()
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
                    spawnRange: 5,
                    aggroRange: 5,
                    wanderingMoveRange: 10,
                    pursueRange: 30
                })
                this.selectedSpawn.value = newSpawn
            }
            this.selectedSpawnAction.value = ''
        }
    },

    saveEditedSpawn() {
        if (this.selectedSpawn.value) {
            Connector.sendMessage(new GMSpawnAction('UPDATE', {
                id: this.selectedSpawn.value.id,
                mobGrpId: this.selectedSpawn.value.mobGrpId,
                mobTypeId: this.selectedSpawn.value.mobTypeId,
                maxCount: this.selectedSpawn.value.maxCount,
                power: this.selectedSpawn.value.power,
                spawnRange: this.selectedSpawn.value.spawnRange,
                aggroRange: this.selectedSpawn.value.aggroRange,
                wanderingMoveRange: this.selectedSpawn.value.wanderingMoveRange,
                pursueRange: this.selectedSpawn.value.pursueRange
            }))
        }
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
                wanderingMoveRange: this.selectedSpawn.value.wanderingMoveRange,
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
        this.actualWorldId = worldId
        for (const spawn of spawnData) {
            this.allSpawns.value.push( new Spawn(spawn) )
        }
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
                // Update existing spawn
                this.allSpawns.value[existingSpawnIndex] = new Spawn(spawnData)
            }
        } else if (!deleted) {
            // Add new spawn
            this.allSpawns.value.push( new Spawn(spawnData) )
        }
        this.renderSpawnMarkers()
    },

    checkAndLoadSpawns() {
        if (this.actualWorldId !== MyPlayer.worldId) {
            Connector.sendMessage(new GMLoadSpawns())
        }
    },

    renderSpawnMarkers() {
        this.updateVisibleSpawns()
        GMSceneManager.renderSpawnMarkers(this.visibleSpawns)
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
        for (const spawn of this.allSpawns.value) {
            if (spawn.markerMesh) {
                spawn.markerMesh.dispose()
                spawn.markerMesh = null
            }
        }
        GMSceneManager.spawnMarker?.setEnabled(false)
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
    wanderingMoveRange: number
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
        this.wanderingMoveRange = spawn.wanderingMoveRange
        this.pursueRange = spawn.pursueRange
    }
}
