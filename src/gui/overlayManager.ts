import { Targetable, TargetingManager } from '@/gui/targettingManager'
import { Renderer } from '@/babylon/scene/renderer'
import { Vector3 } from '@babylonjs/core'
import { CanvasTextUtils } from '@/gui/canvasTextUtils'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { ViewportManager } from '@/utils/viewport'
import { CharacterManager } from '@/babylon/character/characterManager'
import { MyPlayer } from '@/data/myPlayer'
import { CharacterActions } from '@/gui/actionButtonsManager'
import { Monster } from '@/babylon/monsters/monster'

class DamageNumber {
    monster: Monster
    text: string
    color: string
    expiresAt: number
    static ttl: number = 1500

    constructor(monster: Monster, text: string, color: string, expiresAt: number) {
        this.monster = monster
        this.text = text
        this.color = color
        this.expiresAt = expiresAt + DamageNumber.ttl
    }

    static fromHit(monster: Monster, damage: number, hitType: string = 'h', time: number = Date.now()): DamageNumber | null {
        if (hitType === 'm') {
            return new DamageNumber(monster, 'Miss', '#c7c7c7', time)
        }
        if (hitType === 'b') {
            return new DamageNumber(monster, 'Block', '#c7c7c7', time)
        }
        if (damage <= 0) {
            return null
        }

        return new DamageNumber(monster, `-${Math.floor(damage)}`, '#f08f56', time)
    }

    render(ctx: CanvasRenderingContext2D) {
        if (!MonsterManager.monsters.has(this.monster.id) && !MonsterManager.killedMonsters.has(this.monster)) {
            return
        }

        const pos = this.monster.getNameTextNodeScreenPosition()
        if (!pos) {
            return
        }

        const now = Date.now()
        const tightText = Math.abs(OverlayManager.letterSpacingFix) > 0
        const spacingFix = OverlayManager.letterSpacingFix
        const textWidth = CanvasTextUtils.getTextWidth(ctx, this.text, tightText, spacingFix)
        const remaining = Math.max(0, Math.min(DamageNumber.ttl, this.expiresAt - now))
        const progress = 1 - (remaining / DamageNumber.ttl)
        const alpha = progress <= 0.35 ? 1 : Math.max(0, 1 - ((progress - 0.35) / 0.5))
        const riseProgress = 1 - Math.pow(2, -6 * progress)
        const relX = this.monster.pos.x - MyPlayer.myChar.pos.x
        const relZ = this.monster.pos.z - MyPlayer.myChar.pos.z
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

export const OverlayManager = {
    overlayCanvas: null as HTMLCanvasElement,
    overlayCtx: null as CanvasRenderingContext2D | null,
    letterSpacingFix: 0 as number,
    fontSize: 14 as number,
    damageNumbers: [] as DamageNumber[],

    async initialize() {
        this.overlayCanvas = document.getElementById("overlayCanvas") as HTMLCanvasElement
        this.overlayCtx = this.overlayCanvas.getContext("2d")
        this.overlayCtx!.lineWidth = 1
        TargetSelector.unselectTarget()
    },

    targetSelected(target: Targetable) {
        TargetSelector.selectTarget(target)
    },

    unselectTarget() {
        TargetSelector.unselectTarget()
    },

    onFrame(timeRate: number, time: number) {
        this.overlayCtx!.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height)

        if (MyPlayer.myChar.hpPercent < 25) {
            this.setBloodyInnerGlow(MyPlayer.myChar.hpPercent, time)
        }

        TargetSelector.onFrame(timeRate, time, this.overlayCtx!)
        this.renderNames(time, Math.abs(this.letterSpacingFix) > 0)
        this.renderDamageNumbers(time)
        this.renderDamagedBars()
        this.renderHealingMarkers(time)
        this.renderAttackTargetIndicator(time)

    },

    setBloodyInnerGlow(hpPercent: number, time: number) {
        const ctx = this.overlayCanvas.getContext('2d')
        if (!ctx) return

        const w = this.overlayCanvas.width / window.devicePixelRatio
        const h = this.overlayCanvas.height / window.devicePixelRatio

        if (hpPercent >= 25) return

        const intensity = (25 - hpPercent) / 25
        const pulse = (Math.sin(time / 250) + 1) / 2
        const alpha = intensity * (0.5 + pulse * 0.5)

        // Vignette gradient (střed průhledný, okraje červené)
        const cx = w * 0.5
        const cy = h * 0.5

        const innerR = Math.min(w, h) * 0.40
        const outerR = Math.min(w, h) * 0.80

        const g = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR)
        g.addColorStop(0.00, `rgba(255, 0, 0, 0)`)
        g.addColorStop(0.65, `rgba(255, 0, 0, ${0.2 * alpha})`)
        g.addColorStop(1.00, `rgba(255, 0, 0, ${0.5 * alpha})`)

        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
    },

    renderNames(time: number, tightText: boolean) {
        MonsterManager.monsters.forEach(monster => {
            if (monster.nameDisplayTime > time) {
                const pos = monster.getNameTextNodeScreenPosition()
                if (pos) {
                    this.renderName(pos, monster.mobType.name, tightText, monster.getRelationToMyPlayer())
                }
            }
        })

        CharacterManager.characters.forEach(char => {
            if (char.nameDisplayTime > time) {
                const pos = char.getNameTextNodeScreenPosition()
                if (pos) {
                    this.renderName(pos, char.name, tightText, char.getRelationToMyPlayer())
                }
            }
        })
    },

    addMonsterDamageNumber(monsterId: number, damage: number, hitType: string = 'h', time: number = Date.now()) {
        const monster = MonsterManager.monsters.get(monsterId)
        if (!monster) {
            return
        }
        const damageNumber = DamageNumber.fromHit(monster, damage, hitType, time)
        if (!damageNumber) {
            return
        }
        this.damageNumbers.push(damageNumber)
    },

    renderDamageNumbers(time: number) {
        this.damageNumbers = this.damageNumbers.filter(item => item.expiresAt > time)
        if (this.damageNumbers.length === 0) {
            return
        }

        const ctx = this.overlayCtx!
        ctx.save()
        ctx.font = `${this.fontSize}px "Roboto", Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        this.damageNumbers.forEach(item => {
            item.render(ctx)
        })

        ctx.restore()
    },

    renderDamagedBars() {
        MonsterManager.monsters.forEach(monster => {
            if (!MonsterManager.visibleMonsters.has(monster.id)) {
                return
            }
            if (monster.hpPercent < 100) {
                const pos = monster.getNameTextNodeScreenPosition()
                if (pos) {
                    this.renderDamagedBar(pos, monster.hpPercent, monster.getRelationToMyPlayer() === 'ENEMY')
                }
            }
        })

        CharacterManager.characters.forEach(char => {
            if (!CharacterManager.visibleCharacters.has(char.id)) {
                return
            }
            if (char.hpPercent < 100) {
                const pos = char.getNameTextNodeScreenPosition()
                if (pos) {
                    this.renderDamagedBar(pos, char.hpPercent, char.getRelationToMyPlayer() === 'ENEMY')
                }
            }
        })

        if (MyPlayer.myChar.hpPercent < 99) {
            const pos = MyPlayer.myChar.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderDamagedBar(pos, MyPlayer.myChar.hpPercent, false)
            }
        }


    },

    renderHealingMarkers(time) {
        CharacterManager.characters.forEach(char => {
            if (!CharacterManager.visibleCharacters.has(char.id)) {
                return
            }
            if (char.healingActive && char.healingEndTime + 500 > time) {
                const pos = char.getNameTextNodeScreenPosition()
                if (pos) {
                    this.renderHealingSelfMarker(pos, time)
                }
            }
        })

        if (MyPlayer.myChar.healingActive && MyPlayer.activeAction === CharacterActions.SELF_HEAL && MyPlayer.myChar.healingEndTime + 500 > time) {
            const pos = MyPlayer.myChar.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderHealingSelfMarker(pos, time)
            }
        }
    },

    renderAttackTargetIndicator(actualTime) {
        if (MyPlayer.myChar.autoAttackTarget && TargetingManager.selectedTarget !== MyPlayer.myChar.autoAttackTarget) {
            const screenPos = MyPlayer.myChar.autoAttackTarget.getPositionOnScreen()
            const sprite = TargetingManager.getTargetSpriteEnemyAttackTarget()
            if (sprite && screenPos) {
                const x = Math.round(screenPos.x)
                const y = Math.round(screenPos.y)

                const camWorldMatrix = Renderer.camera!.getWorldMatrix()
                const cameraPos = Vector3.TransformCoordinates(Vector3.Zero(), camWorldMatrix)
                const distanceFromCam = cameraPos.subtract(MyPlayer.myChar.autoAttackTarget.pos).length()
                //const scale = (20 / distanceFromCam)

                const scale = (20 / distanceFromCam) * ((Math.sin((actualTime) / 250) * 0.2) + 1)

                const w = sprite.width * scale
                const h = sprite.height * scale

                this.overlayCtx!.drawImage(sprite, x - w/2, y - h/2, w, h)
            }
        }
    },

    renderDamagedBar(pos: Vector3, percent: number, enemy: boolean) {
        const ctx = this.overlayCtx!
        const barWidth = 50
        const barHeight = 6

        const x = pos.x - barWidth / 2
        const y = pos.y -2

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
        ctx.fillRect(x, y, barWidth, barHeight)

        // Fill
        const fillWidth = (barWidth - 2) * (percent / 100)
        ctx.fillStyle = enemy ? 'rgba(200, 32, 32, 0.65)' : 'rgba(25, 175, 175, 0.65)'
        ctx.fillRect(x + 1, y + 1, fillWidth, barHeight - 2)
    },

    renderHealingSelfMarker(pos: Vector3, time: number) {
        const ctx = this.overlayCtx!
        const x = pos.x + 40

        const size = 15
        const thickness = 5
        const alpha = 0.2 + (Math.sin(time / 200) + 1) / 2 * 0.65

        const drawCross = (crossSize: number, crossThickness: number) => {
            ctx.beginPath()
            ctx.rect(x - crossThickness / 2, pos.y - crossSize / 2, crossThickness, crossSize)
            ctx.rect(x - crossSize / 2, pos.y - crossThickness / 2, crossSize, crossThickness)
            ctx.fill()
        }

        // 1px outline via slightly larger black cross behind the red one.
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`
        drawCross(size + 2, thickness + 2)

        // Fill - pulsating red cross (single fill operation, no center overdraw).
        ctx.fillStyle = `rgba(225, 32, 32, ${alpha})`
        drawCross(size, thickness)
    },

    renderName(pos: Vector3, name: string, tightText: boolean, relation: 'ALLY' | 'ENEMY' | 'NEUTRAL') {
        const ctx = this.overlayCtx!
        ctx.font = `${this.fontSize}px "Roboto", Arial, sans-serif`
        ctx.fontKerning = 'normal'
        ctx.textBaseline = 'middle'

        const dpr = window.devicePixelRatio || 1
        const paddingX = 8 / dpr
        const paddingY = 4 / dpr
        const spacingFix = this.letterSpacingFix
        const textWidth = CanvasTextUtils.getTextWidth(ctx, name, tightText, spacingFix)
        const textHeight = this.fontSize

        ViewportManager.movePositionToScreen(pos, textWidth / 2, textHeight + 10)

        const x = pos.x
        const y = pos.y - 3

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
        ctx.fillRect(
            x - textWidth / 2 - paddingX,
            -5 + y - textHeight / 2 - paddingY,
            textWidth + paddingX * 2,
            textHeight + paddingY * 2
        )
        // Text
        switch (relation) {
            case 'ALLY':
                ctx.fillStyle = '#56aaff'
                break
            case 'ENEMY':
                ctx.fillStyle = '#f08f56'
                break
            case 'NEUTRAL':
                ctx.fillStyle = '#aaa'
                break
        }

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
