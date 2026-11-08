<template>
    <section ref="root" class="world-areas" tabindex="0" @keydown="onKeyDown">
        <aside class="areas-sidebar">
            <label>World
                <select :value="worldId" :disabled="editor.busy" @change="changeWorld">
                    <option v-for="world in worlds" :key="world.id" :value="world.id">{{ world.name }} ({{ world.id }})</option>
                </select>
            </label>
            <div class="areas-actions">
                <button class="dialog-button" :disabled="editor.busy || !editor.size" @click="createArea()">New area</button>
                <button class="dialog-button" :disabled="editor.busy || !editor.selectedArea" @click="createArea(editor.draft?.id)">Add child</button>
            </div>
            <div class="areas-tree" role="tree" aria-label="World areas">
                <button v-for="row in treeRows" :key="row.area.id" class="areas-tree-row" :class="{selected: editor.draft?.id === row.area.id}"
                    :style="{paddingLeft: `${8 + row.depth * 14}px`}" :disabled="editor.busy" @click="selectArea(row.area.id)">
                    <span class="areas-tree-name">{{ row.depth ? "\u21b3 " : "" }}{{ row.area.name }}</span>
                </button>
                <span v-if="!treeRows.length && !editor.loading">No areas yet. Create an area and click its boundary points on the map.</span>
            </div>
            <fieldset v-if="editor.draft" :disabled="editor.busy" class="areas-properties">
                <label>Name <input v-model="editor.draft.name" maxlength="80"></label>
                <label>Parent area
                    <select v-model="editor.draft.parentId">
                        <option :value="undefined">None (root area)</option>
                        <option v-for="area in parentChoices" :key="area.id" :value="area.id">{{ area.name }}</option>
                    </select>
                </label>
                <div class="areas-actions">
                    <button class="dialog-button" :disabled="editor.draft.points.length < 6" @click="finishDrawing">Finish polygon</button>
                    <button class="dialog-button" @click="editor.apply(); draw()">Apply changes</button>
                    <button class="dialog-button" @click="editor.select(editor.selectedArea?.id ?? null)">Cancel draft</button>
                </div>
                <div class="areas-actions">
                    <button class="dialog-button" :class="{selected: insertVertex}" :disabled="editor.drawing" @click="insertVertex = !insertVertex">Insert vertex</button>
                    <button class="dialog-button" :disabled="editor.selectedVertex < 0" @click="editor.removePoint()">Delete vertex</button>
                    <button class="dialog-button" :disabled="!editor.undoStack.length" @click="editor.undo()">Undo</button>
                    <button class="dialog-button" :disabled="!editor.redoStack.length" @click="editor.redo()">Redo</button>
                </div>
                <details class="areas-vertices">
                    <summary>{{ editor.draft.points.length / 2 }} vertices (whole-tile grid)</summary>
                    <label v-for="index in editor.draft.points.length / 2" :key="index" class="areas-vertex-row">
                        {{ index }}
                        <input v-model.number="editor.draft.points[(index - 1) * 2]" type="number" step="1" :min="0" :max="editor.size - 1" aria-label="Vertex X">
                        <input v-model.number="editor.draft.points[(index - 1) * 2 + 1]" type="number" step="1" :min="0" :max="editor.size - 1" aria-label="Vertex Z">
                    </label>
                </details>
                <button class="dialog-button" :disabled="!editor.selectedArea" @click="deleteArea">Delete area and children</button>
            </fieldset>
            <p class="areas-hint">Click to add points. Click the first point or press Enter to finish. Drag vertices to move them. Wheel to zoom; right/middle drag or Space + drag to pan.</p>
            <div class="areas-actions">
                <button class="dialog-button" :disabled="editor.busy || !editor.dirty || editor.stale" @click="editor.save()">{{ editor.saving ? 'Saving...' : 'Save areas to DB' }}</button>
                <button class="dialog-button" :disabled="editor.busy" @click="reload">Reload / discard</button>
            </div>
            <div v-if="editor.loading">Loading areas...</div>
            <div v-else-if="editor.dirty">Unsaved area changes</div>
            <div v-if="editor.saved" class="areas-success">{{ editor.saved }}</div>
            <div v-if="editor.error" class="areas-error" role="alert">{{ editor.error }}</div>
        </aside>
        <div class="areas-map-panel">
            <div class="areas-toolbar">
                <button class="dialog-button" @click="fitWorld">Fit world</button>
                <button class="dialog-button" :disabled="!editor.draft?.points.length" @click="fitSelection">Fit selected</button>
                <span>{{ hoverLabel }}</span>
            </div>
            <canvas ref="canvas" class="areas-canvas" :class="{drawing: editor.drawing || insertVertex}"
                @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerCancel"
                @dblclick.prevent="finishDrawing" @wheel.prevent="wheel" @contextmenu.prevent />
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { WorldAreasEditor } from '@/gm/worldAreasEditor'
import { WorldAreaManager } from '@/data/worldAreaManager'
import { WorldAreaIndex, areaBounds, type WorldArea } from '@/data/worldAreas'
import { GMManager } from '@/gm/GM'
import { WorldAreaPreview } from '@/gm/worldAreaPreview'
import { Renderer } from '@/babylon/scene/renderer'
import { MyPlayer } from '@/data/myPlayer'

const props = defineProps<{worldId: number | null, worlds: Array<{id: number, name: string}>}>()
const emit = defineEmits<{(event: 'world-change', id: number): void}>()
const editor = reactive(new WorldAreasEditor())
const root = ref<HTMLElement | null>(null), canvas = ref<HTMLCanvasElement | null>(null)
const insertVertex = ref(false), hoverLabel = ref('')
let image: HTMLImageElement | null = null, imageSequence = 0
let zoom = 1, panX = 0, panY = 0, fittedWorld = -1, resizeObserver: ResizeObserver | null = null
let space = false
let drag: {kind: 'pan' | 'vertex', id: number, x: number, y: number, original?: number[]} | null = null

const areaIndex = computed(() => new WorldAreaIndex(editor.areas))
const treeRows = computed(() => {
    const rows: Array<{area: WorldArea, depth: number}> = []
    const visit = (parentId: number | undefined, depth: number) => {
        for (const area of editor.areas.filter(a => a.parentId === parentId)) { rows.push({area, depth}); visit(area.id, depth + 1) }
    }
    visit(undefined, 0)
    return rows
})
const parentChoices = computed(() => {
    const excluded = editor.draft ? editor.descendants(editor.draft.id) : new Set<number>()
    return editor.areas.filter(area => !excluded.has(area.id))
})
const canLeave = () => !editor.busy && (!editor.dirty || window.confirm('Discard unsaved area changes?'))
const canChangeDraft = () => !editor.draftChanged || window.confirm('Discard unfinished polygon changes?')
const changeWorld = (event: Event) => {
    const select = event.target as HTMLSelectElement
    if (canLeave()) emit('world-change', Number(select.value))
    else select.value = String(props.worldId)
}
const selectArea = (id: number) => { if (canChangeDraft()) { editor.select(id); insertVertex.value = false } }
const createArea = (parentId?: number) => { if (canChangeDraft()) { editor.create(parentId); insertVertex.value = false; root.value?.focus() } }
const deleteArea = () => {
    if (!editor.draft) return
    const ids = editor.descendants(editor.draft.id)
    if (window.confirm(`Delete "${editor.draft.name}"${ids.size > 1 ? ` and ${ids.size - 1} subareas` : ''}? Save areas to persist this deletion.`)) editor.delete(editor.draft.id)
}
const reload = () => { if (canLeave() && props.worldId !== null) editor.load(props.worldId) }
const finishDrawing = () => {
    if (editor.draft && editor.draft.points.length >= 6) { editor.drawing = false; insertVertex.value = false; editor.apply() }
}
const snap = (value: number) => Math.max(0, Math.min(editor.size - 1, Math.round(value)))
// Match the other Worlds maps: world Z points left, world X points up.
const screenX = (z: number) => panX + (editor.size - z) * zoom
const screenY = (x: number) => panY + (editor.size - x) * zoom
const coords = (event: PointerEvent | WheelEvent) => {
    const rect = canvas.value!.getBoundingClientRect()
    return {sx: event.clientX - rect.left, sy: event.clientY - rect.top,
        x: snap(editor.size - (event.clientY - rect.top - panY) / zoom), z: snap(editor.size - (event.clientX - rect.left - panX) / zoom)}
}
const vertexAt = (sx: number, sy: number) => {
    const p = editor.draft?.points ?? []
    for (let i = 0; i < p.length; i += 2) if (Math.hypot(screenX(p[i + 1]) - sx, screenY(p[i]) - sy) < 10) return i
    return -1
}
const pointerDown = (event: PointerEvent) => {
    if (!canvas.value || editor.busy || !editor.size) return
    root.value?.focus({preventScroll: true})
    const p = coords(event)
    canvas.value.setPointerCapture(event.pointerId)
    if (event.button === 1 || event.button === 2 || space) {
        drag = {kind: 'pan', id: event.pointerId, x: event.clientX, y: event.clientY}; event.preventDefault(); return
    }
    if (event.button !== 0) return
    if (editor.drawing) {
        if (vertexAt(p.sx, p.sy) === 0 && (editor.draft?.points.length ?? 0) >= 6) finishDrawing()
        else editor.addPoint(p.x, p.z)
        return
    }
    const vertex = vertexAt(p.sx, p.sy)
    if (vertex >= 0 && editor.draft) {
        editor.selectedVertex = vertex
        const original = [...editor.draft.points]
        editor.checkpoint()
        drag = {kind: 'vertex', id: event.pointerId, x: 0, y: 0, original}
        return
    }
    if (insertVertex.value && editor.draft) {
        const points = editor.draft.points
        let best = -1, distance = 14, x = 0, z = 0
        for (let i = 0; i < points.length; i += 2) {
            const next = (i + 2) % points.length, ax = screenX(points[i + 1]), ay = screenY(points[i])
            const dx = -(points[next + 1] - points[i + 1]) * zoom, dy = -(points[next] - points[i]) * zoom
            const t = Math.max(0, Math.min(1, ((p.sx - ax) * dx + (p.sy - ay) * dy) / (dx * dx + dy * dy)))
            const current = Math.hypot(p.sx - ax - dx * t, p.sy - ay - dy * t)
            if (current < distance) { best = i; distance = current; x = snap(points[i] + (points[next] - points[i]) * t); z = snap(points[i + 1] + (points[next + 1] - points[i + 1]) * t) }
        }
        if (best >= 0) { editor.addPoint(x, z, best); insertVertex.value = false }
        return
    }
    const hit = areaIndex.value.getAt(p.x, p.z)
    if (hit) selectArea(hit.id)
}
const pointerMove = (event: PointerEvent) => {
    const p = coords(event)
    const area = areaIndex.value.getAt(p.x, p.z)
    hoverLabel.value = `X ${p.x} / Z ${p.z}${area ? ` / ${area.name}` : ''}`
    if (!drag || drag.id !== event.pointerId) return
    if (drag.kind === 'pan') {
        panX += event.clientX - drag.x; panY += event.clientY - drag.y
        drag.x = event.clientX; drag.y = event.clientY
    } else if (editor.draft && editor.selectedVertex >= 0) {
        editor.draft.points[editor.selectedVertex] = p.x; editor.draft.points[editor.selectedVertex + 1] = p.z
    }
    draw()
}
const pointerUp = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) drag = null
    if (canvas.value?.hasPointerCapture(event.pointerId)) canvas.value.releasePointerCapture(event.pointerId)
}
const pointerCancel = (event: PointerEvent) => {
    if (drag?.id === event.pointerId && drag.original && editor.draft) editor.draft.points = drag.original
    pointerUp(event)
}
const wheel = (event: WheelEvent) => {
    const p = coords(event), factor = Math.exp(-event.deltaY * .0015)
    const next = Math.max(.02, Math.min(48, zoom * factor)), ratio = next / zoom
    panX = p.sx - (p.sx - panX) * ratio; panY = p.sy - (p.sy - panY) * ratio; zoom = next
    draw()
}
const fitBounds = (minX: number, minZ: number, maxX: number, maxZ: number) => {
    if (!canvas.value) return
    zoom = Math.max(.02, Math.min(48, canvas.value.clientWidth / Math.max(2, maxZ - minZ + 8), canvas.value.clientHeight / Math.max(2, maxX - minX + 8))) * .9
    panX = canvas.value.clientWidth / 2 - (editor.size - (minZ + maxZ) / 2) * zoom
    panY = canvas.value.clientHeight / 2 - (editor.size - (minX + maxX) / 2) * zoom
    draw()
}
const fitWorld = () => fitBounds(0, 0, Math.max(1, editor.size - 1), Math.max(1, editor.size - 1))
const fitSelection = () => {
    if (!editor.draft?.points.length) return
    const b = areaBounds(editor.draft.points); fitBounds(b.minX, b.minZ, b.maxX, b.maxZ)
}
const draw = () => {
    const node = canvas.value, ctx = node?.getContext('2d')
    if (!node || !ctx || !node.clientWidth || !node.clientHeight) return
    const dpr = window.devicePixelRatio || 1
    if (node.width !== Math.round(node.clientWidth * dpr)) node.width = Math.round(node.clientWidth * dpr)
    if (node.height !== Math.round(node.clientHeight * dpr)) node.height = Math.round(node.clientHeight * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, node.clientWidth, node.clientHeight)
    const style = getComputedStyle(root.value!), rgb = (key: string, alpha = 1) => `rgba(${style.getPropertyValue(key)},${alpha})`
    if (image) {
        ctx.save()
        ctx.translate(screenX(0), screenY(0))
        ctx.transform(0, -1, -1, 0, 0, 0)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(image, 0, 0, editor.size * zoom, editor.size * zoom)
        ctx.restore()
    }
    ctx.strokeStyle = rgb('--ui-dark', .3); ctx.lineWidth = 1
    if (zoom >= 12) {
        const minX = Math.max(0, Math.ceil(editor.size - (node.clientHeight - panY) / zoom))
        const maxX = Math.min(editor.size - 1, Math.floor(editor.size + panY / zoom))
        const minZ = Math.max(0, Math.ceil(editor.size - (node.clientWidth - panX) / zoom))
        const maxZ = Math.min(editor.size - 1, Math.floor(editor.size + panX / zoom))
        for (let x = minX; x <= maxX; x++) { ctx.beginPath(); ctx.moveTo(0, screenY(x)); ctx.lineTo(node.clientWidth, screenY(x)); ctx.stroke() }
        for (let z = minZ; z <= maxZ; z++) { ctx.beginPath(); ctx.moveTo(screenX(z), 0); ctx.lineTo(screenX(z), node.clientHeight); ctx.stroke() }
    }
    const polygon = (area: WorldArea, selected: boolean) => {
        const p = area.points
        if (p.length < 2) return
        ctx.beginPath(); ctx.moveTo(screenX(p[1]), screenY(p[0]))
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(screenX(p[i + 1]), screenY(p[i]))
        if (p.length >= 6) ctx.closePath()
        ctx.fillStyle = rgb(selected ? '--ui-accent-blue' : '--ui-base', selected ? .2 : .06)
        ctx.strokeStyle = rgb(selected ? '--ui-accent-blue' : '--ui-base', .95); ctx.lineWidth = selected ? 2.5 : 1.5
        ctx.fill(); ctx.stroke()
        ctx.fillStyle = rgb('--ui-base'); ctx.font = '12px sans-serif'; ctx.fillText(area.name, screenX(p[1]) + 8, screenY(p[0]) - 9)
        if (selected) for (let i = 0; i < p.length; i += 2) {
            ctx.beginPath(); ctx.arc(screenX(p[i + 1]), screenY(p[i]), i === editor.selectedVertex ? 6 : 4, 0, Math.PI * 2)
            ctx.fillStyle = rgb(i === editor.selectedVertex ? '--ui-success' : '--ui-base'); ctx.fill()
        }
    }
    for (const area of editor.areas) if (area.id !== editor.draft?.id) polygon(area, false)
    if (editor.draft) polygon(editor.draft, true)
    if (MyPlayer.myChar && MyPlayer.worldId === props.worldId) {
        ctx.fillStyle = rgb('--ui-success'); ctx.beginPath(); ctx.arc(screenX(MyPlayer.myChar.pos.z), screenY(MyPlayer.myChar.pos.x), 5, 0, Math.PI * 2); ctx.fill()
    }
}
const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
    if (event.code === 'Space') { space = true; event.preventDefault(); event.stopPropagation() }
    if (editor.busy) return
    if (event.key === 'Enter') { finishDrawing(); event.preventDefault(); event.stopPropagation() }
    if (event.key === 'Delete' || event.key === 'Backspace') { editor.removePoint(); event.preventDefault(); event.stopPropagation() }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.shiftKey ? editor.redo() : editor.undo(); event.preventDefault(); event.stopPropagation() }
}
const releaseSpace = () => { space = false }
const beforeUnload = (event: BeforeUnloadEvent) => { if (editor.dirty || editor.busy) { event.preventDefault(); event.returnValue = '' } }
watch(() => props.worldId, id => {
    imageSequence++; image = null; fittedWorld = -1
    if (id !== null) { editor.load(id); GMManager.loadWorldMapImage(id, 'terrain') }
}, {immediate: true})
watch(() => WorldAreaManager.response.value, data => {
    if (!data) return
    editor.receive(data)
    if (editor.size && fittedWorld !== editor.worldId) { fittedWorld = editor.worldId; nextTick(fitWorld) }
})
watch(() => GMManager.worldMapImage.value, data => {
    if (!data || data.worldId !== props.worldId || data.mapType !== 'terrain') return
    const sequence = ++imageSequence, loaded = new Image()
    loaded.onload = () => { if (sequence === imageSequence) { image = loaded; draw() } }
    loaded.src = `data:image/png;base64,${data.image}`
}, {immediate: true})
watch(() => [editor.areas, editor.draft, editor.selectedVertex, editor.drawing], draw, {deep: true})
onMounted(() => {
    resizeObserver = new ResizeObserver(draw)
    if (canvas.value) resizeObserver.observe(canvas.value)
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('keyup', releaseSpace)
    window.addEventListener('blur', releaseSpace)
    draw()
})
onUnmounted(() => {
    imageSequence++; editor.dispose(); resizeObserver?.disconnect()
    window.removeEventListener('beforeunload', beforeUnload)
    window.removeEventListener('keyup', releaseSpace); window.removeEventListener('blur', releaseSpace)
})
const showSelectedPreview = () => {
    const area = editor.selectedArea
    if (area) WorldAreaPreview.show(Renderer.scene, editor.worldId, area.id, editor.size)
    else WorldAreaPreview.clear()
}
defineExpose({canLeave, showSelectedPreview})
</script>

<style scoped>
.world-areas { flex: 1; min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr); grid-template-columns: minmax(220px, 28%) minmax(0, 1fr); gap: 10px; text-align: left; outline: none; }
.areas-sidebar { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; padding: 6px; }
.areas-sidebar label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.areas-sidebar input, .areas-sidebar select { width: 100%; box-sizing: border-box; }
.areas-actions { display: flex; flex-wrap: wrap; gap: 5px; }
.areas-tree { min-height: 90px; max-height: 26vh; overflow: auto; border: 1px solid var(--ui-field-border); }
.world-areas .areas-tree-row { display: block; width: 100%; border: 0; padding: 7px; text-align: left; background: transparent; color: rgb(var(--gui-gold)); cursor: pointer; }
.areas-tree-name { color: rgb(var(--gui-gold, var(--ui-base))); -webkit-text-fill-color: currentColor; text-shadow: 0 1px 2px rgb(var(--ui-darkest)); }
.areas-tree-row.selected { background: rgba(var(--ui-accent-blue), .25); }
.areas-properties { display: flex; flex-direction: column; gap: 9px; margin: 0; padding: 0; border: 0; }
.areas-hint { margin: 0; color: rgb(var(--ui-dark)); font-size: 11px; line-height: 1.5; }
.areas-vertices { font-size: 12px; }
.areas-vertices > .areas-vertex-row { display: grid; grid-template-columns: 24px 1fr 1fr; gap: 5px; margin-top: 4px; align-items: center; }
.areas-error { color: rgb(var(--ui-accent-red)); font-size: 12px; }
.areas-success { color: rgb(var(--ui-success)); font-size: 12px; }
.areas-map-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.areas-toolbar { flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 34px; padding-bottom: 6px; font-size: 12px; }
.areas-canvas { display: block; flex: 1 1 0; min-height: 0; width: 100%; height: 0; background: rgb(var(--ui-darkest)); touch-action: none; }
.areas-canvas.drawing { cursor: crosshair; }
@media (max-width: 900px) { .world-areas { grid-template-columns: minmax(185px, 33%) minmax(0, 1fr); } }
</style>
