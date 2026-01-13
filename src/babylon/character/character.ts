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

class Character implements Attackable {
    model: CharacterModel | null = null
    insideView: boolean = true

    id: number = 1
    hp: number
    name: string = "Player"
    className: string = "Warrior"
    walkSpeed: number = 2
    runSpeed: number = 3.2
    boxSize: number = 0.8
    private actualSpeed: number = 0

    pos: Vector3
    logicYpos: number = 0

    movementType: string = 'WALK'
    modelRotation: number = 0
    private moveAngle: number | null = null
    private lookAngle: number | null = null

    yMoveSpeed: number = 15
    attackAnimationTime: number = 1000 // 1000 is base attack time

    weaponSoundType: string = WeaponSoundTypes.SWORD
    bodySoundType: string = BodySoundTypes.HARD
    parrySoundType: string = WeaponSoundTypes.SWORD

    lastStepMarkTime: number = 0
    stepMarkSide: 'L' | 'R' = 'R'

    autoAttackEnd: number = 0

    constructor(data: any) {
        this.id = data.id
        this.hp = data.hp
        this.pos = new Vector3(data.x, 0, data.z)
        this.name = data.name
        this.className = data.cls

        this.pos.y = Utils.calculateYPos(this.pos.x, this.pos.z, this.getBoxSize())
        this.logicYpos = this.pos.y
    }

    async createModel() {
        this.model = await CharacterModel.create(this)
    }

    onFrame(timeRate: number, actualTime: number, myChar: boolean) {
        // Auto attack in progress
        if (this.autoAttackEnd > actualTime) {
            this.resolveStepMark(actualTime, true)
            this.model?.onFrame(timeRate)
            return
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
        const target = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt)
        if (!target) {
            return
        }
        this.attackAnimationTime = data.dur
        this.autoAttackEnd = Date.now() + this.attackAnimationTime

        const angle = Utils.getAngleBetweenPoints(this.pos, target.pos)
        this.setLookAngle(angle - Math.PI / 4)
        this.model?.doAttackAnimation()
        this.model?.setWeaponTrailEnabled(true)
    }

    finishAutoAttack(data: any) {
        this.model?.setWeaponTrailEnabled(false)
        AudioManager.playWeaponSwing(this.weaponSoundType)

        const target = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt)
        if (!target) {
            return
        }

        if (data.res.hit === 'h') {
            AudioManager.playWeaponHit(this.weaponSoundType, target.getBodySoundType())
        } else if (data.res.hit === 'b' && target.getParrySoundType()) {
            AudioManager.playWeaponBlocked(target.getParrySoundType()!)
        }
    }

    resolveStepMark(time: number, inCombat: boolean = false) {
        const block = WorldDataManager.getBlockOnPosition(this.pos)!
        if (!block.snowed) {
            return
        }
        if (this.lastStepMarkTime < time - 250) {
            this.lastStepMarkTime = time
            this.stepMarkSide = this.stepMarkSide === 'L' ? 'R' : 'L'
            StepMarksRenderer.addStepMark(this.stepMarkSide, this, this.logicYpos, this.modelRotation, time, inCombat)
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

    getNameTextNodeScreenPosition() {
        return ViewportManager.getPositionOnScreen(this.pos)
    }

    getObjectType(): string {
        return "C"
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

    getFootStepSoundType(): string {
        const block = WorldDataManager.getBlockOnPosition(this.pos)!
        if (block.snowed) {
            return FootStepTypes.SNOW
        } else {
            return FootStepTypes.DIRT
        }
    }

    getStepSoundSpeed(): number {
        switch (this.getFootStepSoundType()) {
            case 'DIRT':
                return this.movementType === 'RUN' ? FootStepSpeeds.DIRT_RUN : FootStepSpeeds.DIRT_WALK
            case 'SNOW':
                return this.movementType === 'RUN' ? FootStepSpeeds.SNOW_RUN : FootStepSpeeds.SNOW_WALK
            default:
                return this.movementType === 'RUN' ? FootStepSpeeds.SNOW_RUN : FootStepSpeeds.SNOW_WALK
        }
    }
}

export default Character
