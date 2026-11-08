import { Color3, LinesMesh, Matrix, Mesh, MeshBuilder, PointerEventTypes, PointerInfo, Scene, StandardMaterial, Vector3 } from '@babylonjs/core'
import { watch } from 'vue'
import { MyPlayer } from '@/data/myPlayer'
import { WorldAreaManager } from '@/data/worldAreaManager'
import { validateWorldAreas } from '@/data/worldAreas'
import { Connector } from '@/network/connector'
import { GMWorldAreasRequest } from '@/network/messages'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import type { WorldAreasData } from '@/network/messageIfs'

let requestCounter = 0

class AreaPreview {
    private line: LinesMesh | null = null
    private handles: Mesh[] = []
    private material: StandardMaterial | null = null
    private points: number[] = []
    private worldId = -1
    private areaId = -1
    private size = 0
    private scene: Scene | null = null
    private saving = false
    private uncertain = false
    private drag: {index: number, pointerId: number, y: number, original: number[], offsetX: number, offsetZ: number} | null = null
    private stopWatching: (() => void) | null = null
    private cancelDrag = () => {
        if (!this.drag) return
        this.setPoints(this.drag.original)
        this.drag = null
    }

    show(scene: Scene, worldId: number, areaId: number, size: number) {
        this.clear()
        const area = WorldAreaManager.index.areas.find(area => area.id === areaId)
        if (worldId !== MyPlayer.worldId || worldId !== WorldAreaManager.worldId || !MyPlayer.myChar) return
        if (!area) {
            OnScreenMessageManager.addMessage('Save the area before editing it in the world.', 'ERROR')
            return
        }
        this.scene = scene
        this.worldId = worldId
        this.areaId = areaId
        this.size = size
        this.material = new StandardMaterial('areaVertexMaterial', scene)
        this.material.emissiveColor = new Color3(0.2, 1, 0.25)
        this.material.disableLighting = true
        for (let i = 0; i < area.points.length; i += 2) {
            const handle = MeshBuilder.CreateSphere(`areaVertex_${i / 2}`, {diameter: 0.3, segments: 8}, scene)
            handle.material = this.material
            this.handles.push(handle)
        }
        this.setPoints(area.points)
        this.update()
        window.addEventListener('blur', this.cancelDrag)
        scene.getEngine().getRenderingCanvas()?.addEventListener('pointercancel', this.cancelDrag)
        this.stopWatching = watch(() => WorldAreaManager.response.value, data => {
            if (!data || data.worldId !== this.worldId || data.error || this.saving) return
            this.cancelDrag()
            const area = data.areas.find(area => area.id === this.areaId)
            if (!area || area.points.length !== this.points.length) this.clear()
            else this.setPoints(area.points)
        })
    }

    private setPoints(points: readonly number[]) {
        if (!this.scene) return
        this.points = [...points]
        const vertices: Vector3[] = []
        for (let i = 0; i < points.length; i += 2) {
            vertices.push(new Vector3(points[i], 0, points[i + 1]))
            this.handles[i / 2].position.x = points[i]
            this.handles[i / 2].position.z = points[i + 1]
        }
        vertices.push(vertices[0].clone())
        this.line = MeshBuilder.CreateLines('selectedWorldArea', {points: vertices, updatable: true, instance: this.line ?? undefined}, this.scene)
        this.line.color = new Color3(1, 0.75, 0)
        this.line.isPickable = false
    }

    update() {
        if (!this.line) return
        const character = MyPlayer.myChar
        if (!character || MyPlayer.worldId !== this.worldId) { this.clear(); return }
        // Freeze the drag plane while grabbing a vertex; otherwise follow the player's head.
        const y = this.drag?.y ?? character.pos.y + character.getModelHeight()
        this.line.position.y = y
        for (const handle of this.handles) handle.position.y = y
    }

    private planePoint(scene: Scene, y: number) {
        const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, Matrix.Identity(), scene.activeCamera)
        if (Math.abs(ray.direction.y) < 1e-6) return null
        const distance = (y - ray.origin.y) / ray.direction.y
        return distance >= 0 ? ray.origin.add(ray.direction.scale(distance)) : null
    }

    handlePointer(info: PointerInfo, scene: Scene): boolean {
        if (!this.line || scene !== this.scene) return false
        const event = info.event as PointerEvent
        if (info.type === PointerEventTypes.POINTERDOWN && event.button === 0) {
            const hit = scene.pick(scene.pointerX, scene.pointerY, mesh => this.handles.includes(mesh as Mesh))
            const index = this.handles.indexOf(hit?.pickedMesh as Mesh)
            if (index < 0) return false
            if (this.saving || this.uncertain) return true
            const point = this.planePoint(scene, this.line.position.y)
            if (!point) return true
            this.drag = {index, pointerId: event.pointerId, y: this.line.position.y, original: [...this.points],
                offsetX: this.points[index * 2] - point.x, offsetZ: this.points[index * 2 + 1] - point.z}
            return true
        }
        const drag = this.drag
        if (!drag || drag.pointerId !== event.pointerId) return false
        if (info.type === PointerEventTypes.POINTERMOVE) {
            if (event.pointerType === 'mouse' && !(event.buttons & 1)) { this.cancelDrag(); return true }
            const point = this.planePoint(scene, drag.y)
            if (point) {
                const size = this.size
                const snap = (n: number) => Math.max(0, Math.min(size - 1, Math.round(n)))
                const points = [...this.points]
                points[drag.index * 2] = snap(point.x + drag.offsetX)
                points[drag.index * 2 + 1] = snap(point.z + drag.offsetZ)
                this.setPoints(points)
            }
        } else if (info.type === PointerEventTypes.POINTERUP) {
            this.drag = null
            if (this.points.some((n, i) => n !== drag.original[i])) void this.save(drag.original)
        }
        return true
    }

    private async save(original: number[]) {
        const worldId = this.worldId, line = this.line
        const revision = WorldAreaManager.revision
        let submitted = false
        try {
            const areas = validateWorldAreas(WorldAreaManager.index.areas.map(area => area.id === this.areaId
                ? {...area, points: [...this.points]} : area), this.size)
            this.saving = true
            const requestId = `area-drag-${Date.now()}-${++requestCounter}`
            submitted = true
            const data = await new Promise<WorldAreasData>((resolve, reject) => {
                const stop = watch(() => WorldAreaManager.response.value, response => {
                    if (response?.requestId !== requestId) return
                    clearTimeout(timer); stop(); resolve(response)
                }, {flush: 'sync'})
                const timer = setTimeout(() => { stop(); reject(new Error('Save not confirmed. Reopen Areas before editing again.')) }, 15000)
                try { Connector.sendMessage(new GMWorldAreasRequest({worldId, action: 'save', requestId, revision, areas})) }
                catch (error) { clearTimeout(timer); stop(); reject(error) }
            })
            if (data.error) throw new Error(data.error)
            OnScreenMessageManager.addMessage('Area vertex saved.', 'SUCCESS')
        } catch (error) {
            if (this.line === line) { this.setPoints(original); this.uncertain = submitted }
            OnScreenMessageManager.addMessage(`${error instanceof Error ? error.message : 'Unable to save area.'} ${submitted ? 'Reopen Areas to retry.' : 'Vertex restored.'}`, 'ERROR')
        } finally {
            if (this.line === line) this.saving = false
        }
    }

    clear() {
        this.drag = null
        this.stopWatching?.(); this.stopWatching = null
        window.removeEventListener('blur', this.cancelDrag)
        this.scene?.getEngine().getRenderingCanvas()?.removeEventListener('pointercancel', this.cancelDrag)
        this.line?.dispose(); this.line = null
        this.handles.forEach(handle => handle.dispose()); this.handles = []
        this.material?.dispose(); this.material = null
        this.scene = null
        this.worldId = this.areaId = -1
        this.saving = this.uncertain = false
    }
}

export const WorldAreaPreview = new AreaPreview()
