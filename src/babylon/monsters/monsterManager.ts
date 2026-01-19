import { Vector3 } from '@babylonjs/core'
import { Monster } from '@/babylon/monsters/monster'
import { MonsterLoader } from '@/babylon/monsters/monsterLoader'
import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MonsterCodebook, MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { ViewportManager } from '@/utils/viewport'
import { TargetingManager } from '@/gui/targettingManager'
import { MyPlayer } from '@/data/myPlayer'
import { CharacterManager } from '@/babylon/character/characterManager'

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

    addMonster (id: number, type: number, position: { x: number, z: number }, hpp: number, mv: number[] | undefined) {
        if (this.monsters.has(id)) {
            const mob = this.monsters.get(id)
            mob!.pos.x = position.x
            mob!.pos.z = position.z
            mob!.hpPercent = hpp
        } else {
            const monsterType: MonsterType = MonsterCodebook.getMonsterTypeById(type)
            const monster = new Monster(id, monsterType, position.x, position.z, hpp)
            const monsterModel = new MonsterModel(monsterType, monster)
            monster.model = monsterModel

            monster.insideView = this.isMonsterInViewport(monster)

            // If monster is in view, initialize model immediately
            if (monster.insideView) {
                monsterModel.initializeModel()
            }

            this.monsters.set(id, monster)
        }

        if (mv?.length === 3) {
            this.monsterMove(id, { x: position.x, z: position.z }, { x: mv[0], z: mv[1] }, mv[2])
        }
    },

    removeMonster (id: number, killerId: number | null) {
        if (this.monsters.has(id)) {
            const mob = this.monsters.get(id)
            if (!mob) {
                return
            }
            this.monsterKilled(mob)
            if (mob === TargetingManager.selectedTarget) {
                TargetingManager.unselectTarget()
            }
        }
    },

    monsterMove(id: number, position: { x: number, z: number }, target: { x: number, z: number }, speed: number) {
        if (this.monsters.has(id)) {
            const mob = this.monsters.get(id)
            mob!.runSpeed = speed
            mob!.pos.x = position.x
            mob!.pos.z = position.z
            mob!.setTargetPoint(new Vector3(target.x, 0, target.z))
        }
    },

    autoAttack(data: { id: number, tgt: number, tp: string, dur: number }) {
        const mob = this.monsters.get(data.id)
        if (data.tp === 'C') {
            const targetChar = MyPlayer.myChar.id === data.tgt ? MyPlayer.myChar : CharacterManager.characters.get(data.tgt)
            if (!targetChar) {
                return
            }
            mob?.doAutoAttack(targetChar, data.dur)
        }
    },

    autoAttackFinished(data: any) {
        const monster = this.monsters.get(data.id)
        if (!monster) {
            return
        }
        monster.autoAttackFinished(data)
    },

    monsterMoveStop(id: number, position: { x: number, z: number }) {
        if (this.monsters.has(id)) {
            const mob = this.monsters.get(id)
            mob!.pos.x = position.x
            mob!.pos.z = position.z
            mob!.resetTargetPoint()
        }
    },

    monsterKilled(mob: Monster) {
        mob.killedTime = Date.now()
        mob.model.doDie()
        this.killedMonsters.add(mob)
    },

    onFrame(timeRate: number, actualTime: number, frame: number) {
        if (frame % 10 === 0) {
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
            if (this.monsters.has(monster.id)) {
                this.visibleMonsters.delete(monster.id)
                this.monsters.delete(monster.id)
            }

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
            if (monster.killedTime == 0 && this.isMonsterInViewport(monster)) {
                const distanceToPlayer = monster.getDistanceFromMyPlayer()
                if (distanceToPlayer <= MyPlayer.visibilityRadius) {
                    this.visibleMonsters.add(id)
                }
            }
        })
    },

    isMonsterInViewport(monster: Monster) {
        return ViewportManager.isPointInVisibleMatrix(Math.floor(monster.pos.x), Math.floor(monster.pos.z), 2)
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
