import {
    Scene, Vector3,
} from '@babylonjs/core'
import { Utils } from '@/utils/utils'
import Character from '@/babylon/character/character'
import { CharacterModel } from '@/babylon/character/characterModel'
import { ref } from 'vue'


/**
 * Controlling object for the player's character
 */
export const MyPlayer = {
    worldId: 0 as number,
    worldName: "" as string,

    myChar: null as Character,
    myModel: null as CharacterModel | null,
    myCharRef: ref(null as Character | null),

    aaActive: true as boolean,

    async initialize(character: Character, scene: Scene) {
        this.myChar = character
        await this.myChar.createModel(scene)
        this.myModel = this.myChar.model as CharacterModel

        this.myChar.pos.y = Utils.calculateYPos(this.myChar.pos.x, this.myChar.pos.z, this.myChar.getBoxSize())
        this.myChar.logicYpos = this.myChar.pos.y
        this.myCharRef.value = this.myChar
    },

    reset() {
        this.myChar?.reset()
    },

    doAutoAttack(data: any) {
        this.myChar?.doAutoAttack(data)
    },

    autoAttackFinished(data: any) {
        this.myChar?.autoAttackFinished(data)
    },

    onFrame(timeRate: number, actualTime: number) {
        this.myChar?.onFrame(timeRate, actualTime)
    },

    setMoveTypeAngle(movementType: string, angle: number) {
        this.myChar?.setMoveTypeAngle(movementType, angle)

    },

    setTargetPoint(point: Vector3 | null, resetAngleSpeedIfNull: boolean = true) {
        this.myChar?.setTargetPoint(point, resetAngleSpeedIfNull)
    },
}
