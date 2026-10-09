import { Color3, LinesMesh, MeshBuilder, Vector3 } from '@babylonjs/core'
import { ref } from 'vue'
import { Connector } from '@/network/connector'
import { GMFoggyAreaAction } from '@/network/messages'
import { FoggyAreaData, FoggyAreaManager } from '@/babylon/world/foggyAreaManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { Renderer } from '@/babylon/scene/renderer'
import { ViewportManager } from '@/utils/viewport'

const cloneArea = (area: FoggyAreaData): FoggyAreaData => ({...area})

export const GMFoggyAreas = {
    selectedArea: ref<FoggyAreaData | null>(null),
    selectedAction: ref(''),
    markers: [] as LinesMesh[],

    onClick(x: number, z: number) {
        if (this.selectedAction.value === 'MOVE' && this.selectedArea.value?.id) {
            this.selectedArea.value.x = x
            this.selectedArea.value.z = z
            Connector.sendMessage(new GMFoggyAreaAction('UPDATE', this.selectedArea.value))
            this.selectedAction.value = ''
            return
        }

        const clicked = [...FoggyAreaManager.areas].reverse().find((area) => this.contains(area, x, z))
        if (clicked) {
            this.selectedArea.value = cloneArea(clicked)
            this.selectedAction.value = ''
        } else if (this.selectedArea.value) {
            this.selectedArea.value = null
            this.selectedAction.value = ''
        } else {
            this.selectedArea.value = {id: 0, x, z, width: 12, depth: 8, rotation: 0, intensity: 5}
        }
        this.renderMarkers()
    },

    contains(area: FoggyAreaData, x: number, z: number): boolean {
        const rotation = -area.rotation * Math.PI / 180
        const dx = x - area.x
        const dz = z - area.z
        const localX = dx * Math.cos(rotation) - dz * Math.sin(rotation)
        const localZ = dx * Math.sin(rotation) + dz * Math.cos(rotation)
        return (localX * localX) / ((area.width * area.width) / 4)
            + (localZ * localZ) / ((area.depth * area.depth) / 4) <= 1
    },

    saveCreate() {
        if (!this.selectedArea.value) return
        Connector.sendMessage(new GMFoggyAreaAction('CREATE', this.selectedArea.value))
        this.selectedArea.value = null
        this.selectedAction.value = ''
    },

    saveEdit() {
        if (!this.selectedArea.value?.id) return
        Connector.sendMessage(new GMFoggyAreaAction('UPDATE', this.selectedArea.value))
        this.selectedAction.value = ''
    },

    deleteSelected() {
        if (!this.selectedArea.value?.id) return
        Connector.sendMessage(new GMFoggyAreaAction('DELETE', {id: this.selectedArea.value.id}))
        this.selectedArea.value = null
        this.selectedAction.value = ''
    },

    cancel() {
        this.selectedArea.value = null
        this.selectedAction.value = ''
        this.renderMarkers()
    },

    renderMarkers() {
        this.removeMarkers()
        if (!Renderer.scene) return
        const selected = this.selectedArea.value
        const areas = FoggyAreaManager.areas
            .filter((area) => area.id !== selected?.id && ViewportManager.isPointNearVisibleBounds(area.x, area.z, Math.max(area.width, area.depth)))
            .map((area) => ({area, selected: false}))
        if (selected) areas.push({area: selected, selected: true})

        for (const entry of areas) {
            const area = entry.area
            const block = WorldDataManager.getBlockMap()?.[Math.floor(area.x)]?.[Math.floor(area.z)]
            if (!block) continue
            const points: Vector3[] = []
            const rotation = area.rotation * Math.PI / 180
            for (let index = 0; index <= 48; index++) {
                const angle = index / 48 * Math.PI * 2
                const localX = Math.cos(angle) * area.width * 0.5
                const localZ = Math.sin(angle) * area.depth * 0.5
                points.push(new Vector3(
                    area.x + localX * Math.cos(rotation) - localZ * Math.sin(rotation),
                    block.totalHeight + 0.16,
                    area.z + localX * Math.sin(rotation) + localZ * Math.cos(rotation),
                ))
            }
            const marker = MeshBuilder.CreateLines(`foggyArea_${area.id}`, {points}, Renderer.scene)
            marker.color = entry.selected ? new Color3(1, 0.75, 0) : new Color3(0.35, 0.85, 1)
            marker.isPickable = false
            this.markers.push(marker)
        }
    },

    removeMarkers() {
        this.markers.forEach((marker) => marker.dispose())
        this.markers = []
    },
}
