import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { WorldDataManager } from '@/data/worldDataManager'
import { Utils } from '@/utils/utils'
import { Vector3 } from '@babylonjs/core'

export class Monster {
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
        this.logicYpos = this.calculateYPos()
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

        this.logicYpos = this.calculateYPos()
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

    calculateYPos() {
        const map = WorldDataManager.getBlockMap()
        const coveredBlocks = Utils.getCoveredBlocks(this.pos.x, this.pos.z, 0.4)

        // From map get all blocks that are covered by the player and find the highest one
        let highest = 0
        coveredBlocks.forEach(block => {
            if (map[block.x][block.z].height > highest) {
                highest = map[block.x][block.z].height
            }
        })

        return highest
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
}
