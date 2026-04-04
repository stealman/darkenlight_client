import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MonsterAATypes, MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { Utils } from '@/utils/utils'
import { TransformNode, Vector3 } from '@babylonjs/core'
import { ViewportManager } from '@/utils/viewport'
import { AudioManager } from '@/babylon/audio/audioManager'
import { Attackable } from '@/GameManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { StepMarksRenderer } from '@/babylon/world/stepMarksRenderer'
import { MyPlayer } from '@/data/myPlayer'
import { Arrow, ArrowsManager } from '@/babylon/world/arrowsManager'
import { AttackableBasicTO, AutoAttackResultMessage } from '@/network/messageIfs'
import { PubliclyVisibleAffect } from '@/data/affects'
import { EffectTarget } from '@/babylon/gfx/characterEffect'

export class Monster implements Attackable, EffectTarget {
    id: number
    mobType: MonsterType
    model: MonsterModel
    targetPoint: Vector3 | null = null

    hp: number
    hpPercent: number = 100
    killedTime: number = 0
    runSpeed: number = 0
    rotationSpeed: number = 8
    pos: Vector3
    logicYpos: number = 0

    private moveAngle: number | null = null
    lookAngle: number | null = null
    insideView: boolean = true
    lastStepMarkTime: number = 0
    stepMarkSide: 'L' | 'R' = 'R'

    autoAttackTarget: Attackable | null = null
    attackAnimationTime: number = 1000 // Updated before each attack from server
    autoAttackEnd: number = 0
    autoAttackSoundPlayed: boolean = false

    arrowCreateTime: number = 0
    arrowShotTime: number = 0
    arrow: Arrow | null = null

    nameDisplayTime: number = 0
    publiclyVisibleAffects: Map<number, PubliclyVisibleAffect> = new Map<number, PubliclyVisibleAffect>()

    constructor(id: number, mobType: MonsterType, xPos: number, zPos: number, hpp: number) {
        this.id = id
        this.mobType = mobType
        this.hpPercent = hpp
        this.pos = new Vector3(xPos, 0, zPos)
        this.logicYpos = Utils.calculateWalkYPos(this.pos.x, this.pos.z, 0.4)
        this.pos.y = this.logicYpos
    }

    onFrame(timeRate: number, actualTime: number) {
        if (this.autoAttackEnd > actualTime) {

            if (this.arrowCreateTime > 0 && actualTime >= this.arrowCreateTime && this.autoAttackTarget && (this.insideView || this.autoAttackTarget!.insideView)) {
                this.arrow = ArrowsManager.addArrow(this, this.autoAttackTarget, this.arrowShotTime, '')
                if (this.model && this.model.initialized && this.insideView) {
                    this.arrow.assignHandNode(this.model!.lhandNode, 0.25 / this.model.template.scale.y)
                } else {
                    this.arrow.assignHandNode(this.model!.nameTextNode, 1)
                }
                this.arrowCreateTime = 0
            }
        } else {
            if (this.arrowShotTime > 0 && Date.now() >= this.arrowShotTime) {
                if (this == MyPlayer.myChar || this.insideView) AudioManager.playWeaponSwing(this.getWeaponSoundType(), this.pos)
                this.arrowShotTime = 0
            }

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

    doAutoAttack(target: Attackable, dur: number) {
        // Ranged weapon attack animation is shorter to account for arrow travel time
        this.autoAttackTarget = target
        this.attackAnimationTime = dur
        if (this.isWeaponRanged()) {
            const dist = Vector3.Distance(this.pos, target.pos)
            this.attackAnimationTime = dur - (100 * dist / 5)
            this.arrowCreateTime = Date.now() + dur * 0.3
            this.arrowShotTime = Date.now() + this.attackAnimationTime
        }
        this.autoAttackEnd = Date.now() + this.attackAnimationTime

        this.autoAttackSoundPlayed = false
        const angle = Utils.getAngleBetweenPoints(this.pos, target.pos)
        this.lookAngle = (angle - Math.PI / 4)
        this.model.doAttackAnimation()
    }

    autoAttackFinished(data: AutoAttackResultMessage) {
        AudioManager.playWeaponSwing(this.getWeaponSoundType(), this.pos)
        this.model.setWeaponTrailEnabled(false)

        const target = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt)
        if (!target) {
            return
        }
        target.hpPercent = data.res.tgt.hpp
        if (target === MyPlayer.myChar) {
            MyPlayer.setMyCharHp(data.res.tgt.hp)
        }

        if (data.res.h === 'h') {
            AudioManager.playWeaponHit(this.getWeaponSoundType(), target.getBodySoundType(), target.pos)
        } else if (data.res.h === 'b' && target.getParrySoundType()) {
            AudioManager.playWeaponBlocked(target.getParrySoundType()!, target.pos)
        }
    }

    resolveMovement(timeRate: number, actualTime: number) {
        const stepSize = this.runSpeed * timeRate
        if (this.targetPoint != null) {
            this.model.setWeaponTrailEnabled(false)
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

        this.logicYpos = Utils.calculateWalkYPos(this.pos.x, this.pos.z, 0.4)
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

    basicDataChange(data: AttackableBasicTO) {
        this.hpPercent = data.hpp
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

    killed() {
        this.killedTime = Date.now()
        this.arrowCreateTime = 0
        this.arrowShotTime = 0
        if (this.arrow && !this.arrow.startedFlying) {
            this.arrow.dispose()
            this.arrow = null
        }
    }

    consumePubliclyVisibleAffects(affects: [{tp: number, p: number}]) {
        this.publiclyVisibleAffects.clear()
        affects.forEach(aff => {
            if (aff.p > 0) {
                this.publiclyVisibleAffects.set(aff.tp, new PubliclyVisibleAffect(aff.tp, aff.p))
            }
        })
    }

    removeModel() {
        this.model.removeFromScene()
    }

    getPositionOnScreen(): Vector3 | null {
        return ViewportManager.getPositionOnScreen(this.pos)
    }

    getDistanceFromMyPlayer(): number {
        return Vector3.Distance(this.pos, MyPlayer.myChar.pos)
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

    getRelationToMyPlayer(): 'ALLY' | 'ENEMY' | 'NEUTRAL' {
        return 'ENEMY'
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

    isWeaponRanged(): boolean {
        return this.mobType.aaType === MonsterAATypes.RANGED_ARROW
    }

    getEffectAnchorNode(): TransformNode | null {
        if (!this.model?.initialized) {
            return null
        }

        return this.model.node
    }

    isEffectVisible(): boolean {
        return this.insideView && !!this.model?.initialized && !this.killedTime
    }
}
