import { Vector3 } from '@babylonjs/core'

export class PlayerData {
    id: number = 1
    hp: number
    name: string = "Player"
    className: string = "Warrior"
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

    constructor(data: any) {
        this.hp = data.hp
        this.logicYpos = 0
        this.pos = new Vector3(data.x, 0, data.z)
        this.name = data.name
        this.className = data.cls
    }

    getPositionRounded(): Vector3 {
        return new Vector3(Math.round(this.pos.x), Math.round(this.pos.y), Math.round(this.pos.z))
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
