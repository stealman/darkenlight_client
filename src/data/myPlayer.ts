import { Vector3 } from '@babylonjs/core'
import { Utils } from '@/utils/utils'
import Character from '@/babylon/character/character'
import { CharacterModel } from '@/babylon/character/characterModel'
import { ref } from 'vue'
import { TargetingManager } from '@/gui/targettingManager'
import { Connector } from '@/network/connector'
import {
    AutoAttackBreak,
    HealingSelfAction,
    HealingTargetAction,
    StopAction,
} from '@/network/messages'
import { MyStatusPanel } from '@/gui/myStatusPanel'
import { AutoAttackMessage, AutoAttackResultMessage, HealingMessage, HealingResultMessage } from '@/network/messageIfs'
import { AudioManager } from '@/babylon/audio/audioManager'
import { ActionButtonsManager, CharacterAction, CharacterActions } from '@/gui/actionButtonsManager'
import { Attackable } from '@/GameManager'

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

    heartBeatSoundTime: 0 as number,

    activeAction: null as CharacterAction | null,

    async initialize(charData: any) {
        this.myChar = new Character(charData)
        this.myChar.initializeInventory(charData.inventory.items)
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

        // Resolve heartbeat sound
        this.resolveLowHealthStatus(actualTime)
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

    setAction(type: string | null) {
        if (type != null) {
            this.activeAction = CharacterActions.getActionByName(type)
        } else {
            this.activeAction = null
        }

        ActionButtonsManager.setActiveAction(this.activeAction)
        this.resolveStopButtonVisibility()
    },

    startAutoAttack(data: AutoAttackMessage) {
        this.myChar.startAutoAttack(data)
    },

    finishAutoAttack(data: AutoAttackResultMessage) {
        this.myChar.finishAutoAttack(data)
    },

    startHealingAction() {
        if (TargetingManager.selectedTarget && TargetingManager.selectedTarget.getObjectType() == 'C') {
            const tgt = TargetingManager.selectedTarget as Attackable

            if (tgt.hpPercent <= 99) {
                Connector.sendMessage(new HealingTargetAction(TargetingManager.selectedTarget.id, tgt.getObjectType()))
                return
            }
        }
        Connector.sendMessage(new HealingSelfAction())
    },

    startHealing(data: HealingMessage) {
        this.myChar.startHealing(data)
    },

    finishHealing(result: HealingResultMessage) {
        this.myChar.finishHealing(result)
        AudioManager.playBackpackHandle()
    },

    onClickEscape() {
        AudioManager.playGuiButtonClick()
        this.stopActions(true)
    },

    basicDataChange(data) {
        this.setMyCharHpMp(data.hp)
        this.myChar.basicDataChange(data)
    },

    setMyCharHpMp(hp: number) {
        const percentBeforeChange = (this.myChar.hp / this.myChar.maxHp) * 100
        this.myChar.hp = hp
        this.myChar.hpPercent = (hp / this.myChar.maxHp) * 100

        let vibrated = false
        if (this.myChar.hpPercent <= 25) {
            if (percentBeforeChange > 25) {
                AudioManager.playLowHealthWarning()
                this.heartBeatSoundTime = new Date().getTime()

                if (navigator.vibrate) {
                    navigator.vibrate(500)
                    vibrated = true
                }
            } else if (this.myChar.hpPercent < percentBeforeChange) {
                this.heartBeatSoundTime = new Date().getTime()
            }
        }

        if (this.myChar.hpPercent < percentBeforeChange - 5) {
            if (!vibrated && navigator.vibrate) {
                navigator.vibrate(100)
            }
        }
    },

    resolveLowHealthStatus(actualTime) {
        if (this.heartBeatSoundTime > 0 && (actualTime - this.heartBeatSoundTime) < 15000) {
            if (!AudioManager.heartBeatSound?.isPlaying) {
                AudioManager.playHeartBeat()
                AudioManager.setHeartBeatVolume(0.75)
            }
            const timeSinceLowHp = actualTime - this.heartBeatSoundTime
            const volume = 0.75 - (timeSinceLowHp / 15000)
            AudioManager.setHeartBeatVolume(volume)
        } else {
            AudioManager.stopHeartBeat()
        }
    },

    resolveStopButtonVisibility() {
        if (this.activeAction != null) {
            ActionButtonsManager.showStopButton()
        } else {
            ActionButtonsManager.hideStopButton()
        }
    },

    stopActions(resetTarget: boolean = false) {
        MyPlayer.myChar.autoAttackTarget = null
        Connector.sendMessage(new StopAction())

        if (resetTarget) {
            TargetingManager.unselectTarget()
        }
    }
}
