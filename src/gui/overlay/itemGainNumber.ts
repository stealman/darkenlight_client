import Character from '@/babylon/character/character'
import { Item } from '@/data/items/item'
import { MyPlayer } from '@/data/myPlayer'
import { CharacterManager } from '@/babylon/character/characterManager'
import { CanvasTextUtils } from '@/gui/canvasTextUtils'
import { OverlayManager } from '@/gui/overlay/overlayManager'

export class ItemGainNumber {
    tgtCharacter: Character
    text: string
    iconUrl: string | null
    expiresAt: number
    static ttl: number = 2000

    constructor(character: Character, text: string, iconUrl: string | null, startTime: number) {
        this.tgtCharacter = character
        this.text = text
        this.iconUrl = iconUrl
        this.expiresAt = startTime + ItemGainNumber.ttl
    }

    static fromCharacter(character: Character, quantity: number, item: Item, time: number = Date.now()): ItemGainNumber | null {
        if (quantity <= 0) {
            return null
        }
        const itemWithImageUrl = item as Item & { imageUrl?: string | null }
        const itemIconUrl = itemWithImageUrl.imageUrl || item.imgUrl || null
        return new ItemGainNumber(character, `${Math.floor(quantity)}`, itemIconUrl, time)
    }

    render(ctx: CanvasRenderingContext2D) {
        if (this.tgtCharacter !== MyPlayer.myChar && !CharacterManager.characters.has(this.tgtCharacter.id)) {
            return
        }

        const pos = this.tgtCharacter.getNameTextNodeScreenPosition()
        if (!pos) {
            return
        }

        const now = Date.now()
        const tightText = Math.abs(OverlayManager.letterSpacingFix) > 0
        const spacingFix = OverlayManager.letterSpacingFix
        const textWidth = CanvasTextUtils.getTextWidth(ctx, this.text, tightText, spacingFix)
        const remaining = Math.max(0, Math.min(ItemGainNumber.ttl, this.expiresAt - now))
        const progress = 1 - (remaining / ItemGainNumber.ttl)
        const alpha = progress <= 0.35 ? 1 : Math.max(0, 1 - ((progress - 0.35) / 0.5))
        const riseProgress = 1 - Math.pow(2, -6 * progress)

        const x = pos.x
        const y = pos.y - (22 + (riseProgress * 34)) / window.devicePixelRatio
        const icon = OverlayManager.getItemGainIcon(this.iconUrl)
        const hasIcon = !!icon && icon.complete && icon.naturalWidth > 0
        const iconSize = OverlayManager.fontSize + 12
        const iconGap = 4
        const totalWidth = textWidth + (hasIcon ? iconSize + iconGap : 0)
        const blockStartX = x - totalWidth / 2
        const textStartX = blockStartX + (hasIcon ? iconSize + iconGap : 0)

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
        ctx.lineWidth = 3
        ctx.fillStyle = '#f0f0f0'
        ctx.globalAlpha = alpha

        if (hasIcon) {
            ctx.drawImage(icon, blockStartX, -2 + y - iconSize / 2, iconSize, iconSize)
        }

        if (tightText) {
            ctx.textAlign = 'left'
            let cursorX = textStartX
            for (const ch of this.text) {
                ctx.strokeText(ch, cursorX, y)
                cursorX += ctx.measureText(ch).width + spacingFix
            }
            CanvasTextUtils.drawText(ctx, this.text, textStartX, y, true, spacingFix)
        } else {
            ctx.textAlign = 'center'
            const textCenterX = textStartX + textWidth / 2
            ctx.strokeText(this.text, textCenterX, y)
            ctx.fillText(this.text, textCenterX, y)
        }

        ctx.globalAlpha = 1
    }
}
