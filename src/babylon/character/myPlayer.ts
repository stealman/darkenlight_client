import {
    Scene,
    Vector3,
} from '@babylonjs/core'
import { WorldDataManager } from '@/data/worldDataManager'
import { CharacterModel } from '@/babylon/character/characterModel'
import { Utils } from '@/utils/utils'
import { Data } from '@/data/globalData'
import { MyCharMoveMsg } from '@/network/messages'
import { Connector } from '@/network/connector'

export const MyPlayer = {
    scene: null as Scene | null,
    charModel: null as CharacterModel | null,

    movementType: 'WALK',
    boxSize: 0.8,
    autoAttackActive: false,
    autoAttackEnd: 0,

    async initialize(scene: Scene) {
        this.charModel = await CharacterModel.create(Data.myChar, scene)
        Data.myChar.pos.y = Utils.calculateYPos(Data.myChar.pos.x, Data.myChar.pos.z, this.boxSize)
        Data.myChar.logicYpos = Data.myChar.pos.y
    },

    onFrame(timeRate: number, actualTime: number) {
        if (this.autoAttackActive && actualTime - Data.myChar.lastAttackTime > Data.myChar.attackCooldown && this.autoAttackEnd <= actualTime) {
            Data.myChar.lastAttackTime = actualTime
            this.autoAttackEnd = actualTime + Data.myChar.attackAnimationTime
            this.charModel?.doAttackAnimation()
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
            const speed = Data.myChar.getActualSpeed()
            const angle = Utils.roundToTwoDecimals(Data.myChar.getMoveAngle()! + Math.PI / 4)
            let tgtPos = new Vector3(Data.myChar.pos.x + Math.cos(angle) * speed * timeRate, 0, Data.myChar.pos.z -Math.sin(angle) * speed * timeRate)

            // Check if player can move to the target position, if not try to find an alternate position
            if (Utils.isMovementCollision(this.boxSize, new Vector3(Data.myChar.pos.x, 0, Data.myChar.pos.z), tgtPos)) {
                const alternateMovementPos = Utils.getAlternateMovementPos(this.boxSize, angle, Data.myChar.pos.x, Data.myChar.pos.z, tgtPos.x, tgtPos.z, speed, timeRate)
                if (alternateMovementPos != null) {
                    tgtPos = alternateMovementPos
                } else {
                    tgtPos = new Vector3(Data.myChar.pos.x, 0, Data.myChar.pos.z)
                }
                Connector.sendMoveMessage(new MyCharMoveMsg())
            }

            if (tgtPos.x < 1 || tgtPos.z < 1 || tgtPos.x > WorldDataManager.worldDataMap.get(Data.worldId)!.worldSize - 2 || tgtPos.z > WorldDataManager.worldDataMap.get(Data.worldId)!.worldSize - 2) {
                tgtPos = new Vector3(Data.myChar.pos.x, 0, Data.myChar.pos.z)
                this.setMoveAngleAndSpeed(0, 0)
            } else {
                Data.myChar.pos.x = tgtPos.x
                Data.myChar.pos.z = tgtPos.z
                Data.myChar.logicYpos = Utils.calculateYPos(Data.myChar.pos.x, Data.myChar.pos.z, this.boxSize)
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
