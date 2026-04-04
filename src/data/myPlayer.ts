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
import {
    AffectGroupData,
    AutoAttackMessage,
    AutoAttackResultMessage,
    HealingMessage,
    HealingResultMessage,
    PotionUsedMessage,
} from '@/network/messageIfs'
import { AudioManager } from '@/babylon/audio/audioManager'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { Attackable } from '@/GameManager'
import { EmeraldsManager } from '@/gui/emeraldsManager'
import { InventoryManager } from '@/data/InventoryManager'
import { GuiButtonsManager } from '@/gui/guiButtonsManager'
import { CharacterAction, CharacterActions } from '@/data/actions/characterActions'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import { StaticObjectsCodebook } from '@/babylon/world/statics/staticsCodebook'
import { ClientAffectGroup } from '@/data/affects'

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

    lastPotionUseTime: 0 as number,
    nextPotionUseTime: 0 as number,
    nearFireplace: null as { x: number, z: number } | null,

    affectGroups: [] as ClientAffectGroup[],

    async initialize(charData: any) {
        console.log("Initializing MyPlayer with charData:", charData)
        this.myChar = new Character(charData, true)
        this.myChar.initializeInventory(charData.inventory.items)
        this.myChar.insideView = true
        await this.myChar.createModel(true)
        this.myModel = this.myChar.model as CharacterModel

        this.myChar.pos.y = Utils.calculateWalkYPos(this.myChar.pos.x, this.myChar.pos.z, this.myChar.getBoxSize())
        this.myChar.logicYpos = this.myChar.pos.y
        this.myCharRef.value = this.myChar

        if (charData.aff) {
            charData.aff.forEach((group: AffectGroupData) => {
                this.affectGroupChange(group)
            })
        }
        if (charData.act) {
            this.setAction(charData.act)
        }

        MyStatusPanel.setMyName(this.myChar.name)
        MyStatusPanel.refreshAffectGroups()
        EmeraldsManager.setMyEmeralds(charData.emeralds, true, charData.emeralds, null)
    },

    reset() {
        this.myChar.model = null
        this.myChar.autoAttackStart = 0
        this.myChar.autoAttackEnd = 0
    },

    onFrame(timeRate: number, actualTime: number) {
        const coveredBlockCoords = Utils.getCoveredBlocks(this.myChar.pos.x, this.myChar.pos.z, this.myChar.getBoxSize())

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

        // Moving during gathering actions breaks the action immediately
        if ((MyPlayer.activeAction?.name === CharacterActions.MINING.name || MyPlayer.activeAction?.name === CharacterActions.LUMBERJACKING.name) && this.myChar.getMoveAngle() != null) {
            this.myChar.breakAutoAttack() // Mining action uses auto attack system, so we can reuse the same break message
            Connector.sendMessage(new AutoAttackBreak())
            this.myChar.finishGathering(null)
        }

        if (MyPlayer.activeAction?.name === CharacterActions.CAMPING.name && this.myChar.getMoveAngle() != null) {
            Connector.sendMessage(new StopAction())
            this.myChar.clearTimedAction()
        }

        // Resolve common character onFrame logic
        this.myChar.onFrame(timeRate, actualTime, true)

        // Resolve heartbeat sound
        this.resolveLowHealthStatus(actualTime)

        // Check if near fireplace
        this.nearFireplace = this.checkIsNearFireplace(coveredBlockCoords)
    },

    checkIsNearFireplace(coveredBlockCoords: { x: number, z: number }[]): { x: number, z: number } | null {
        if (coveredBlockCoords.length === 0) {
            return null
        }

        for (const block of coveredBlockCoords) {
            for (const obj of StaticsManager.allStatics) {
                if (obj.type !== 241 && obj.type !== 242) {
                    continue
                }

                const fireX = Math.floor(obj.position.x)
                const fireZ = Math.floor(obj.position.z)
                const fireSize = StaticObjectsCodebook.get(obj.type)?.size || 1
                const fireMaxX = fireX + fireSize - 1
                const fireMaxZ = fireZ + fireSize - 1

                const isNearFireplace = block.x >= fireX - 1 && block.x <= fireMaxX + 1
                    && block.z >= fireZ - 1 && block.z <= fireMaxZ + 1
                if (isNearFireplace) {
                    return { x: fireX, z: fireZ }
                }
            }
        }

        return null
    },

    startMove(movementType: string, angle: number) {
        // only move if angle differs from current by at least 0.1 rad
        const currentAngle = this.myChar.getMoveAngle()
        if (movementType === this.myChar.getMoveType() && currentAngle != null && Math.abs(currentAngle - angle) < 0.1) {
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
        GuiButtonsManager.setActiveAction(this.activeAction)
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

    potionUsed(data: PotionUsedMessage) {
        this.myChar.potionUsed()
        this.lastPotionUseTime = new Date().getTime()
        this.nextPotionUseTime = new Date().getTime() + data.cd
        if (data.add === 'HP') {
            OverlayManager.addMyCharDamageNumber(MyPlayer.myChar, -data.val, 'h')
        }
    },

    onClickEscape() {
        AudioManager.playGuiButtonClick()
        this.stopActions(true)
    },

    basicDataChange(data) {
        this.setMyCharHp(data.hp)
        this.myChar.basicDataChange(data)
    },

    setMyCharHp(hp: number) {
        const percentBeforeChange = (this.myChar.hp / this.myChar.maxHp) * 100
        this.myChar.hp = hp

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

    stopActions(resetTarget: boolean = false) {
        MyPlayer.myChar.autoAttackTarget = null
        Connector.sendMessage(new StopAction())

        if (resetTarget) {
            TargetingManager.unselectTarget()
        }
    },

    hasWaponTypeInHandOrInventory(weaponType: string): boolean {
        const equippedWeapon = this.myChar?.getWeapon()
        if (equippedWeapon?.slotInfo?.weaponType === weaponType) {
            return true
        }

        return InventoryManager.inventory.some(item => item?.slotInfo?.weaponType === weaponType)
    },

    affectGroupChange(affectGroup: AffectGroupData) {
        const clientAffectGroup = ClientAffectGroup.fromServerData(affectGroup)

        const existingGroupIndex = this.affectGroups.findIndex(group => group.id === clientAffectGroup.id)
        if (existingGroupIndex !== -1) {
            if (clientAffectGroup.af.length === 0) {
                this.affectGroups.splice(existingGroupIndex, 1)
            } else {
                this.affectGroups[existingGroupIndex] = clientAffectGroup
            }
        } else if (clientAffectGroup.af.length > 0) {
            this.affectGroups.push(clientAffectGroup)
        }

        MyStatusPanel.refreshAffectGroups()
    },

    getActionCooldownPercent(action: CharacterAction, actualTime: number): number {
        if (!action) return 100

        switch (action.name) {
            case CharacterActions.AUTO_ATTACK.name: {
                return this.getCooldownPercent(actualTime, this.myChar.autoAttackStart, this.myChar.autoAttackCooldownEnd)
            }
            case CharacterActions.HEAL.name: {
                return this.getCooldownPercent(actualTime, this.myChar.healingStartTime, this.myChar.healingEndTime)
            }
            case CharacterActions.HEALING_POTION.name:
            case CharacterActions.MANA_POTION.name: {
                return this.getCooldownPercent(actualTime, this.lastPotionUseTime, this.nextPotionUseTime)
            }
        }
        return 100
    },

    getCooldownPercent(actualTime: number, cooldownStartTime: number, cooldownEndTime: number): number {
        if (cooldownEndTime <= actualTime) {
            return 100
        }

        const totalCooldown = cooldownEndTime - cooldownStartTime
        if (cooldownStartTime <= 0 || totalCooldown <= 0) {
            return 100
        }

        const elapsedCooldown = actualTime - cooldownStartTime
        return Math.max(0, Math.min(100, (elapsedCooldown / totalCooldown) * 100))
    },
}
