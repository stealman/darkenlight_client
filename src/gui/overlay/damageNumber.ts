import { Attackable } from '@/GameManager'
import { Monster } from '@/babylon/monsters/monster'
import Character from '@/babylon/character/character'
import { MyPlayer } from '@/data/myPlayer'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { CanvasTextUtils } from '@/gui/canvasTextUtils'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import { t } from '@/i18n'

export class DamageNumber {
    attacker: Attackable
    tgtMonster: Monster | null = null
    tgtCharacter: Character | null = null
    text: string
    color: string
    expiresAt: number
    static ttl: number = 1500

    constructor(attacker: Attackable, monster: Monster | null, character: Character | null, text: string, color: string, expiresAt: number) {
        this.tgtMonster = monster
        this.tgtCharacter = character
        this.attacker = attacker
        this.text = text
        this.color = color
        this.expiresAt = expiresAt + DamageNumber.ttl
    }

    static fromHitMonster(attacker: Attackable, monster: Monster, damage: number, hitType: string = 'h', time: number = Date.now()): DamageNumber | null {
        if (hitType === 'm') {
            return new DamageNumber(attacker, monster, null, t('common.miss'), '#c7c7c7', time)
        }
        if (hitType === 'b') {
            return new DamageNumber(attacker, monster, null, t('common.blocked'), '#c7c7c7', time)
        }
        if (damage < 0) {
            return new DamageNumber(attacker, monster, null, `+${Math.floor(-damage)}`, '#20ff20', time)
        }
        if (damage === 0) {
            return null
        }
        return new DamageNumber(attacker, monster, null, `-${Math.floor(damage)}`, '#f08f56', time)
    }

    static fromHitCharacter(attacker: Attackable, char: Character, damage: number, hitType: string = 'h', time: number = Date.now()): DamageNumber | null {
        if (hitType === 'm') {
            return new DamageNumber(attacker, null, char,t('common.miss'), '#c7c7c7', time)
        }
        if (hitType === 'b') {
            return new DamageNumber(attacker, null, char, t('common.blocked'), '#c7c7c7', time)
        }
        if (damage <= 0) {
            // Healing is sent as negative damage, but we want to display it as positive number with plus sign.
            return new DamageNumber(attacker, null, char, `+${Math.floor(-damage)}`, '#20ff20', time)
        } else if (damage > 0) {
            return new DamageNumber(attacker, null, char, `-${Math.floor(damage)}`, '#f08f56', time)
        }
    }

    static fromHitMyChar(attacker: Attackable, damage: number, hitType: string = 'h', time: number = Date.now()): DamageNumber | null {
        if (hitType === 'm') {
            return new DamageNumber(attacker, null, MyPlayer.myChar,t('common.miss'), '#c7c7c7', time)
        }
        if (hitType === 'b') {
            return new DamageNumber(attacker, null, MyPlayer.myChar, t('common.blocked'), '#c7c7c7', time)
        }
        if (damage < 0) {
            // Healing is sent as negative damage, but we want to display it as positive number with plus sign.
            return new DamageNumber(attacker, null, MyPlayer.myChar, `+${Math.floor(-damage)}`, '#20ff20', time)
        } else if (damage > 0) {
            return new DamageNumber(attacker, null, MyPlayer.myChar, `-${Math.floor(damage)}`, '#ff2020', time)
        }
    }

    render(ctx: CanvasRenderingContext2D) {
        if (this.tgtMonster && !MonsterManager.monsters.has(this.tgtMonster.id) && !MonsterManager.killedMonsters.has(this.tgtMonster)) {
            return
        }

        const pos = this.tgtMonster ? this.tgtMonster.getNameTextNodeScreenPosition() : this.tgtCharacter ? this.tgtCharacter.getNameTextNodeScreenPosition() : null
        if (!pos) {
            return
        }

        const tgtXpos = this.tgtMonster ? this.tgtMonster.pos.x : this.tgtCharacter ? this.tgtCharacter.pos.x : 0
        const tgtZpos = this.tgtMonster ? this.tgtMonster.pos.z : this.tgtCharacter ? this.tgtCharacter.pos.z : 0
        const relX = tgtXpos - this.attacker.pos.x
        const relZ = tgtZpos - this.attacker.pos.z

        const now = Date.now()
        const tightText = Math.abs(OverlayManager.letterSpacingFix) > 0
        const spacingFix = OverlayManager.letterSpacingFix
        const textWidth = CanvasTextUtils.getTextWidth(ctx, this.text, tightText, spacingFix)
        const remaining = Math.max(0, Math.min(DamageNumber.ttl, this.expiresAt - now))
        const progress = 1 - (remaining / DamageNumber.ttl)
        const alpha = progress <= 0.35 ? 1 : Math.max(0, 1 - ((progress - 0.35) / 0.5))
        const riseProgress = 1 - Math.pow(2, -6 * progress)
        const isoRelX = (relX - relZ) / Math.SQRT2
        const relDist = Math.sqrt((relX * relX) + (relZ * relZ))
        const angleFactor = relDist > 0 ? Math.abs(isoRelX) / relDist : 0
        const driftDir = isoRelX >= 0 ? 1 : -1
        const x = pos.x + (driftDir * angleFactor * riseProgress * 30) / window.devicePixelRatio
        const y = pos.y - (0 + (riseProgress * 30)) / window.devicePixelRatio
        const textStartX = x - textWidth / 2

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
        ctx.lineWidth = 3
        ctx.fillStyle = this.color
        ctx.globalAlpha = alpha

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
            ctx.strokeText(this.text, x, y)
            ctx.fillText(this.text, x, y)
        }
        ctx.globalAlpha = 1
    }
}
