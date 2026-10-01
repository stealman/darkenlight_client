import { Matrix, Mesh, Quaternion, Scene, Vector2, Vector3 } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials } from '@/babylon/materials'
import { Targetable } from '@/gui/targettingManager'
import { Settings } from '@/settings/settings'
import { MyPlayer } from '@/data/myPlayer'
import { WorldDataManager } from '@/data/worldDataManager'

export const StepMarksRenderer = {
    myStepMarks: new Array<StepMark>(),
    otherStepMarks: new Array<StepMark>(),
    maxMarks: 250,
    stepMarkPlane: null as Mesh | null,
    matrixBuffer: new Float32Array(0),
    uvBuffer: new Float32Array(0),
    matricesDirty: true,
    tmpPosition: new Matrix(),
    tmpRotation: new Matrix(),
    tmpWorld: new Matrix(),
    tmpQuaternion: new Quaternion(),
    scaleMatrix: Matrix.Scaling(0.4, 1, 0.4),

    initialize (scene: Scene) {
        this.maxMarks = Settings.isDetalLevelHigh() ? 500 : 250
        this.stepMarkPlane = Builder.createHorizontalPlane(scene, null, 1, 0)
        this.stepMarkPlane.material = Materials.stepMarksMaterial
        this.loadFromLocalStorage()

    },

    addStepMark(side: string, object: Targetable, yPos: number, rot: number, time: number, inCombat: boolean = false) {
        const block = WorldDataManager.getBlockOnPosition(object.pos)
        if (!block || block.shallowWater || block.deepWater) {
            return
        }

        let tgtArray = null
        let ttl = 300000
        if (object === MyPlayer.myChar) {
            tgtArray = this.myStepMarks
        } else {
            tgtArray = this.otherStepMarks
            ttl = 60000
        }

        if (tgtArray.length >= this.maxMarks) {
            tgtArray.shift()
        }

        const randomize = inCombat ? 0.2 : 0.1
        const straddle = side === 'L' ? -0.2 : 0.2
        const dx = Math.cos(rot + Math.PI / 2) * straddle
        const dz = -Math.sin(rot + Math.PI / 2) * straddle

        const footPos = new Vector3( - randomize + object.pos.x + dx + (Math.random() * randomize * 2), yPos + 0.01, -randomize + object.pos.z + dz + (Math.random() * randomize * 2))
        tgtArray.push(new StepMark(footPos, (-randomize + (Math.random() * randomize * 2)) + rot + Math.PI / 2, time, ttl))
        this.matricesDirty = true
    },

    update(timeRate: number, time: number) {
        void timeRate
        if (this.removeExpiredMarks(this.myStepMarks, time) || this.removeExpiredMarks(this.otherStepMarks, time)) {
            this.matricesDirty = true
        }
        this.renderStepMarks(time)
    },

    clearWorld() {
        this.myStepMarks = []
        this.otherStepMarks = []
        this.matricesDirty = true
        localStorage.removeItem('myStepMarks')
        localStorage.removeItem('otherStepMarks')
        this.renderStepMarks(Date.now())
    },

    renderStepMarks(time: number) {
        if (!this.stepMarkPlane) {
            return
        }
        const markCount = this.myStepMarks.length + this.otherStepMarks.length
        if (this.matricesDirty) {
            this.matrixBuffer = new Float32Array(markCount * 16)
            this.uvBuffer = new Float32Array(markCount * 2)

            let index = 0
            for (const mark of this.myStepMarks) {
                this.writeMarkMatrix(mark, index)
                this.writeMarkUvc(mark, index, time)
                index++
            }
            for (const mark of this.otherStepMarks) {
                this.writeMarkMatrix(mark, index)
                this.writeMarkUvc(mark, index, time)
                index++
            }

            this.stepMarkPlane.thinInstanceSetBuffer('matrix', this.matrixBuffer, 16, false)
            this.stepMarkPlane.thinInstanceSetBuffer('uvc', this.uvBuffer, 2, false)
            this.stepMarkPlane.thinInstanceCount = markCount
            this.stepMarkPlane.setEnabled(markCount > 0)
            if (markCount > 0) {
                this.stepMarkPlane.thinInstanceRefreshBoundingInfo()
            }
            this.matricesDirty = false
            return
        }

        let uvChanged = false
        let index = 0
        for (const mark of this.myStepMarks) {
            uvChanged = this.updateMarkUvc(mark, index, time) || uvChanged
            index++
        }
        for (const mark of this.otherStepMarks) {
            uvChanged = this.updateMarkUvc(mark, index, time) || uvChanged
            index++
        }
        if (uvChanged) {
            this.stepMarkPlane.thinInstanceBufferUpdated('uvc')
        }
    },

    removeExpiredMarks(marks: StepMark[], time: number): boolean {
        let changed = false
        for (let index = marks.length - 1; index >= 0; index--) {
            if (time >= marks[index].deadTime) {
                marks.splice(index, 1)
                changed = true
            }
        }
        return changed
    },

    writeMarkMatrix(mark: StepMark, index: number) {
        Matrix.TranslationToRef(mark.pos.x, mark.pos.y, mark.pos.z, this.tmpPosition)
        Quaternion.FromEulerAnglesToRef(0, mark.rot, 0, this.tmpQuaternion)
        Matrix.FromQuaternionToRef(this.tmpQuaternion, this.tmpRotation)
        this.tmpRotation.multiplyToRef(this.tmpPosition, this.tmpWorld)
        this.scaleMatrix.multiplyToRef(this.tmpWorld, this.tmpWorld)
        this.tmpWorld.copyToArray(this.matrixBuffer, index * 16)
    },

    writeMarkUvc(mark: StepMark, index: number, time: number) {
        const uvc = mark.getUvcIndex(time)
        const offset = index * 2
        this.uvBuffer[offset] = uvc.x
        this.uvBuffer[offset + 1] = uvc.y
    },

    updateMarkUvc(mark: StepMark, index: number, time: number): boolean {
        const uvc = mark.getUvcIndex(time)
        const offset = index * 2
        if (this.uvBuffer[offset] === uvc.x && this.uvBuffer[offset + 1] === uvc.y) {
            return false
        }
        this.uvBuffer[offset] = uvc.x
        this.uvBuffer[offset + 1] = uvc.y
        return true
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
        const storedMyStepMarks = localStorage.getItem('myStepMarks')
        if (storedMyStepMarks) {
            const parsedMarks = JSON.parse(storedMyStepMarks)
            this.myStepMarks = parsedMarks.map((markData: any) => new StepMark(
                new Vector3(markData.pos.x, markData.pos.y, markData.pos.z),
                markData.rot,
                markData.creationTime,
                markData.deadTime - markData.creationTime
            ))
        }

        const storedOtherStepMarks = localStorage.getItem('otherStepMarks')
        if (storedOtherStepMarks) {
            const parsedMarks = JSON.parse(storedOtherStepMarks)
            this.otherStepMarks = parsedMarks.map((markData: any) => new StepMark(
                new Vector3(markData.pos.x, markData.pos.y, markData.pos.z),
                markData.rot,
                markData.creationTime,
                markData.deadTime - markData.creationTime
            ))
        }
        this.matricesDirty = true
    },
}

class StepMark {
    pos: Vector3
    rot: number = 0
    creationTime: number
    deadTime: number = 0
    uvcIndices = [new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, 0), new Vector2(1, 0)]

    constructor(pos: Vector3, rot: number, creationTime: number, ttl: number) {
        this.pos = pos
        this.rot = rot
        this.creationTime = creationTime
        this.deadTime = creationTime + ttl
    }

    getUvcIndex(time: number): Vector2 {
        const lifeProgress = (time - this.creationTime) / (this.deadTime - this.creationTime)
        if (lifeProgress < 0.5) {
            return this.uvcIndices[0]
        } else if (lifeProgress < 0.65) {
            return this.uvcIndices[1]
        } else if (lifeProgress < 0.8) {
            return this.uvcIndices[2]
        } else {
            return this.uvcIndices[3]
        }
    }
}
