import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { Utils } from '@/utils/utils'
import { Vector3 } from '@babylonjs/core'
import { ViewportManager } from '@/utils/viewport'
import { Data } from '@/data/globalData'
import { Targetable } from '@/gui/targettingManager'
import { AudioManager } from '@/babylon/audio/audioManager'
import { Attackable } from '@/GameManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { StepMarksRenderer } from '@/babylon/world/stepMarksRenderer'

export class Monster implements Attackable {
    id: number
    mobType: MonsterType
    model: MonsterModel
    targetPoint: Vector3 | null = null

    hp: number
    runSpeed: number = 0
    rotationSpeed: number = 8
    pos: Vector3
    logicYpos: number = 0

    private moveAngle: number | null = null
    lookAngle: number | null = null
    insideView: boolean = true
    lastStepMarkTime: number = 0
    stepMarkSide: 'L' | 'R' = 'R'

    autoAttackEnd: number = 0
    autoAttackSoundPlayed: boolean = false

    constructor(id: number, mobType: MonsterType, xPos: number, zPos: number, hp: number) {
        this.id = id
        this.mobType = mobType
        this.hp = hp
        this.pos = new Vector3(xPos, 0, zPos)
        this.logicYpos = Utils.calculateYPos(this.pos.x, this.pos.z, 0.4)
        this.pos.y = this.logicYpos
    }

    onFrame(timeRate: number, actualTime: number) {
        if (this.autoAttackEnd > actualTime) {
        } else {
            this.resolveMovement(timeRate, actualTime)
        }

        if (this.insideView) {
            this.model.onFrame(timeRate)
        }
    }

    onAnimFrame() {
        if (this.insideView) {
            this.model.onAnimFrame()
        }
    }

    doAutoAttack(target: Targetable, dur: number) {
        const actualTime = Date.now()
        this.autoAttackEnd = actualTime + dur
        this.autoAttackSoundPlayed = false

        const angle = Utils.getAngleBetweenPoints(this.pos, target.pos)
        this.lookAngle = (angle - Math.PI / 4)
        this.model.doAttackMelee(dur)
    }

    autoAttackFinished(data: any) {
        AudioManager.playWeaponSwing(this.getWeaponSoundType())
        const target = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt)
        if (!target) {
            return
        }
        if (data.res.hit === 'h') {
            AudioManager.playWeaponHit(this.getWeaponSoundType(), target.getBodySoundType())
        } else if (data.res.hit === 'b' && target.getParrySoundType()) {
            AudioManager.playWeaponBlocked(target.getParrySoundType()!)
        }
    }

    resolveMovement(timeRate: number, actualTime: number) {
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

            this.resolveStepMark(actualTime, false)
        }

        if (this.moveAngle != null) {
            this.lookAngle = this.moveAngle
            this.pos.x += (Math.cos(this.moveAngle + Math.PI / 4) * stepSize)
            this.pos.z -= (Math.sin(this.moveAngle + Math.PI / 4) * stepSize)
            if (this.model.initialized) this.model.doWalk()
        } else {
            if (this.model.initialized) this.model.doIdle()
        }

        this.logicYpos = Utils.calculateYPos(this.pos.x, this.pos.z, 0.4)
    }

    resolveStepMark(time: number, inCombat: boolean = false) {
        const block = WorldDataManager.getBlockOnPosition(this.pos)!
        if (!block.snowed) {
            return
        }
        if (this.lastStepMarkTime < time - 400) {
            this.lastStepMarkTime = time
            this.stepMarkSide = this.stepMarkSide === 'L' ? 'R' : 'L'
            StepMarksRenderer.addStepMark(this.stepMarkSide, this, this.logicYpos, this.model.modelRotation, time, inCombat)
        }
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

    removeMonster() {
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

    getWeaponSoundType(): string {
        return this.mobType.weaponSoundType
    }

    getBodySoundType(): string {
        return this.mobType.bodySoundType
    }

    getParrySoundType(): string | null {
        return this.mobType.parrySoundType
    }
}
