import { Connector } from '@/network/connector'
import { GMWorldAreasRequest } from '@/network/messages'
import type { WorldAreasData } from '@/network/messageIfs'
import { SIGNPOST_DIRECTIONS } from '@/babylon/world/statics/objects/woodenSignpost'

let requestCounter = 0
export type SignpostTarget = NonNullable<WorldAreasData['signpostTargets']>['targets'][number]

export function directionToSignpostTarget(x: number, z: number, target: SignpostTarget): string | null {
    const dx = target.x - x, dz = target.z - z
    if (Math.hypot(dx, dz) < 0.001) return null
    let best: string | null = null, score = -Infinity
    for (const [direction, {yaw}] of Object.entries(SIGNPOST_DIRECTIONS)) {
        const dot = dx * Math.cos(yaw) - dz * Math.sin(yaw)
        if (dot > score) { best = direction; score = dot }
    }
    return best
}

export class SignpostAreaPicker {
    loading = false
    error = ''
    currentAreaName = ''
    targets: SignpostTarget[] = []
    private context = ''
    private requestId = ''
    private worldId = -1
    private timer: ReturnType<typeof setTimeout> | null = null

    refresh(worldId: number, currentAreaId: number | null, force = false) {
        const context = `${worldId}:${currentAreaId}`
        if (this.loading || (!force && context === this.context)) return
        this.dispose()
        this.context = context
        this.worldId = worldId
        this.targets = []
        this.currentAreaName = ''
        this.error = ''
        this.loading = true
        this.requestId = `signpost-targets-${Date.now()}-${++requestCounter}`
        this.timer = setTimeout(() => {
            this.loading = false
            this.requestId = ''
            this.error = 'Server did not reply. Refresh the area list to retry.'
        }, 15000)
        Connector.sendMessage(new GMWorldAreasRequest({worldId, action: 'signpostTargets', requestId: this.requestId}))
    }

    receive(data: WorldAreasData) {
        if (!this.requestId || data.requestId !== this.requestId || data.worldId !== this.worldId) return
        this.dispose()
        this.requestId = ''
        this.loading = false
        this.error = data.error ?? ''
        if (!data.error && data.signpostTargets) {
            this.context = `${data.worldId}:${data.signpostTargets.currentAreaId}`
            this.currentAreaName = data.signpostTargets.currentAreaName
            this.targets = data.signpostTargets.targets
        }
    }

    dispose() {
        if (this.timer) clearTimeout(this.timer)
        this.timer = null
    }
}
