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

    async initialize() {
        this.overlayCanvas = document.getElementById("overlayCanvas") as HTMLCanvasElement
        this.overlayCtx = this.overlayCanvas.getContext("2d")
        this.overlayCtx!.lineWidth = 1
        this.fontSize = window.devicePixelRatio > 1 ? 14 : 18
        this.emeraldGainIcon = new Image()
        this.emeraldGainIcon.src = '/images/icons/emerald.png'
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
        this.renderEmeraldGainNumbers(time)
        this.renderItemGainNumbers(time)
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
            if (char.nameDisplayTime <= time && !char.activeTimedAction) {
                return
            }

            const pos = char.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderCharacterLabel(pos, char, time, tightText)
            }
        })

        NpcManager.npcs.forEach(npc => {
            const pos = npc.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderName(pos, npc.name, tightText, npc.getRelationToMyPlayer())
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
                this.renderName(pos, displayName, tightText, 'NEUTRAL')
            }
        }
    },

    addMonsterDamageNumber(monsterId: number, damage: number, hitType: string = 'h', time: number = Date.now()) {
        const monster = MonsterManager.monsters.get(monsterId)
        if (!monster) {
            return
        }
        const damageNumber = DamageNumber.fromHitMonster(MyPlayer.myChar, monster, damage, hitType, time)
        if (!damageNumber) {
            return
        }
        this.damageNumbers.push(damageNumber)
    },

    addCharacterDamageNumber(charId: number, damage: number, hitType: string = 'h', time: number = Date.now()) {
        const char = CharacterManager.characters.get(charId)
        if (!char) {
            return
        }
        const damageNumber = DamageNumber.fromHitCharacter(MyPlayer.myChar, char, damage, hitType, time)
        if (!damageNumber) {
            return
        }
        this.damageNumbers.push(damageNumber)
    },

    addMyCharDamageNumber(attacker: Attackable, damage: number, hitType: string = 'h', time: number = Date.now()) {
        const damageNumber = DamageNumber.fromHitMyChar(attacker, damage, hitType, time)
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

    renderEmeraldGainNumbers(time: number) {
        this.emeraldGainNumbers = this.emeraldGainNumbers.filter(item => item.expiresAt > time)
        if (this.emeraldGainNumbers.length === 0) {
            return
        }

        const ctx = this.overlayCtx!
        ctx.save()
        ctx.font = `${this.fontSize + 6}px "Roboto", Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        this.emeraldGainNumbers.forEach(item => {
            item.render(ctx)
        })

        ctx.restore()
    },

    renderItemGainNumbers(time: number) {
        this.itemGainNumbers = this.itemGainNumbers.filter(item => item.expiresAt > time)
        if (this.itemGainNumbers.length === 0) {
            return
        }

        const ctx = this.overlayCtx!
        ctx.save()
        ctx.font = `${this.fontSize + 6}px "Roboto", Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        this.itemGainNumbers.forEach(item => {
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

    renderHealingMarker(pos: Vector3, time: number, healSelf: boolean) {
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
        ctx.fillStyle = healSelf ? `rgba(225, 32, 32, ${alpha})` : `rgba(25, 255, 25, ${alpha})`
        drawCross(size, thickness)
    },

    renderCharacterLabel(pos: Vector3, char: Character, time: number, tightText: boolean) {
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
            this.renderOutlinedText(basePos.x, currentTextY, name, tightText, char.getRelationToMyPlayer(), nameFontSize)
            currentTextY += actionName ? (nameFontSize / 2 + actionFontSize / 2 + 6) : 0
        }

        if (actionName) {
            const actionTextAlpha = 0.5 + ((Math.sin(time / 220) + 1) / 2) * 0.5
            this.renderOutlinedText(basePos.x, currentTextY, '* ' + actionName + ' *', tightText, 'NEUTRAL', actionFontSize, undefined, actionTextAlpha)
        }
    },

    renderName(pos: Vector3, name: string, tightText: boolean, relation: 'ALLY' | 'ENEMY' | 'NEUTRAL') {
        this.renderOutlinedText(pos.x, pos.y - 6, name, tightText, relation, this.fontSize, pos)
    },

    renderOutlinedText(x: number, y: number, text: string, tightText: boolean, relation: 'ALLY' | 'ENEMY' | 'NEUTRAL', fontSize: number, pos?: Vector3, textAlpha: number = 1) {
        const ctx = this.overlayCtx!
        ctx.font = `${fontSize}px "Roboto", Arial, sans-serif`
        ctx.fontKerning = 'normal'
        ctx.textBaseline = 'middle'

        const spacingFix = this.letterSpacingFix
        const textWidth = CanvasTextUtils.getTextWidth(ctx, text, tightText, spacingFix)

        if (pos) {
            ViewportManager.movePositionToScreen(pos, textWidth / 2, fontSize + 10)
        }

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

        ctx.fillStyle = 'rgba(240, 210, 90, 0.85)'
        ctx.fillRect(x + 1, y + 1, (barWidth - 2) * (percent / 100), barHeight - 2)
    },

    onResize() {
        const dpr = window.devicePixelRatio || 1
        this.overlayCanvas.width = this.overlayCanvas.clientWidth * dpr
        this.overlayCanvas.height = this.overlayCanvas.clientHeight * dpr

        this.overlayCtx!.setTransform(dpr, 0, 0, dpr, 0, 0)
        this.letterSpacingFix = CanvasTextUtils.computeLetterSpacingFix(this.overlayCtx!, `${this.fontSize}px "Roboto", Arial, sans-serif`)
    },
}
