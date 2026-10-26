import { Targetable, TargetingManager } from '@/gui/targettingManager'
import { Renderer } from '@/babylon/scene/renderer'
import { Vector3 } from '@babylonjs/core'
import { MyPlayer } from '@/data/myPlayer'
import { CharacterActions } from '@/data/actions/characterActions'

const TARGET_MARKER_INTRO_DURATION = 350
const TARGET_MARKER_INTRO_SCALE = 2
const TARGET_MARKER_PULSE_SPEED = 250
const ATTACK_TARGET_MARKER_PULSE_SPEED = 175

export const TargetSelector = {
    target: null as Targetable | null,
    selectedTime: new Date().getTime(),
    markerPopTime: new Date().getTime(),
    attackTargetActive: false,
    cameraOrigin: Vector3.Zero(),
    cameraPosition: Vector3.Zero(),

    selectTarget(target: Targetable) {
        const selectedTime = new Date().getTime()
        this.target = target
        this.selectedTime = selectedTime
        this.markerPopTime = selectedTime
        this.attackTargetActive = false
    },

    unselectTarget() {
        this.target = null
        this.attackTargetActive = false
    },

    onFrame(timeRate: number, actualTime: number, ctx: CanvasRenderingContext2D) {
        if (!this.target) {
            return
        }
        const screenPos = this.target.getPositionOnScreen()
        let sprite = null
        let attackTarget = false
        if (MyPlayer.activeAction === CharacterActions.AUTO_ATTACK && MyPlayer.myChar.autoAttackTarget === this.target) {
            sprite = TargetingManager.getTargetSpriteEnemyAttackTarget()
            attackTarget = true
        } else if (this.target.getRelationToMyPlayer() === 'ENEMY') {
            sprite = TargetingManager.getTargetSpriteEnemy()
        } else {
            sprite = TargetingManager.getTargetSpriteAlly()
        }
        if (attackTarget !== this.attackTargetActive) {
            if (attackTarget) {
                this.markerPopTime = actualTime
            }
            this.attackTargetActive = attackTarget
        }
        if (!sprite || !screenPos) {
            return
        }

        const x = Math.round(screenPos.x)
        const y = Math.round(screenPos.y)

        const camWorldMatrix = Renderer.camera!.getWorldMatrix()
        Vector3.TransformCoordinatesToRef(this.cameraOrigin, camWorldMatrix, this.cameraPosition)
        const distanceFromCam = Math.hypot(
            this.cameraPosition.x - this.target.pos.x,
            this.cameraPosition.y - this.target.pos.y,
            this.cameraPosition.z - this.target.pos.z,
        )
        const markerPopAge = Math.max(0, actualTime - this.markerPopTime)
        let animationScale: number
        if (markerPopAge < TARGET_MARKER_INTRO_DURATION) {
            const progress = markerPopAge / TARGET_MARKER_INTRO_DURATION
            const easedProgress = 1 - Math.pow(1 - progress, 3)
            animationScale = TARGET_MARKER_INTRO_SCALE + (1 - TARGET_MARKER_INTRO_SCALE) * easedProgress
        } else {
            const pulseSpeed = attackTarget ? ATTACK_TARGET_MARKER_PULSE_SPEED : TARGET_MARKER_PULSE_SPEED
            animationScale = (Math.sin((markerPopAge - TARGET_MARKER_INTRO_DURATION) / pulseSpeed) * 0.2) + 1
        }
        const scale = (20 / distanceFromCam) * animationScale
        const w = sprite.width * scale
        const h = sprite.height * scale
        ctx.drawImage(sprite, x - w/2, y - h/2, w, h)
    }
}
