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

export const MyPlayer = {
    scene: null as Scene | null,
    charModel: null as CharacterModel | null,

    movementType: 'WALK',
    autoAttackEnd: 0,

    async initialize(scene: Scene) {
        this.charModel = await CharacterModel.create(Data.myChar, scene)
        Data.myChar.pos.y = Utils.calculateYPos(Data.myChar.pos.x, Data.myChar.pos.z, Data.myChar.getBoxSize())
        Data.myChar.logicYpos = Data.myChar.pos.y
    },

    doAutoAttack(data: any) {
        const actualTime = Date.now()
        Data.myChar.attackAnimationTime = data.dur
        this.autoAttackEnd = actualTime + Data.myChar.attackAnimationTime

        if (TargetingManager.selectedTarget) {
            const angle = Utils.getAngleBetweenPoints(Data.myChar.pos, TargetingManager.selectedTarget!.pos)
            Data.myChar.setLookAngle(angle - Math.PI / 4)
        }

        this.charModel?.doAttackAnimation()
    },

    resultAutoAttack(data: any) {
        console.log(data.res)
    },

    onFrame(timeRate: number, actualTime: number) {
        // Auto attack in progress
        if (this.autoAttackEnd > actualTime) {

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
                    Connector.sendMessage(new AutoAttackBreak())
                }
            }
        }

        if (this.autoAttackEnd > actualTime) {
            this.charModel?.onFrame(timeRate)
            return
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

            if (this.movementType === 'RUN') { this.charModel?.startRunAnimation() }
            if (this.movementType === 'WALK') { this.charModel?.startWalkAnimation() }
        } else {
            this.charModel?.stopAnimation()
        }

        this.charModel?.onFrame(timeRate)
    },

    setMoveTypeAngle(movementType: string, angle: number) {
        this.movementType = movementType
        this.setMoveAngleAndSpeed(angle, this.movementType === 'RUN' ? Data.myChar.runSpeed : Data.myChar.walkSpeed)

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
            this.movementType = distance > 4 ? 'RUN' : 'WALK'

            const angle = Math.atan2(-(point.z - Data.myChar.pos.z), point.x - Data.myChar.pos.x)
            this.setMoveAngleAndSpeed(angle - Math.PI / 4, this.movementType === 'RUN' ? Data.myChar.runSpeed : Data.myChar.walkSpeed)
            Data.myChar.targetBlock = point
        }
    },

    setMoveAngleAndSpeed(angle: number | null, speed: number) {
        Data.myChar.setMoveAngle(angle ? Utils.roundToTwoDecimals(angle): null)
        Data.myChar.setActualSpeed(Utils.roundToOneDecimal(speed))

        Connector.sendMoveMessage(new MyCharMoveMsg())
    }
}
