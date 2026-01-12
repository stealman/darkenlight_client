import { Attackable } from '@/GameManager'
import { Scene, Vector3 } from '@babylonjs/core'
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
import { TargetingManager } from '@/gui/targettingManager'
import { Connector } from '@/network/connector'
import { AutoAttackBreak, MyCharMoveMsg } from '@/network/messages'
import { MyPlayer } from '@/babylon/character/myPlayer'

class Character implements Attackable {
    model: CharacterModel | null = null

    id: number = 1
    hp: number
    name: string = "Player"
    className: string = "Warrior"
    walkSpeed: number = 2.2
    runSpeed: number = 3.5
    boxSize: number = 0.8
    private actualSpeed: number = 0

    pos: Vector3
    logicYpos: number = 0

    movementType: string = 'WALK'
    modelRotation: number = 0
    private moveAngle: number | null = null
    private lookAngle: number | null = null
    targetBlock: Vector3 | null = null

    rotationSpeed: number = 15
    yMoveSpeed: number = 15
    attackAnimationTime: number = 1000 // 1000 is base attack time

    weaponSoundType: string = WeaponSoundTypes.SWORD
    bodySoundType: string = BodySoundTypes.HARD
    parrySoundType: string = WeaponSoundTypes.SWORD

    lastStepMarkTime: number = 0
    stepMarkSide: 'L' | 'R' = 'R'

    autoAttackTarget: Attackable | null = null
    autoAttackEnd: number = 0

    constructor(data: any) {
        this.hp = data.hp
        this.logicYpos = 0
        this.pos = new Vector3(data.x, 0, data.z)
        this.name = data.name
        this.className = data.cls
    }

    async createModel(scene: Scene) {
        this.model = await CharacterModel.create(this, scene)
    }

    reset() {
        this.model = null
        this.autoAttackTarget = null
        this.autoAttackEnd = 0
    }

    onFrame(timeRate: number, actualTime: number) {
        // Auto attack in progress
        if (this.autoAttackEnd > actualTime) {
            this.resolveStepMark(actualTime, true)

            // Cancel auto attack immediately if moving away from target
            if (TargetingManager.selectedTarget && this.getMoveAngle() != null) {
                const myPos = this.pos
                const targetPos = TargetingManager.selectedTarget.pos
                const moveAngle = this.getMoveAngle()!
                const toTarget = targetPos.subtract(myPos).normalize()
                const moveDir = new Vector3(Math.cos(moveAngle), 0, -Math.sin(moveAngle)).normalize()
                const dot = Vector3.Dot(moveDir, toTarget)
                if (dot < -0.5) {
                    this.autoAttackEnd = 0
                    this.model?.weaponMesh.trailMesh!.setEnabled(false)
                    Connector.sendMessage(new AutoAttackBreak())
                }
            }
        }

        if (this.autoAttackEnd > actualTime) {
            this.model?.onFrame(timeRate)
            return
        }

        if (this.targetBlock != null) {
            const targetBlock = this.targetBlock
            const dx = Math.abs(targetBlock.x - this.pos.x)
            const dz = Math.abs(targetBlock.z - this.pos.z)

            if (dx < 0.1 && dz < 0.1) {
                this.targetBlock = null
                this.setMoveAngleAndSpeed(0, 0)
            }
        }

        if (this.getMoveAngle() != null) {
            this.setLookAngle(this.getMoveAngle())
            const speed = this.getActualSpeed()
            const angle = Utils.roundToTwoDecimals(this.getMoveAngle()! + Math.PI / 4)
            let tgtPos = new Vector3(this.pos.x + Math.cos(angle) * speed * timeRate, 0, this.pos.z -Math.sin(angle) * speed * timeRate)

            // Check if player can move to the target position, if not try to find an alternate position
            if (Utils.isMovementCollision(this.getBoxSize(), new Vector3(this.pos.x, 0, this.pos.z), tgtPos)) {
                const alternateMovementPos = Utils.getAlternateMovementPos(this.getBoxSize(), angle, this.pos.x, this.pos.z, tgtPos.x, tgtPos.z, speed, timeRate)
                if (alternateMovementPos != null) {
                    tgtPos = alternateMovementPos
                } else {
                    tgtPos = new Vector3(this.pos.x, 0, this.pos.z)
                }
                Connector.sendMoveMessage(new MyCharMoveMsg())
            }

            // Check world boundaries
            if (tgtPos.x < 1 || tgtPos.z < 1 || tgtPos.x > WorldDataManager.worldDataMap.get(MyPlayer.worldId)!.worldSize - 2 || tgtPos.z > WorldDataManager.worldDataMap.get(MyPlayer.worldId)!.worldSize - 2) {
                tgtPos = new Vector3(this.pos.x, 0, this.pos.z)
                this.setMoveAngleAndSpeed(0, 0)
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

    doAutoAttack(data: any) {
        this.autoAttackTarget = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt)
        if (!this.autoAttackTarget) {
            return
        }
        this.attackAnimationTime = data.dur
        this.autoAttackEnd = Date.now() + this.attackAnimationTime

        const angle = Utils.getAngleBetweenPoints(this.pos, this.autoAttackTarget.pos)
        this.setLookAngle(angle - Math.PI / 4)
        this.model?.doAttackAnimation()
        this.model?.weaponMesh.trailMesh!.setEnabled(true)
    }

    autoAttackFinished(data: any) {
        this.model?.weaponMesh.trailMesh!.setEnabled(false)
        AudioManager.playWeaponSwing(this.weaponSoundType)
        if (!this.autoAttackTarget) {
            return
        }

        if (data.res.hit === 'h') {
            AudioManager.playWeaponHit(this.weaponSoundType, this.autoAttackTarget.getBodySoundType())
        } else if (data.res.hit === 'b' && this.autoAttackTarget.getParrySoundType()) {
            AudioManager.playWeaponBlocked(this.autoAttackTarget.getParrySoundType()!)
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

    setMoveTypeAngle(movementType: string, angle: number) {
        this.movementType = movementType
        this.setMoveAngleAndSpeed(angle, this.movementType === 'RUN' ? this.runSpeed : this.walkSpeed)
    }

    setTargetPoint(point: Vector3 | null, resetAngleSpeedIfNull: boolean = true) {
        if (point == null) {
            this.targetBlock = null
            if (resetAngleSpeedIfNull) {
                this.setMoveAngleAndSpeed(0, 0)
            }
        } else {
            // if distance > 3 then movementType is run, otherwise walk
            const distance = Vector3.Distance(point, new Vector3(this.pos.x, 0, this.pos.z))
            this.movementType = distance > 4 ? 'RUN' : 'WALK'

            const angle = Math.atan2(-(point.z - this.pos.z), point.x - this.pos.x)
            this.setMoveAngleAndSpeed(angle - Math.PI / 4, this.movementType === 'RUN' ? this.runSpeed : this.walkSpeed)
            this.targetBlock = point
        }
    }

    setMoveAngleAndSpeed(angle: number | null, speed: number) {
        this.setMoveAngle(angle ? Utils.roundToTwoDecimals(angle): null)
        this.setActualSpeed(Utils.roundToOneDecimal(speed))
        Connector.sendMoveMessage(new MyCharMoveMsg())
    }

    getPositionRounded(): Vector3 {
        return new Vector3(Math.round(this.pos.x), Math.round(this.pos.y), Math.round(this.pos.z))
    }

    setMoveAngle(angle: number | null) {
        this.moveAngle = angle
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
