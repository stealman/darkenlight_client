import { Targetable, TargetingManager } from '@/gui/targettingManager'
import { Renderer } from '@/babylon/scene/renderer'
import { Vector3 } from '@babylonjs/core'
import { CanvasTextUtils } from '@/gui/canvasTextUtils'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { ViewportManager } from '@/utils/viewport'
import { CharacterManager } from '@/babylon/character/characterManager'
import { NpcManager } from '@/babylon/npc/npcManager'
import { MyPlayer } from '@/data/myPlayer'
import Character from '@/babylon/character/character'
import { Attackable } from '@/GameManager'
import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { Item } from '@/data/items/item'
import { CharacterActions } from '@/data/actions/characterActions'
import { TargetSelector } from '@/gui/overlay/targetSelector'
import { DamageNumber } from '@/gui/overlay/damageNumber'
import { EmeraldGainNumber } from '@/gui/overlay/emeraldGainNumber'
import { ItemGainNumber } from '@/gui/overlay/itemGainNumber'
import { GmOreTierOverlay } from '@/gui/gm/oreTierOverlay'

interface AnimatedHpBar {
    displayedPercent: number
    lastUpdatedAt: number
    lastSeenAt: number
}

export const OverlayManager = {
    overlayCanvas: null as HTMLCanvasElement,
    overlayCtx: null as CanvasRenderingContext2D | null,
    letterSpacingFix: 0 as number,
    fontSize: 14 as number,
    damageNumbers: [] as DamageNumber[],
    emeraldGainNumbers: [] as EmeraldGainNumber[],
    itemGainNumbers: [] as ItemGainNumber[],
    emeraldGainIcon: null as HTMLImageElement | null,
    itemGainIcons: new Map<string, HTMLImageElement>(),
    animatedHpBars: new Map<string, AnimatedHpBar>(),
    lastHpBarCleanupAt: 0 as number,

    async initialize() {
        this.overlayCanvas = document.getElementById('overlayCanvas') as HTMLCanvasElement
        this.overlayCtx = this.overlayCanvas.getContext('2d')
        this.overlayCtx!.lineWidth = 1
        this.fontSize = window.devicePixelRatio > 1 ? 14 : 18
        this.emeraldGainIcon = new Image()
        this.emeraldGainIcon.src = '/images/icons/emerald.png'
        this.reset()
    },

    reset() {
        this.damageNumbers = []
        this.emeraldGainNumbers = []
        this.itemGainNumbers = []
        this.animatedHpBars.clear()
        this.lastHpBarCleanupAt = 0
        TargetSelector.unselectTarget()
    },

    targetSelected(target: Targetable) {
        TargetSelector.selectTarget(target)
    },

    unselectTarget() {
        TargetSelector.unselectTarget()
    },

    getOverlayPopScale(createdAt: number, time: number) {
        const age = Math.max(0, time - createdAt)
        if (age < 98) {
            return 1 + 0.5 * (age / 98)
        }
        if (age < 225) {
            return 1.5 - 0.5 * ((age - 98) / 127)
        }
        return 1
    },

    onFrame(timeRate: number, time: number) {
        this.overlayCtx!.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height)

        if (MyPlayer.myChar.hpPercent < 25) {
            this.setBloodyInnerGlow(MyPlayer.myChar.hpPercent, time)
        }

        TargetSelector.onFrame(timeRate, time, this.overlayCtx!)
        this.renderNames(time, Math.abs(this.letterSpacingFix) > 0)
        this.renderDamageNumbers(time)
        this.renderEmeraldGainNumbers(time)
        this.renderItemGainNumbers(time)
        this.renderDamagedBars(time)
        this.renderHealingMarkers(time)
        this.renderAttackTargetIndicator(time)
        GmOreTierOverlay.onFrame(this.overlayCtx!)
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

        const innerR = Math.min(w, h) * 0.4
        const outerR = Math.min(w, h) * 0.8

        const g = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR)
        g.addColorStop(0.0, `rgba(255, 0, 0, 0)`)
        g.addColorStop(0.65, `rgba(255, 0, 0, ${0.2 * alpha})`)
        g.addColorStop(1.0, `rgba(255, 0, 0, ${0.5 * alpha})`)

        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
    },

    renderNames(time: number, tightText: boolean) {
        MonsterManager.monsters.forEach((monster) => {
            if (MonsterManager.visibleMonsters.has(monster.id) && monster.nameDisplayTime > time) {
                const pos = monster.getNameTextNodeScreenPosition()
                if (pos) {
                    this.renderName(pos, monster.mobType.name, tightText, monster.getRelationToMyPlayer(), true)
                }
            }
        })

        CharacterManager.characters.forEach((char) => {
            if (char.nameDisplayTime <= time && !char.activeTimedAction) {
                return
            }

            const pos = char.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderCharacterLabel(pos, char, time, tightText)
            }
        })

        NpcManager.npcs.forEach((npc) => {
            if (!NpcManager.visibleNpcs.has(npc.id)) {
                return
            }
            const pos = npc.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderNpcLabel(pos, npc.name, npc.getTitle(), tightText)
            }
        })

        if (MyPlayer.myChar.nameDisplayTime > time || MyPlayer.myChar.activeTimedAction) {
            const pos = MyPlayer.myChar.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderCharacterLabel(pos, MyPlayer.myChar, time, tightText)
            }
        }

        const nearestItem = GroundItemsManager.nearbyItem
        if (nearestItem && nearestItem.nameDisplayTime > time) {
            const pos = nearestItem.getNameTextNodeScreenPosition()
            const itemName = nearestItem.item.name
            if (pos && itemName) {
                let displayName = itemName
                if (nearestItem.item.isStackable()) {
                    const qtyRaw = (nearestItem.item.atts as any)?.qty
                    const qty = Number(qtyRaw)
                    if (!Number.isNaN(qty) && qty > 0) {
                        displayName = `${qty}x  ${itemName}`
                    }
                }
                this.renderName(pos, displayName, tightText, 'NEUTRAL', true)
            }
        }
    },

    addMonsterDamageNumber(monsterId: number, damage: number, hitType: string = 'h', hitQuality: 'P' | 'N' | 'G' | null = null, time: number = Date.now()) {
        const monster = MonsterManager.monsters.get(monsterId)
        if (!monster) {
            return
        }
        const damageNumber = DamageNumber.fromHitMonster(MyPlayer.myChar, monster, damage, hitType, hitQuality, time)
        if (!damageNumber) {
            return
        }
        this.damageNumbers.push(damageNumber)
    },

    addCharacterDamageNumber(charId: number, damage: number, hitType: string = 'h', hitQuality: 'P' | 'N' | 'G' | null = null, time: number = Date.now()) {
        const char = CharacterManager.characters.get(charId)
        if (!char) {
            return
        }
        const damageNumber = DamageNumber.fromHitCharacter(MyPlayer.myChar, char, damage, hitType, hitQuality, time)
        if (!damageNumber) {
            return
        }
        this.damageNumbers.push(damageNumber)
    },

    addMyCharDamageNumber(attacker: Attackable, damage: number, hitType: string = 'h', hitQuality: 'P' | 'N' | 'G' | null = null, time: number = Date.now()) {
        const damageNumber = DamageNumber.fromHitMyChar(attacker, damage, hitType, hitQuality, time)
        if (!damageNumber) {
            return
        }
        this.damageNumbers.push(damageNumber)
    },

    addMonsterEmeraldNumber(monsterId: number, emeraldGain: number, time: number = Date.now()) {
        const monster = MonsterManager.monsters.get(monsterId)
        if (!monster) {
            return
        }
        const emeraldNumber = EmeraldGainNumber.fromMonster(monster, emeraldGain, time)
        if (!emeraldNumber) {
            return
        }
        this.emeraldGainNumbers.push(emeraldNumber)
    },

    addCharacterItemGainNumber(char: Character, quantity: number, item: Item, time: number = Date.now()) {
        const itemGainNumber = ItemGainNumber.fromCharacter(char, quantity, item, time)
        if (!itemGainNumber) {
            return
        }
        this.itemGainNumbers.push(itemGainNumber)
    },

    renderDamageNumbers(time: number) {
        this.damageNumbers = this.damageNumbers.filter((item) => item.expiresAt > time)
        if (this.damageNumbers.length === 0) {
            return
        }

        const ctx = this.overlayCtx!
        ctx.save()
        ctx.font = `${this.fontSize}px "Roboto", Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        this.damageNumbers.forEach((item) => {
            item.render(ctx)
        })

        ctx.restore()
    },

    renderEmeraldGainNumbers(time: number) {
        this.emeraldGainNumbers = this.emeraldGainNumbers.filter((item) => item.expiresAt > time)
        if (this.emeraldGainNumbers.length === 0) {
            return
        }

        const ctx = this.overlayCtx!
        ctx.save()
        ctx.font = `${this.fontSize + 6}px "Roboto", Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        this.emeraldGainNumbers.forEach((item) => {
            item.render(ctx)
        })

        ctx.restore()
    },

    renderItemGainNumbers(time: number) {
        this.itemGainNumbers = this.itemGainNumbers.filter((item) => item.expiresAt > time)
        if (this.itemGainNumbers.length === 0) {
            return
        }

        const ctx = this.overlayCtx!
        ctx.save()
        ctx.font = `${this.fontSize + 6}px "Roboto", Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        this.itemGainNumbers.forEach((item) => {
            item.render(ctx)
        })

        ctx.restore()
    },

    getItemGainIcon(iconUrl: string | null): HTMLImageElement | null {
        if (!iconUrl) {
            return null
        }

        let normalizedUrl = iconUrl
        if (!normalizedUrl.startsWith('/') && !normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
            normalizedUrl = `/${normalizedUrl}`
        }

        let icon = this.itemGainIcons.get(normalizedUrl)
        if (!icon) {
            icon = new Image()
            icon.src = normalizedUrl
            this.itemGainIcons.set(normalizedUrl, icon)
        }
        return icon
    },

    renderDamagedBars(time: number) {
        MonsterManager.monsters.forEach((monster) => {
            if (!MonsterManager.visibleMonsters.has(monster.id)) {
                return
            }
            const displayedPercent = this.getAnimatedHpPercent(`M:${monster.id}`, monster.hpPercent, time)
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
            const displayedPercent = this.getAnimatedHpPercent(`C:${char.id}`, char.hpPercent, time)
            if (char.hpPercent < 100 || displayedPercent < 99.95) {
                const pos = char.getNameTextNodeScreenPosition()
                if (pos) {
                    this.renderDamagedBar(pos, displayedPercent, char.getRelationToMyPlayer() === 'ENEMY')
                }
            }
        })

        const displayedMyHpPercent = this.getAnimatedHpPercent('P:me', MyPlayer.myChar.hpPercent, time)
        if (MyPlayer.myChar.hpPercent < 99 || displayedMyHpPercent < 99.95) {
            const pos = MyPlayer.myChar.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderDamagedBar(pos, displayedMyHpPercent, false)
            }
        }

        this.cleanupAnimatedHpBars(time)
    },

    getAnimatedHpPercent(key: string, hpPercent: number, time: number) {
        const numericHpPercent = Number(hpPercent)
        const targetPercent = Number.isFinite(numericHpPercent) ? Math.max(0, Math.min(100, numericHpPercent)) : 100
        let state = this.animatedHpBars.get(key)
        if (!state) {
            state = {
                displayedPercent: targetPercent < 100 ? 100 : targetPercent,
                lastUpdatedAt: time,
                lastSeenAt: time,
            }
            this.animatedHpBars.set(key, state)
            return state.displayedPercent
        }

        const elapsed = Math.max(0, Math.min(100, time - state.lastUpdatedAt))
        const progress = 1 - Math.exp(-elapsed / 65)
        const nextPercent = state.displayedPercent + (targetPercent - state.displayedPercent) * progress

        state.displayedPercent = Math.abs(targetPercent - nextPercent) < 0.05 ? targetPercent : nextPercent
        state.lastUpdatedAt = time
        state.lastSeenAt = time
        return state.displayedPercent
    },

    cleanupAnimatedHpBars(time: number) {
        if (time - this.lastHpBarCleanupAt < 10000) {
            return
        }

        this.animatedHpBars.forEach((state, key) => {
            if (state.lastSeenAt + 15000 < time) {
                this.animatedHpBars.delete(key)
            }
        })
        this.lastHpBarCleanupAt = time
    },

    renderHealingMarkers(time) {
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
                const scale = (20 / distanceFromCam) * (Math.sin(actualTime / 250) * 0.2 + 1)

                const w = sprite.width * scale
                const h = sprite.height * scale

                this.overlayCtx!.drawImage(sprite, x - w / 2, y - h / 2, w, h)
            }
        }
    },

    renderDamagedBar(pos: Vector3, percent: number, enemy: boolean) {
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(percent)) {
            return
        }

        const ctx = this.overlayCtx!
        const barWidth = 50
        const barHeight = 6

        const x = pos.x - barWidth / 2
        const y = pos.y - 2

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
        ctx.fillRect(x, y, barWidth, barHeight)

        // Fill
        const fillWidth = (barWidth - 2) * (percent / 100)
        if (fillWidth <= 0) {
            return
        }
        const fillGradient = ctx.createLinearGradient(x + 1, y, x + 1 + fillWidth, y)
        if (enemy) {
            fillGradient.addColorStop(0, 'rgba(112, 20, 20, 0.7)')
            fillGradient.addColorStop(1, 'rgba(230, 58, 52, 0.82)')
        } else {
            fillGradient.addColorStop(0, 'rgba(12, 92, 92, 0.7)')
            fillGradient.addColorStop(1, 'rgba(48, 214, 204, 0.82)')
        }
        ctx.fillStyle = fillGradient
        ctx.fillRect(x + 1, y + 1, fillWidth, barHeight - 2)
    },

    renderHealingMarker(pos: Vector3, time: number, healSelf: boolean) {
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(time)) {
            return
        }

        const ctx = this.overlayCtx!
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
    },

    renderCharacterLabel(pos: Vector3, char: Character, time: number, tightText: boolean) {
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
            return
        }

        const name = char.nameDisplayTime > time ? char.name : ''
        const actionName = char.activeTimedAction?.getDisplayName() || ''

        if (!name && !actionName) {
            return
        }

        const ctx = this.overlayCtx!
        const basePos = new Vector3(pos.x, pos.y, pos.z)
        const nameFontSize = this.fontSize
        const actionFontSize = Math.max(12, this.fontSize - 2)
        const spacingFix = this.letterSpacingFix
        const nameWidth = name ? CanvasTextUtils.getTextWidth(ctx, name, tightText, spacingFix) : 0
        const actionWidth = actionName ? CanvasTextUtils.getTextWidth(ctx, actionName, tightText, spacingFix) : 0
        const maxWidth = Math.max(nameWidth, actionWidth)
        const textLines = (name ? 1 : 0) + (actionName ? 1 : 0)
        const blockHeight = textLines === 2 ? nameFontSize + actionFontSize + 10 : Math.max(nameFontSize, actionFontSize) + 6
        const showProgressBar = char === MyPlayer.myChar && !!char.activeTimedAction?.hasTimer()
        const progressBarHeight = showProgressBar ? 8 : 0
        const totalHeight = blockHeight + progressBarHeight + (progressBarHeight > 0 ? 4 : 0)

        ViewportManager.movePositionToScreen(basePos, maxWidth / 2, totalHeight + 10)

        let currentTextY = basePos.y - totalHeight + nameFontSize / 2
        if (showProgressBar && char.activeTimedAction) {
            this.renderTimedActionProgressBar(basePos.x, currentTextY - 12, char.activeTimedAction.getProgressPercent(time))
            currentTextY += 12
        }

        if (name) {
            this.renderOutlinedText(basePos.x, currentTextY, name, tightText, char.getRelationToMyPlayer(), nameFontSize, undefined, 1, null, true)
            currentTextY += actionName ? nameFontSize / 2 + actionFontSize / 2 + 6 : 0
        }

        if (actionName) {
            const actionTextAlpha = 0.5 + ((Math.sin(time / 220) + 1) / 2) * 0.5
            this.renderOutlinedText(basePos.x, currentTextY, '* ' + actionName + ' *', tightText, 'NEUTRAL', actionFontSize, undefined, actionTextAlpha)
        }
    },

    renderName(pos: Vector3, name: string, tightText: boolean, relation: 'ALLY' | 'ENEMY' | 'NEUTRAL', useGradient: boolean = false) {
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
            return
        }
        this.renderOutlinedText(pos.x, pos.y - 6, name, tightText, relation, this.fontSize, pos, 1, null, useGradient)
    },

    renderNpcLabel(pos: Vector3, name: string, title: string, tightText: boolean) {
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
            return
        }
        if (!title) {
            this.renderName(pos, name, tightText, 'NEUTRAL', true)
            return
        }

        const ctx = this.overlayCtx!
        const titleText = `[${title}]`
        const titleFontSize = Math.max(12, this.fontSize - 2)
        const spacingFix = this.letterSpacingFix
        ctx.font = `${this.fontSize}px "Roboto", Arial, sans-serif`
        const nameWidth = CanvasTextUtils.getTextWidth(ctx, name, tightText, spacingFix)
        ctx.font = `${titleFontSize}px "Roboto", Arial, sans-serif`
        const titleWidth = CanvasTextUtils.getTextWidth(ctx, titleText, tightText, spacingFix)
        const totalHeight = this.fontSize + titleFontSize + 6

        ViewportManager.movePositionToScreen(pos, Math.max(nameWidth, titleWidth) / 2, totalHeight + 10)

        const nameY = pos.y - totalHeight + this.fontSize / 2
        this.renderOutlinedText(pos.x, nameY, name, tightText, 'NEUTRAL', this.fontSize, undefined, 1, null, true)
        this.renderOutlinedText(pos.x, nameY + this.fontSize / 2 + titleFontSize / 2 + 6, titleText, tightText, 'NEUTRAL', titleFontSize, undefined, 1, '#e9dabe', true)
    },

    renderOutlinedText(
        x: number,
        y: number,
        text: string,
        tightText: boolean,
        relation: 'ALLY' | 'ENEMY' | 'NEUTRAL',
        fontSize: number,
        pos?: Vector3,
        textAlpha: number = 1,
        color: string | null = null,
        useGradient: boolean = false,
    ) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(fontSize) || !Number.isFinite(textAlpha)) {
            return
        }

        const ctx = this.overlayCtx!
        ctx.font = `${fontSize}px "Roboto", Arial, sans-serif`
        ctx.fontKerning = 'normal'
        ctx.textBaseline = 'middle'

        const spacingFix = this.letterSpacingFix
        const textWidth = CanvasTextUtils.getTextWidth(ctx, text, tightText, spacingFix)

        if (pos) {
            ViewportManager.movePositionToScreen(pos, textWidth / 2, fontSize + 10)
        }

        let fillColor = color || '#aaa'
        if (color) {
            fillColor = color
        } else {
            switch (relation) {
                case 'ALLY':
                    fillColor = '#56aaff'
                    break
                case 'ENEMY':
                    fillColor = '#f08f56'
                    break
                case 'NEUTRAL':
                    fillColor = '#aaa'
                    break
            }
        }
        if (useGradient) {
            const fillGradient = ctx.createLinearGradient(x, y - fontSize * 0.75, x, y + fontSize * 0.25)
            fillGradient.addColorStop(0, fillColor)
            fillGradient.addColorStop(1, CanvasTextUtils.getDarkenedColor(fillColor, 0.86))
            ctx.fillStyle = fillGradient
        } else {
            ctx.fillStyle = fillColor
        }
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
        ctx.lineWidth = 3

        if (tightText) {
            const textStartX = x - textWidth / 2
            ctx.textAlign = 'left'
            let cursorX = textStartX
            ctx.save()
            ctx.globalAlpha = textAlpha
            for (const ch of text) {
                ctx.strokeText(ch, cursorX, y)
                cursorX += ctx.measureText(ch).width + spacingFix
            }
            CanvasTextUtils.drawText(ctx, text, textStartX, y, true, spacingFix)
            ctx.restore()
        } else {
            ctx.textAlign = 'center'
            ctx.save()
            ctx.globalAlpha = textAlpha
            ctx.strokeText(text, x, y)
            ctx.fillText(text, x, y)
            ctx.restore()
        }
    },

    renderTimedActionProgressBar(centerX: number, y: number, percent: number) {
        const ctx = this.overlayCtx!
        const barWidth = 50
        const barHeight = 6
        const x = centerX - barWidth / 2

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
        ctx.fillRect(x, y, barWidth, barHeight)

        const fillWidth = (barWidth - 2) * (percent / 100)
        const fillGradient = ctx.createLinearGradient(x + 1, y, x + 1 + fillWidth, y)
        fillGradient.addColorStop(0, 'rgba(145, 107, 28, 0.82)')
        fillGradient.addColorStop(1, 'rgba(240, 210, 90, 0.85)')
        ctx.fillStyle = fillGradient
        ctx.fillRect(x + 1, y + 1, fillWidth, barHeight - 2)
    },

    onResize() {
        const dpr = window.devicePixelRatio || 1
        this.overlayCanvas.width = this.overlayCanvas.clientWidth * dpr
        this.overlayCanvas.height = this.overlayCanvas.clientHeight * dpr

        this.overlayCtx!.setTransform(dpr, 0, 0, dpr, 0, 0)
        this.letterSpacingFix = CanvasTextUtils.computeLetterSpacingFix(this.overlayCtx!, `${this.fontSize}px "Roboto", Arial, sans-serif`)
    },
}
