import { Npc } from '@/babylon/npc/npc'
import { ViewportManager } from '@/utils/viewport'
import { MyPlayer } from '@/data/myPlayer'
import { Utils } from '@/utils/utils'

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
            npc.pos.x = data.x
            npc.pos.z = data.z
            npc.logicYpos = Utils.calculateWalkYPos(npc.pos.x, npc.pos.z, npc.getBoxSize())
            npc.pos.y = npc.logicYpos
            npc.name = data.name
            npc.type = data.type
            return
        }

        const npc = new Npc(data)
        this.npcs.set(npc.id, npc)
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

    isPointInNpc(x: number, z: number, size: number): Npc | null {
        const halfSize = size / 2
        for (const npc of this.npcs.values()) {
            if (Math.abs(npc.pos.x - x) < size && Math.abs(npc.pos.z - z) < halfSize + npc.getBoxSize() / 2) {
                return npc
            }
        }
        return null
    }
}
