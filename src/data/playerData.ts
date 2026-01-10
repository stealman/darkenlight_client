import { Vector3 } from '@babylonjs/core'
import { ViewportManager } from '@/utils/viewport'
import { BodySoundTypes, FootStepSpeeds, FootStepTypes, WeaponSoundTypes } from '@/babylon/audio/audioManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { Attackable } from '@/GameManager'
import { StepMarksRenderer } from '@/babylon/world/stepMarksRenderer'

export class PlayerData implements Attackable {
    id: number = 1
    hp: number
    name: string = "Player"
    className: string = "Warrior"
    walkSpeed: number = 2.2
    runSpeed: number = 3.5
    boxSize: number = 0.8
    private actualSpeed: number = 0

    pos: Vector3
    logicYpos: number = 0

    movementType: string = 'WALK'
    modelRotation: number = 0
    private moveAngle: number | null = null
    private lookAngle: number | null = null
    targetBlock: Vector3 | null = null

    rotationSpeed: number = 15
    yMoveSpeed: number = 15

    attackCooldown: number = 2000
    attackAnimationTime: number = 1000 // 1000 is base attack time

    weaponSoundType: string = WeaponSoundTypes.SWORD
    bodySoundType: string = BodySoundTypes.HARD
    parrySoundType: string = WeaponSoundTypes.SWORD

    lastStepMarkTime: number = 0
    stepMarkSide: 'L' | 'R' = 'R'

    constructor(data: any) {
        this.hp = data.hp
        this.logicYpos = 0
        this.pos = new Vector3(data.x, 0, data.z)
        this.name = data.name
        this.className = data.cls
        this.attackCooldown = data.aaCd
        this.attackAnimationTime = data.aaDur
    }

    resolveStepMark(time: number, inCombat: boolean = false) {
        const block = WorldDataManager.getBlockOnPosition(this.pos)!
        if (!block.snowed) {
            return
        }
        if (this.lastStepMarkTime < time - 250) {
            this.lastStepMarkTime = time
            this.stepMarkSide = this.stepMarkSide === 'L' ? 'R' : 'L'
            StepMarksRenderer.addStepMark(this.stepMarkSide, this, this.logicYpos, this.modelRotation, time, inCombat)
        }
    }

    getPositionRounded(): Vector3 {
        return new Vector3(Math.round(this.pos.x), Math.round(this.pos.y), Math.round(this.pos.z))
    }

    setMoveAngle(angle: number | null) {
        this.moveAngle = angle
        this.setLookAngle(angle)
    }

    getMoveAngle() {
        return this.moveAngle
    }

    setLookAngle(angle: number | null) {
        this.lookAngle = angle
    }

    getLookAngle() {
        return this.lookAngle
    }

    getActualSpeed() {
        return this.actualSpeed
    }

    setActualSpeed(speed: number) {
        this.actualSpeed = speed
    }

    getPositionOnScreen() {
        return ViewportManager.getPositionOnScreen(this.pos)
    }

    getBoxSize() {
        return this.boxSize
    }

    getName() {
        return this.name
    }

    getModelHeight(): number {
        return 2
    }

    getNameTextNodeScreenPosition() {
        return ViewportManager.getPositionOnScreen(this.pos)
    }

    getObjectType(): string {
        return "C"
    }

    getWeaponSoundType(): string {
        return this.weaponSoundType
    }

    getBodySoundType(): string {
        return this.bodySoundType
    }

    getParrySoundType(): string | null {
        return this.parrySoundType
    }

    getFootStepSoundType(): string {
        const block = WorldDataManager.getBlockOnPosition(this.pos)!
        if (block.snowed) {
            return FootStepTypes.SNOW
        } else {
            return FootStepTypes.DIRT
        }
    }

    getStepSoundSpeed(): number {
        switch (this.getFootStepSoundType()) {
            case 'DIRT':
                return this.movementType === 'RUN' ? FootStepSpeeds.DIRT_RUN : FootStepSpeeds.DIRT_WALK
            case 'SNOW':
                return this.movementType === 'RUN' ? FootStepSpeeds.SNOW_RUN : FootStepSpeeds.SNOW_WALK
            default:
                return this.movementType === 'RUN' ? FootStepSpeeds.SNOW_RUN : FootStepSpeeds.SNOW_WALK
        }
    }
}
