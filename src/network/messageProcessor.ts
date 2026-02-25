
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { TreeManager } from '@/babylon/world/treeManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { MiniMap } from '@/utils/minimap'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { StaticsManager } from '@/babylon/world/staticsManager'
import { GMSpawns } from '@/gm/GmSpawns'
import { MyPlayer } from '@/data/myPlayer'
import { FightSplatsRenderer } from '@/babylon/world/fightSplatsRenderer'
import { GameManager } from '@/GameManager'
import { CharacterManager } from '@/babylon/character/characterManager'
import {
    AttackableBasicTO,
    AutoAttackMessage,
    AutoAttackResultMessage,
    HealingMessage, HealingResultMessage,
    MonsterMoveMessage,
} from '@/network/messageIfs'
import { CharacterActions } from '@/gui/actionButtonsManager'
import { c } from 'vite/dist/node/types.d-aGj9QkWt'

export const MessageProcessor = {

    async processResponse(response) {
        for (const element of response) {
            const msg = element
            //console.log(msg.t + ":" + msg.d)
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
        MonsterManager.addMonster(data.id, data.tp, { x: data.x, z: data.z }, data.hpp, data.mv)
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
        console.log('World data received')
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

    processGMAllSpawns(data) {
        GMSpawns.consumeAllSpawns(data.worldId, data.spawns)
    },

    processGMSpawnChange(data) {
        GMSpawns.spawnChange(data.worldId, data.spawn, data.deleted)
    }
}
