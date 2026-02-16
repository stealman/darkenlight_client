import { Matrix, Mesh, Quaternion, Scene, Vector2, Vector3 } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials } from '@/babylon/materials'
import { Targetable } from '@/gui/targettingManager'
import { Settings } from '@/settings/settings'
import { MyPlayer } from '@/data/myPlayer'

export const StepMarksRenderer = {
    myStepMarks: new Array<StepMark>(),
    otherStepMarks: new Array<StepMark>(),
    maxMarks: 250,
    stepMarkPlane: null as Mesh | null,

    initialize (scene: Scene) {
        this.maxMarks = Settings.isDetalLevelHigh() ? 500 : 150
        this.stepMarkPlane = Builder.createHorizontalPlane(scene, null, 1, 0)
        this.stepMarkPlane.material = Materials.stepMarksMaterial
        this.loadFromLocalStorage()

    },

    addStepMark(side: string, object: Targetable, yPos: number, rot: number, time: number, inCombat: boolean = false) {
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
    },

    update(timeRate: number, time: number) {
        this.myStepMarks = this.myStepMarks.filter(mark => (time < mark.deadTime))
        this.otherStepMarks = this.otherStepMarks.filter(mark => (time < mark.deadTime))
        this.renderStepMarks(time)
    },

    renderStepMarks(time: number) {
        if (!this.stepMarkPlane) {
            return
        }
        const buffer = new Float32Array((this.myStepMarks.length + this.otherStepMarks.length) * 16)
        const uvBuffer = new Float32Array((this.myStepMarks.length + this.otherStepMarks.length) * 2)
        const size = 0.4
        let i = 0
        for (const mark of this.myStepMarks) {
            const posMatrix = Matrix.Translation(mark.pos.x, mark.pos.y, mark.pos.z)
            const scaleMatrix = Matrix.Scaling(size, 1, size);
            scaleMatrix.multiply(Matrix.FromQuaternionToRef(Quaternion.FromEulerAngles(0, mark.rot, 0), new Matrix()).multiply(posMatrix)).copyToArray(buffer, i * 16);

            const uvc = mark.getUvcIndex(time)
            uvBuffer[i * 2] = uvc.x
            uvBuffer[i * 2 + 1] = uvc.y
            i++
        }

        for (const mark of this.otherStepMarks) {
            const posMatrix = Matrix.Translation(mark.pos.x, mark.pos.y, mark.pos.z)
            const scaleMatrix = Matrix.Scaling(size, 1, size);
            scaleMatrix.multiply(Matrix.FromQuaternionToRef(Quaternion.FromEulerAngles(0, mark.rot, 0), new Matrix()).multiply(posMatrix)).copyToArray(buffer, i * 16);

            const uvc = mark.getUvcIndex(time)
            uvBuffer[i * 2] = uvc.x
            uvBuffer[i * 2 + 1] = uvc.y
            i++
        }

        this.stepMarkPlane.thinInstanceSetBuffer('matrix', buffer, 16)
        this.stepMarkPlane.thinInstanceSetBuffer('uvc', uvBuffer, 2)
        this.stepMarkPlane.thinInstanceRefreshBoundingInfo()
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
