import { Vector3 } from '@babylonjs/core'
import { WorldDataManager } from '@/data/worldDataManager'
import { Settings } from '@/settings/settings'
import { BuildingManager } from './buildings/buildingManager'
import { StepMarksRenderer } from './stepMarksRenderer'
import { FIGHT_SPLAT_TTL, MAX_FIGHT_SPLATS } from './fightSplatShader'
import type { TerrainSplat } from './fightSplatShader'

type SplatMessage = {lp: number, x: number | string, z: number | string, tp: number, s: number}

export const FightSplatsRenderer = {
    splats: new Array<TerrainSplat>(),
    maxSplats: MAX_FIGHT_SPLATS,
    stainsDirty: true,

    initialize() {
        this.maxSplats = Settings.isDetalLevelHigh() ? MAX_FIGHT_SPLATS : 250
        this.splats = []
        this.stainsDirty = true
    },
    consumeSplats(data: readonly SplatMessage[]) {
        if (!data.length) return
        const map = WorldDataManager.getBlockMap()
        const now = Date.now()
        for (const {lp, x, z, tp, s} of data) {
            if ((tp !== 1 && tp !== 2 && tp !== 3 && tp !== 4 && tp !== 8) || lp >= 100) continue
            const worldX = Number(x), worldZ = Number(z)
            const tileX = Math.round(worldX), tileZ = Math.round(worldZ)
            const block = map[tileX]?.[tileZ]
            if (!block || block.shallowWater || block.deepWater) continue
            const y = block.totalHeight + BuildingManager.getFloorHeightAtTile(tileX, tileZ)
            const creationTime = now - lp / 100 * FIGHT_SPLAT_TTL
            const size = Math.max(1, Math.min(4, s))
            const seed = Math.random()
            const width = 0.32 + size * 0.04 + Math.random() * 0.09
            this.splats.push({
                pos: new Vector3(worldX, y, worldZ),
                type: tp,
                rot: Math.random() * Math.PI * 2,
                scaleX: width * (1.0 - seed * 0.19),
                scaleZ: width * (0.53 + seed * 0.36),
                creationTime,
                deadTime: creationTime + FIGHT_SPLAT_TTL,
                seed,
            })
            this.stainsDirty = true
            if (this.splats.length > this.maxSplats) this.removeAt(0)
        }
    },

    removeSplats(data: readonly SplatMessage[]) {
        for (const {x, z} of data) {
            const worldX = Number(x), worldZ = Number(z)
            for (let index = this.splats.length - 1; index >= 0; index--) {
                const {pos} = this.splats[index]
                if (pos.x === worldX && pos.z === worldZ) this.removeAt(index)
            }
        }
    },

    removeAt(index: number) {
        this.stainsDirty = true
        this.splats.splice(index, 1)
    },

    clearWorld() {
        this.splats = []
        this.stainsDirty = false
        StepMarksRenderer.field?.updateSplats([])
    },

    update(time: number) {
        for (let index = this.splats.length - 1; index >= 0; index--) {
            if (time >= this.splats[index].deadTime) this.removeAt(index)
        }
        if (this.stainsDirty) {
            StepMarksRenderer.field?.updateSplats(this.splats)
            this.stainsDirty = false
        }
    },

}
