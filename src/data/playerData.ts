import { Vector3 } from '@babylonjs/core'
import { ViewportManager } from '@/utils/viewport'
import { Targetable } from '@/gui/targettingManager'

export class PlayerData implements Targetable {
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

    modelRotation: number = 0
    private moveAngle: number | null = null
    private lookAngle: number | null = null
    targetBlock: Vector3 | null = null

    rotationSpeed: number = 15
    yMoveSpeed: number = 15

    attackCooldown: number = 2000
    attackAnimationTime: number = 1000 // 1000 is base attack time

    constructor(data: any) {
        this.hp = data.hp
        this.logicYpos = 0
        this.pos = new Vector3(data.x, 0, data.z)
        this.name = data.name
        this.className = data.cls
        this.attackCooldown = data.aaCd
        this.attackAnimationTime = data.aaDur
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
}
