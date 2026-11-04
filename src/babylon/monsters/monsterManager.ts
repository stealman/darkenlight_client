import { Monster } from '@/babylon/monsters/monster'
import { MonsterLoader } from '@/babylon/monsters/monsterLoader'
import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MonsterCodebook, MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { ViewportManager } from '@/utils/viewport'
import { TargetingManager } from '@/gui/targettingManager'
import { MyPlayer } from '@/data/myPlayer'
import {
    AttackableBasicTO,
    AutoAttackMessage,
    AutoAttackResultMessage,
    EffectDamageMessage,
    PubliclyVisibleAffectData,
} from '@/network/messageIfs'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import { Utils } from '@/utils/utils'
import { PubliclyVisibleAffect } from '@/data/affects'
import { NpcManager } from '@/babylon/npc/npcManager'

export const MonsterManager = {
    monsters: new Map as Map<number, Monster>,
    killedMonsters: new Set<Monster>,
    visibleMonsters: new Set<number>(),

    async initialize () {
        this.monsters = new Map<number, Monster>()
        this.killedMonsters = new Set<Monster>()
        this.visibleMonsters = new Set<number>()
        await MonsterLoader.initialize()
    },

    async prepareModels() {
        await MonsterLoader.prepareRuntimeClones()
    },

    addMonster (id: number, type: number, position: { x: number, z: number }, hpp: number, mv: number[] | undefined, ef: [{tp: number, p: number}] | undefined, role?: string, alignment?: string, guard?: any, huntable: boolean = false) {
        if (role === 'guard' && guard) {
            void NpcManager.addGuard({id, tp: type, x: position.x, z: position.z, hpp, mv, paf: ef, role, alignment, guard})
            return
        }
        if (this.monsters.has(id)) {
            const mob = this.monsters.get(id)
            mob!.pos.x = position.x
            mob!.pos.z = position.z
            mob!.logicYpos = Utils.calculateWalkYPos(mob!.pos.x, mob!.pos.z, mob!.getBoxSize())
            mob!.pos.y = mob!.logicYpos
            mob!.hpPercent = hpp
            mob!.alignment = alignment === 'neutral' || alignment === 'friendly' ? alignment : 'evil'
            mob!.huntable = huntable
            if (ef) mob!.consumePubliclyVisibleAffects(ef)
        } else {
            const monsterType: MonsterType = MonsterCodebook.getMonsterTypeById(type)
            const monster = new Monster(id, monsterType, position.x, position.z, hpp, alignment === 'neutral' || alignment === 'friendly' ? alignment : 'evil')
            monster.huntable = huntable
            const monsterModel = new MonsterModel(monsterType, monster)
            monster.model = monsterModel

            monster.insideView = this.isMonsterVisible(monster)

            // If monster is in view, initialize model immediately
            if (monster.insideView) {
                monsterModel.addToView()
            }

            if (ef) monster.consumePubliclyVisibleAffects(ef)
            this.monsters.set(id, monster)
        }

        if (mv && mv.length >= 3) {
            const move = [id, position.x, position.z, mv[0], mv[1], mv[2]]
            if (mv.length >= 5) move.push(mv[3], mv[4])
            this.monsterMove(move)
        }
    },

    removeMonster (id: number, dead: boolean) {
        if (NpcManager.guards.has(id)) {
            NpcManager.removeGuard(id, dead)
            return
        }
        if (this.monsters.has(id)) {
            const mob = this.monsters.get(id)
            if (dead) {
                this.monsterKilled(mob!)
            } else {
                mob!.removeModel()
                this.visibleMonsters.delete(id)
                this.monsters.delete(id)
            }
            if (mob === TargetingManager.selectedTarget) {
                TargetingManager.unselectTarget()
            }
            if (mob === MyPlayer.myChar.autoAttackTarget) {
                MyPlayer.myChar.breakAutoAttack()
                MyPlayer.myChar.autoAttackTarget = null
                MyPlayer.setAction(null)
            }
        }
    },

    monsterMove(data: number[]) {
        const id = data[0]
        if (NpcManager.guards.has(id)) {
            NpcManager.guardMove(data)
            return
        }
        const mob = this.monsters.get(id)
        if (mob) {
            mob.runSpeed = data[5]
            const confirmsQueuedMove = mob.targetPoint?.x === data[3] && mob.targetPoint?.z === data[4]
            if (!confirmsQueuedMove) {
                mob.pos.x = data[1]
                mob.pos.z = data[2]
            }
            mob.logicYpos = Utils.calculateWalkYPos(mob.pos.x, mob.pos.z, mob.getBoxSize())
            mob.setTargetPoint(data[3], data[4], data.length >= 8 ? data[6] : undefined, data.length >= 8 ? data[7] : undefined)
        }
    },

    autoAttack(data: AutoAttackMessage) {
        const guard = NpcManager.guards.get(data.id)
        if (guard) {
            guard.startAutoAttack({...data, cd: data.dur})
            return
        }
        const mob = this.monsters.get(data.id)
        const target = Utils.getAttackTargetByTypeAndId(data.tp, data.tgt)
        if (target) {
            mob?.doAutoAttack(target, data.dur)
        }
    },

    autoAttackFinished(data: AutoAttackResultMessage) {
        const guard = NpcManager.guards.get(data.id)
        if (guard) {
            guard.finishAutoAttack(data)
            return
        }
        const monster = this.monsters.get(data.id)
        if (!monster) {
            return
        }
        monster.autoAttackFinished(data)
        if (data.tp === 'C' && data.tgt === MyPlayer.myChar.id) {
            OverlayManager.addMyCharDamageNumber(monster, data.res.d, data.res.h, data.res.q)
        }
    },

    basicDataChange(data: AttackableBasicTO) {
        const guard = NpcManager.guards.get(data.id)
        if (guard) {
            guard.basicDataChange(data)
            return
        }
        const monster = this.monsters.get(data.id)
        if (!monster) {
            return
        }
        monster.basicDataChange(data)
    },

    monsterMoveStop(data: [number, number, number, boolean?]) {
        const id = data[0]
        if (NpcManager.guards.has(id)) {
            NpcManager.guardMoveStop(data)
            return
        }
        const mob = this.monsters.get(id)
        if (mob) {
            mob.pos.x = data[1]
            mob.pos.z = data[2]
            mob.logicYpos = Utils.calculateWalkYPos(mob.pos.x, mob.pos.z, mob.getBoxSize())
            mob.pos.y = mob.logicYpos
            mob.resetTargetPoint()
            if (data[3] === true && mob.model.initialized) {
                mob.model.node.position.copyFrom(mob.pos)
            }
        }
    },

    clearWorld() {
        Array.from(this.monsters.keys()).forEach((id) => this.removeMonster(id, false))
        this.killedMonsters.forEach((monster) => monster.removeModel())
        this.killedMonsters.clear()
    },

    monsterKilled(mob: Monster) {
        mob.killed()
        this.killedMonsters.add(mob)
        this.visibleMonsters.delete(mob.id)
        this.monsters.delete(mob.id)
        mob.model.doDie()
    },

    publiclyVisibleAffectChange(data: PubliclyVisibleAffectData) {
        const monster = this.monsters.get(data.tgt)
        if (!monster) {
            return
        }
        if (data.p > 0) {
            monster.publiclyVisibleAffects.set(data.id, new PubliclyVisibleAffect(data.id, data.p))
        } else {
            monster.publiclyVisibleAffects.delete(data.id)
        }
    },

    processEffectDamage(data: EffectDamageMessage) {
        if (data.d === 0 || !this.monsters.has(data.id) || (!data.ids.includes(MyPlayer.myChar.id) && data.id != TargetingManager.selectedTarget?.id) ) {
            return
        }
        OverlayManager.addMonsterDamageNumber(data.id, data.d, 'h')
    },

    onFrame(timeRate: number, actualTime: number, frame: number) {
       if (frame % 10 === 6) {
            this.updateVisibleMonsters()
            this.monsters.forEach(monster => {
                monster.setVisible(this.visibleMonsters.has(monster.id))
            })
        }

        this.monsters.forEach(monster => {
            if (monster.killedTime > 0) {
                return
            }
            monster.onFrame(timeRate, actualTime)
        })

        this.killedMonsters.forEach(monster => {
            monster.model.onFrame(timeRate, actualTime)
            if (actualTime - monster.killedTime > 4000) {
                monster.removeModel()
                this.killedMonsters.delete(monster)
            }
        })

        this.onAnimFrame(timeRate)
    },

    onAnimFrame(timeRate: number) {
        this.monsters.forEach(monster => {
            monster.onAnimFrame(timeRate)
        })

        this.killedMonsters.forEach(monster => {
            monster.onAnimFrame(timeRate)
        })
    },

    updateVisibleMonsters() {
        this.visibleMonsters.clear()

        this.monsters.forEach((monster, id) => {
            if (this.isMonsterVisible(monster)) {
                this.visibleMonsters.add(id)
            }
        })
    },

    isMonsterVisible(monster: Monster) {
        return monster.getDistanceFromMyPlayer() <= MyPlayer.visibilityRadius
            && this.isMonsterInViewport(monster)
    },

    isMonsterInViewport(monster: Monster) {
        return ViewportManager.isPointInVisibleMatrix(Math.floor(monster.pos.x), Math.floor(monster.pos.z), 2, monster.pos.y, 3)
    },

    isPointInMonster(x: number, z: number, size: number): Monster | null {
        const halfSize = size / 2
        for (const monster of this.monsters.values()) {
            if (Math.abs(monster.pos.x - x) < size && Math.abs(monster.pos.z - z) < halfSize + monster.mobType.boxSize / 2) {
                return monster
            }
        }
        return null
    },

    getVisibleMonstersSortedByDistance(): Monster[] {
        const sortedMonsters = Array.from(this.monsters.values())
            .filter(monster => this.visibleMonsters.has(monster.id))
            .sort((a, b) => {
                const distA = a.getDistanceFromMyPlayer()
                const distB = b.getDistanceFromMyPlayer()
                return distA - distB
            })
        return sortedMonsters
    }
}
