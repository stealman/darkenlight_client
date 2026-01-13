import { MyPlayer } from '@/data/myPlayer'
import Character from '@/babylon/character/character'
import { ViewportManager } from '@/utils/viewport'
import { Utils } from '@/utils/utils'

export const CharacterManager = {
    characters: new Map<number, Character>(),
    visibleCharacters: new Set<number>(),

    initialize () {
        this.characters = new Map<number, Character>()
        this.visibleCharacters = new Set<number>()
    },

    async addCharacter(data) {
        console.log("Adding/updating character:", data)
        if (this.characters.has(data.id)) {
            const char = this.characters.get(data.id)!
            char!.pos.x = data.x
            char!.pos.z = data.z
            char!.hp = data.hp
            char.pos.y = Utils.calculateYPos(char.pos.x, char.pos.z, char.getBoxSize())
            char.logicYpos = char.pos.y
        } else {
            const newChar = new Character(data)
            await newChar.createModel(false)
            newChar.insideView = this.isCharInViewport(newChar)

            // If char is in view, initialize model immediately
            if (newChar.insideView) {
                await newChar.model!.initAsync();
            }
            this.characters.set(data.id, newChar)
        }
    },

    removeCharacter(id: number) {
        if (this.characters.has(id)) {
            const char = this.characters.get(id)!
            char.model?.removeFromScene()
            this.visibleCharacters.delete(id)
            this.characters.delete(id)
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

    processCharMove(data) {
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
                char.pos.y = Utils.calculateYPos(char.pos.x, char.pos.z, char.getBoxSize())
                char.logicYpos = char.pos.y
                char.setMoveAngle(data[3])
                char.setActualSpeed(data[4])
            }
        }
    },

    processStartAutoAttack(data) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.startAutoAttack(data)
        } else {
            const char = this.characters.get(data.id)
            if (char) {
                char.startAutoAttack(data)
            }
        }
    },

    processFinishAutoAttack(data) {
        if (data.id === MyPlayer.myChar.id) {
            MyPlayer.finishAutoAttack(data)
        } else {
            const char = this.characters.get(data.id)
            if (char) {
                char.finishAutoAttack(data)
            }
        }
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
        return ViewportManager.isPointInVisibleMatrix(Math.floor(char.pos.x), Math.floor(char.pos.z), 2)
    },
}
