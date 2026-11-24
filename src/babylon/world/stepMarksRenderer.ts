import { Engine, Scene, Vector3 } from '@babylonjs/core'
import type { Targetable } from '@/gui/targettingManager'
import { Settings } from '@/settings/settings'
import { MyPlayer } from '@/data/myPlayer'
import { WorldDataManager } from '@/data/worldDataManager'
import { TerrainEnum1 } from '@/babylon/materials'
import { isPartyTarget } from '@/gui/overlay/partyTarget'
import { BuildingManager } from './buildings/buildingManager'
import { StaticsManager } from './statics/staticsManager'
import { TERRAIN_STEP_HEIGHT } from './terrainRoofShape'
import { MAX_SOIL_STEPS, MAX_STEP_MARKS, TerrainStepField } from './terrainStepField'
import type { TerrainStep } from './terrainStepField'

export const StepMarksRenderer = {
    myStepMarks: new Array<TerrainStep>(),
    otherStepMarks: new Array<TerrainStep>(),
    soilStepMarks: new Array<TerrainStep & {priority: boolean}>(),
    field: null as TerrainStepField | null,
    dirty: true,

    get maxOwnMarks() {
        return Settings.isDetalLevelHigh() ? MAX_STEP_MARKS : 200
    },

    get maxOtherMarks() {
        return Settings.isDetalLevelHigh() ? MAX_STEP_MARKS : 100
    },

    initialize (scene: Scene) {
        const engine = scene.getEngine()
        this.field = engine instanceof Engine && engine.webGLVersion >= 2 && engine.getCaps().textureFloat
            ? new TerrainStepField(scene, engine) : null
        this.soilStepMarks = []
        this.loadFromLocalStorage()
    },

    getSoilStepHeight(map: ReturnType<typeof WorldDataManager.getBlockMap>, footX: number, footZ: number, y: number) {
        const x = Math.round(footX)
        const z = Math.round(footZ)
        const block = map[x]?.[z]
        if (!block || block.snowed || block.shallowWater || block.deepWater || block.stonePath || block.beigeStonePath
            || (block.type !== TerrainEnum1.TERRAIN_DIRT.index && block.type !== TerrainEnum1.TERRAIN_MUDDY_DIRT.index)
            || Math.abs(block.height - y) > TERRAIN_STEP_HEIGHT + 0.02
            || BuildingManager.hasFloorAtTile(x, z) || StaticsManager.getWalkableHeightAtTile(x, z) > 0) return
        return block.height
    },

    addStepMark(side: string, object: Targetable, yPos: number, rot: number, time: number, inCombat: boolean, visible: boolean): boolean {
        if (Settings.isDetalLevelLow()) return false
        const own = object === MyPlayer.myChar
        const map = WorldDataManager.getBlockMap()
        const {x, z} = object.pos
        const block = map[Math.floor(x)]?.[Math.floor(z)]
        const snow = block?.snowed && !block.shallowWater && !block.deepWater
        const canLeaveSoilStep = visible && !!this.field
        if (!snow && !canLeaveSoilStep) return false
        const randomize = inCombat ? 0.2 : 0.1
        const straddle = side === 'L' ? -0.2 : 0.2
        const footX = x + Math.cos(rot + Math.PI / 2) * straddle + (Math.random() * 2 - 1) * randomize
        const footZ = z - Math.sin(rot + Math.PI / 2) * straddle + (Math.random() * 2 - 1) * randomize
        // Movement follows the highest tile under the character's collision box.
        // Anchor the impression to the terrain under the individual foot.
        const soilHeight = canLeaveSoilStep ? this.getSoilStepHeight(map, footX, footZ, yPos) : undefined
        const soil = soilHeight !== undefined
        if (!soil && !snow) return false
        const mark: TerrainStep = {
            pos: new Vector3(footX, (soilHeight ?? yPos) + 0.01, footZ),
            rot: -randomize + Math.random() * randomize * 2 + rot + Math.PI / 2,
            creationTime: time,
            deadTime: time + (soil ? 3000 : own ? 300000 : 60000),
            soil
        }
        if (soil) {
            const priority = own || isPartyTarget(object)
            if (this.soilStepMarks.length >= MAX_SOIL_STEPS) {
                const index = this.soilStepMarks.findIndex(step => !step.priority || step.deadTime <= time)
                if (index < 0 && !priority) return false
                this.soilStepMarks.splice(Math.max(0, index), 1)
            }
            this.soilStepMarks.push({...mark, priority})
        } else {
            const steps = own ? this.myStepMarks : this.otherStepMarks
            const limit = own ? this.maxOwnMarks : this.maxOtherMarks
            if (steps.length >= limit) steps.splice(0, steps.length - limit + 1)
            steps.push(mark)
        }
        this.dirty = true
        return true
    },

    update(time: number) {
        if (Settings.isDetalLevelLow()) return
        const ownChanged = this.pruneMarks(this.myStepMarks, time, this.maxOwnMarks)
        const otherChanged = this.pruneMarks(this.otherStepMarks, time, this.maxOtherMarks)
        const soilChanged = this.pruneMarks(this.soilStepMarks, time, MAX_SOIL_STEPS)
        this.field?.setTime(time, Settings.isDetalLevelHigh())
        if (this.dirty || ownChanged || otherChanged || soilChanged) {
            this.field?.update(this.myStepMarks, this.otherStepMarks, this.soilStepMarks)
            this.dirty = false
        }
    },

    clearWorld() {
        this.myStepMarks = []
        this.otherStepMarks = []
        this.soilStepMarks = []
        this.dirty = false
        localStorage.removeItem('myStepMarks')
        localStorage.removeItem('otherStepMarks')
        this.field?.update(this.myStepMarks, this.otherStepMarks, this.soilStepMarks)
    },

    pruneMarks(marks: TerrainStep[], time: number, limit: number): boolean {
        let changed = false
        for (let index = marks.length - 1; index >= 0; index--) {
            if (time >= marks[index].deadTime) {
                marks.splice(index, 1)
                changed = true
            }
        }
        if (marks.length > limit) {
            marks.splice(0, marks.length - limit)
            changed = true
        }
        return changed
    },

    updateInLocalStorage() {
        const stepMarksData = this.myStepMarks.map(mark => ({
            pos: { x: mark.pos.x, y: mark.pos.y, z: mark.pos.z },
            rot: mark.rot,
            creationTime: mark.creationTime,
            deadTime: mark.deadTime
        }))
        localStorage.setItem('myStepMarks', JSON.stringify(stepMarksData))

        const otherStepMarksData = this.otherStepMarks.map(mark => ({
            pos: { x: mark.pos.x, y: mark.pos.y, z: mark.pos.z },
            rot: mark.rot,
            creationTime: mark.creationTime,
            deadTime: mark.deadTime
        }))
        localStorage.setItem('otherStepMarks', JSON.stringify(otherStepMarksData))
    },

    loadFromLocalStorage() {
        this.myStepMarks = this.loadMarks('myStepMarks')
        this.otherStepMarks = this.loadMarks('otherStepMarks')
        this.dirty = true
    },

    loadMarks(key: string): TerrainStep[] {
        const stored = localStorage.getItem(key)
        if (!stored) return []
        const marks: Omit<TerrainStep, 'soil'>[] = JSON.parse(stored)
        return marks.slice(-MAX_STEP_MARKS).map(({pos, rot, creationTime, deadTime}) => ({
            pos: new Vector3(pos.x, pos.y, pos.z), rot, creationTime, deadTime, soil: false
        }))
    },
}
