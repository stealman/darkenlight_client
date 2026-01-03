import { Targetable, TargetingManager } from '@/gui/targettingManager'
import { Renderer } from '@/babylon/scene/renderer'
import { Vector3 } from '@babylonjs/core'
import { CanvasTextUtils } from '@/gui/canvasTextUtils'

export const OverlayManager = {
    overlayCanvas: null as HTMLCanvasElement,
    overlayCtx: null as CanvasRenderingContext2D | null,
    letterSpacingFix: 0 as number,
    fontSize: 14 as number,

    async initialize() {
        this.overlayCanvas = document.getElementById("overlayCanvas") as HTMLCanvasElement
        this.overlayCtx = this.overlayCanvas.getContext("2d")
        this.overlayCtx!.lineWidth = 1
    },

    targetSelected(target: Targetable) {
        TargetSelector.selectTarget(target)
    },

    onFrame(timeRate: number, actualTime: number) {
        this.overlayCtx!.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height)
        TargetSelector.onFrame(timeRate, actualTime, this.overlayCtx!)
        this.renderNames(Math.abs(this.letterSpacingFix) > 0)
    },

    renderNames(tightText: boolean) {
        if (!TargetSelector.target) return
        const screenPos = TargetSelector.target.getNameTextNodeScreenPosition()
        if (!screenPos) return

        const ctx = this.overlayCtx!
        const name = TargetSelector.target.getName()

        ctx.font = `${this.fontSize}px "Roboto", Arial, sans-serif`
        ctx.fontKerning = 'normal'
        ctx.textBaseline = 'middle'

        const dpr = window.devicePixelRatio || 1
        const paddingX = 8 / dpr
        const paddingY = 4 / dpr
        const spacingFix = this.letterSpacingFix
        const textWidth = CanvasTextUtils.getTextWidth(ctx, name, tightText, spacingFix)
        const textHeight = this.fontSize

        const x = screenPos.x
        const y = screenPos.y - 3

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
        ctx.fillRect(
            x - textWidth / 2 - paddingX,
            -5 + y - textHeight / 2 - paddingY,
            textWidth + paddingX * 2,
            textHeight + paddingY * 2
        )
        // Text
        ctx.fillStyle = '#FF2222'
        if (tightText) {
            CanvasTextUtils.drawText(ctx, name, x - textWidth / 2, y -3, true, spacingFix)
        } else {
            ctx.textAlign = 'center'
            ctx.fillText(name, x, y -3)
        }
    },

    onResize() {
        const dpr = window.devicePixelRatio || 1
        this.overlayCanvas.width = this.overlayCanvas.clientWidth * dpr
        this.overlayCanvas.height = this.overlayCanvas.clientHeight * dpr

        this.overlayCtx!.setTransform(dpr, 0, 0, dpr, 0, 0)
        this.letterSpacingFix = CanvasTextUtils.computeLetterSpacingFix(this.overlayCtx!, `${this.fontSize}px "Roboto", Arial, sans-serif`)
    },
}

const TargetSelector = {
    target: null as Targetable | null,
    selectedTime: new Date().getTime(),

    selectTarget(target: Targetable) {
        this.target = target
        this.selectedTime = new Date().getTime()
    },

    onFrame(timeRate: number, actualTime: number, ctx: CanvasRenderingContext2D) {
        if (!this.target) {
            return
        }
        const screenPos = this.target.getPositionOnScreen()
        const sprite = TargetingManager.getTargetSprite()
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
