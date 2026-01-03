import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { Utils } from '@/utils/utils'
import { Vector3 } from '@babylonjs/core'
import { ViewportManager } from '@/utils/viewport'
import { Data } from '@/data/globalData'
import { Targetable } from '@/gui/targettingManager'

export class Monster implements Targetable {
    id: number
    mobType: MonsterType
    model: MonsterModel
    targetPoint: Vector3 | null = null

    hp: number
    runSpeed: number = 0
    rotationSpeed: number = 15
    pos: Vector3
    logicYpos: number = 0

    moveAngle: number | null = null
    insideView: boolean = true

    constructor(id: number, mobType: MonsterType, xPos: number, zPos: number, hp: number) {
        this.id = id
        this.mobType = mobType
        this.hp = hp
        this.pos = new Vector3(xPos, 0, zPos)
        this.logicYpos = Utils.calculateYPos(this.pos.x, this.pos.z,0.4)
        this.pos.y = this.logicYpos
    }

    onFrame(timeRate: number, actualTime: number) {
        this.resolveMovement(timeRate)

        if (this.insideView) {
            this.model.onFrame(timeRate)
        }
    }

    onAnimFrame(animFrame: number) {
        if (this.insideView) {
            this.model.onAnimFrame(animFrame)
        }
    }

    resolveMovement(timeRate: number) {
        const stepSize = this.runSpeed * timeRate
        if (this.targetPoint != null) {

            const dx = Math.abs(this.targetPoint.x - this.pos.x)
            const dz = Math.abs(this.targetPoint.z - this.pos.z)

            if (dx <= stepSize && dz <= stepSize) {
                this.pos.x = this.targetPoint.x
                this.pos.z = this.targetPoint.z
                this.targetPoint = null
                this.moveAngle = null
            }
        }

        if (this.moveAngle != null) {
            this.pos.x += (Math.cos(this.moveAngle + Math.PI / 4) * stepSize)
            this.pos.z -= (Math.sin(this.moveAngle + Math.PI / 4) * stepSize)
            if (this.model.initialized) this.model.doWalk()
        } else {
            if (this.model.initialized) this.model.doIdle()
        }

        this.logicYpos = Utils.calculateYPos(this.pos.x, this.pos.z,0.4)
    }

    setTargetPoint(point: Vector3) {
        const angle = Math.atan2(-(point.z - this.pos.z), point.x - this.pos.x)
        this.moveAngle = angle - Math.PI / 4
        this.targetPoint = point
    }

    resetTargetPoint() {
        this.targetPoint = null
        this.moveAngle = null
    }

    setVisible(visible: boolean) {
        if (visible && !this.insideView) {
            this.model.addToView()
        } else if (!visible && this.insideView) {
            this.model.removeFromView()
        }
        this.insideView = visible
    }

    removeMonster () {
        this.model.removeFromScene()
    }

    getPositionOnScreen(): Vector3 | null {
        return ViewportManager.getPositionOnScreen(this.pos)
    }

    getDistanceFromMyPlayer(): number {
        return Vector3.Distance(this.pos, Data.myChar.pos)
    }

    getBoxSize(): number {
        return this.mobType.boxSize
    }

    getName(): string {
        return this.mobType.name
    }

    getModelHeight(): number {
        return this.mobType.boxHeight
    }

    getNameTextNodeScreenPosition(): Vector3 | null {
        return ViewportManager.getPositionOnScreen(this.model.getNameTextNodeWorldPosition())
    }
    getObjectType(): string {
        return "M"
    }
}
