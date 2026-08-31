import { Npc } from '@/babylon/npc/npc'
import { ViewportManager } from '@/utils/viewport'
import { MyPlayer } from '@/data/myPlayer'
import { Utils } from '@/utils/utils'
import { Vector3 } from '@babylonjs/core'
import { TargetingManager } from '@/gui/targettingManager'

export const NpcManager = {
    npcs: new Map<number, Npc>(),
    visibleNpcs: new Set<number>(),

    initialize() {
        this.npcs = new Map<number, Npc>()
        this.visibleNpcs = new Set<number>()
    },

    async addNpc(data: any) {
        if (this.npcs.has(data.id)) {
            const npc = this.npcs.get(data.id)!
            this.applyNpcData(npc, data)
            return
        }

        const npc = new Npc(data)
        this.npcs.set(npc.id, npc)
        this.applyNpcData(npc, data)
        await npc.createModel(false)
        npc.insideView = this.isNpcInViewport(npc)
        if (npc.insideView) {
            await npc.model!.initAsync()
        }
    },

    removeNpc(id: number) {
        const npc = this.npcs.get(id)
        if (!npc) {
            return
        }
        npc.model?.removeFromScene()
        this.visibleNpcs.delete(id)
        this.npcs.delete(id)
        if (npc === TargetingManager.selectedTarget) {
            TargetingManager.unselectTarget()
        }
    },

    npcMove(data: number[]) {
        const npc = this.npcs.get(data[0])
        if (!npc) {
            return
        }
        this.setNpcPosition(npc, data[1], data[2])
        const angle = Utils.getAngleBetweenPoints(npc.pos, new Vector3(data[3], npc.pos.y, data[4]))
        npc.setMoveAngle(angle)
        npc.setActualSpeed(data[5])
        npc.setMoveType('W')
    },

    npcMoveStop(data: number[]) {
        const npc = this.npcs.get(data[0])
        if (!npc) {
            return
        }
        this.setNpcPosition(npc, data[1], data[2])
        npc.setMoveAngle(null)
        npc.setActualSpeed(0)
        npc.setLookAngle(data[3] - Math.PI / 4)
    },

    applyNpcData(npc: Npc, data: any) {
        this.setNpcPosition(npc, data.x, data.z)
        npc.name = data.name
        npc.title = data.title ?? ''
        npc.type = data.type
        npc.changeAppearance(data.bodyType, data.equipment)
        npc.wanderingRange = data.wr ?? 0
        if (data.mv?.length === 3) {
            this.npcMove([npc.id, data.x, data.z, data.mv[0], data.mv[1], data.mv[2]])
        } else {
            npc.setMoveAngle(null)
            npc.setActualSpeed(0)
            npc.setLookAngle((data.a ?? npc.getLookAngle()) - Math.PI / 4)
        }
    },

    setNpcPosition(npc: Npc, x: number, z: number) {
        npc.pos.x = x
        npc.pos.z = z
        npc.logicYpos = Utils.calculateWalkYPos(npc.pos.x, npc.pos.z, npc.getBoxSize())
        npc.pos.y = npc.logicYpos
    },

    onFrame(timeRate: number, actualTime: number, frame: number) {
        if (frame % 10 === 0) {
            this.updateVisibleNpcs()
            this.npcs.forEach((npc) => {
                npc.setVisible(this.visibleNpcs.has(npc.id))
            })
        }

        this.npcs.forEach((npc) => {
            npc.onFrame(timeRate, actualTime, false)
        })
    },

    updateVisibleNpcs() {
        this.visibleNpcs.clear()
        this.npcs.forEach((npc, id) => {
            if (this.isNpcInViewport(npc) && npc.getDistanceFromMyPlayer() <= MyPlayer.visibilityRadius) {
                this.visibleNpcs.add(id)
            }
        })
    },

    isNpcInViewport(npc: Npc) {
        return ViewportManager.isPointInVisibleMatrix(Math.floor(npc.pos.x), Math.floor(npc.pos.z), 1)
    },

    getNpcOnTile(x: number, z: number): Npc | null {
        for (const npc of this.npcs.values()) {
            if (Math.abs(npc.pos.x - x) < 0.75 && Math.abs(npc.pos.z - z) < 0.75) {
                return npc
            }
        }
        return null
    },

    isPointInNpc(x: number, z: number, size: number): Npc | null {
        const halfSize = size / 2
        for (const npc of this.npcs.values()) {
            if (Math.abs(npc.pos.x - x) < size && Math.abs(npc.pos.z - z) < halfSize + npc.getBoxSize() / 2) {
                return npc
            }
        }
        return null
    },

    getClosestNpcInDistance(maxDistance: number): Npc | null {
        if (!MyPlayer.myChar) {
            return null
        }

        let closestNpc: Npc | null = null
        let closestDistance = maxDistance
        for (const npc of this.npcs.values()) {
            const distance = npc.getDistanceFromMyPlayer()
            if (distance <= closestDistance) {
                closestNpc = npc
                closestDistance = distance
            }
        }
        return closestNpc
    }
}
