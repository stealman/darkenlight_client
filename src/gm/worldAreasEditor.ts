import { Connector } from '@/network/connector'
import { GMWorldAreasRequest } from '@/network/messages'
import type { WorldAreasData } from '@/network/messageIfs'
import { validateWorldAreas, type WorldArea } from '@/data/worldAreas'

const clone = (areas: WorldArea[]) => areas.map(area => ({...area, points: [...area.points]}))
let requestCounter = 0

export class WorldAreasEditor {
    worldId = -1
    size = 0
    revision = 0
    areas: WorldArea[] = []
    draft: WorldArea | null = null
    drawing = false
    selectedVertex = -1
    loading = false
    saving = false
    stale = false
    error = ''
    saved = ''
    undoStack: number[][] = []
    redoStack: number[][] = []
    private baseline = '[]'
    private pendingRequest = ''
    private timer: ReturnType<typeof setTimeout> | null = null

    get draftChanged() {
        if (!this.draft) return false
        return JSON.stringify(this.draft) !== JSON.stringify(this.areas.find(area => area.id === this.draft!.id))
    }
    get dirty() { return JSON.stringify(this.areas) !== this.baseline || this.draftChanged }
    get busy() { return this.loading || this.saving }
    get selectedArea() { return this.areas.find(area => area.id === this.draft?.id) ?? null }

    dispose() { if (this.timer) clearTimeout(this.timer); this.timer = null }
    private request(action: 'load' | 'save') {
        this.dispose()
        this.pendingRequest = `areas-${Date.now()}-${++requestCounter}`
        this.timer = setTimeout(() => {
            this.loading = this.saving = false
            this.error = 'Server did not reply. Your changes are kept; retry or reload.'
            this.pendingRequest = ''
        }, 15000)
        Connector.sendMessage(new GMWorldAreasRequest({worldId: this.worldId, action, requestId: this.pendingRequest,
            ...(action === 'save' ? {revision: this.revision, areas: clone(this.areas)} : {})}))
    }
    load(worldId: number) {
        this.worldId = worldId
        this.size = 0
        this.areas = []
        this.draft = null
        this.baseline = '[]'
        this.loading = true
        this.saving = this.stale = false
        this.error = this.saved = ''
        this.request('load')
    }
    receive(data: WorldAreasData) {
        if (data.worldId !== this.worldId) return
        const reply = data.requestId === this.pendingRequest && !!this.pendingRequest
        if (data.requestId && !reply) return
        if (!reply && data.revision === this.revision) return
        if (!reply && (this.dirty || this.busy)) {
            this.stale = true
            this.error = 'Another GM changed these areas. Reload before saving; local changes are kept.'
            return
        }
        if (reply) { this.dispose(); this.pendingRequest = ''; this.loading = this.saving = false }
        if (data.error) { this.error = data.error; return }
        const selected = this.draft?.id
        this.size = data.size
        this.revision = data.revision
        this.areas = clone(data.areas)
        this.baseline = JSON.stringify(this.areas)
        this.stale = false
        this.error = ''
        this.saved = data.saved ? 'Areas saved to database.' : ''
        this.select(selected ?? null)
    }
    descendants(id: number): Set<number> {
        const result = new Set([id])
        for (let pass = 0; pass < this.areas.length; pass++) {
            let changed = false
            for (const area of this.areas) if (area.parentId !== undefined && result.has(area.parentId) && !result.has(area.id)) {
                result.add(area.id); changed = true
            }
            if (!changed) break
        }
        return result
    }
    select(id: number | null) {
        const area = this.areas.find(area => area.id === id)
        this.draft = area ? clone([area])[0] : null
        this.drawing = false
        this.selectedVertex = -1
        this.undoStack = []; this.redoStack = []
    }
    create(parentId?: number) {
        const id = Math.max(0, ...this.areas.map(area => area.id)) + 1
        this.draft = {id, name: parentId === undefined ? 'New area' : 'New subarea', ...(parentId === undefined ? {} : {parentId}), points: []}
        this.drawing = true
        this.selectedVertex = -1
        this.undoStack = []; this.redoStack = []
        this.error = this.saved = ''
    }
    checkpoint() {
        if (!this.draft) return
        this.undoStack.push([...this.draft.points])
        if (this.undoStack.length > 100) this.undoStack.shift()
        this.redoStack = []
    }
    addPoint(x: number, z: number, after?: number) {
        if (!this.draft || this.draft.points.length >= 256) return
        const p = this.draft.points
        if (after === undefined && p.length && p[p.length - 2] === x && p[p.length - 1] === z) return
        this.checkpoint()
        const at = after === undefined ? p.length : after + 2
        p.splice(at, 0, x, z)
        this.selectedVertex = at
    }
    removePoint() {
        if (!this.draft || this.selectedVertex < 0) return
        this.checkpoint()
        this.draft.points.splice(this.selectedVertex, 2)
        this.selectedVertex = -1
    }
    undo() {
        if (!this.draft || !this.undoStack.length) return
        this.redoStack.push([...this.draft.points]); this.draft.points = this.undoStack.pop()!; this.selectedVertex = -1
    }
    redo() {
        if (!this.draft || !this.redoStack.length) return
        this.undoStack.push([...this.draft.points]); this.draft.points = this.redoStack.pop()!; this.selectedVertex = -1
    }
    apply(): boolean {
        if (!this.draft) return true
        try {
            const candidate = clone(this.areas.filter(area => area.id !== this.draft!.id))
            candidate.push(clone([this.draft])[0])
            this.areas = validateWorldAreas(candidate, this.size).sort((a, b) => a.id - b.id)
            const id = this.draft.id
            this.select(id)
            this.error = this.saved = ''
            return true
        } catch (error) { this.error = error instanceof Error ? error.message : 'Invalid area.'; return false }
    }
    delete(id: number) {
        const ids = this.descendants(id)
        this.areas = this.areas.filter(area => !ids.has(area.id))
        this.select(null)
        this.error = this.saved = ''
    }
    save() {
        if (this.busy || this.stale || (this.draftChanged && !this.apply())) return
        try { this.areas = validateWorldAreas(this.areas, this.size) }
        catch (error) { this.error = String(error); return }
        this.saving = true
        this.error = this.saved = ''
        this.request('save')
    }
}
