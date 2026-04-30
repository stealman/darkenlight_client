import { MyPlayer } from '@/data/myPlayer'
import Character from '@/babylon/character/character'
import { ViewportManager } from '@/utils/viewport'
import { Utils } from '@/utils/utils'
import {
    AttackableBasicTO,
    AutoAttackMessage,
    AutoAttackResultMessage, CharacterCampingMessage,
    CharacterCraftingMessage,
    EffectDamageMessage,
    CharacterGatheringMessage,
    CharacterGatheringResultMessage,
    CharacterRestingMessage,
    HealingMessage,
    HealingResultMessage, PotionUsedMessage, PubliclyVisibleAffectData,
} from '@/network/messageIfs'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import { TargetingManager } from '@/gui/targettingManager'
import { PubliclyVisibleAffect } from '@/data/affects'

export const CharacterManager = {
    characters: new Map<number, Character>(),
    visibleCharacters: new Set<number>(),

    initialize () {
        this.characters = new Map<number, Character>()
        this.visibleCharacters = new Set<number>()
    },

    async addCharacter(data) {
        if (this.characters.has(data.id)) {
            const char = this.characters.get(data.id)!
            char!.pos.x = data.x
            char!.pos.z = data.z
            char!.hp = data.hp
            char.pos.y = Utils.calculateWalkYPos(char.pos.x, char.pos.z, char.getBoxSize())
            char.logicYpos = char.pos.y

            if (data.paf) char.consumePubliclyVisibleAffects(data.paf)
        } else {
            const newChar = new Character(data)
            this.characters.set(data.id, newChar)

            await newChar.createModel(false)
            newChar.insideView = this.isCharInViewport(newChar)

            // If char is in view, initialize model immediately
            if (newChar.insideView) {
                await newChar.model!.initAsync();
            }

            if (data.paf) newChar.consumePubliclyVisibleAffects(data.paf)
        }
    },

    removeCharacter(id: number) {
        if (this.characters.has(id)) {
            const char = this.characters.get(id)!
            char.clearTimedAction()
            char.model?.removeFromScene()
            this.visibleCharacters.delete(id)
            this.characters.delete(id)

            if (TargetingManager.selectedTarget?.id === id) {
                TargetingManager.unselectTarget()
            }
        }
    },

    onFrame(timeRate: number, actualTime: number, frame: number) {
        if (frame % 10 === 0) {
            this.updateVisibleChars()
            this.characters.forEach(char => {
                char.setVisible(this.visibleCharacters.has(char.id))
            })
        }

        this.characters.forEach(char => {
            char.onFrame(timeRate, actualTime, false)
        })
    },

    charMove(data) {
        const id = data[0]
        if (id === MyPlayer.myChar.id) {
            const dist = Math.sqrt( (MyPlayer.myChar.pos.x - data[1]) * (MyPlayer.myChar.pos.x - data[1]) + (MyPlayer.myChar.pos.z - data[2]) * (MyPlayer.myChar.pos.z - data[2]) )
            if (dist > 1) {
                MyPlayer.myChar.pos.x = data[1]
                MyPlayer.myChar.pos.z = data[2]
                MyPlayer.myChar.setMoveAngle(data[3])
                MyPlayer.myChar.setActualSpeed(data[4])
            }
        } else {
            const char = this.characters.get(id)
            if (char) {
                char.pos.x = data[1]
                char.pos.z = data[2]
                char.pos.y = Utils.calculateWalkYPos(char.pos.x, char.pos.z, char.getBoxSize())
                char.logicYpos = char.pos.y
                char.setMoveAngle(data[3])
                char.setActualSpeed(data[4])
                char.setMoveType(data[5])
            }
        }
    },

    startAutoAttack(data: AutoAttackMessage) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.startAutoAttack(data)
        } else {
            const char = this.characters.get(data.id)
            if (char) {
                char.startAutoAttack(data)
            }
        }
    },

    finishAutoAttack(data: AutoAttackResultMessage) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.finishAutoAttack(data)
            if (data.tp === 'M') {
                OverlayManager.addMonsterDamageNumber(data.tgt, data.res.d, data.res.h)
            }
            if (data.tp === 'C') {
                OverlayManager.addCharacterDamageNumber(data.tgt, data.res.d, data.res.h)
            }
        } else {
            const char = this.characters.get(data.id)
            if (char) {
                char.finishAutoAttack(data)
            }
        }

    },

    startGathering(data: CharacterGatheringMessage) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.myChar.startGathering(data)
        } else {
            const char = this.characters.get(data.id)
            if (char) {
                char.startGathering(data)
            }
        }
    },

    finishGathering(data: CharacterGatheringResultMessage) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.myChar.finishGathering(data)
        } else {
            const char = this.characters.get(data.id)
            if (char) {
                char.finishGathering(data)
            }
        }
    },

    autoAttackBroken(data) {
        if (data === MyPlayer.myChar.id) {
        } else {
            const char = this.characters.get(data)
            if (char) {
                char.breakAutoAttack()
            }
        }
    },

    startHealing(data: HealingMessage) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.startHealing(data)
        } else {
            const char = this.characters.get(data.id)
            if (char) {
                char.startHealing(data)
            }
        }
    },

    finishHealing(data: HealingResultMessage) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.finishHealing(data)
        } else {
            const char = this.characters.get(data.id)
            if (char) {
                char.finishHealing(data)
            }
        }

        if (data.tgt === MyPlayer.myChar.id) {
            OverlayManager.addMyCharDamageNumber(MyPlayer.myChar, -data.res.hp, 'h')
        } else {
            // If I am healing someone else, show heal numbers above their head
            if (data.id === MyPlayer.myChar.id && data.tp === 'C') {
                OverlayManager.addCharacterDamageNumber(data.tgt, -data.res.hp, 'h')
            }
        }
    },

    startCamping(data: CharacterCampingMessage) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.myChar.startCamping(data)
        } else {
            const char = this.characters.get(data.id)
            if (char) {
                char.startCamping(data)
            }
        }
    },

    startCrafting(data: CharacterCraftingMessage) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.myChar.startCrafting(data)
        } else {
            const char = this.characters.get(data.id)
            if (char) {
                char.startCrafting(data)
            }
        }
    },

    startResting(data: CharacterRestingMessage) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.myChar.startResting(data)
        } else {
            const char = this.characters.get(data.id)
            console.log('start resting', char)
            if (char) {
                char.startResting(data)
            }
        }
    },

    stopAction(id) {
        if (id === MyPlayer.myChar.id) {
            MyPlayer.myChar.clearTimedAction()
        } else {
            const char = this.characters.get(id)
            if (char) {
                char.clearTimedAction()
            }
        }
    },

    basicDataChange(data: AttackableBasicTO) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.basicDataChange(data)
        } else {
            const char = this.characters.get(data.id)
            if (char) {
               char.basicDataChange(data)
            }
        }
    },

    equipSetChange(data) {
        if (data.id === MyPlayer.myChar.id) {
            // Nothing to do, handled locally in InventoryManager when equipping/unequipping items
        } else {
            const char = this.characters.get(data.id)
            if (char) {
               char.changeEquipSet(data.equipSet)
            }
        }
    },

    potionUsed(data: PotionUsedMessage) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.potionUsed(data)
        } else {
            const char = this.characters.get(data.id)
            if (char) {
               char.potionUsed()
            }
        }
    },

    publiclyVisibleAffectChange(data: PubliclyVisibleAffectData) {
        const char = data.tgt === MyPlayer.myChar?.id ? MyPlayer.myChar : this.characters.get(data.tgt)
        if (!char) {
            return
        }
        if (data.p > 0) {
            char.publiclyVisibleAffects.set(data.id, new PubliclyVisibleAffect(data.id, data.p))
        } else {
            char.publiclyVisibleAffects.delete(data.id)
        }
    },

    processEffectDamage(data: EffectDamageMessage) {
        if (data.d === 0 || (data.id !== MyPlayer.myChar.id && (!data.ids.includes(MyPlayer.myChar.id) || !this.characters.has(data.id)) && (data.id != TargetingManager.selectedTarget?.id) ) ) {
            return
        }

        if (data.id === MyPlayer.myChar.id) {
            OverlayManager.addMyCharDamageNumber(MyPlayer.myChar, data.d, 'h')
            return
        }
        OverlayManager.addCharacterDamageNumber(data.id, data.d, 'h')
    },

    updateVisibleChars() {
        this.visibleCharacters.clear()
        this.characters.forEach((char, id) => {
            if (this.isCharInViewport(char)) {
                const distanceToPlayer = char.getDistanceFromMyPlayer()
                if (distanceToPlayer <= MyPlayer.visibilityRadius) {
                    this.visibleCharacters.add(id)
                }
            }
        })
    },

    isCharInViewport(char: Character) {
        return ViewportManager.isPointInVisibleMatrix(Math.floor(char.pos.x), Math.floor(char.pos.z), 1)
    },

    isPointInCharacter(x: number, z: number, size: number, ignoredId?: number): Character | null {
        const halfSize = size / 2
        const myCharId = MyPlayer.myChar?.id

        if (myCharId !== ignoredId && Math.abs(MyPlayer.myChar.pos.x - x) < size && Math.abs(MyPlayer.myChar.pos.z - z) < halfSize + MyPlayer.myChar.getBoxSize() / 2) {
            return MyPlayer.myChar
        }

        for (const character of this.characters.values()) {
            if (character.id === ignoredId) {
                continue
            }

            if (Math.abs(character.pos.x - x) < size && Math.abs(character.pos.z - z) < halfSize + character.getBoxSize() / 2) {
                return character
            }
        }

        return null
    },
}
