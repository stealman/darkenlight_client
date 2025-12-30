import { ref } from 'vue'
import { Data } from '@/data/globalData'
import { Connector } from '@/network/connector'
import { GMLoadSpawns, GMSpawnAction } from '@/network/messages'
import { InstancedMesh } from '@babylonjs/core'
import { ViewportManager } from '@/utils/viewport'
import { GMSceneManager } from '@/babylon/gm/GmSceneManager'

export const GMSpawns = {
    actualWorldId: 0,
    allSpawns: ref([] as Spawn[]),
    selectedSpawn: ref<Spawn | null>(null),

    visibleSpawns: [] as Spawn[],

    onClick(x: number, z: number) {
        // Check if clicked on a spawn - exact match of x and z
        const clickedSpawn = this.allSpawns.value.find(spawn => spawn.x === x && spawn.z === z)
        if (clickedSpawn) {
            this.selectedSpawn.value = clickedSpawn
            console.log('Selected Spawn ID:', clickedSpawn)
        } else {
            if (this.selectedSpawn.value) {
                this.selectedSpawn.value.markerMesh!.position.y = this.selectedSpawn.value.origYPos
            }
            this.selectedSpawn.value = null

        }
    },

    onFrame(timeRate: number, actualTime: number) {
        if (this.selectedSpawn.value) {
            this.selectedSpawn.value.markerMesh!.position.y = this.selectedSpawn.value.origYPos + (Math.abs(Math.sin(actualTime / 200)) * 0.5)
        }
    },

    killAllSpawn() {
        if (this.selectedSpawn.value) {
            Connector.sendMessage(new GMSpawnAction('KILL_ALL', this.selectedSpawn.value.id))
        }
    },

    consumeAllSpawns(worldId: number, spawnData: any[]) {
        this.actualWorldId = worldId
        for (const spawn of spawnData) {
            this.allSpawns.value.push( new Spawn(spawn) )
        }
        this.renderSpawnMarkers()
    },

    checkAndLoadSpawns() {
        if (this.actualWorldId !== Data.worldId) {
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
