import {
    Scene, Vector3,
} from '@babylonjs/core'
import { WorldDataManager } from '@/data/worldDataManager'
import { CharacterModel } from '@/babylon/character/characterModel'
import { Utils } from '@/utils/utils'
import { Data } from '@/data/globalData'
import { AutoAttackBreak, MyCharMoveMsg } from '@/network/messages'
import { Connector } from '@/network/connector'
import { TargetingManager } from '@/gui/targettingManager'
import { AudioManager } from '@/babylon/audio/audioManager'
import { Attackable } from '@/GameManager'

export const MyPlayer = {
    charModel: null as CharacterModel | null,

    autoAttackTarget: null as Attackable | null,
    autoAttackEnd: 0,

    async initialize(scene: Scene) {
        this.charModel = await CharacterModel.create(Data.myChar, scene)
        Data.myChar.pos.y = Utils.calculateYPos(Data.myChar.pos.x, Data.myChar.pos.z, Data.myChar.getBoxSize())
        Data.myChar.logicYpos = Data.myChar.pos.y
    },

    reset() {
        this.charModel = null
        this.autoAttackTarget = null
        this.autoAttackEnd = 0
    },

    doAutoAttack(data: any) {
        this.autoAttackTarget = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt)
        if (!this.autoAttackTarget) {
            return
        }
        const actualTime = Date.now()
        Data.myChar.attackAnimationTime = data.dur
        this.autoAttackEnd = actualTime + Data.myChar.attackAnimationTime

        const angle = Utils.getAngleBetweenPoints(Data.myChar.pos, this.autoAttackTarget.pos)
        Data.myChar.setLookAngle(angle - Math.PI / 4)
        this.charModel?.doAttackAnimation()
        this.charModel?.weaponMesh.trailMesh!.setEnabled(true)
    },

    autoAttackFinished(data: any) {
        this.charModel?.weaponMesh.trailMesh!.setEnabled(false)
        AudioManager.playWeaponSwing(Data.myChar.weaponSoundType)
        if (!this.autoAttackTarget) {
            return
        }

        if (data.res.hit === 'h') {
            AudioManager.playWeaponHit(Data.myChar.weaponSoundType, this.autoAttackTarget.getBodySoundType())
        } else if (data.res.hit === 'b' && this.autoAttackTarget.getParrySoundType()) {
            AudioManager.playWeaponBlocked(this.autoAttackTarget.getParrySoundType()!)
        }
    },

    onFrame(timeRate: number, actualTime: number) {
        // Auto attack in progress
        if (this.autoAttackEnd > actualTime) {
            Data.myChar.resolveStepMark(actualTime, true)

            // Cancel auto attack immediately if moving away from target
            if (TargetingManager.selectedTarget && Data.myChar.getMoveAngle() != null) {
                const myPos = Data.myChar.pos
                const targetPos = TargetingManager.selectedTarget.pos
                const moveAngle = Data.myChar.getMoveAngle()!
                const toTarget = targetPos.subtract(myPos).normalize()
                const moveDir = new Vector3(Math.cos(moveAngle), 0, -Math.sin(moveAngle)).normalize()
                const dot = Vector3.Dot(moveDir, toTarget)
                if (dot < -0.5) {
                    this.autoAttackEnd = 0
                    this.charModel?.weaponMesh.trailMesh!.setEnabled(false)
                    Connector.sendMessage(new AutoAttackBreak())
                }
            }
        }

        if (this.autoAttackEnd > actualTime) {
            this.charModel?.onFrame(timeRate)
            return
        } else {

        }

        if (Data.myChar.targetBlock != null) {
            const targetBlock = Data.myChar.targetBlock
            const dx = Math.abs(targetBlock.x - Data.myChar.pos.x)
            const dz = Math.abs(targetBlock.z - Data.myChar.pos.z)

            if (dx < 0.1 && dz < 0.1) {
                Data.myChar.targetBlock = null
                this.setMoveAngleAndSpeed(0, 0)
            }
        }

        if (Data.myChar.getMoveAngle() != null) {
            Data.myChar.setLookAngle(Data.myChar.getMoveAngle())
            const speed = Data.myChar.getActualSpeed()
            const angle = Utils.roundToTwoDecimals(Data.myChar.getMoveAngle()! + Math.PI / 4)
            let tgtPos = new Vector3(Data.myChar.pos.x + Math.cos(angle) * speed * timeRate, 0, Data.myChar.pos.z -Math.sin(angle) * speed * timeRate)

            // Check if player can move to the target position, if not try to find an alternate position
            if (Utils.isMovementCollision(Data.myChar.getBoxSize(), new Vector3(Data.myChar.pos.x, 0, Data.myChar.pos.z), tgtPos)) {
                const alternateMovementPos = Utils.getAlternateMovementPos(Data.myChar.getBoxSize(), angle, Data.myChar.pos.x, Data.myChar.pos.z, tgtPos.x, tgtPos.z, speed, timeRate)
                if (alternateMovementPos != null) {
                    tgtPos = alternateMovementPos
                } else {
                    tgtPos = new Vector3(Data.myChar.pos.x, 0, Data.myChar.pos.z)
                }
                Connector.sendMoveMessage(new MyCharMoveMsg())
            }

            // Check world boundaries
            if (tgtPos.x < 1 || tgtPos.z < 1 || tgtPos.x > WorldDataManager.worldDataMap.get(Data.worldId)!.worldSize - 2 || tgtPos.z > WorldDataManager.worldDataMap.get(Data.worldId)!.worldSize - 2) {
                tgtPos = new Vector3(Data.myChar.pos.x, 0, Data.myChar.pos.z)
                this.setMoveAngleAndSpeed(0, 0)
            } else {
                Data.myChar.pos.x = tgtPos.x
                Data.myChar.pos.z = tgtPos.z
                Data.myChar.logicYpos = Utils.calculateYPos(Data.myChar.pos.x, Data.myChar.pos.z, Data.myChar.getBoxSize())
            }

            if (Data.myChar.movementType === 'RUN') { this.charModel?.startRunAnimation() }
            if (Data.myChar.movementType === 'WALK') { this.charModel?.startWalkAnimation() }
            Data.myChar.resolveStepMark(actualTime, false)
        } else {
            this.charModel?.stopAnimation()
        }
        this.charModel?.onFrame(timeRate)
    },

    setMoveTypeAngle(movementType: string, angle: number) {
        Data.myChar.movementType = movementType
        this.setMoveAngleAndSpeed(angle, Data.myChar.movementType === 'RUN' ? Data.myChar.runSpeed : Data.myChar.walkSpeed)

    },

    setTargetPoint(point: Vector3 | null, resetAngleSpeedIfNull: boolean = true) {
        if (point == null) {
            Data.myChar.targetBlock = null
            if (resetAngleSpeedIfNull) {
                this.setMoveAngleAndSpeed(0, 0)
            }
        } else {
            // if distance > 3 then movementType is run, otherwise walk
            const distance = Vector3.Distance(point, new Vector3(Data.myChar.pos.x, 0, Data.myChar.pos.z))
            Data.myChar.movementType = distance > 4 ? 'RUN' : 'WALK'

            const angle = Math.atan2(-(point.z - Data.myChar.pos.z), point.x - Data.myChar.pos.x)
            this.setMoveAngleAndSpeed(angle - Math.PI / 4, Data.myChar.movementType === 'RUN' ? Data.myChar.runSpeed : Data.myChar.walkSpeed)
            Data.myChar.targetBlock = point
        }
    },

    setMoveAngleAndSpeed(angle: number | null, speed: number) {
        Data.myChar.setMoveAngle(angle ? Utils.roundToTwoDecimals(angle): null)
        Data.myChar.setActualSpeed(Utils.roundToOneDecimal(speed))

        Connector.sendMoveMessage(new MyCharMoveMsg())
    }
}
