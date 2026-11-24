import type { Matrix, Mesh, Vector2 } from '@babylonjs/core'
import type { TerrainInstanceAttribute } from '@/adminUtils/terrainPreviewBatch'

export type OutdoorInstance = {
    batch: OutdoorInstanceBatch
    matrix: Matrix
    uv: Vector2
    slot: number
    attributes?: TerrainInstanceAttribute[]
    index?: number
}

export class OutdoorInstanceBatch {
    private slots: OutdoorInstance[] = []
    private arrivals: OutdoorInstance[] = []
    private departures: OutdoorInstance[] = []
    private dirty: number[] = []
    private capacity = 0
    private buffers: {kind: string, stride: number, data: Float32Array}[] = []

    constructor(readonly mesh: Mesh) {}

    add(instance: OutdoorInstance) { this.arrivals.push(instance) }
    remove(instance: OutdoorInstance) { this.departures.push(instance) }

    flush() {
        if (!this.arrivals.length && !this.departures.length) return

        // Reuse vacated slots first. Compact the tail only when the batch shrinks.
        for (const leaving of this.departures) {
            const slot = leaving.slot
            leaving.slot = -1
            const incoming = this.arrivals.pop() ?? this.slots.pop()!
            if (slot >= this.slots.length) continue
            this.slots[slot] = incoming
            incoming.slot = slot
            this.dirty.push(slot)
        }
        for (const instance of this.arrivals) {
            instance.slot = this.slots.length
            this.slots.push(instance)
            this.dirty.push(instance.slot)
        }
        this.arrivals.length = this.departures.length = 0

        const count = this.slots.length
        const grow = count > this.capacity
        if (grow) {
            this.capacity = Math.max(32, count, this.capacity * 2)
            const attributes = this.slots[0].attributes ?? []
            this.buffers = [{kind: 'matrix', stride: 16}, {kind: 'uvc', stride: 2}, ...attributes]
                .map(({kind, stride}, index) => {
                    const data = new Float32Array(this.capacity * stride)
                    if (this.buffers[index]) data.set(this.buffers[index].data)
                    return {kind, stride, data}
                })
        }
        this.dirty.sort((a, b) => a - b)
        const pickedMatrices = this.mesh._thinInstanceDataStorage.worldMatrices
        if (pickedMatrices) pickedMatrices.length = count
        for (let i = 0; i < this.dirty.length; i++) {
            const slot = this.dirty[i]
            if (slot >= count || (i > 0 && slot === this.dirty[i - 1])) continue
            const {matrix, uv, attributes, index} = this.slots[slot]
            matrix.copyToArray(this.buffers[0].data, slot * 16)
            if (pickedMatrices) pickedMatrices[slot] = matrix
            this.buffers[1].data[slot * 2] = uv.x
            this.buffers[1].data[slot * 2 + 1] = uv.y
            attributes?.forEach(({stride, values}, attrIndex) => {
                const data = this.buffers[attrIndex + 2].data
                for (let component = 0; component < stride; component++) {
                    data[slot * stride + component] = values[index! * stride + component]
                }
            })
        }
        if (grow) {
            this.mesh.doNotSyncBoundingInfo = true
            for (const {kind, stride, data} of this.buffers) this.mesh.thinInstanceSetBuffer(kind, data, stride, false)
        } else if (count) {
            this.uploadChangedSlots(count)
        }
        this.mesh.thinInstanceCount = count
        this.mesh.setEnabled(count > 0)
        this.dirty.length = 0
    }

    private uploadChangedSlots(count: number) {
        if (!this.dirty.length || this.dirty[0] >= count) return
        const engine = this.mesh.getEngine()
        // Coalesce small gaps to avoid a driver call for each changed slot.
        const ranges: number[] = []
        let start = this.dirty[0], end = start
        for (const slot of this.dirty) {
            if (slot >= count) break
            if (slot > end + 5) {
                ranges.push(start, end + 1)
                start = slot
            }
            end = slot
        }
        ranges.push(start, end + 1)
        if (ranges.length > 32) {
            ranges.length = 0
            ranges.push(0, count)
        }
        for (const {kind, stride, data} of this.buffers) {
            const buffer = this.mesh.getVertexBuffer(kind === 'matrix' ? 'world0' : kind)!.getBuffer()!
            for (let i = 0; i < ranges.length; i += 2) {
                const offset = ranges[i] * stride
                // Keep Babylon's backing data intact for context restoration.
                engine.updateDynamicVertexBuffer(buffer, data.subarray(offset, ranges[i + 1] * stride), offset * 4)
            }
        }
    }
}
