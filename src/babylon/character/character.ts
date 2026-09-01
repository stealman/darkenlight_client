import { Attackable } from '@/GameManager'
import { TransformNode, Vector3 } from '@babylonjs/core'
import {
    AudioManager,
    BodySoundTypes,
    FootStepTypes,
    WeaponSoundTypes,
} from '@/babylon/audio/audioManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { StepMarksRenderer } from '@/babylon/world/stepMarksRenderer'
import { ViewportManager } from '@/utils/viewport'
import { CharacterModel } from '@/babylon/character/characterModel'
import { Utils } from '@/utils/utils'
import { Connector } from '@/network/connector'
import { MyCharMoveMsg } from '@/network/messages'
import { MyPlayer } from '@/data/myPlayer'
import { EquipItemSlots, EquipSlotModelsCb, Item, WeaponCategories, WeaponTypes } from '@/data/items/item'
import { Arrow, ArrowsManager } from '@/babylon/world/arrowsManager'
import {
    AttackableBasicTO,
    AutoAttackMessage,
    AutoAttackResultMessage,
    CharacterCampingMessage,
    CharacterCraftingMessage,
    CharacterCraftingResultMessage,
    CharacterGatheringMessage,
    CharacterGatheringResultMessage,
    CharacterRestingMessage,
    HealingMessage,
    HealingResultMessage,
} from '@/network/messageIfs'
import { TargetingManager } from '@/gui/targettingManager'
import { CharacterManager } from '@/babylon/character/characterManager'
import { InventoryManager } from '@/data/inventoryManager'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import { EffectTarget } from '@/babylon/gfx/characterEffect'
import { GfxManager } from '@/babylon/gfx/gfxManager'
import { PotionConsumeEffect } from '@/babylon/gfx/potionConsumeEffect'
import { WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import { CharacterActions, CharacterTimedAction } from '@/data/actions/characterActions'
import { PubliclyVisibleAffect } from '@/data/affects'
import { GameClass, GameClasses } from '@/data/gameClass'

class Character implements Attackable, EffectTarget {
    model: CharacterModel | null = null
    insideView: boolean = true

    id: number = 1
    hp: number = 100
    maxHp: number = 100
    hpPercent: number = 100
    mp: number = 100
    maxMp: number = 100
    mpPercent: number = 100
    st: number = 100
    maxSt: number = 100
    stPercent: number = 100

    name: string = "Player"
    nameDisplayTime: number = 0
    gameClass: GameClass = GameClasses.FIGHTER
    className: string = GameClasses.FIGHTER.key

    boxSize: number = 0.8
    walkSpeed: number = 1
    runSpeed: number = 1
    yMoveSpeed: number = 15 // Only for client purposes (jumping, falling)

    pos: Vector3
    logicYpos: number = 0

    private movementType: string = 'N' // N - None, W - Walk, R - Run
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

    autoAttackMessage: AutoAttackMessage | null = null
    autoAttackTarget: Attackable | null = null
    autoAttackStart: number = 0
    autoAttackEnd: number = 0
    autoAttackCooldownEnd: number = 0
    arrowCreateTime: number = 0
    arrowShotTime: number = 0
    arrow: Arrow | null = null
    lastCombatActivityTime: number = 0

    healingActive: boolean = false
    healSelf: boolean = false
    healingStartTime: number = 0
    healingEndTime: number = 0

    activeTimedAction: CharacterTimedAction | null = null
    publiclyVisibleAffects: Map<number, PubliclyVisibleAffect> = new Map<number, PubliclyVisibleAffect>()

    constructor(data: any, myChar: boolean = false) {
        this.id = data.id
        if (data.hpp != null) {
            this.hpPercent = data.hpp
        }
        if (myChar) {
            this.hp = data.hp
            this.mp = data.mp
            this.st = data.st
            this.maxHp = data.mhp
            this.hpPercent = (this.hp / this.maxHp) * 100
            this.maxMp = data.mmp
            this.mpPercent = (this.mp / this.maxMp) * 100
            this.maxSt = data.mst
            this.stPercent = (this.st / this.maxSt) * 100

            this.walkSpeed = data.spd1
            this.runSpeed = data.spd2
        }

        this.pos = new Vector3(data.x, 0, data.z)
        this.name = data.name
        const gameClassKey = data.gameClass?.key ?? data.cls
        this.gameClass = GameClasses.getByKey(gameClassKey) || GameClasses.FIGHTER
        this.className = this.gameClass.key
        this.boxSize = data.bsz
        this.pos.y = Utils.calculateWalkYPos(this.pos.x, this.pos.z, this.getBoxSize())
        this.logicYpos = this.pos.y

        this.initializeEquip(data.equipSet)
    }

    async createModel(init: boolean) {
        this.model = await CharacterModel.create(this, init)
    }

    initializeEquip(equip: any) {
        if (equip.weapon) {
            this.equipSet.set(EquipSlotModelsCb.getById(equip.weapon.mId)!.slot, Item.fromData(equip.weapon))
        }
        if (equip.body) {
            this.equipSet.set(EquipSlotModelsCb.getById(equip.body.mId)!.slot, Item.fromData(equip.body))
        }
        if (equip.head) {
            this.equipSet.set(EquipSlotModelsCb.getById(equip.head.mId)!.slot, Item.fromData(equip.head))
        }
        if (equip.arms) {
            this.equipSet.set(EquipSlotModelsCb.getById(equip.arms.mId)!.slot, Item.fromData(equip.arms))
        }
        if (equip.legs) {
            this.equipSet.set(EquipSlotModelsCb.getById(equip.legs.mId)!.slot, Item.fromData(equip.legs))
        }
        if (equip.necklace) {
            this.equipSet.set('NECKLACE', Item.fromData(equip.necklace))
        }
        if (equip.ring1) {
            this.equipSet.set('L_RING', Item.fromData(equip.ring1))
        }
        if (equip.ring2) {
            this.equipSet.set('R_RING', Item.fromData(equip.ring2))
        }
        if (equip.trinket) {
            this.equipSet.set('TRINKET', Item.fromData(equip.trinket))
        }
    }

    changeEquipSet(equipSet: any) {
        this.equipSet.clear()
        this.initializeEquip(equipSet)
        if (this.model && this.model.initialized) {
            this.model.clearAllEquippedItems()
            this.model.assignEquippedItems()
        }
    }

    initializeInventory(items: any[]) {
        InventoryManager.inventory = items.map(itemData => Item.fromData(itemData))
        InventoryManager.sortInventory()
    }

    onFrame(timeRate: number, actualTime: number, myChar: boolean) {
        this.resolveTimedAction(actualTime)

        // Auto attack in progress
        if (this.autoAttackEnd > actualTime) {
            this.resolveStepMark(actualTime, true)
            this.model?.onFrame(timeRate)

            if (this.arrowCreateTime > 0 && Date.now() >= this.arrowCreateTime && this.autoAttackTarget && (this.insideView || this.autoAttackTarget!.insideView)) {
                this.arrow = ArrowsManager.addArrow(this, this.autoAttackTarget, this.arrowShotTime, this.autoAttackMessage?.ef)
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
                this.logicYpos = Utils.calculateWalkYPos(this.pos.x, this.pos.z, this.getBoxSize())
            }

            if (this.movementType === 'R') { this.model?.startRunAnimation(this.getActualSpeed() / 3.2) }
            if (this.movementType === 'W') { this.model?.startWalkAnimation(this.getActualSpeed() / 2) }
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

    markCombatActivity() {
        this.lastCombatActivityTime = Date.now()
    }

    isRecentlyInCombat() {
        return Date.now() - this.lastCombatActivityTime <= 10000
    }

    startAutoAttack(data: AutoAttackMessage) {
        this.autoAttackMessage = data
        this.autoAttackTarget = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt)
        if (!this.autoAttackTarget) {
            return
        }
        this.markCombatActivity()
        if (this.autoAttackTarget instanceof Character) {
            this.autoAttackTarget.markCombatActivity()
        }

        if (TargetingManager.selectedTarget === null) {
            TargetingManager.setSelectedTarget(this.autoAttackTarget)
        }

        // Ranged weapon attack animation is shorter to account for arrow travel time
        this.attackAnimationTime = data.dur
        if (this.isWeaponRanged()) {
            const dist = Vector3.Distance(this.pos, this.autoAttackTarget.pos)
            this.attackAnimationTime = data.dur - (100 * dist / 5)
            this.arrowCreateTime = Date.now() + data.dur * 0.3
            this.arrowShotTime = Date.now() + this.attackAnimationTime
        }

        this.autoAttackStart = Date.now()
        this.autoAttackEnd = this.autoAttackStart + this.attackAnimationTime
        this.autoAttackCooldownEnd = this.autoAttackStart + data.cd

        const angle = Utils.getAngleBetweenPoints(this.pos, this.autoAttackTarget.pos)
        this.setLookAngle(angle - Math.PI / 4)
        this.model?.doAttackAnimation()
        this.model?.setWeaponTrailEnabled(true)
    }

    breakAutoAttack() {
        this.autoAttackStart = 0
        this.autoAttackEnd = 0
        this.autoAttackCooldownEnd = 0
        this.model?.setWeaponTrailEnabled(false)
        this.model?.stopAnimation()
        this.arrowCreateTime = 0
        this.arrowShotTime = 0
        this.arrow?.dispose()
    }

    finishAutoAttack(data: AutoAttackResultMessage) {
        this.model?.setWeaponTrailEnabled(false)

        // Swing sound for melee weapons - ranged weapons have it when arrow is fired
        if (!this.isWeaponRanged()) AudioManager.playWeaponSwing(this.weaponSoundType, this.pos)

        const target = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt)
        if (!target) {
            return
        }
        if (target instanceof Character) {
            target.markCombatActivity()
        }
        target.hpPercent = data.res.tgt.hpp
        if (target === MyPlayer.myChar) {
            MyPlayer.setMyCharHp(data.res.tgt.hp)
        }
        if (data.res.h === 'h') {
            AudioManager.playWeaponHit(this.weaponSoundType, target.getBodySoundType(), target.pos)
        } else if (data.res.h === 'b' && target.getParrySoundType()) {
            AudioManager.playWeaponBlocked(target.getParrySoundType()!, target.pos)
        }
    }

    startGathering(data: CharacterGatheringMessage) {
        this.attackAnimationTime = data.dur

        const angle = Utils.getAngleBetweenPoints(this.pos, new Vector3(data.x, this.pos.y, data.z))
        this.setLookAngle(angle - Math.PI / 4)

        if (data.gt === 'M') {
            this.model?.doOreMiningAnimation()
        }
        if (data.gt === 'L') {
            this.model?.doLumberJackingAnimation()
        }
        this.model?.setWeaponTrailEnabled(true)
        this.autoAttackEnd = Date.now() + this.attackAnimationTime
    }

    finishGathering(data: CharacterGatheringResultMessage | null) {
        this.model?.setWeaponTrailEnabled(false)
        if (data) {
            if (data.gt === 'M') {
                AudioManager.playMiningSound(this.pos)
            }
            if (data.gt === 'L') {
                AudioManager.playLumberJackingSound(this.pos)
            }

            if (this === MyPlayer.myChar && data.g > 0) {
                const items = InventoryManager.getResourceItemsByType(data.g)
                if (items.length > 0) {
                    OverlayManager.addCharacterItemGainNumber(this, data.q, items[0])
                }
            }
        }
    }

    startHealing(data: HealingMessage) {
        this.healingActive = true
        this.healingStartTime = Date.now()
        this.healingEndTime = Date.now() + data.dur
        this.healSelf = data.tgt === this.id && data.tp === 'C'
    }

    startTimedAction(type: string, data: CharacterTimedActionData) {
        this.clearTimedAction()

        if (data.x != null && data.z != null) {
            const angle = Utils.getAngleBetweenPoints(this.pos, new Vector3(data.x, this.pos.y, data.z))
            this.setLookAngle(angle - Math.PI / 4)
        }

        this.activeTimedAction = new CharacterTimedAction(type, this.id, data.dur ?? null, data.x ?? null, data.z ?? null, data.type ?? null)
    }

    startCamping(data: CharacterCampingMessage) {
        this.startTimedAction(CharacterActions.CAMPING.name, data)
        AudioManager.playCampingSound(this.pos)
    }

    startResting(data: CharacterRestingMessage) {
        this.startTimedAction(CharacterActions.RESTING.name, data)
    }

    startCrafting(data: CharacterCraftingMessage) {
        this.startTimedAction(CharacterActions.CRAFTING.name, data)
    }

    finishCrafting(data: CharacterCraftingResultMessage) {
        if (this !== MyPlayer.myChar || data.g <= 0 || data.q <= 0) {
            return
        }

        const items = InventoryManager.getResourceItemsByType(data.g)
        if (items.length > 0) {
            OverlayManager.addCharacterItemGainNumber(this, data.q, items[0])
        }
    }

    clearTimedAction() {
        this.activeTimedAction = null
    }

    resolveTimedAction(actualTime: number) {
        if (!this.activeTimedAction) {
            return
        }

        if (this.activeTimedAction.tryFinish(actualTime)) {
            this.activeTimedAction = null
        }
    }

    finishHealing(result: HealingResultMessage) {
        CharacterManager.basicDataChange(result.res.dt)
    }

    potionUsed() {
        AudioManager.playPotionSound(this.pos)
        GfxManager.addEffect(new PotionConsumeEffect(this))
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

    basicDataChange(data: AttackableBasicTO) {
        this.hpPercent = data.hpp
        if (data.hp != null) {
            this.hp = data.hp
        }
        if (data.mhp != null) {
            this.maxHp = data.mhp
        }
        if (data.mp != null) {
            this.mp = data.mp
        }
        if (data.mmp != null) {
            this.maxMp = data.mmp
        }
        if (data.st != null) {
            this.st = data.st
        }
        if (data.mst != null) {
            this.maxSt = data.mst
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
        this.setMoveAngleAndSpeed(angle, this.movementType === 'R' ? this.runSpeed : this.walkSpeed)
    }

    forceMoveType(movementType: string) {
        if (this.movementType === movementType) {
            return
        }

        this.movementType = movementType
        if (this.getMoveAngle() == null) {
            Connector.sendMoveMessage(new MyCharMoveMsg())
            return
        }

        this.setActualSpeed(this.movementType === 'R' ? this.runSpeed : this.walkSpeed)
        Connector.sendMoveMessage(new MyCharMoveMsg())
    }

    stopMove() {
        if (this === MyPlayer.myChar && this.model?.initialized) {
            this.pos.x = this.model.node.position.x
            this.pos.z = this.model.node.position.z
            this.logicYpos = Utils.calculateWalkYPos(this.pos.x, this.pos.z, this.getBoxSize())
            this.pos.y = this.model.node.position.y
        }

        this.setMoveAngleAndSpeed(null, 0)
    }

    private setMoveAngleAndSpeed(angle: number | null, speed: number) {
        this.setMoveAngle(angle != null ? Utils.roundToTwoDecimals(angle) : null)
        this.setActualSpeed(speed)
        Connector.sendMoveMessage(new MyCharMoveMsg())
    }

    consumePubliclyVisibleAffects(affects: [{tp: number, p: number}]) {
        this.publiclyVisibleAffects.clear()
        affects.forEach(aff => {
            if (aff.p > 0) {
                this.publiclyVisibleAffects.set(aff.tp, new PubliclyVisibleAffect(aff.tp, aff.p))
            }
        })
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

    setMoveType(movementType: string) {
        this.movementType = movementType
    }

    getMoveType() {
        return this.movementType
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

    getWeapon(): Item | null {
        return this.equipSet.get(EquipItemSlots.R_HAND) || null
    }

    isWeaponRanged(): boolean {
        const weapon = this.getWeapon()
        if (weapon && weapon.weaponCategory === WeaponCategories.BOW) {
            return true
        }
        return false
    }

    isWeaponAxe(): boolean {
        const weapon = this.getWeapon()
        if (weapon && (weapon.slotInfo.weaponType === WeaponTypes.AXE || weapon.slotInfo.weaponType === WeaponTypes.PICKAXE)) {
            return true
        }
        return false
    }

    getFootStepSoundType(): string {
        const block = WorldDataManager.getBlockOnPosition(this.pos)!
        if (block.snowed) {
            return FootStepTypes.SNOW
        } else if (block.type === WATER_BLOCK_TYPE) {
            return FootStepTypes.WATER
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

    getEffectAnchorNode(): TransformNode | null {
        if (!this.model?.initialized) {
            return null
        }

        return this.model.node
    }

    isEffectVisible(): boolean {
        return this.insideView && !!this.model?.initialized
    }
}

export default Character

interface CharacterTimedActionData {
    dur?: number
    x?: number
    z?: number
    type?: string
}
