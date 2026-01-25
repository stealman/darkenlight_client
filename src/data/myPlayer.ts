import { Vector3 } from '@babylonjs/core'
import { Utils } from '@/utils/utils'
import Character from '@/babylon/character/character'
import { CharacterModel } from '@/babylon/character/characterModel'
import { ref } from 'vue'
import { TargetingManager } from '@/gui/targettingManager'
import { Connector } from '@/network/connector'
import { AutoAttackBreak, StopAction } from '@/network/messages'
import { MyStatusPanel } from '@/gui/myStatusPanel'
import { AutoAttackMessage, AutoAttackResultMessage } from '@/network/messageIfs'
import { AudioManager } from '@/babylon/audio/audioManager'
import { ActionButtonActions, ActionButtonsManager } from '@/gui/actionButtonsManager'

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

    aaActionActive: false as boolean,

    async initialize(charData: any) {
        this.myChar = new Character(charData)
        this.myChar.insideView = true
        await this.myChar.createModel(true)
        this.myModel = this.myChar.model as CharacterModel

        this.myChar.pos.y = Utils.calculateYPos(this.myChar.pos.x, this.myChar.pos.z, this.myChar.getBoxSize())
        this.myChar.logicYpos = this.myChar.pos.y
        this.myCharRef.value = this.myChar

        MyStatusPanel.setMyName(this.myChar.name)
    },

    reset() {
        this.myChar.model = null
        this.myChar.autoAttackEnd = 0
    },

    startAutoAttack(data: AutoAttackMessage) {
        this.myChar.startAutoAttack(data)
        ActionButtonsManager.activated(ActionButtonActions.AUTO_ATTACK)
    },

    finishAutoAttack(data: AutoAttackResultMessage) {
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
                    this.myChar.breakAutoAttack()
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

    onClickEscape() {
        AudioManager.playGuiButtonClick()

        // Stop AA
        MyPlayer.myChar.autoAttackTarget = null
        ActionButtonsManager.deactivated(ActionButtonActions.AUTO_ATTACK)
        Connector.sendMessage(new StopAction())
    },

    basicDataChange(data) {
        this.setMyCharHpMp(data.hp)
        this.myChar.basicDataChange(data)
    },

    setMyCharHpMp(hp: number) {
        const percentBeforeChange = (this.myChar.hp / this.myChar.maxHp) * 100
        this.myChar.hp = hp
        this.myChar.hpPercent = (hp / this.myChar.maxHp) * 100

        if (percentBeforeChange > 25 && this.myChar.hpPercent <= 25) {
            AudioManager.playLowHealthWarning()
        }
    }
}
