import { Scene } from '@babylonjs/core'
import { CharacterEffect, MonsterEffect } from '@/babylon/gfx/characterEffect'
import { CharacterManager } from '@/babylon/character/characterManager'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { BurningEffect } from '@/babylon/gfx/burningEffect'
import { MyPlayer } from '@/data/myPlayer'

export const GfxManager = {
    BURNING_AFFECT_ID: 6,
    scene: null as Scene | null,
    activeCharacterEffects: [] as CharacterEffect[],
    activeMonsterEffects: [] as MonsterEffect[],
    activeCharacterAffects: new Map<string, BurningEffect>(),
    activeMonsterAffects: new Map<string, BurningEffect>(),

    initialize(scene: Scene) {
        this.clear()
        this.scene = scene
    },

    addEffect(effect: CharacterEffect, actualTime: number = Date.now()) {
        this.addCharacterEffect(effect, actualTime)
    },

    addCharacterEffect(effect: CharacterEffect, actualTime: number = Date.now()) {
        if (!this.scene) {
            return
        }

        this.activeCharacterEffects.push(effect)
        effect.onStart(actualTime)
    },

    onFrame(actualTime: number) {
        this.updateTimedCharacterEffects(actualTime)
        this.updateTimedMonsterEffects(actualTime)
        this.syncCharacterAffects(actualTime)
        this.syncMonsterAffects(actualTime)
    },

    clear() {
        this.activeCharacterEffects.forEach(effect => effect.onEnd())
        this.activeMonsterEffects.forEach(effect => effect.onEnd())
        this.activeCharacterAffects.forEach(effect => effect.onEnd())
        this.activeMonsterAffects.forEach(effect => effect.onEnd())

        this.activeCharacterEffects = []
        this.activeMonsterEffects = []
        this.activeCharacterAffects.clear()
        this.activeMonsterAffects.clear()
    },

    updateTimedCharacterEffects(actualTime: number) {
        for (let i = this.activeCharacterEffects.length - 1; i >= 0; i--) {
            const effect = this.activeCharacterEffects[i]
            effect.onUpdate(actualTime)

            if (!effect.isFinished(actualTime)) {
                continue
            }

            effect.onEnd()
            this.activeCharacterEffects.splice(i, 1)
        }
    },

    updateTimedMonsterEffects(actualTime: number) {
        for (let i = this.activeMonsterEffects.length - 1; i >= 0; i--) {
            const effect = this.activeMonsterEffects[i]
            effect.onUpdate(actualTime)

            if (!effect.isFinished(actualTime)) {
                continue
            }

            effect.onEnd()
            this.activeMonsterEffects.splice(i, 1)
        }
    },

    syncCharacterAffects(actualTime: number) {
        const activeKeys = new Set<string>()

        const myChar = MyPlayer.myChar
        if (myChar?.publiclyVisibleAffects.has(this.BURNING_AFFECT_ID)) {
            const key = this.getAffectKey(myChar.id, this.BURNING_AFFECT_ID)
            activeKeys.add(key)

            let effect = this.activeCharacterAffects.get(key)
            if (!effect) {
                effect = new BurningEffect(myChar)
                this.activeCharacterAffects.set(key, effect)
                effect.onStart(actualTime)
            }

            effect.onUpdate(actualTime)
        }

        CharacterManager.characters.forEach(character => {
            if (!character.publiclyVisibleAffects.has(this.BURNING_AFFECT_ID)) {
                return
            }

            const key = this.getAffectKey(character.id, this.BURNING_AFFECT_ID)
            activeKeys.add(key)

            let effect = this.activeCharacterAffects.get(key)
            if (!effect) {
                effect = new BurningEffect(character)
                this.activeCharacterAffects.set(key, effect)
                effect.onStart(actualTime)
            }

            effect.onUpdate(actualTime)
        })

        this.cleanupInactiveCharacterAffects(activeKeys)
    },

    syncMonsterAffects(actualTime: number) {
        const activeKeys = new Set<string>()

        MonsterManager.monsters.forEach(monster => {
            if (monster.killedTime > 0 || !monster.publiclyVisibleAffects.has(this.BURNING_AFFECT_ID)) {
                return
            }

            const key = this.getAffectKey(monster.id, this.BURNING_AFFECT_ID)
            activeKeys.add(key)

            let effect = this.activeMonsterAffects.get(key)
            if (!effect) {
                effect = new BurningEffect(monster)
                this.activeMonsterAffects.set(key, effect)
                effect.onStart(actualTime)
            }

            effect.onUpdate(actualTime)
        })

        this.cleanupInactiveMonsterAffects(activeKeys)
    },

    cleanupInactiveCharacterAffects(activeKeys: Set<string>) {
        this.activeCharacterAffects.forEach((effect, key) => {
            if (activeKeys.has(key)) {
                return
            }

            effect.onEnd()
            this.activeCharacterAffects.delete(key)
        })
    },

    cleanupInactiveMonsterAffects(activeKeys: Set<string>) {
        this.activeMonsterAffects.forEach((effect, key) => {
            if (activeKeys.has(key)) {
                return
            }

            effect.onEnd()
            this.activeMonsterAffects.delete(key)
        })
    },

    getAffectKey(targetId: number, affectId: number) {
        return `${targetId}_${affectId}`
    },
}
