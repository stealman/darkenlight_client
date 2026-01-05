import { Scene, Vector3 } from '@babylonjs/core'
import { Monster } from '@/babylon/monsters/monster'
import { MonsterLoader } from '@/babylon/monsters/monsterLoader'
import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MonsterCodebook, MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { ViewportManager } from '@/utils/viewport'
import { Data } from '@/data/globalData'

export const MonsterManager = {
    monsters: new Map as Map<number, Monster>,
    visibleMonsters: new Set<number>(),

    async initialize (scene: Scene) {
        await MonsterLoader.initialize(scene)
    },

    addMonster (id: number, type: number, position: { x: number, z: number }, hp: number, mv: number[] | undefined) {
        if (this.monsters.has(id)) {
            const mob = this.monsters.get(id)
            mob!.pos.x = position.x
            mob!.pos.z = position.z
            mob!.hp = hp
        } else {
            const monsterType: MonsterType = MonsterCodebook.getMonsterTypeById(type)
            const monster = new Monster(id, monsterType, position.x, position.z, hp)
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

    removeMonster (id: number) {
        if (this.monsters.has(id)) {
            this.visibleMonsters.delete(id)
            this.monsters.get(id)!.removeMonster()
            this.monsters.delete(id)
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

    monsterAttack(data: { id: number, tgt: number, tp: string, dur: number }) {
        const mob = this.monsters.get(data.id)
        if (data.tp === 'C' && data.tgt === Data.myChar.id) {
            mob?.doAutoAttack(Data.myChar, data.dur)
        }
    },

    monsterMoveStop(id: number, position: { x: number, z: number }) {
        if (this.monsters.has(id)) {
            const mob = this.monsters.get(id)
            mob!.pos.x = position.x
            mob!.pos.z = position.z
            mob!.resetTargetPoint()
        }
    },

    onFrame(timeRate: number, actualTime: number, frame: number) {
        if (frame % 10 === 0) {
            this.updateVisibleMonsters()
            this.monsters.forEach(monster => {
                monster.setVisible(this.visibleMonsters.has(monster.id))
            })
        }

        this.monsters.forEach(monster => {
            monster.onFrame(timeRate, actualTime)
        })
    },

    onAnimFrame(animFrame: number) {
        this.monsters.forEach(monster => {
            monster.onAnimFrame(animFrame)
        })
    },

    updateVisibleMonsters() {
        this.visibleMonsters.clear()

        this.monsters.forEach((monster, id) => {
            if (this.isMonsterInViewport(monster)) {
                this.visibleMonsters.add(id)
            }
        })
    },

    isMonsterInViewport(monster: Monster) {
        return ViewportManager.isPointInVisibleMatrix(Math.floor(monster.pos.x), Math.floor(monster.pos.z), 0)
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
