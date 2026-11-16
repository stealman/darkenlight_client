import {Lights} from '@/babylon/scene/lights'
import { Vector3 } from '@babylonjs/core'
import { GMSpawns } from '@/gm/GmSpawns'
import { MyPlayer } from '@/data/myPlayer'
import { ViewportManager } from '@/utils/viewport'
import { MonsterCatalog } from '@/data/monsterCatalog'
import { MonsterGroups } from '@/babylon/monsters/codebook/monsterCodebook'

export const SpawnCountOverlay = {
    labelPosition: new Vector3(),

    onFrame(ctx: CanvasRenderingContext2D) {
        if (!GMSpawns.rangeMarkersEnabled || GMSpawns.actualWorldId !== MyPlayer.worldId) return
        ctx.save()
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'
        const now = Date.now()
        for (const spawn of GMSpawns.visibleSpawns) {
            if (!spawn.markerMesh || spawn.markerMesh.isDisposed()) continue
            this.labelPosition.copyFrom(spawn.markerMesh.position)
            this.labelPosition.y += 1
            const screen = ViewportManager.getPositionOnScreen(this.labelPosition)
            if (!screen) continue
            const name = spawn.mobTypeId > 0
                ? MonsterCatalog.get(spawn.mobTypeId)?.name ?? `Monster #${spawn.mobTypeId}`
                : MonsterGroups.getById(spawn.mobGrpId)?.name.replace(/_/g, ' ') ?? `Group #${spawn.mobGrpId}`
            const received = GMSpawns.spawnStatuses.value.get(spawn.id)
            const status = received && now - received.receivedAt < 2500 ? received : undefined
            const label = `${spawn.maxCount}× (${status?.count ?? '?'}) ${name}`
            ctx.font = 'bold 16px "Roboto", Arial, sans-serif'
            ctx.fillStyle = '#ffd45a'
            ctx.strokeText(label, screen.x, screen.y)
            ctx.fillText(label, screen.x, screen.y)
            let timer = '...'
            if (status) {
                if (status.nextSpawnInGameHours === null) timer = status.count >= spawn.maxCount ? 'Full' : 'No respawn'
                else {
                    const elapsedHours = Lights.dayNightPaused ? 0 : Math.max(0, now - status.receivedAt) / Lights.dayNightCycleDurationMs * 24
                    const minutes = Math.max(0, Math.ceil((status.nextSpawnInGameHours - elapsedHours) * 60))
                    const days = Math.floor(minutes / 1440)
                    const hours = Math.floor(minutes % 1440 / 60)
                    timer = minutes === 0 ? 'Ready' : `Next: ${days}d ${hours}h ${minutes % 60}m`
                }
            }
            ctx.font = '13px "Roboto", Arial, sans-serif'
            ctx.fillStyle = '#b0b0b0'
            ctx.strokeText(timer, screen.x, screen.y + 18)
            ctx.fillText(timer, screen.x, screen.y + 18)
        }
        ctx.restore()
    },
}
