import type { Vector3 } from '@babylonjs/core'
import type { OverlayCanvasView } from '@/gui/canvasTextUtils'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { CharacterManager } from '@/babylon/character/characterManager'
import { MyPlayer } from '@/data/myPlayer'
import { CharacterActions } from '@/data/actions/characterActions'
import type { MonsterAggroAlertData } from '@/network/messageIfs'

interface AnimatedHpBar {
    displayedPercent: number
    lastUpdatedAt: number
    lastSeenAt: number
}


export class OverlayIndicators {
    damagedBarBackground: HTMLCanvasElement | null = null
    animatedHpBars = new WeakMap<object, AnimatedHpBar>()
    monsterAggroAlerts = new Map<number, {worldId: number, startedAt: number}>()
    aggroAlertIcon: HTMLCanvasElement | null = null

    constructor(private readonly view: OverlayCanvasView) {}

    initialize() {
        if (!this.damagedBarBackground) {
            // Rasterize the rounded background once; frame rendering only copies pixels.
            const background = document.createElement('canvas')
            background.width = 50
            background.height = 6
            const ctx = background.getContext('2d')!
            ctx.fillStyle = 'rgba(0, 0, 0, 0.42)'
            ctx.beginPath()
            ctx.roundRect(0, 0, background.width, background.height, 2)
            ctx.fill()
            this.damagedBarBackground = background
        }
        const alertIcon = document.createElement('canvas')
        const alertFontSize = this.view.fontSize + 6
        const padding = 10 // Leave room for the outline and blurred shadow.
        alertIcon.width = alertFontSize * 2 + padding * 2
        alertIcon.height = alertFontSize * 2 + padding * 2
        const alertCtx = alertIcon.getContext('2d')!
        alertCtx.font = `bold ${alertFontSize}px "Roboto", Arial, sans-serif`
        alertCtx.textAlign = 'center'
        alertCtx.textBaseline = 'bottom'
        alertCtx.fillStyle = `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--ui-danger').trim()})`
        alertCtx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
        alertCtx.lineWidth = 3
        alertCtx.lineJoin = 'round'
        alertCtx.shadowColor = 'rgba(0, 0, 0, .65)'
        alertCtx.shadowBlur = 3
        alertCtx.strokeText('!', alertIcon.width / 2, alertIcon.height - padding)
        alertCtx.fillText('!', alertIcon.width / 2, alertIcon.height - padding)
        this.aggroAlertIcon = alertIcon
    }

    reset() {
        this.monsterAggroAlerts.clear()
        this.animatedHpBars = new WeakMap<object, AnimatedHpBar>()
    }

    onResize() {}

    addMonsterAggroAlert(data: MonsterAggroAlertData) {
        if (data.worldId !== MyPlayer.worldId) return
        this.monsterAggroAlerts.set(data.id, {worldId: data.worldId, startedAt: Date.now()})
    }

    renderMonsterAggroAlerts(time: number) {
        if (!this.monsterAggroAlerts.size) return
        const ctx = this.view.ctx!
        const icon = this.aggroAlertIcon!
        ctx.save()
        for (const [id, alert] of this.monsterAggroAlerts) {
            const age = Math.max(0, time - alert.startedAt)
            const monster = MonsterManager.monsters.get(id)
            if (age >= 5000 || alert.worldId !== MyPlayer.worldId || monster?.killedTime || (monster && monster.hpPercent <= 0)) {
                this.monsterAggroAlerts.delete(id)
                continue
            }
            if (!monster || !MonsterManager.visibleMonsters.has(id)) continue
            const pos = monster.getNameTextNodeScreenPosition()
            if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue
            const pulse = Math.cos(age / 700 * Math.PI * 2)
            const scale = 1 + .1 * (pulse + 1)
            const width = icon.width * scale
            const height = icon.height * scale
            ctx.globalAlpha = (.6 + .3 * pulse) * Math.min(1, (5000 - age) / 400)
            // The cached text baseline is 10px above the bottom of the image.
            ctx.drawImage(icon, pos.x - width / 2, pos.y - 10 - (icon.height - 10) * scale, width, height)
        }
        ctx.restore()
    }

    renderDamagedBars(time: number) {
        MonsterManager.monsters.forEach((monster) => {
            if (!MonsterManager.visibleMonsters.has(monster.id)) {
                return
            }
            const displayedPercent = this.getAnimatedHpPercent(monster, monster.hpPercent, time)
            if (monster.hpPercent < 100 || displayedPercent < 99.95) {
                const pos = monster.getNameTextNodeScreenPosition()
                if (pos) {
                    this.renderDamagedBar(pos, displayedPercent, monster.getRelationToMyPlayer() === 'ENEMY')
                }
            }
        })

        CharacterManager.characters.forEach((char) => {
            if (!CharacterManager.visibleCharacters.has(char.id)) {
                return
            }
            const displayedPercent = this.getAnimatedHpPercent(char, char.hpPercent, time)
            if (char.hpPercent < 100 || displayedPercent < 99.95) {
                const pos = char.getNameTextNodeScreenPosition()
                if (pos) {
                    this.renderDamagedBar(pos, displayedPercent, char.getRelationToMyPlayer() === 'ENEMY')
                }
            }
        })

        const displayedMyHpPercent = this.getAnimatedHpPercent(MyPlayer.myChar, MyPlayer.myChar.hpPercent, time)
        if (MyPlayer.myChar.hpPercent < 99 || displayedMyHpPercent < 99.95) {
            const pos = MyPlayer.myChar.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderDamagedBar(pos, displayedMyHpPercent, false)
            }
        }

    }

    getAnimatedHpPercent(target: object, hpPercent: number, time: number) {
        const numericHpPercent = Number(hpPercent)
        const targetPercent = Number.isFinite(numericHpPercent) ? Math.max(0, Math.min(100, numericHpPercent)) : 100
        let state = this.animatedHpBars.get(target)
        if (state && state.lastSeenAt + 15000 < time) {
            this.animatedHpBars.delete(target)
            state = undefined
        }
        if (!state) {
            if (targetPercent >= 100) {
                return targetPercent
            }
            state = {
                displayedPercent: 100,
                lastUpdatedAt: time,
                lastSeenAt: time,
            }
            this.animatedHpBars.set(target, state)
            return state.displayedPercent
        }

        const elapsed = Math.max(0, Math.min(100, time - state.lastUpdatedAt))
        const progress = 1 - Math.exp(-elapsed / 65)
        const nextPercent = state.displayedPercent + (targetPercent - state.displayedPercent) * progress

        state.displayedPercent = Math.abs(targetPercent - nextPercent) < 0.05 ? targetPercent : nextPercent
        state.lastUpdatedAt = time
        state.lastSeenAt = time
        return state.displayedPercent
    }

    renderHealingMarkers(time: number) {
        CharacterManager.characters.forEach((char) => {
            if (!CharacterManager.visibleCharacters.has(char.id)) {
                return
            }
            if (char.healingActive && char.healingEndTime + 500 > time) {
                const pos = char.getNameTextNodeScreenPosition()
                if (pos) {
                    this.renderHealingMarker(pos, time, char.healSelf)
                }
            }
        })

        if (MyPlayer.myChar.healingActive && MyPlayer.activeAction === CharacterActions.HEAL && MyPlayer.myChar.healingEndTime + 500 > time) {
            const pos = MyPlayer.myChar.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderHealingMarker(pos, time, MyPlayer.myChar.healSelf)
            }
        }
    }

    renderDamagedBar(pos: Vector3, percent: number, enemy: boolean) {
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(percent)) {
            return
        }

        const ctx = this.view.ctx!
        const background = this.damagedBarBackground!
        const barWidth = background.width
        const barHeight = background.height

        const x = pos.x - barWidth / 2
        const y = pos.y - 2

        // Background
        ctx.drawImage(background, x, y)

        // Fill
        const fillWidth = (barWidth - 2) * (percent / 100)
        if (fillWidth <= 0) {
            return
        }
        const fillGradient = ctx.createLinearGradient(x + 1, y, x + 1 + fillWidth, y)
        if (enemy) {
            fillGradient.addColorStop(0, 'rgba(112, 20, 20, 0.6)')
            fillGradient.addColorStop(1, 'rgba(230, 58, 52, 0.7)')
        } else {
            fillGradient.addColorStop(0, 'rgba(12, 92, 92, 0.6)')
            fillGradient.addColorStop(1, 'rgba(48, 214, 204, 0.7)')
        }
        ctx.fillStyle = fillGradient
        ctx.fillRect(x + 1, y + 1, fillWidth, barHeight - 2)
    }

    renderHealingMarker(pos: Vector3, time: number, healSelf: boolean) {
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(time)) {
            return
        }

        const ctx = this.view.ctx!
        const x = pos.x + 40

        const size = 15
        const thickness = 5
        const pulse = (Math.sin(time / 200) + 1) / 2
        const alpha = 0.2 + pulse * 0.65
        const glowColor = healSelf ? '255, 68, 54' : '78, 255, 82'
        const fillGradient = ctx.createLinearGradient(x - size / 2, pos.y - size / 2, x + size / 2, pos.y + size / 2)

        if (healSelf) {
            fillGradient.addColorStop(0, `rgba(255, 196, 178, ${alpha})`)
            fillGradient.addColorStop(0.45, `rgba(239, 57, 45, ${alpha})`)
            fillGradient.addColorStop(1, `rgba(142, 14, 19, ${alpha})`)
        } else {
            fillGradient.addColorStop(0, `rgba(219, 255, 202, ${alpha})`)
            fillGradient.addColorStop(0.45, `rgba(64, 238, 79, ${alpha})`)
            fillGradient.addColorStop(1, `rgba(12, 125, 36, ${alpha})`)
        }

        const drawCross = (crossSize: number, crossThickness: number) => {
            ctx.beginPath()
            ctx.rect(x - crossThickness / 2, pos.y - crossSize / 2, crossThickness, crossSize)
            ctx.rect(x - crossSize / 2, pos.y - crossThickness / 2, crossSize, crossThickness)
            ctx.fill()
        }

        // A softly pulsing halo gives healing a presence without obscuring the scene.
        ctx.save()
        ctx.fillStyle = `rgba(${glowColor}, ${alpha * (0.25 + pulse * 0.4)})`
        ctx.shadowColor = `rgba(${glowColor}, ${alpha * 0.95})`
        ctx.shadowBlur = 9 + pulse * 10
        drawCross(size + 3, thickness + 3)
        ctx.restore()

        // Dark outline keeps the glow readable over bright terrain.
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.9})`
        drawCross(size + 2, thickness + 2)

        ctx.fillStyle = fillGradient
        drawCross(size, thickness)
    }

}
