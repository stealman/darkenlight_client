import { Targetable, TargetingManager } from '@/gui/targettingManager'
import { Renderer } from '@/babylon/scene/renderer'
import { Vector3 } from '@babylonjs/core'
import { MyPlayer } from '@/data/myPlayer'
import { CharacterActions } from '@/data/actions/characterActions'

export const TargetSelector = {
    target: null as Targetable | null,
    selectedTime: new Date().getTime(),

    selectTarget(target: Targetable) {
        this.target = target
        this.selectedTime = new Date().getTime()
    },

    unselectTarget() {
        this.target = null
    },

    onFrame(timeRate: number, actualTime: number, ctx: CanvasRenderingContext2D) {
        if (!this.target) {
            return
        }
        const screenPos = this.target.getPositionOnScreen()
        let sprite = null
        if (this.target.getRelationToMyPlayer() === 'ENEMY') {
            if (MyPlayer.activeAction === CharacterActions.AUTO_ATTACK && MyPlayer.myChar.autoAttackTarget && MyPlayer.myChar.autoAttackTarget === this.target) {
                sprite = TargetingManager.getTargetSpriteEnemyAttackTarget()
            } else {
                sprite = TargetingManager.getTargetSpriteEnemy()
            }
        } else {
            sprite = TargetingManager.getTargetSpriteAlly()
        }
        if (!sprite || !screenPos) {
            return
        }

        const x = Math.round(screenPos.x)
        const y = Math.round(screenPos.y)

        const camWorldMatrix = Renderer.camera!.getWorldMatrix()
        const cameraPos = Vector3.TransformCoordinates(Vector3.Zero(), camWorldMatrix)
        const distanceFromCam = cameraPos.subtract(this.target.pos).length()
        const scale = (20 / distanceFromCam) * ((Math.sin((actualTime - this.selectedTime) / 250) * 0.2) + 1)
        const w = sprite.width * scale
        const h = sprite.height * scale
        ctx.drawImage(sprite, x - w/2, y - h/2, w, h)
    }
}
