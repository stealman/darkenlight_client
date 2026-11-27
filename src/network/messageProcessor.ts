import {AffectGroups} from '@/data/affects'
import { Vector3 } from '@babylonjs/core'
import { MagicArrow } from '@game/game/spells/magicArrow'
import { HealingSpell } from '@game/game/spells/healingSpell'
import { HealingSpellEffect } from '@/babylon/gfx/healingSpellEffect'
import {ActivityLogManager} from '@/data/activityLogManager'
import {getDamageColor, getRelationColor} from '@/gui/combatColors'
import {getDamagePositionSuffix} from '@/gui/combatText'

import { OverlayManager } from '@/gui/overlay/overlayManager'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { TreeManager } from '@/babylon/world/treeManager'
import type { TreeData } from '@/babylon/world/treeManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { MiniMap } from '@/utils/minimap'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { Renderer } from '@/babylon/scene/renderer'
import { Lights } from '@/babylon/scene/lights'
import { WorldAreaManager } from '@/data/worldAreaManager'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import { TerrainManager } from '@/babylon/world/terrainManager'
import { WeatherManager } from '@/babylon/world/weather/weatherManager'
import { StepMarksRenderer } from '@/babylon/world/stepMarksRenderer'
import { GMSpawns } from '@/gm/GmSpawns'
import { MyPlayer } from '@/data/myPlayer'
import { FightSplatsRenderer } from '@/babylon/world/fightSplatsRenderer'
import { GameManager } from '@/GameManager'
import { CharacterManager } from '@/babylon/character/characterManager'
import {
    AffectGroupData,
    MonsterSpawnData,
    AttackableBasicTO,
    AttackableCombatTO,
    AutoAttackMessage,
    AutoAttackResultMessage, CharacterCampingMessage, HealerTreatmentMessage, HealingSpellCastMessage, MagicArrowCastMessage,
    CombatApproachMessage,
    CharacterCraftingMessage, CharacterCraftingResultMessage,
    CharacterGatheringMessage,
    CharacterGatheringResultMessage, CharacterRestingMessage,
    EmeraldsChangeMessage,
    EffectDamageMessage,
    HealingMessage, HealingResultMessage, PlaySoundMessage, PotionUsedMessage, PubliclyVisibleAffectData, TextMessage,
    CraftingInitMenuData,
    GMItemCodebookItem,
    GMWorldSettingsData,
    GMWorldsData,
    GMWorldMapImageData,
    GMWorldBiomeTreesChangedData,
    GMStaticDeleteInfoData,
    GMNpcDetailsData,
    GMBotDetailsData,
    GMExistingBotsData,
    GuestCharacterNameCheckData,
    AccountCharacterNameCheckData,
    PlayerRegistrationData,
    NpcUseData,
    BankStateData, ContainerStateData, SkillSetTO,
    PowerStrikeQueueStateMessage,
    PreciseShotQueueStateMessage,
    PushThroughMessage,
    WorldMapDataMessage,
    MonsterDangerChangedData,
} from '@/network/messageIfs'
import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { InventoryManager } from '@/data/inventoryManager'
import { EmeraldsManager } from '@/gui/emeraldsManager'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import type { GrassOverrideChange } from '@/network/messageIfs'
import { t } from '@/i18n'
import { CraftingManager } from '@/data/crafting/craftingManager'
import { AudioManager } from '@/babylon/audio/audioManager'
import { NpcManager } from '@/babylon/npc/npcManager'
import {NpcInteractionManager} from '@/data/npcInteractionManager'
import {GMManager} from '@/gm/GM'
import {BuildingManager} from '@/babylon/world/buildings/buildingManager'
import {BankManager} from '@/data/bankManager'
import {ContainerManager} from '@/data/containerManager'
import { TargetingManager } from '@/gui/targettingManager'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { CharacterActions } from '@/data/actions/characterActions'
import { FoggyAreaManager } from '@/babylon/world/foggyAreaManager'
import { GMFoggyAreas } from '@/gm/GmFoggyAreas'
import { EquipmentDecorationsManager } from '@/babylon/world/equipmentDecorationsManager'
import {PartyManager} from '@/data/partyManager'
import { Utils } from '@/utils/utils'
import { ViewportManager } from '@/utils/viewport'
import { MonsterCatalog } from '@/data/monsterCatalog'
import { StaticFireParticleManager } from '@/babylon/world/statics/staticFireParticleManager'

type WorldChunkVisibilityData = {
    trees: Array<{x: number, z: number}>
    statics: Array<{x: number, z: number}>
    buildings?: Array<{x: number, z: number, width?: number, depth?: number}>
    equipmentDecorations?: Array<{x: number, z: number}>
}

export const MessageProcessor = {

    async processResponse(response) {
        let starting = false
        let staticChangesPending = false
        for (const element of response) {
            const msg = element
            if (staticChangesPending && msg.t !== 15 && msg.t !== 16) {
                WorldRenderer.renderWorld()
                staticChangesPending = false
            }
            switch (msg.t) {
                case 104: this.processMagicArrow(msg.d); break
                case 105: this.processHealingSpell(msg.d); break
                case 106: this.processHealerTreatment(msg.d); break
                case 107: this.processGrassOverrideChange(msg.d); break
                case 103: CharacterManager.receivePickup(msg.d); break
                case 102: WorldAreaManager.receive(msg.d); break
                case 101: ActivityLogManager.receive(msg.d); break
                case 99: MonsterCatalog.receive(msg.d); break
                case 98:
                    this.processMonsterDangerChanged(msg.d)
                    break
                case 97:
                    OverlayManager.addMonsterAggroAlert(msg.d)
                    break
                case 95:
                    OverlayManager.addSpeech(msg.d)
                    break
                case 94:
                    if (MyPlayer.myCharRef.value) MyPlayer.myCharRef.value.monsterKnowledge = msg.d
                    break
                case 92:
                    if (MyPlayer.myChar) ActivityLogManager.partyChanged(PartyManager.state.value, msg.d, MyPlayer.myChar.id)
                    if (PartyManager.state.value && !msg.d) AudioManager.playPartyLeave()
                    if (PartyManager.receiveState(msg.d)) AudioManager.playPartyJoin()
                    break
                // 93 retired: party invitation dialog.
                case 96: {
                    const sheep = MonsterManager.monsters.get(msg.d.id)
                    if (sheep) sheep.woolReadyAt = Date.now() + msg.d.cooldown
                    break
                }
                case 2: starting = await this.loginResponse(msg.d) || starting; break
                case 3: {
                    const added = this.addMonster(msg.d)
                    if (starting && added) await added
                    break
                }
                case 4: this.monsterMove(msg.d); break
                case 5: {
                    const added = this.addCharacter(msg.d)
                    if (starting) await added
                    break
                }
                case 6: this.charMove(msg.d); break
                case 7: this.processWorldData(msg.d); break
                case 8: this.removeMonster(msg.d); break
                case 9: this.processWorldChunkData(msg.d, !starting); break
                case 10: this.monsterMoveStop(msg.d); break
                case 11: this.processWorldChangedData(msg.d); break
                case 12: this.charMoveDesynced(msg.d); break
                case 13: this.processAddTree(msg.d); break
                case 14: this.processRemoveTree(msg.d); break
                case 15:
                    this.processAddStaticObject(msg.d)
                    staticChangesPending = true
                    break
                case 16:
                    this.processRemoveStaticObject(msg.d)
                    staticChangesPending = true
                    break
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
                case 51: await this.addNpc(msg.d); break
                case 52: this.removeNpc(msg.d); break
                case 53: this.npcMove(msg.d); break
                case 54: this.npcMoveStop(msg.d); break
                case 55: this.processNpcUse(msg.d); break
                case 56: this.processGMNpcDetails(msg.d); break
                case 57: this.processCharacterCraftingFinished(msg.d); break
                case 58: this.processBankState(msg.d); break
                case 83: this.processContainerState(msg.d); break
                case 84: this.processGMStaticDeleteInfo(msg.d); break
                case 85: this.processFoggyAreaChanged(msg.d); break
                case 86: this.processAddEquipmentDecoration(msg.d); break
                case 87: this.processRemoveEquipmentDecorations(msg.d); break
                case 88: this.processGMBotDetails(msg.d); break
                case 89: await this.processCharacterNameChanged(msg.d); break
                case 90: this.processGMExistingBots(msg.d); break
                case 91: this.processPushThrough(msg.d); break
                case 59: this.processCharacterDeath(msg.d); break
                case 66: this.processCharacterCombatApproach(msg.d); break
                case 60: this.processCharacterTeleport(msg.d); break
                case 61: this.processCharacterRespawn(msg.d); break
                case 62: this.processGMWorlds(msg.d); break
                case 63: this.processGMItemCodebook(msg.d); break
                case 64: this.processCharacterSkillSetChange(msg.d); break
                case 67: this.processGuestCharacterNameCheck(msg.d); break
                case 68: this.processPlayerRegistration(msg.d); break
                case 69: this.processAccountCharacterSetupRequired(); break
                case 70: this.processAccountCharacterNameCheck(msg.d); break
                case 72: this.processPowerStrikeQueueState(msg.d); break
                case 74: this.processPreciseShotQueueState(msg.d); break
                case 75: this.processDayNightCycle(msg.d); break
                case 76: this.processGMWorldSettings(msg.d); break
                case 77: this.processGMWorldMapImage(msg.d); break
                case 78: this.processBiomeChanged(msg.d); break
                case 79: this.processGMWorldBiomeTreesChanged(msg.d); break
                case 80: this.processAddBuilding(msg.d); break
                case 81: this.processRemoveBuilding(msg.d); break
                case 82: this.processBuildingDoorState(msg.d); break
                case 1003: this.processGMAllSpawns(msg.d); break
                case 1004: this.processGMSpawnChange(msg.d); break
                case 1005: GMSpawns.receiveSpawnStatuses(msg.d); break
                default:
                    console.log('Unknown message type: ' + msg.t)
                    break
            }
        }
        if (staticChangesPending) WorldRenderer.renderWorld()
        if (starting) {
            await GameManager.startGame()
            window.dispatchEvent(new Event('game:started'))
            console.log('Game started')
        }
    },

    async loginResponse(data) {
        if (data.message) {
            window.dispatchEvent(new CustomEvent('game:login-error', {detail: {message: data.message}}))
            window.dispatchEvent(new Event('game:login-failed'))
        } else if (data.char) {
            await GameManager.initializeCharacter(data.char)
            return true
        }
        return false
    },

    addMonster(data: MonsterSpawnData) {
        MonsterCatalog.get(data.tp)
        const added = MonsterManager.addMonster(data.id, data.tp, { x: data.x, z: data.z }, Number(data.hpp), data.mv, data.paf, data.role, data.alignment, data.guard, data.huntable === true)
        const sheep = MonsterManager.monsters.get(data.id)
        if (sheep) {
            sheep.woolReadyAt = Date.now() + (data.woolCooldown ?? 0)
            sheep.skulls = data.skulls ?? 0
        }
        return added
    },

    processMonsterDangerChanged(data: MonsterDangerChangedData) {
        if (data.worldId !== MyPlayer.worldId) return
        for (const entry of data.monsters) {
            const monster = MonsterManager.monsters.get(entry.id)
            if (monster) monster.skulls = entry.skulls
        }
    },

    monsterMove(data) {
        MonsterManager.monsterMove(data)
    },

    async addCharacter(data) {
        await CharacterManager.addCharacter(data)
    },

    processPlayerRegistration(data: PlayerRegistrationData) {
        window.dispatchEvent(new CustomEvent('game:player-registration', {detail: data}))
    },

    processAccountCharacterSetupRequired() {
        window.dispatchEvent(new Event('game:account-character-setup-required'))
    },

    processAccountCharacterNameCheck(data: AccountCharacterNameCheckData) {
        window.dispatchEvent(new CustomEvent('game:account-character-name-check', {detail: data}))
    },

    processDayNightCycle(data) {
        Lights.synchronizeDayNightCycle(data)
    },

    processGuestCharacterNameCheck(data: GuestCharacterNameCheckData) {
        window.dispatchEvent(new CustomEvent('game:guest-character-name-check', {detail: data}))
    },

    async addNpc(data) {
        await NpcManager.addNpc(data)
    },

    removeNpc(data) {
        NpcManager.removeNpc(data.id)
    },

    npcMove(data) {
        NpcManager.npcMove(data)
    },

    npcMoveStop(data) {
        NpcManager.npcMoveStop(data)
    },

    processNpcUse(data: NpcUseData) {
        NpcInteractionManager.processNpcUse(data)
    },

    processBankState(data: BankStateData) {
        BankManager.replaceState(data)
    },

    processContainerState(data: ContainerStateData) {
        ContainerManager.replaceState(data)
    },

    processGMNpcDetails(data: GMNpcDetailsData) {
        GMManager.processNpcDetails(data)
    },

    processGMBotDetails(data: GMBotDetailsData) {
        GMManager.processBotDetails(data)
    },

    processGMExistingBots(data: GMExistingBotsData) {
        GMManager.processBotStatuses(data)
    },

    async processCharacterNameChanged(data: {id: number, name: string, gender?: 'M' | 'F'}) {
        await CharacterManager.changeCharacterName(data.id, data.name, data.gender)
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
            MyPlayer.myChar.logicYpos = Utils.calculateCharacterYPos(data[1], data[2], MyPlayer.myChar.getBoxSize())
            MyPlayer.myChar.setMoveAngle(data[3])
            MyPlayer.myChar.setActualSpeed(data[4])
        }
    },

    processWorldData(data: WorldMapDataMessage) {
        const worldChanged = MyPlayer.worldId !== data.id
        if (worldChanged) {
            if (GameManager.started && MyPlayer.myChar) MyPlayer.beginWorldTransition()
            else MyPlayer.stopMovementForTeleport()
            if (MyPlayer.activeAction?.name !== CharacterActions.HEAL.name) {
                MyPlayer.setAction(null)
            }
        }
        const environmentType = data.environment?.type
        if (worldChanged) {
            // Dispose the previous world's entities while they still use their
            // original environment. Otherwise they are dirtied for the new
            // light layout immediately before disposal, which can leave stale
            // mobile WebGL/shadow resources behind.
            this.clearWorldForTransition()
        }
        MiniMap.setEnvironmentType(environmentType)
        if (Renderer.environmentType !== (environmentType === 'indoor' ? 'indoor' : 'outdoor')) {
            Renderer.setWorldEnvironmentType(environmentType)
        }
        Lights.synchronizeDayNightCycle(data.dayNightCycle)
        WeatherManager.setEnabled(environmentType !== 'indoor')
        if (worldChanged) {
            WorldDataManager.replaceWorldData(data.id, data.size)
            WorldDataManager.prepareTerrainRenderData(data.id, environmentType !== 'indoor')
            TerrainManager.setSeaWaterLevel(data.seaWaterLevel ?? null)
        }
        if (worldChanged && MyPlayer.myChar && MyPlayer.worldName) {
            ActivityLogManager.worldChanged(MyPlayer.worldName, data.name)
        }
        MyPlayer.worldId = data.id
        MyPlayer.worldName = data.name
        if (data.noGrassTiles) {
            WorldDataManager.worldDataMap.get(data.id)!.noGrassTiles = new Set(data.noGrassTiles)
        }
        if (data.forcedGrassTiles) {
            WorldDataManager.worldDataMap.get(data.id)!.forcedGrassTiles = new Map(data.forcedGrassTiles)
        }
        if (worldChanged && WorldDataManager.worldDataMap.get(data.id)?.allChunksLoaded) MiniMap.redrawLocalWorld()
        if (worldChanged || data.areas) WorldAreaManager.setWorld(data.id, data.areas ?? [], data.areasRevision ?? 0, data.name)
        FoggyAreaManager.setAreas(data.foggyAreas ?? [])
        if (data.mapChunk) {
            WorldDataManager.consumeMapChunk(data.mapChunk)
            MiniMap.redrawMiniMap(data.mapChunk)
            // A teleport can deliver entity chunk data before its terrain
            // chunk. Re-anchor objects that may have been created from the
            // placeholder height map, then rebuild the now-loaded area.
            TreeManager.recountYPositions()
            StaticsManager.resolveStackedStaticPositions()
            BuildingManager.recountYPositions()
            EquipmentDecorationsManager.recountYPositions()
            if (MyPlayer.myChar != null && WorldRenderer.block1 != null) {
                WorldRenderer.renderWorld()
            }
        }
    },

    processGrassOverrideChange(data: GrassOverrideChange) {
        if ('error' in data) {
            OnScreenMessageManager.addMessage('Could not save the grass edit.', 'ERROR')
            return
        }
        const world = WorldDataManager.worldDataMap.get(data.worldId)
        if (!world) return
        if (data.excluded) world.noGrassTiles.add(data.tile)
        else world.noGrassTiles.delete(data.tile)
        if (data.level) world.forcedGrassTiles.set(data.tile, data.level)
        else world.forcedGrassTiles.delete(data.tile)
        if (data.worldId !== MyPlayer.worldId) return
        TerrainManager.refreshGrassOverrides(data.tile)
        WorldRenderer.refreshGrassOverrideMarkers()
    },

    removeMonster(data) {
        if (data.dead && data.killerIsCharacter && data.killer === MyPlayer.myChar.id) {
            const target = MonsterManager.monsters.get(data.id) || NpcManager.guards.get(data.id)
            const color = getRelationColor(target?.getRelationToMyPlayer() || 'NEUTRAL')
            const name = this.combatLogName(data.id, true)
            const text = t('activityLog.kill', {name})
            const offset = text.lastIndexOf(name)
            ActivityLogManager.addKill(data.id, text, {
                before: text.slice(0, offset), name, after: text.slice(offset + name.length), color,
            })
        }
        MonsterManager.removeMonster(data.id, data.dead)
    },

    processPushThrough(data: PushThroughMessage) {
        CharacterManager.pushThrough(data)
    },

    processWorldChunkData(data, render = true) {
        let staticsChanged = false
        data.a.forEach(chunk => {
            TreeManager.consumeTrees(chunk.trees)
            StaticsManager.consumeObjects(chunk.statics, false)
            staticsChanged ||= chunk.statics.length > 0
            BuildingManager.consumeBuildings(chunk.buildings ?? [])
            EquipmentDecorationsManager.consume(chunk.equipmentDecorations ?? [])
            FightSplatsRenderer.consumeSplats(chunk.splats)
        })
        data.r.forEach(chunk => {
            TreeManager.removeTrees(chunk.trees)
            StaticsManager.removeObjects(chunk.statics, false)
            staticsChanged ||= chunk.statics.length > 0
            BuildingManager.removeBuildings(chunk.buildings ?? [])
            EquipmentDecorationsManager.removeMany((chunk.equipmentDecorations ?? []).map((item) => item.id))
            FightSplatsRenderer.removeSplats(chunk.splats)
        })
        if (staticsChanged) {
            StaticsManager.resolveStackedStaticPositions()
            StaticFireParticleManager.flush()
        }
        // WorldRenderer may already have recorded the teleport destination
        // before this asynchronous entity payload arrived, so movement alone
        // will not necessarily trigger another rebuild.
        if (render && MyPlayer.myChar != null && WorldRenderer.block1 != null) {
            const rebuild = WorldRenderer.lastPos == null || !ViewportManager.viewPortInitialized
                || data.a.some((chunk: WorldChunkVisibilityData) => this.chunkAffectsVisibleWorld(chunk))
                || data.r.some((chunk: WorldChunkVisibilityData) => this.chunkAffectsVisibleWorld(chunk))
            if (rebuild) {
                WorldRenderer.renderWorld()
            } else if (staticsChanged) {
                // Static lights can reach beyond the visual footprint. Keep
                // their visibility current without rebuilding geometry.
                StaticsManager.updateVisibleObjects()
            }
        }
    },
    chunkAffectsVisibleWorld(chunk: WorldChunkVisibilityData) {
        // Check a conservative bounding rectangle, including the position of
        // the last geometry rebuild and a reserve for snow/connected statics.
        const pos = MyPlayer.myChar.pos
        const last = WorldRenderer.lastPos
        const reserve = 8 + (last ? Math.max(Math.abs(pos.x - last.x), Math.abs(pos.z - last.z)) : 0)
        const near = (point: {x: number, z: number}, extra = 0) =>
            ViewportManager.isPointNearVisibleBounds(point.x, point.z, reserve + extra)
        return chunk.trees.some(point => near(point))
            || chunk.statics.some(point => near(point))
            || (chunk.buildings ?? []).some(building => near(building, Math.max(building.width ?? 5, building.depth ?? 5)))
            || (chunk.equipmentDecorations ?? []).some(point => near(point))
    },

    processAddTree(data: TreeData) {
        if (TreeManager.addTree(data)) WorldRenderer.renderWorld()
    },

    processRemoveTree(data) {
        TreeManager.removeTreeAt(data.x, data.z)
        WorldRenderer.renderWorld()
    },

    processAddStaticObject(data) {
        StaticsManager.addObject(data, false)
    },

    processRemoveStaticObject(data) {
        if (Array.isArray(data.objects)) {
            StaticsManager.removeObjects(data.objects, false)
        } else {
            StaticsManager.removeObjectAt(data.x, data.z, undefined, false)
        }
    },

    monsterMoveStop(data) {
        MonsterManager.monsterMoveStop(data)
    },

    processAddBuilding(data) {
        BuildingManager.addBuilding(data)
        EquipmentDecorationsManager.recountYPositions()
        WorldRenderer.renderWorld()
    },

    processRemoveBuilding(data) {
        BuildingManager.removeBuilding(data.id)
        EquipmentDecorationsManager.recountYPositions()
        WorldRenderer.renderWorld()
    },

    processBuildingDoorState(data) {
        BuildingManager.setDoorOpen(data.id, data.open === true)
    },

    processBiomeChanged(data) {
        TreeManager.removeTrees(data.removedTrees ?? [])
        TreeManager.consumeTrees(data.addedTrees ?? [])
        StaticsManager.removeObjects(data.removedShrubs ?? [])
        StaticsManager.consumeObjects(data.addedShrubs ?? [])
        WorldRenderer.renderWorld()
    },

    processGMWorldBiomeTreesChanged(data: GMWorldBiomeTreesChangedData) {
        GMManager.consumeWorldBiomeTreesChanged(data)
    },

    processWorldChangedData(data) {
        WorldDataManager.consumeMapUpdate(data.worldId, data.changes)
        MiniMap.redrawMapChanges(data.worldId, data.changes)
        EquipmentDecorationsManager.recountYPositions()
    },

    processAddEquipmentDecoration(data) {
        EquipmentDecorationsManager.add(data)
    },

    processRemoveEquipmentDecorations(data) {
        EquipmentDecorationsManager.removeMany(data.ids ?? [])
    },

    processCharacterAttack(data: AutoAttackMessage) {
        if (data.id === MyPlayer.myChar?.id) {
            ActivityLogManager.rememberAttackWeapon(MyPlayer.myChar.getWeapon())
            ActivityLogManager.lastAttackSkillName = data.ps ? t('skills.weapons.powerStrike') : data.prs ? t('skills.weapons.preciseShot') : ''
        }
        CharacterManager.startAutoAttack(data)
    },

    processCharacterCombatApproach(data: CombatApproachMessage) {
        MyPlayer.startCombatApproach(data)
    },

    combatLogName(id: number, monster: boolean): string {
        if (!monster) return (id === MyPlayer.myChar.id ? MyPlayer.myChar : CharacterManager.characters.get(id))?.getName() || `Character #${id}`
        // Death/removal can precede the finishing attack result.
        const entity = MonsterManager.monsters.get(id) || NpcManager.guards.get(id)
            || Array.from(MonsterManager.killedMonsters).find(mob => mob.id === id)
        return entity?.getName() || `Monster #${id}`
    },

    logAttack(data: AutoAttackResultMessage, monsterAttacker: boolean, spellName?: string) {
        const mine = !monsterAttacker && data.id === MyPlayer.myChar.id
        const incoming = data.tp === 'C' && data.tgt === MyPlayer.myChar.id
        if (!mine && !incoming) return
        const hit = data.res.h === 'h'
        const direction = hit ? getDamagePositionSuffix(data.res.a, data.res.v) : ''
        const value = String(Math.round(data.res.d)) + direction
        const result = data.res.h === 'm' ? t('common.miss') : data.res.h === 'b' ? t('common.blocked') : value
        const baseText = t(mine ? 'activityLog.outgoing' : 'activityLog.incoming', {name: mine ? this.combatLogName(data.tgt, data.tp === 'M') : this.combatLogName(data.id, monsterAttacker), result})
        const weapon = mine && !spellName ? ActivityLogManager.lastAttackWeaponName || MyPlayer.myChar.getWeapon()?.name || t('activityLog.unarmed') : ''
        const skill = spellName ?? (mine ? ActivityLogManager.lastAttackSkillName : '')
        const description = [skill, weapon].filter(Boolean).join(', ')
        const text = description ? `${baseText} (${description})` : baseText
        const offset = baseText.lastIndexOf(result)
        ActivityLogManager.add(text, hit ? getDamageColor(data.res.q, incoming ? '#ff2020' : '#f08f56') : undefined, undefined, {
            negative: incoming && hit && data.res.d > 0,
            damage: hit ? {before: text.slice(0, offset), value, after: text.slice(offset + value.length), heightBlocks: data.res.v} : undefined,
        })
        if (mine && hit && data.tp === 'M') ActivityLogManager.flushKill(data.tgt)
    },

    processCharacterAttackFinished(data: AutoAttackResultMessage) {
        this.logAttack(data, false)
        CharacterManager.finishAutoAttack(data)
    },

    processMagicArrow(data: MagicArrowCastMessage) {
        const player = MyPlayer.myChar
        if (!player || data.worldId !== MyPlayer.worldId) return
        const caster = player.id === data.id ? player : CharacterManager.characters.get(data.id)
        const event = data.event
        if (event.phase === 'charge') {
            caster?.startMagicArrow(event.x, event.z)
            return
        }

        const target = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt, true)
        if (event.phase === 'release') {
            if (caster === player) MyPlayer.magicArrowCooldownEnd = Date.now() + MagicArrow.cooldown
            const height = (target?.getModelHeight() ?? 1.8) * 0.63
            const destination = new Vector3(event.x, event.y + height, event.z)
            caster?.releaseMagicArrow(destination, target, event.flightMs)
            return
        }
        const {res} = event
        this.logAttack({...data, res}, false, t('skills.magic.magicArrow'))
        if (!target) return
        if (res.h === 'h') AudioManager.playSpellImpactSound(Renderer.scene, target === player ? undefined : target.pos)
        target.hpPercent = res.tgt.hpp
        if (target === player) {
            MyPlayer.setMyCharHp(res.tgt.hp)
            if (caster) OverlayManager.addMyCharDamageNumber(caster, res.d, res.h, res.q)
        } else if (caster === player) {
            if (data.tp === 'M') OverlayManager.addMonsterDamageNumber(data.tgt, res.d, res.h, res.q)
            else OverlayManager.addCharacterDamageNumber(data.tgt, res.d, res.h, res.q)
        }
    },

    processHealingSpell(data: HealingSpellCastMessage) {
        const player = MyPlayer.myChar
        if (!player || data.worldId !== MyPlayer.worldId) return
        const caster = player.id === data.id ? player : CharacterManager.characters.get(data.id)
        const event = data.event
        if (event.phase === 'charge') {
            caster?.startHealingSpell(event.x, event.z, data.targetId === data.id)
            return
        }

        caster?.finishHealingSpell()
        if (caster === player) MyPlayer.healingSpellCooldownEnd = Date.now() + HealingSpell.cooldown
        const target = player.id === data.targetId ? player : CharacterManager.characters.get(data.targetId)
        if (target) target.hpPercent = event.hpPercent
        if (target?.insideView || target === player || (!target && caster === player)) {
            const position = target?.pos ?? new Vector3(event.x, event.y, event.z)
            this.playHealingEffect(position, target === player)
        }
        if (target === player) OverlayManager.addMyCharDamageNumber(caster ?? player, -event.amount, 'h')
        else if (caster === player && target) OverlayManager.addCharacterDamageNumber(target.id, -event.amount)
        this.logHealing(data.id === data.targetId ? null : data.id, data.targetId, 'C', event.amount)
    },

    processHealerTreatment(data: HealerTreatmentMessage) {
        const player = MyPlayer.myChar
        if (!player || data.worldId !== MyPlayer.worldId) return
        const target = data.id === player.id ? player : CharacterManager.characters.get(data.id)
        if (target && (target === player || target.insideView)) this.playHealingEffect(target.pos, target === player)
    },

    playHealingEffect(position: Vector3, local: boolean) {
        AudioManager.playSpellHealingSound(Renderer.scene, local ? undefined : position)
        new HealingSpellEffect(Renderer.scene, feet => feet.copyFrom(position), 'bloom')
    },

    processMonsterAttack(data: AutoAttackMessage) {
        MonsterManager.autoAttack(data)
        TargetingManager.requestCombatApproachOnMonsterAttack(data.id, data.tgt, data.tp)
    },

    processMonsterAttackFinished(data: AutoAttackResultMessage) {
        this.logAttack(data, true)
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
        window.dispatchEvent(new CustomEvent('game:application-error', {detail: {message: 'Byli jste odhlášeni, protože jste se přihlásili z jiného zařízení.'}}))
        window.dispatchEvent(new Event('game:session-ended'))
    },

    processCharBasicData(data: AttackableBasicTO) {
        CharacterManager.basicDataChange(data)
    },

    processCharacterDeath(data) {
        CharacterManager.characterDied(data.id)
    },

    processCharacterTeleport(data: {id: number, x: number, y: number, z: number, fx: number, fy: number, fz: number, departure: boolean}) {
        const ownArrival = MyPlayer.myChar && data.id === MyPlayer.myChar.id && !data.departure
        if (ownArrival && !MyPlayer.worldTransitionPending) MyPlayer.beginWorldTransition()
        CharacterManager.characterTeleported(data)
        if (!ownArrival) return

        // The simulation queues terrain and the destination's entity chunks
        // before this arrival packet. Rebuild at the final position, then keep
        // movement locked until that world has actually rendered a frame.
        WorldRenderer.renderWorld()
        const version = MyPlayer.worldTransitionVersion
        Renderer.scene.onAfterRenderObservable.addOnce(() => {
            if (version !== MyPlayer.worldTransitionVersion) return
            MyPlayer.stopMovementForTeleport()
            MyPlayer.worldTransitionPending = false
        })
    },

    processGMWorlds(data: GMWorldsData) {
        GMManager.consumeTeleportWorlds(data)
    },

    processGMItemCodebook(data: GMItemCodebookItem[]) {
        GMManager.consumeItemCodebook(data)
    },

    processGMStaticDeleteInfo(data: GMStaticDeleteInfoData) {
        GMManager.consumeStaticDeleteInfo(data)
    },

    processGMWorldSettings(data: GMWorldSettingsData) {
        GMManager.consumeWorldSettings(data)
    },

    processGMWorldMapImage(data: GMWorldMapImageData) {
        GMManager.consumeWorldMapImage(data)
    },

    clearWorldForTransition() {
        if (!MyPlayer.myChar) {
            return
        }
        CharacterManager.clearWorld()
        MonsterManager.clearWorld()
        NpcManager.clearWorld()
        TreeManager.clearWorld()
        GMManager.clearStaticSelection()
        GMManager.closeDeleteConfirmation()
        StaticsManager.clearWorld()
        BuildingManager.clearWorld()
        EquipmentDecorationsManager.clearWorld()
        GroundItemsManager.clearWorld()
        FightSplatsRenderer.clearWorld()
        StepMarksRenderer.clearWorld()
        FoggyAreaManager.clearWorld()
        GMSpawns.removeAllMarkers()
        GMFoggyAreas.removeMarkers()
        WorldRenderer.hideGrassOverrideMarkers()
        Lights.pruneDisposedMeshReferences()
    },

    processFoggyAreaChanged(data) {
        if (data.worldId !== MyPlayer.worldId) return
        FoggyAreaManager.applyChange(data.area, data.deleted === true)
        if (GMManager.gmPanelVisible.value && GMManager.tab === 'fog_edit') GMFoggyAreas.renderMarkers()
    },

    processCharacterRespawn(data: {id: number}) {
        CharacterManager.characterRespawned(data.id)
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

    processCharacterActionChange(data: {type: string | null, tgt?: number, tp?: string}) {
        const target = data.type === CharacterActions.MAGIC_ARROW.name && data.tp && data.tgt != null
            ? Utils.getAttackTargetByTypeAndId(data.tp, data.tgt) : null
        MyPlayer.setAction(data.type, target)
    },

    processPowerStrikeQueueState(data: PowerStrikeQueueStateMessage) {
        MyPlayer.setPowerStrikeQueued(data.q === true)
    },

    processPreciseShotQueueState(data: PreciseShotQueueStateMessage) {
        MyPlayer.setPreciseShotQueued(data.q === true)
    },

    logHealing(source: number | null, target: number, type: string, amount: number) {
        const myId = MyPlayer.myChar?.id
        if (!(amount > 0) || myId === undefined || (source !== myId && !(type === 'C' && target === myId))) return
        const key = source === myId ? 'activityLog.healOutgoing' : source === null ? 'activityLog.healSelf' : 'activityLog.healIncoming'
        const value = String(Math.max(1, Math.floor(amount)))
        const text = t(key, {name: this.combatLogName(source === myId ? target : source ?? target, source === myId && type === 'M'), amount: value})
        const offset = text.lastIndexOf(value)
        ActivityLogManager.add(text, '#20ff20', undefined, {
            damage: {before: text.slice(0, offset), value, after: text.slice(offset + value.length)},
        })
    },

    processCharacterHealingFinished(data: HealingResultMessage) {
        this.logHealing(data.id, data.tgt, data.tp, data.res.hp)
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
        if (data.id === MyPlayer.myChar.id && data.g > 0 && data.q > 0) {
            const item = InventoryManager.getResourceItemsByType(data.g)[0]
            if (item) ActivityLogManager.add(t('activityLog.pickup', {item: item.name || '?', quantity: data.q}))
        }
        CharacterManager.finishGathering(data)
    },

    processTextMessage(data: TextMessage) {
        OnScreenMessageManager.addMessage(t(data.txt, data.params), data.sev)
    },

    processPlaySound(data: PlaySoundMessage) {
        if (data.id !== MyPlayer.myChar.id) {
            return
        }

        AudioManager.playSoundByName(data.sound)
    },

    processPotionUsed(data: PotionUsedMessage) {
        if (data.tp === 'C' && data.id === MyPlayer.myChar?.id && ['HP', 'MP', 'ST'].includes(data.add)) {
            const value = String(Math.max(0, Math.floor(data.val)))
            const text = t(`activityLog.potion${data.add}`, {amount: value})
            const offset = text.lastIndexOf(value)
            ActivityLogManager.add(text, data.add === 'HP' ? '#20ff20' : undefined, undefined, {
                damage: data.add === 'HP' ? {before: text.slice(0, offset), value, after: text.slice(offset + value.length)} : undefined,
            })
        }
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

    processCharacterSkillSetChange(data: SkillSetTO) {
        if (MyPlayer.myCharRef.value) {
            MyPlayer.myCharRef.value.skillSet = data
            ActionButtonsManager.notifyBindingsChanged()
        }
    },

    processCharacterCraftingFinished(data: CharacterCraftingResultMessage) {
        if (data.id === MyPlayer.myChar.id && data.q > 0 && data.item) ActivityLogManager.receive({event: "craft", item: data.item, quantity: data.q})
        CharacterManager.finishCrafting(data)
    },

    processCharacterStopAction(data) {
        CharacterManager.stopAction(data.id)
    },

    processCharacterResting(data: CharacterRestingMessage) {
        CharacterManager.startResting(data)
    },

    processCharacterAffectGroupChange(data: AffectGroupData) {
        const definition = AffectGroups[data.id as keyof typeof AffectGroups]
        const previous = MyPlayer.affectGroups.find(group => group.id === data.id)
        const elapsed = previous ? Math.max(0, (Date.now() - previous.lastUpdatedAt) / 1000) : 0
        const received = data.af.length > 0 && (!previous || data.p > previous.p || data.af.some(effect => {
            const old = previous.af.find(existing => existing.data[0] === effect.data[0])
            return !old || effect.data[2] > old.data[2]
                || (definition?.displayDuration && effect.data[1] > Math.max(0, old.data[1] - elapsed) + 1)
        }))
        if (received) ActivityLogManager.add(t('activityLog.affect', {
            name: definition?.getNameLocalized() || `#${data.id}`,
        }), undefined, undefined, {negative: definition?.adverse === true})
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
        if (data.d < 0) {
            const myId = MyPlayer.myChar?.id
            // A combined regeneration tick does not identify each source's contribution.
            if (data.tp === 'C' && data.id === myId) this.logHealing(null, data.id, data.tp, -data.d)
            else if (myId !== undefined && data.ids.length === 1 && data.ids[0] === myId) this.logHealing(myId, data.id, data.tp, -data.d)
        }
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
