import { Attackable } from '@/GameManager'
import { Vector3 } from '@babylonjs/core'
import {
    AudioManager,
    BodySoundTypes,
    FootStepSpeeds,
    FootStepTypes,
    WeaponSoundTypes,
} from '@/babylon/audio/audioManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { StepMarksRenderer } from '@/babylon/world/stepMarksRenderer'
import { ViewportManager } from '@/utils/viewport'
import { FightSplatTypes, SplatType } from '@/babylon/world/fightSplatsRenderer'
import { CharacterModel } from '@/babylon/character/characterModel'
import { Utils } from '@/utils/utils'
import { Connector } from '@/network/connector'
import { MyCharMoveMsg } from '@/network/messages'
import { MyPlayer } from '@/data/myPlayer'
import { EquipItemSlots, EquipSlotsCb, Item } from '@/data/items/item'
import { Arrow, ArrowsManager } from '@/babylon/world/arrowsManager'

class Character implements Attackable {
    model: CharacterModel | null = null
    insideView: boolean = true

    id: number = 1
    hp: number
    hpPercent: number = 100
    name: string = "Player"
    nameDisplayTime: number = 0
    className: string = "Warrior"

    boxSize: number = 0.8 // TODO server shall send it
    walkSpeed: number = 2
    runSpeed: number = 3.2
    yMoveSpeed: number = 15 // Only for client purposes (jumping, falling)

    pos: Vector3
    logicYpos: number = 0

    movementType: string = 'WALK'
    private actualSpeed: number = 0
    private moveAngle: number | null = null
    private lookAngle: number | null = null

    equipSet: Map<string, Item> = new Map<string, Item>()

    attackAnimationTime: number = 1000 // Updated before each attack from server

    weaponSoundType: string = WeaponSoundTypes.SWORD
    bodySoundType: string = BodySoundTypes.HARD
    parrySoundType: string = WeaponSoundTypes.SWORD

    lastStepMarkTime: number = 0
    stepMarkSide: 'L' | 'R' = 'R'

    autoAttackTarget: Attackable | null = null
    autoAttackEnd: number = 0
    arrowCreateTime: number = 0
    arrowShotTime: number = 0
    arrow: Arrow | null = null

    constructor(data: any) {
        this.id = data.id
        this.hp = data.hp
        this.pos = new Vector3(data.x, 0, data.z)
        this.name = data.name
        this.className = data.cls

        this.pos.y = Utils.calculateYPos(this.pos.x, this.pos.z, this.getBoxSize())
        this.logicYpos = this.pos.y
        this.initializeEquip(data.equipSet)
    }

    async createModel(init: boolean) {
        this.model = await CharacterModel.create(this, init)
    }

    initializeEquip(equip: any) {
        if (equip.weapon) {
            //equip.weapon.mId = 10
            this.equipSet.set(EquipSlotsCb.getById(equip.weapon.mId)!.slot, Item.fromData(equip.weapon))
        }
        if (equip.body) {
            this.equipSet.set(EquipSlotsCb.getById(equip.body.mId)!.slot, Item.fromData(equip.body))
        }
        if (equip.head) {
            this.equipSet.set(EquipSlotsCb.getById(equip.head.mId)!.slot, Item.fromData(equip.head))
        }
        if (equip.arms) {
            this.equipSet.set(EquipSlotsCb.getById(equip.arms.mId)!.slot, Item.fromData(equip.arms))
        }
        if (equip.legs) {
            this.equipSet.set(EquipSlotsCb.getById(equip.legs.mId)!.slot, Item.fromData(equip.legs))
        }
    }

    onFrame(timeRate: number, actualTime: number, myChar: boolean) {
        // Auto attack in progress
        if (this.autoAttackEnd > actualTime) {
            this.resolveStepMark(actualTime, true)
            this.model?.onFrame(timeRate)

            if (this.arrowCreateTime > 0 && Date.now() >= this.arrowCreateTime && this.autoAttackTarget && (this.insideView || this.autoAttackTarget!.insideView)) {
                this.arrow = ArrowsManager.addArrow(this, this.autoAttackTarget, this.arrowShotTime)
                if (this.model && this.model.initialized && this.insideView) {
                    this.arrow.assignHandNode(this.model.lhandNode)
                } else {
                    this.arrow.assignHandNode(this.model!.node, 0.25)
                }

                this.arrowCreateTime = 0
            }
            return
        }

        if (this.arrowShotTime > 0 && Date.now() >= this.arrowShotTime) {
            if (this == MyPlayer.myChar || this.insideView) AudioManager.playWeaponSwing(this.weaponSoundType, this.pos)
            this.arrowShotTime = 0
        }

        if (this.getMoveAngle() != null) {
            this.setLookAngle(this.getMoveAngle() - (myChar ? Math.PI / 4 : Math.PI / 2))
            const speed = this.getActualSpeed()
            const angle = Utils.roundToTwoDecimals(this.getMoveAngle()! - (myChar ? 0 : Math.PI / 4))
            const tgtPos = new Vector3(this.pos.x + Math.cos(angle) * speed * timeRate, 0, this.pos.z -Math.sin(angle) * speed * timeRate)

            // ONLY FOR MY CHAR
            if (myChar && Utils.isMovementCollision(this.getBoxSize(), new Vector3(this.pos.x, 0, this.pos.z), tgtPos)) {
                this.checkMyCharAlternateMovementPos(tgtPos, angle, speed, timeRate)
            }

            // ONLY FOR MY CHAR - Check world boundaries
            if (myChar && (tgtPos.x < 1 || tgtPos.z < 1 || tgtPos.x > WorldDataManager.worldDataMap.get(MyPlayer.worldId)!.worldSize - 2 || tgtPos.z > WorldDataManager.worldDataMap.get(MyPlayer.worldId)!.worldSize - 2)) {
                this.stopMove()
            } else {
                this.pos.x = tgtPos.x
                this.pos.z = tgtPos.z
                this.logicYpos = Utils.calculateYPos(this.pos.x, this.pos.z, this.getBoxSize())
            }

            if (this.movementType === 'RUN') { this.model?.startRunAnimation() }
            if (this.movementType === 'WALK') { this.model?.startWalkAnimation() }
            this.resolveStepMark(actualTime, false)
        } else {
            this.model?.stopAnimation()
        }
        this.model?.onFrame(timeRate)
    }

    /**
     * ONLY FOR MY CHAR - Check if an alternate movement position is available when the direct path is blocked
     */
    checkMyCharAlternateMovementPos(tgtPos: Vector3, angle: number, speed: number, timeRate: number) {
        const alternateMovementPos = Utils.getAlternateMovementPos(this.getBoxSize(), angle, this.pos.x, this.pos.z, tgtPos.x, tgtPos.z, speed, timeRate)
        if (alternateMovementPos != null) {
            tgtPos.copyFrom(alternateMovementPos)
        } else {
            tgtPos.x = this.pos.x
            tgtPos.z = this.pos.z
        }
        Connector.sendMoveMessage(new MyCharMoveMsg())
    }

    startAutoAttack(data: any) {
        this.autoAttackTarget = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt)
        if (!this.autoAttackTarget) {
            return
        }

        // Ranged weapon attack animation is shorter to account for arrow travel time
        this.attackAnimationTime = data.dur
        if (this.isWeaponRanged()) {
            const dist = Vector3.Distance(this.pos, this.autoAttackTarget.pos)
            this.attackAnimationTime = data.dur - (100 * dist / 5)
            this.arrowCreateTime = Date.now() + data.dur * 0.3
            this.arrowShotTime = Date.now() + this.attackAnimationTime
        }

        this.autoAttackEnd = Date.now() + this.attackAnimationTime

        const angle = Utils.getAngleBetweenPoints(this.pos, this.autoAttackTarget.pos)
        this.setLookAngle(angle - Math.PI / 4)
        this.model?.doAttackAnimation()
        this.model?.setWeaponTrailEnabled(true)
    }

    breakAutoAttack() {
        console.log("Auto attack broken")
        this.autoAttackEnd = 0
        this.autoAttackTarget = null
        this.model?.setWeaponTrailEnabled(false)
        this.model?.stopAnimation()
        this.arrowCreateTime = 0
        this.arrowShotTime = 0
        this.arrow?.dispose()
    }

    finishAutoAttack(data: any) {
        this.model?.setWeaponTrailEnabled(false)

        // Swing sound for melee weapons - ranged weapons have it when arrow is fired
        if (!this.isWeaponRanged()) AudioManager.playWeaponSwing(this.weaponSoundType, this.pos)

        const target = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt)
        if (!target) {
            return
        }
        target.hpPercent = data.res.hpp
        if (data.res.h === 'h') {
            AudioManager.playWeaponHit(this.weaponSoundType, target.getBodySoundType(), target.pos)
        } else if (data.res.h === 'b' && target.getParrySoundType()) {
            AudioManager.playWeaponBlocked(target.getParrySoundType()!)
        }
        this.autoAttackTarget = null
    }

    resolveStepMark(time: number, inCombat: boolean = false) {
        const block = WorldDataManager.getBlockOnPosition(this.pos)!
        if (!block.snowed) {
            return
        }
        if (this.lastStepMarkTime < time - 250) {
            this.lastStepMarkTime = time
            this.stepMarkSide = this.stepMarkSide === 'L' ? 'R' : 'L'
            StepMarksRenderer.addStepMark(this.stepMarkSide, this, this.logicYpos, this.model!.modelRotation, time, inCombat)
        }
    }

    setVisible(visible: boolean) {
        if (visible && !this.insideView) {
            this.model!.addToView()
        } else if (!visible && this.insideView) {
            this.model!.removeFromView()
        }
        this.insideView = visible
    }

    startMove(movementType: string, angle: number) {
        this.movementType = movementType
        this.setMoveAngleAndSpeed(angle, this.movementType === 'RUN' ? this.runSpeed : this.walkSpeed)
    }

    stopMove() {
        this.setMoveAngleAndSpeed(null, 0)
    }

    private setMoveAngleAndSpeed(angle: number | null, speed: number) {
        this.setMoveAngle(angle ? Utils.roundToTwoDecimals(angle): null)
        this.setActualSpeed(Utils.roundToOneDecimal(speed))
        Connector.sendMoveMessage(new MyCharMoveMsg())
    }

    getPositionRounded(): Vector3 {
        return new Vector3(Math.round(this.pos.x), Math.round(this.pos.y), Math.round(this.pos.z))
    }

    setMoveAngle(angle: number | null) {
        this.moveAngle = angle
        if (angle !== null) {
            this.moveAngle += Math.PI / 4
        }
        this.setLookAngle(angle)
    }

    getMoveAngle() {
        return this.moveAngle
    }

    setLookAngle(angle: number | null) {
        this.lookAngle = angle
    }

    getLookAngle() {
        return this.lookAngle
    }

    getActualSpeed() {
        return this.actualSpeed
    }

    setActualSpeed(speed: number) {
        this.actualSpeed = speed
        if (this !== MyPlayer.myChar) {
            this.movementType = speed > this.walkSpeed ? 'RUN' : 'WALK'
        }
    }

    getPositionOnScreen() {
        return ViewportManager.getPositionOnScreen(this.pos)
    }

    getBoxSize() {
        return this.boxSize
    }

    getName() {
        return this.name
    }

    getModelHeight(): number {
        return 2
    }

    getNameTextNodeScreenPosition(): Vector3 | null {
        if (!this.model) {
            return null
        }
        return ViewportManager.getPositionOnScreen(this.model.getNameTextNodeWorldPosition())
    }

    getObjectType(): string {
        return "C"
    }

    getRelationToMyPlayer(): 'ALLY' | 'ENEMY' | 'NEUTRAL' {
        return 'ALLY'
    }

    getWeaponSoundType(): string {
        return this.weaponSoundType
    }

    getBodySoundType(): string {
        return this.bodySoundType
    }

    getParrySoundType(): string | null {
        return this.parrySoundType
    }

    getSplatType(): SplatType {
        return FightSplatTypes.BLOOD
    }

    getWeapon(): Item | null {
        return this.equipSet.get(EquipItemSlots.R_HAND) || null
    }

    isWeaponRanged(): boolean {
        const weapon = this.getWeapon()
        if (weapon && weapon.slotInfo.weaponType === 'BOW') {
            return true
        }
        return false
    }

    getFootStepSoundType(): string {
        const block = WorldDataManager.getBlockOnPosition(this.pos)!
        if (block.snowed) {
            return FootStepTypes.SNOW
        } else {
            return FootStepTypes.DIRT
        }
    }

    getDistanceFromMyPlayer(): number {
        return Vector3.Distance(this.pos, MyPlayer.myChar.pos)
    }

    isMyChar(): boolean {
        return this.id === MyPlayer.myChar.id
    }
}

export default Character
