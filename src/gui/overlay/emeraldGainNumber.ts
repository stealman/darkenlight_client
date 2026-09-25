import { Monster } from '@/babylon/monsters/monster'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import { CanvasTextUtils } from '@/gui/canvasTextUtils'

export class EmeraldGainNumber {
    tgtMonster: Monster
    text: string
    bottomColor: string
    createdAt: number
    expiresAt: number
    static ttl: number = 2000

    constructor(monster: Monster, text: string, startTime: number) {
        this.tgtMonster = monster
        this.text = text
        this.bottomColor = CanvasTextUtils.getDarkenedColor('#20ff20')
        this.createdAt = startTime
        this.expiresAt = startTime + EmeraldGainNumber.ttl
    }

    static fromMonster(monster: Monster, emeraldAmount: number, time: number = Date.now()): EmeraldGainNumber | null {
        if (emeraldAmount <= 0) {
            return null
        }
        return new EmeraldGainNumber(monster, `${Math.floor(emeraldAmount)}`, time)
    }

    render(ctx: CanvasRenderingContext2D) {
        if (!MonsterManager.monsters.has(this.tgtMonster.id) && !MonsterManager.killedMonsters.has(this.tgtMonster)) {
            return
        }

        const pos = this.tgtMonster.getNameTextNodeScreenPosition()
        if (!pos) {
            return
        }

        const now = Date.now()
        const tightText = Math.abs(OverlayManager.letterSpacingFix) > 0
        const spacingFix = OverlayManager.letterSpacingFix
        const textWidth = CanvasTextUtils.getTextWidth(ctx, this.text, tightText, spacingFix)
        const remaining = Math.max(0, Math.min(EmeraldGainNumber.ttl, this.expiresAt - now))
        const progress = 1 - remaining / EmeraldGainNumber.ttl
        const alpha = progress <= 0.35 ? 1 : Math.max(0, 1 - (progress - 0.35) / 0.5)
        const riseProgress = 1 - Math.pow(2, -6 * progress)

        const x = pos.x
        const y = pos.y - (22 + riseProgress * 34) / window.devicePixelRatio
        const icon = OverlayManager.emeraldGainIcon
        const hasIcon = !!icon && icon.complete && icon.naturalWidth > 0
        const iconSize = OverlayManager.fontSize + 12
        const iconGap = 4
        const totalWidth = textWidth + (hasIcon ? iconSize + iconGap : 0)
        const blockStartX = -totalWidth / 2
        const textStartX = blockStartX + (hasIcon ? iconSize + iconGap : 0)
        const popScale = OverlayManager.getOverlayPopScale(this.createdAt, now)

        ctx.save()
        ctx.translate(x, y)
        ctx.scale(popScale, popScale)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
        ctx.lineWidth = 3
        const fillGradient = ctx.createLinearGradient(0, -OverlayManager.fontSize * 0.75, 0, OverlayManager.fontSize * 0.25)
        fillGradient.addColorStop(0, '#20ff20')
        fillGradient.addColorStop(1, this.bottomColor)
        ctx.fillStyle = fillGradient
        ctx.globalAlpha = alpha

        if (hasIcon) {
            ctx.drawImage(icon, blockStartX, -2 - iconSize / 2, iconSize, iconSize)
        }

        if (tightText) {
            ctx.textAlign = 'left'
            let cursorX = textStartX
            for (const ch of this.text) {
                ctx.strokeText(ch, cursorX, 0)
                cursorX += ctx.measureText(ch).width + spacingFix
            }
            CanvasTextUtils.drawText(ctx, this.text, textStartX, 0, true, spacingFix)
        } else {
            ctx.textAlign = 'center'
            const textCenterX = textStartX + textWidth / 2
            ctx.strokeText(this.text, textCenterX, 0)
            ctx.fillText(this.text, textCenterX, 0)
        }

        ctx.restore()
    }
}
