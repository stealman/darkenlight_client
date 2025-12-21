import { Vector3 } from '@babylonjs/core'

export class PlayerData {
    id: number = 1
    hp: number
    walkSpeed: number = 2.2
    runSpeed: number = 3.5
    private actualSpeed: number = 0

    pos: Vector3
    logicYpos: number = 0

    modelRotation: number = 0
    private moveAngle: number | null = null
    targetBlock: Vector3 | null = null

    rotationSpeed: number = 15
    yMoveSpeed: number = 15

    lastAttackTime: number = 0
    attackCooldown: number = 1000
    attackAnimationTime: number = 800 // 1000 is base attack time

    constructor(hp = 0, xPos = 0, zPos = 0, yPos = 0) {
        this.hp = hp
        this.logicYpos = yPos
        this.pos = new Vector3(xPos, yPos, zPos)
    }

    getPositionRounded(): Vector3 {
        return new Vector3(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z))
    }

    setMoveAngle(angle: number | null) {
        this.moveAngle = angle
    }

    getMoveAngle() {
        return this.moveAngle
    }

    getActualSpeed() {
        return this.actualSpeed
    }

    setActualSpeed(speed: number) {
        this.actualSpeed = speed
    }
}
