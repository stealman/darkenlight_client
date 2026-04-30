
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { TreeManager } from '@/babylon/world/treeManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { MiniMap } from '@/utils/minimap'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import { GMSpawns } from '@/gm/GmSpawns'
import { MyPlayer } from '@/data/myPlayer'
import { FightSplatsRenderer } from '@/babylon/world/fightSplatsRenderer'
import { GameManager } from '@/GameManager'
import { CharacterManager } from '@/babylon/character/characterManager'
import {
    AffectGroupData,
    AttackableBasicTO,
    AttackableCombatTO,
    AutoAttackMessage,
    AutoAttackResultMessage, CharacterCampingMessage,
    CharacterCraftingMessage,
    CharacterGatheringMessage,
    CharacterGatheringResultMessage, CharacterRestingMessage,
    EmeraldsChangeMessage,
    EffectDamageMessage,
    HealingMessage, HealingResultMessage, PlaySoundMessage, PotionUsedMessage, PubliclyVisibleAffectData, TextMessage,
    CraftingInitMenuData,
} from '@/network/messageIfs'
import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { InventoryManager } from '@/data/InventoryManager'
import { EmeraldsManager } from '@/gui/emeraldsManager'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { t } from '@/i18n'
import { CraftingManager } from '@/data/crafting/craftingManager'
import { AudioManager } from '@/babylon/audio/audioManager'

export const MessageProcessor = {

    async processResponse(response) {
        for (const element of response) {
            const msg = element
            switch (msg.t) {
                case 2: await this.loginResponse(msg.d); break
                case 3: this.addMonster(msg.d); break
                case 4: this.monsterMove(msg.d); break
                case 5: this.addCharacter(msg.d); break
                case 6: this.charMove(msg.d); break
                case 7: this.processWorldData(msg.d); break
                case 8: this.removeMonster(msg.d); break
                case 9: this.processWorldChunkData(msg.d); break
                case 10: this.monsterMoveStop(msg.d); break
                case 11: this.processWorldChangedData(msg.d); break
                case 12: this.charMoveDesynced(msg.d); break
                case 13: this.processAddTree(msg.d); break
                case 14: this.processRemoveTree(msg.d); break
                case 15: this.processAddStaticObject(msg.d); break
                case 16: this.processRemoveStaticObject(msg.d); break
                case 17: this.processCharacterAttack(msg.d); break
                case 18: this.processMonsterAttack(msg.d); break
                case 19: this.processCharacterAttackFinished(msg.d); break
                case 20: this.processMonsterAttackFinished(msg.d); break
                case 21: this.processAddFightSplats(msg.d); break
                case 22: this.processLoggedFromAnotherDevice(); break
                case 23: this.removeCharacter(msg.d); break
                case 24: this.processCharAutoAttackBroken(msg.d); break
                case 25: this.processCharBasicData(msg.d); break
                case 26: this.processMonsterBasicData(msg.d); break
                case 27: this.processCharacterHealing(msg.d); break
                case 28: this.processCharacterActionChange(msg.d); break
                case 29: this.processCharacterHealingFinished(msg.d); break
                case 30: this.processCharacterEquipSetChange(msg.d); break
                case 31: this.processAddGroundItem(msg.d); break
                case 32: this.processRemoveGroundItem(msg.d); break
                case 33: this.processAddItemsToInventory(msg.d); break
                case 34: this.processRemoveItemsFromInventory(msg.d); break
                case 35: this.processEmeraldsChange(msg.d); break
                case 36: this.processChangeItemsInInventory(msg.d); break
                case 37: this.processCharacterGathering(msg.d); break
                case 38: this.processCharacterGatheringFinished(msg.d); break
                case 39: this.processPotionUsed(msg.d); break
                case 40: this.processCharacterCamping(msg.d); break
                case 41: this.processTextMessage(msg.d); break
                case 42: this.processCharacterStopAction(msg.d); break
                case 43: this.processCharacterResting(msg.d); break
                case 44: this.processCharacterAffectGroupChange(msg.d); break
                case 45: this.processPubliclyVisibleAffectChange(msg.d); break
                case 46: this.processEffectDamage(msg.d); break
                case 47: this.processCharCombatData(msg.d); break
                case 48: this.processCraftingMenu(msg.d); break
                case 49: this.processCharacterCrafting(msg.d); break
                case 50: this.processPlaySound(msg.d); break
                case 1003: this.processGMAllSpawns(msg.d); break
                case 1004: this.processGMSpawnChange(msg.d); break
                default:
                    console.log('Unknown message type: ' + msg.t)
                    break
            }
        }
    },

    async loginResponse(data) {
        if (data.message) {
            document.getElementById("dialog-error-content")!.innerText = data.message
            document.getElementById("dialog-error")!.style.display = 'flex'
        } else if (data.char) {
            await GameManager.startGame(data.char)
            console.log('Game started')
        }
    },

    addMonster(data) {
        MonsterManager.addMonster(data.id, data.tp, { x: data.x, z: data.z }, data.hpp, data.mv, data.paf)
    },

    monsterMove(data) {
        MonsterManager.monsterMove(data[0], { x: data[1], z: data[2] }, { x: data[3], z: data[4] }, data[5])
    },

    async addCharacter(data) {
        await CharacterManager.addCharacter(data)
    },

    removeCharacter(data) {
        CharacterManager.removeCharacter(data)
    },

    charMove(data) {
        CharacterManager.charMove(data)
    },

    charMoveDesynced(data) {
        // If received my own move, it is desync - take position
        if (data[0] === MyPlayer.myChar.id) {
            console.log('Desync')
            MyPlayer.myChar.pos.x = data[1]
            MyPlayer.myChar.pos.z = data[2]
            MyPlayer.myChar.setMoveAngle(data[3])
            MyPlayer.myChar.setActualSpeed(data[4])
        }
    },

    processWorldData(data) {
        MyPlayer.worldId = data.id
        MyPlayer.worldName = data.name
        if (data.mapChunk) {
            WorldDataManager.consumeMapChunk(data.mapChunk)
            MiniMap.redrawMiniMap(data.mapChunk)
        }
    },

    removeMonster(data) {
        MonsterManager.removeMonster(data.id, data.killer)
    },

    processWorldChunkData(data) {
        data.a.forEach(chunk => {
            TreeManager.consumeTrees(chunk.trees)
            StaticsManager.consumeObjects(chunk.statics)
            FightSplatsRenderer.consumeSplats(chunk.splats)
        })
        data.r.forEach(chunk => {
            TreeManager.removeTrees(chunk.trees)
            StaticsManager.removeObjects(chunk.statics)
            FightSplatsRenderer.removeSplats(chunk.splats)
        })
    },

    processAddTree(data) {
        TreeManager.addTree(data)
        TreeManager.renderTrees()
        WorldRenderer.renderWorld()
    },

    processRemoveTree(data) {
        TreeManager.removeTreeAt(data.x, data.z)
        TreeManager.renderTrees()
        WorldRenderer.renderWorld()
    },

    processAddStaticObject(data) {
        StaticsManager.addObject(data)
        StaticsManager.renderObjects()
        WorldRenderer.renderWorld()
    },

    processRemoveStaticObject(data) {
        StaticsManager.removeObjectAt(data.x, data.z)
        StaticsManager.renderObjects()
        WorldRenderer.renderWorld()
    },

    monsterMoveStop(data) {
        MonsterManager.monsterMoveStop(data[0], { x: data[1], z: data[2] })
    },

    processWorldChangedData(data) {
        WorldDataManager.consumeMapUpdate(data.worldId, data.changes)
    },

    processCharacterAttack(data: AutoAttackMessage) {
        CharacterManager.startAutoAttack(data)
    },

    processCharacterAttackFinished(data: AutoAttackResultMessage) {
        CharacterManager.finishAutoAttack(data)
    },

    processMonsterAttack(data: AutoAttackMessage) {
        MonsterManager.autoAttack(data)
    },

    processMonsterAttackFinished(data: AutoAttackResultMessage) {
        MonsterManager.autoAttackFinished(data)
    },

    processAddFightSplats(data) {
        FightSplatsRenderer.consumeSplats(data)
    },

    processCharAutoAttackBroken(data) {
        CharacterManager.autoAttackBroken(data)
    },

    processLoggedFromAnotherDevice() {
        console.log('Logged from another device')
        document.getElementById("dialog-error-content")!.innerText = 'Byli jste odhlášeni, protože jste se přihlásili z jiného zařízení.'
        document.getElementById("dialog-error")!.style.display = 'flex'
    },

    processCharBasicData(data: AttackableBasicTO) {
        CharacterManager.basicDataChange(data)
    },

    processCharCombatData(data: AttackableCombatTO) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.combatDataChange(data)
        }
    },

    processCraftingMenu(data: CraftingInitMenuData) {
        CraftingManager.processCraftingMenu(data)
    },

    processMonsterBasicData(data: AttackableBasicTO) {
        MonsterManager.basicDataChange(data)
    },

    processCharacterHealing(data: HealingMessage) {
        CharacterManager.startHealing(data)
    },

    processCharacterActionChange(data) {
        MyPlayer.setAction(data.type)
    },

    processCharacterHealingFinished(data: HealingResultMessage) {
        CharacterManager.finishHealing(data)
    },

    processCharacterEquipSetChange(data) {
        CharacterManager.equipSetChange(data)
    },

    processAddGroundItem(data) {
        GroundItemsManager.addItems(data)
    },

    processRemoveGroundItem(data) {
        GroundItemsManager.removeItems(data)
    },

    processAddItemsToInventory(data) {
        InventoryManager.addItemsToInventory(data)
        const changedItemIds = Array.isArray(data) ? data.map((item: any) => item?.id) : []
        this.emitInventoryUpdated('add', changedItemIds)
    },

    processRemoveItemsFromInventory(data) {
        InventoryManager.removeItemsFromInventory(data)
        this.emitInventoryUpdated('remove', data)
    },

    processChangeItemsInInventory(data) {
        InventoryManager.changeItemsInInventory(data)
        const changedItemIds = Array.isArray(data) ? data.map((item: any) => item?.id) : []
        this.emitInventoryUpdated('change', changedItemIds)
    },

    processEmeraldsChange(data: EmeraldsChangeMessage) {
        EmeraldsManager.setMyEmeralds(data.em, false, data.ch, data.mobId)
    },

    processCharacterGathering(data: CharacterGatheringMessage) {
        CharacterManager.startGathering(data)
    },

    processCharacterGatheringFinished(data: CharacterGatheringResultMessage) {
        CharacterManager.finishGathering(data)
    },

    processTextMessage(data: TextMessage) {
        OnScreenMessageManager.addMessage(t(data.txt), data.sev)
    },

    processPlaySound(data: PlaySoundMessage) {
        if (data.id !== MyPlayer.myChar.id) {
            return
        }

        AudioManager.playSoundByName(data.sound)
    },

    processPotionUsed(data: PotionUsedMessage) {
        if (data.tp === 'C') {
            CharacterManager.potionUsed(data)
        }
    },

    processCharacterCamping(data: CharacterCampingMessage) {
        CharacterManager.startCamping(data)
    },

    processCharacterCrafting(data: CharacterCraftingMessage) {
        CharacterManager.startCrafting(data)
    },

    processCharacterStopAction(data) {
        CharacterManager.stopAction(data.id)
    },

    processCharacterResting(data: CharacterRestingMessage) {
        CharacterManager.startResting(data)
    },

    processCharacterAffectGroupChange(data: AffectGroupData) {
        MyPlayer.affectGroupChange(data)
    },

    processPubliclyVisibleAffectChange(data: PubliclyVisibleAffectData) {
        if (data.tp === 'C') {
            CharacterManager.publiclyVisibleAffectChange(data)
        } else if (data.tp === 'M') {
            MonsterManager.publiclyVisibleAffectChange(data)
        }
    },

    processEffectDamage(data: EffectDamageMessage) {
        if (data.tp === 'C') {
            CharacterManager.processEffectDamage(data)
        } else if (data.tp === 'M') {
            MonsterManager.processEffectDamage(data)
        }
    },

    processGMAllSpawns(data) {
        GMSpawns.consumeAllSpawns(data.worldId, data.spawns)
    },

    processGMSpawnChange(data) {
        GMSpawns.spawnChange(data.worldId, data.spawn, data.deleted)
    },

    emitInventoryUpdated(reason: string, changedItemIds: number[] = []) {
        if (typeof window === 'undefined') {
            return
        }

        window.dispatchEvent(new CustomEvent('ui:inventory-updated', {
            detail: { reason, changedItemIds }
        }))
    }
}
