import { WorldAreaIndex } from './worldAreas'
import type { WorldAreasData } from '@/network/messageIfs'
import { ref } from 'vue'

export const WorldAreaManager = {
    worldId: -1,
    worldName: '',
    revision: 0,
    announcement: ref<{name: string, sequence: number} | null>(null),
    currentAreaId: undefined as number | null | undefined,
    announcementSequence: 0,
    lastAnnouncementAt: -Infinity,
    pendingAnnouncement: null as string | null,
    lastX: NaN,
    lastZ: NaN,
    resetLocation(resetCooldown = true) {
        if (resetCooldown) this.lastAnnouncementAt = -Infinity
        this.pendingAnnouncement = null
        this.currentAreaId = undefined
        this.lastX = this.lastZ = NaN
        this.announcement.value = null
    },
    updateLocation(worldId: number, x: number, z: number, now = Date.now()) {
        if (worldId !== this.worldId) return
        if (x !== this.lastX || z !== this.lastZ) {
            this.lastX = x; this.lastZ = z
            const area = this.index.getAt(x, z)
            if ((area?.id ?? null) !== this.currentAreaId) {
                this.currentAreaId = area?.id ?? null
                this.pendingAnnouncement = area?.name ?? (this.worldName || null)
            } else if (this.pendingAnnouncement !== null) {
                this.pendingAnnouncement = area?.name ?? (this.worldName || null)
            }
        }
        // Check the deadline even when standing still after a boundary crossing.
        if (this.pendingAnnouncement !== null && now - this.lastAnnouncementAt >= 5000) {
            this.announcement.value = {name: this.pendingAnnouncement, sequence: ++this.announcementSequence}
            this.lastAnnouncementAt = now
            this.pendingAnnouncement = null
        }
    },
    index: new WorldAreaIndex([]),
    // A single notification stream also serves the GM editor for other worlds.
    response: ref<WorldAreasData | null>(null),
    setWorld(worldId: number, areas: WorldAreasData['areas'], revision = 0, worldName = '') {
        if (worldId !== this.worldId) this.resetLocation(false)
        this.lastX = this.lastZ = NaN
        this.worldId = worldId
        this.worldName = worldName
        this.revision = revision
        this.index = new WorldAreaIndex(areas)
    },
    receive(data: WorldAreasData) {
        if (!data.error && data.worldId === this.worldId && data.revision >= this.revision) {
            this.lastX = this.lastZ = NaN
            this.index = new WorldAreaIndex(data.areas)
            this.revision = data.revision
        }
        this.response.value = data
    },
}
