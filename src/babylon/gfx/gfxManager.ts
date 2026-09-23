import { Scene } from '@babylonjs/core'
import { CharacterEffect, EffectTarget, MonsterEffect } from '@/babylon/gfx/characterEffect'
import { CharacterManager } from '@/babylon/character/characterManager'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { BurningEffect } from '@/babylon/gfx/burningEffect'
import { SlowEffect } from '@/babylon/gfx/slowEffect'
import { MyPlayer } from '@/data/myPlayer'

export const GfxManager = {
    BURNING_AFFECT_ID: 6,
    SLOWING_AFFECT_ID: 5,

    scene: null as Scene | null,
    activeCharacterEffects: [] as CharacterEffect[],
    activeMonsterEffects: [] as MonsterEffect[],
    activeCharacterAffects: new Map<string, CharacterEffect>(),
    activeMonsterAffects: new Map<string, MonsterEffect>(),

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
        if (myChar) {
            this.syncCharacterAffect(myChar, this.BURNING_AFFECT_ID, MyPlayer.affectGroups.some(group => group.id === this.BURNING_AFFECT_ID), activeKeys, actualTime)
            this.syncCharacterAffect(myChar, this.SLOWING_AFFECT_ID, MyPlayer.affectGroups.some(group => group.id === this.SLOWING_AFFECT_ID), activeKeys, actualTime)
        }

        CharacterManager.characters.forEach(character => {
            this.syncCharacterAffect(character, this.BURNING_AFFECT_ID, character.publiclyVisibleAffects.has(this.BURNING_AFFECT_ID), activeKeys, actualTime)
            this.syncCharacterAffect(character, this.SLOWING_AFFECT_ID, character.publiclyVisibleAffects.has(this.SLOWING_AFFECT_ID), activeKeys, actualTime)
        })

        this.cleanupInactiveCharacterAffects(activeKeys, actualTime)
    },

    syncMonsterAffects(actualTime: number) {
        const activeKeys = new Set<string>()

        MonsterManager.monsters.forEach(monster => {
            this.syncMonsterAffect(monster, this.BURNING_AFFECT_ID, monster.publiclyVisibleAffects.has(this.BURNING_AFFECT_ID), activeKeys, actualTime)
            this.syncMonsterAffect(monster, this.SLOWING_AFFECT_ID, monster.publiclyVisibleAffects.has(this.SLOWING_AFFECT_ID), activeKeys, actualTime)
        })

        this.cleanupInactiveMonsterAffects(activeKeys, actualTime)
    },

    syncCharacterAffect(target: EffectTarget, affectId: number, isActive: boolean, activeKeys: Set<string>, actualTime: number) {
        if (!isActive || !target.isEffectVisible()) {
            return
        }

        const key = this.getAffectKey(target.id, affectId)
        activeKeys.add(key)

        let effect = this.activeCharacterAffects.get(key)
        if (!effect) {
            effect = this.createCharacterAffectEffect(target, affectId)
            if (!effect) {
                return
            }

            this.activeCharacterAffects.set(key, effect)
            effect.onStart(actualTime)
        }

        effect.onUpdate(actualTime)
    },

    syncMonsterAffect(target: EffectTarget & { killedTime: number }, affectId: number, isActive: boolean, activeKeys: Set<string>, actualTime: number) {
        if (target.killedTime > 0 || !isActive || !target.isEffectVisible()) {
            return
        }

        const key = this.getAffectKey(target.id, affectId)
        activeKeys.add(key)

        let effect = this.activeMonsterAffects.get(key)
        if (!effect) {
            effect = this.createMonsterAffectEffect(target, affectId)
            if (!effect) {
                return
            }

            this.activeMonsterAffects.set(key, effect)
            effect.onStart(actualTime)
        }

        effect.onUpdate(actualTime)
    },

    cleanupInactiveCharacterAffects(activeKeys: Set<string>, actualTime: number) {
        this.activeCharacterAffects.forEach((effect, key) => {
            if (activeKeys.has(key)) {
                return
            }

            if (!effect.target.isEffectVisible()) {
                effect.onUpdate(actualTime)
            }
            effect.onEnd()
            this.activeCharacterAffects.delete(key)
        })
    },

    cleanupInactiveMonsterAffects(activeKeys: Set<string>, actualTime: number) {
        this.activeMonsterAffects.forEach((effect, key) => {
            if (activeKeys.has(key)) {
                return
            }

            if (!effect.target.isEffectVisible()) {
                effect.onUpdate(actualTime)
            }
            effect.onEnd()
            this.activeMonsterAffects.delete(key)
        })
    },

    getAffectKey(targetId: number, affectId: number) {
        return `${targetId}_${affectId}`
    },

    createCharacterAffectEffect(target: EffectTarget, affectId: number): CharacterEffect | null {
        switch (affectId) {
        case this.BURNING_AFFECT_ID:
            return new BurningEffect(target)
        case this.SLOWING_AFFECT_ID:
            return new SlowEffect(target)
        default:
            return null
        }
    },

    createMonsterAffectEffect(target: EffectTarget, affectId: number): MonsterEffect | null {
        switch (affectId) {
        case this.BURNING_AFFECT_ID:
            return new BurningEffect(target)
        case this.SLOWING_AFFECT_ID:
            return new SlowEffect(target)
        default:
            return null
        }
    },
}
