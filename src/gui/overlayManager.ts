import { Targetable, TargetingManager } from '@/gui/targettingManager'
import { Renderer } from '@/babylon/scene/renderer'
import { Vector3 } from '@babylonjs/core'
import { CanvasTextUtils } from '@/gui/canvasTextUtils'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { ViewportManager } from '@/utils/viewport'
import { CharacterManager } from '@/babylon/character/characterManager'
import { MyPlayer } from '@/data/myPlayer'

export const OverlayManager = {
    overlayCanvas: null as HTMLCanvasElement,
    overlayCtx: null as CanvasRenderingContext2D | null,
    letterSpacingFix: 0 as number,
    fontSize: 14 as number,

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
        TargetSelector.onFrame(timeRate, time, this.overlayCtx!)
        this.renderNames(time, Math.abs(this.letterSpacingFix) > 0)
        this.renderDamagedBars()
        this.renderAttackTargetIndicator(time)
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
            if (MyPlayer.myChar.autoAttackTarget && MyPlayer.myChar.autoAttackTarget === this.target) {
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
