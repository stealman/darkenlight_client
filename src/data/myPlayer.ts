import {
    Scene, Vector3,
} from '@babylonjs/core'
import { Utils } from '@/utils/utils'
import Character from '@/babylon/character/character'
import { CharacterModel } from '@/babylon/character/characterModel'
import { ref } from 'vue'
import { TargetingManager } from '@/gui/targettingManager'
import { Connector } from '@/network/connector'
import { AutoAttackBreak } from '@/network/messages'
import { WeaponTypes } from '@/data/items/item'

/**
 * Controlling object for the player's character
 */
export const MyPlayer = {
    visibilityRadius: 32 as number,

    myChar: null as Character,
    myModel: null as CharacterModel | null,
    myCharRef: ref(null as Character | null),

    worldId: 0 as number,
    worldName: "" as string,
    aaActive: true as boolean,

    async initialize(charData: any) {
        this.myChar = new Character(charData)
        await this.myChar.createModel(true)
        this.myModel = this.myChar.model as CharacterModel

        this.myChar.pos.y = Utils.calculateYPos(this.myChar.pos.x, this.myChar.pos.z, this.myChar.getBoxSize())
        this.myChar.logicYpos = this.myChar.pos.y
        this.myCharRef.value = this.myChar
    },

    reset() {
        this.myChar.model = null
        this.myChar.autoAttackEnd = 0
    },

    startAutoAttack(data: any) {
        //console.log("Starting auto attack", data)
        this.myChar.startAutoAttack(data)
    },

    finishAutoAttack(data: any) {
        //console.log("Finishing auto attack", data)
        this.myChar.finishAutoAttack(data)
    },

    onFrame(timeRate: number, actualTime: number) {

        // Cancel auto attack immediately if moving away from target
        if (this.myChar.autoAttackEnd > actualTime) {
            if (TargetingManager.selectedTarget && this.myChar.getMoveAngle() != null) {
                const myPos = this.myChar.pos
                const targetPos = TargetingManager.selectedTarget.pos
                const moveAngle = this.myChar.getMoveAngle()!
                const toTarget = targetPos.subtract(myPos).normalize()
                const moveDir = new Vector3(Math.cos(moveAngle), 0, -Math.sin(moveAngle)).normalize()
                const dot = Vector3.Dot(moveDir, toTarget)
                if (dot < -0.5 || (this.myChar.isWeaponRanged())) {
                    this.myChar.autoAttackEnd = 0
                    this.myModel?.setWeaponTrailEnabled(false)
                    this.myModel?.stopAnimation()
                    Connector.sendMessage(new AutoAttackBreak())
                }
            }
        }

        // Resolve common character onFrame logic
        this.myChar.onFrame(timeRate, actualTime, true)
    },

    startMove(movementType: string, angle: number) {
        // only move if angle differs from current by at least 0.1 rad
        const currentAngle = this.myChar.getMoveAngle()
        if (movementType === this.myChar.movementType && currentAngle != null && Math.abs(currentAngle - angle) < 0.1) {
            return
        }
        this.myChar.startMove(movementType, angle)
    },

    stopMove() {
        this.myChar.stopMove()
    },
}
