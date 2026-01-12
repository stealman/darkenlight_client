
import { Data } from '@/data/globalData'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { TreeManager } from '@/babylon/world/treeManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { MiniMap } from '@/utils/minimap'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { StaticsManager } from '@/babylon/world/staticsManager'
import { GMSpawns } from '@/gm/GmSpawns'
import { MyPlayer } from '@/babylon/character/myPlayer'
import { FightSplatsRenderer } from '@/babylon/world/fightSplatsRenderer'
import { PlayerData } from '@/data/playerData'
import { GameManager } from '@/GameManager'

export const MessageProcessor = {

    async processResponse(response) {
        for (const element of response) {
            const msg = element
            //console.log(msg.t)
            switch (msg.t) {
                case 2: await this.loginResponse(msg.d); break
                case 3: this.addMonster(msg.d); break
                case 4: this.monsterMove(msg.d); break
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
                case 1003: this.processGMAllSpawns(msg.d); break
                case 1004: this.processGMSpawnChange(msg.d); break
                default:
                    console.log('Unknown message type: ' + msg.t)
                    break
            }
        }
    },

    async loginResponse(data) {
        const myChar = new PlayerData(data)
        Data.setMyChar(myChar)
        await GameManager.startGame()
        console.log('Game started')
    },

    addMonster(data) {
        MonsterManager.addMonster(data.id, data.tp, { x: data.x, z: data.z }, data.hp, data.mv)
    },

    monsterMove(data) {
        MonsterManager.monsterMove(data[0], { x: data[1], z: data[2] }, { x: data[3], z: data[4] }, data[5])
    },

    charMove(data) {
        const dist = Math.sqrt( (Data.myChar.pos.x - data[1]) * (Data.myChar.pos.x - data[1]) + (Data.myChar.pos.z - data[2]) * (Data.myChar.pos.z - data[2]) )
        if (data[0] === Data.myChar.id && dist >= 1) {
            Data.myChar.pos.x = data[1]
            Data.myChar.pos.z = data[2]
            Data.myChar.setMoveAngle(data[3])
            Data.myChar.setActualSpeed(data[4])
        }
    },

    charMoveDesynced(data) {
        // If received my own move, it is desync - take position
        if (data[0] === Data.myChar.id) {
            console.log('Desync')
            Data.myChar.pos.x = data[1]
            Data.myChar.pos.z = data[2]
            Data.myChar.setMoveAngle(data[3])
            Data.myChar.setActualSpeed(data[4])
        }
    },

    processWorldData(data) {
        Data.worldId = data.id
        Data.worldName = data.name
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

    processCharacterAttack(data) {
        MyPlayer.doAutoAttack(data)
    },

    processCharacterAttackFinished(data) {
        MyPlayer.autoAttackFinished(data)
    },

    processMonsterAttack(data) {
        MonsterManager.autoAttack(data)
    },

    processMonsterAttackFinished(data) {
        MonsterManager.autoAttackFinished(data)
    },

    processAddFightSplats(data) {
        FightSplatsRenderer.consumeSplats(data)
    },

    processGMAllSpawns(data) {
        GMSpawns.consumeAllSpawns(data.worldId, data.spawns)
    },

    processGMSpawnChange(data) {
        GMSpawns.spawnChange(data.worldId, data.spawn, data.deleted)
    }
}
