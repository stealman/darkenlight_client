import type { Targetable } from '@/gui/targettingManager'
// Keep the existing initialization order of the targeting/character modules.
import '@/gui/targettingManager'
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
import { isPartyTarget, PARTY_TARGET_COLOR } from '@/gui/overlay/partyTarget'
import { DamageNumber } from '@/gui/overlay/damageNumber'
import { EmeraldGainNumber } from '@/gui/overlay/emeraldGainNumber'
import { ItemGainNumber } from '@/gui/overlay/itemGainNumber'
import { GmOreTierOverlay } from '@/gui/gm/oreTierOverlay'
import { UiIconManager } from '@/gui/uiIconManager'

import type { CharacterSpeechData } from '@/network/messageIfs'

interface SpeechBubble {
    lines: string[]
    width: number
    expiresAt: number
}

interface AnimatedHpBar {
    displayedPercent: number
    lastUpdatedAt: number
    lastSeenAt: number
}

interface TemporaryNameFadeState {
    displayUntil: number
    appearedAt: number
}

function removeExpiredOverlayEntries(entries: Array<{ expiresAt: number }>, time: number) {
    for (let index = entries.length - 1; index >= 0; index--) {
        if (entries[index].expiresAt <= time) {
            entries.splice(index, 1)
        }
    }
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
    iconStyleUnsubscribe: null as (() => void) | null,
    animatedHpBars: new WeakMap<object, AnimatedHpBar>(),
    temporaryNameFadeStates: new WeakMap<object, TemporaryNameFadeState>(),
    speech: new Map<Character, SpeechBubble[]>(),

    async initialize() {
        this.overlayCanvas = document.getElementById('overlayCanvas') as HTMLCanvasElement
        this.overlayCtx = this.overlayCanvas.getContext('2d')
        this.overlayCtx!.lineWidth = 1
        this.fontSize = window.devicePixelRatio > 1 ? 14 : 18
        this.emeraldGainIcon = new Image()
        this.refreshIconSources()
        if (!this.iconStyleUnsubscribe) {
            this.iconStyleUnsubscribe = UiIconManager.onStyleChanged(() => this.refreshIconSources())
        }
        this.reset()
        TargetSelector.initialize()
    },

    refreshIconSources() {
        if (this.emeraldGainIcon) {
            this.emeraldGainIcon.src = UiIconManager.getUrl('/images/icons/emerald.png')
        }
        this.itemGainIcons.forEach((icon, source) => {
            icon.src = UiIconManager.getUrl(source)
        })
    },

    reset() {
        this.speech.clear()
        this.damageNumbers = []
        this.emeraldGainNumbers = []
        this.itemGainNumbers = []
        this.animatedHpBars = new WeakMap<object, AnimatedHpBar>()
        this.temporaryNameFadeStates = new WeakMap<object, TemporaryNameFadeState>()
        TargetSelector.unselectTarget()
    },

    targetSelected(target: Targetable) {
        TargetSelector.selectTarget(target)
    },

    updateTargetMarkers(time: number, opacity: number) {
        TargetSelector.onFrame(time, opacity)
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

    getSelectedNamePopScale(selectedAt: number, time: number) {
        const age = Math.max(0, time - selectedAt)
        const peakScale = 1.17
        if (age < 140) {
            return 1 + (peakScale - 1) * (age / 140)
        }
        if (age < 280) {
            return peakScale - (peakScale - 1) * ((age - 140) / 140)
        }
        return 1
    },

    getTemporaryNameAlpha(owner: object, displayUntil: number, time: number, appearedAt: number = time) {
        let state = this.temporaryNameFadeStates.get(owner)
        if (!state || state.displayUntil !== displayUntil) {
            state = { displayUntil, appearedAt: state && state.displayUntil > time ? state.appearedAt : appearedAt }
            this.temporaryNameFadeStates.set(owner, state)
        }

        const fadeInAlpha = Math.max(0, Math.min(1, (time - state.appearedAt) / 140))
        const fadeOutAlpha = Math.max(0, Math.min(1, (displayUntil - time) / 200))
        return Math.min(fadeInAlpha, fadeOutAlpha)
    },

    onFrame(timeRate: number, time: number) {
        this.overlayCtx!.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height)

        if (MyPlayer.myChar.hpPercent < 25) {
            this.setBloodyInnerGlow(MyPlayer.myChar.hpPercent, time)
        }

        this.renderNames(time, Math.abs(this.letterSpacingFix) > 0)
        this.renderDamageNumbers(time)
        this.renderEmeraldGainNumbers(time)
        this.renderItemGainNumbers(time)
        this.renderDamagedBars(time)
        this.renderHealingMarkers(time)
        this.renderSpeech(time)
        GmOreTierOverlay.onFrame(this.overlayCtx!)
    },

    addSpeech(data: CharacterSpeechData) {
        const char = data.id === MyPlayer.myChar?.id ? MyPlayer.myChar : CharacterManager.characters.get(data.id)
        if (!char || typeof data.text !== 'string' || !this.overlayCtx) return
        const text = data.text.slice(0, 100).trim()
        if (!text) return
        const ctx = this.overlayCtx
        ctx.save()
        ctx.font = `${Math.max(12, this.fontSize - 2)}px "Roboto", Arial, sans-serif`
        const tightText = Math.abs(this.letterSpacingFix) > 0
        const textWidth = (value: string) => CanvasTextUtils.getTextWidth(ctx, value, tightText, this.letterSpacingFix)
        const lines: string[] = []
        let line = ''
        // Prefer word boundaries; split oversized words by Unicode code point.
        for (const word of text.split(/\s+/)) {
            if (line && textWidth(line + ' ' + word) <= 220) {
                line += ' ' + word
                continue
            }
            if (line) lines.push(line)
            line = ''
            for (const letter of word) {
                if (line && textWidth(line + letter) > 220) {
                    lines.push(line)
                    line = ''
                }
                line += letter
            }
        }
        if (line) lines.push(line)
        const width = Math.max(...lines.map(value => textWidth(value))) + 20
        ctx.restore()
        const bubbles = this.speech.get(char) || []
        bubbles.push({lines, width, expiresAt: Date.now() + 3000 + (text.length - 1) * 3000 / 99})
        this.speech.set(char, bubbles)
    },

    renderSpeech(time: number) {
        const ctx = this.overlayCtx!
        ctx.save()
        const size = Math.max(12, this.fontSize - 2)
        ctx.font = `${size}px "Roboto", Arial, sans-serif`
        ctx.fontKerning = 'normal'
        ctx.textBaseline = 'middle'
        const tightText = Math.abs(this.letterSpacingFix) > 0
        this.speech.forEach((bubbles, char) => {
            removeExpiredOverlayEntries(bubbles, time)
            if (!bubbles.length || (char !== MyPlayer.myChar && CharacterManager.characters.get(char.id) !== char)) {
                this.speech.delete(char)
                return
            }
            if (char !== MyPlayer.myChar && !CharacterManager.visibleCharacters.has(char.id)) return
            const pos = char.getNameTextNodeScreenPosition()
            if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return
            let bottom = pos.y - 12
            for (let i = bubbles.length - 1; i >= 0; i--) {
                const bubble = bubbles[i]
                const height = bubble.lines.length * (size + 4) + 14
                const x = Math.max(bubble.width / 2 + 4, Math.min(this.overlayCanvas.clientWidth - bubble.width / 2 - 4, pos.x))
                const top = bottom - height
                ctx.globalAlpha = Math.min(1, (bubble.expiresAt - time) / 200)
                ctx.fillStyle = 'rgba(40, 38, 32, 0.4)'
                ctx.beginPath()
                ctx.roundRect(x - bubble.width / 2, top, bubble.width, height, 8)
                ctx.fill()
                ctx.fillStyle = '#e9dabe'
                bubble.lines.forEach((line, index) => {
                    const width = CanvasTextUtils.getTextWidth(ctx, line, tightText, this.letterSpacingFix)
                    ctx.textAlign = tightText ? 'left' : 'center'
                    CanvasTextUtils.drawText(ctx, line, tightText ? x - width / 2 : x,
                        top + 7 + (index + .5) * (size + 4), tightText, this.letterSpacingFix)
                })
                bottom = top - 6
            }
        })
        ctx.restore()
    },

    setBloodyInnerGlow(hpPercent: number, time: number) {
        const ctx = this.overlayCtx
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
        MonsterManager.visibleMonsters.forEach((id) => {
            const monster = MonsterManager.monsters.get(id)
            if (monster && monster.nameDisplayTime > time) {
                const pos = monster.getNameTextNodeScreenPosition()
                if (pos) {
                    const selected = TargetSelector.target === monster
                    const scale = selected ? this.getSelectedNamePopScale(TargetSelector.selectedTime, time) : 1
                    const alpha = this.getTemporaryNameAlpha(
                        monster,
                        monster.nameDisplayTime,
                        time,
                        selected ? TargetSelector.selectedTime : time,
                    )
                    this.renderName(pos, monster.mobType.name, tightText, monster.getRelationToMyPlayer(), true, scale, alpha)
                }
            }
        })

        CharacterManager.visibleCharacters.forEach((id) => {
            const char = CharacterManager.characters.get(id)
            if (!char || (char.nameDisplayTime <= time && !char.activeTimedAction)) {
                return
            }

            const pos = char.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderCharacterLabel(pos, char, time, tightText)
            }
        })

        NpcManager.visibleNpcs.forEach((id) => {
            const npc = NpcManager.npcs.get(id)
            if (!npc) {
                return
            }
            const pos = npc.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderNpcLabel(pos, npc.name, npc.getTitle(), tightText)
            }
        })

        NpcManager.visibleGuards.forEach((id) => {
            const guard = NpcManager.guards.get(id)
            if (!guard) return
            const pos = guard.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderNpcLabel(pos, guard.getName(), guard.getTitle(), tightText)
            }
        })

        if (MyPlayer.myChar.nameDisplayTime > time || MyPlayer.myChar.activeTimedAction) {
            const pos = MyPlayer.myChar.getNameTextNodeScreenPosition()
            if (pos) {
                this.renderCharacterLabel(pos, MyPlayer.myChar, time, tightText)
            }
        }

        const nearestItem = GroundItemsManager.nearbyItem
        const hoveredItem = GroundItemsManager.hoveredItem
        if (nearestItem && nearestItem !== hoveredItem) {
            this.renderGroundItemName(nearestItem, nearestItem.nameDisplayTime, time, tightText)
        }
        if (hoveredItem) {
            this.renderGroundItemName(hoveredItem, Math.max(hoveredItem.nameDisplayTime,
                GroundItemsManager.hoverNameDisplayTime), time, tightText)
        }
    },

    renderGroundItemName(item: NonNullable<typeof GroundItemsManager.nearbyItem>, displayUntil: number, time: number, tightText: boolean) {
        if (displayUntil > time) {
            const pos = item.getNameTextNodeScreenPosition()
            const itemName = item.item.name
            if (pos && itemName) {
                let displayName = itemName
                if (item.item.isStackable()) {
                    const qtyRaw = (item.item.atts as any)?.qty
                    const qty = Number(qtyRaw)
                    if (!Number.isNaN(qty) && qty > 0) {
                        displayName = `${qty}x  ${itemName}`
                    }
                }
                const alpha = this.getTemporaryNameAlpha(item, displayUntil, time)
                this.renderName(pos, displayName, tightText, 'NEUTRAL', true, 1, alpha)
            }
        }
    },

    addMonsterDamageNumber(monsterId: number, damage: number, hitType: string = 'h', hitQuality: 'P' | 'N' | 'G' | null = null, time: number = Date.now()) {
        let monster = MonsterManager.monsters.get(monsterId)
        // A lethal hit's result can arrive after removal from the live map.
        if (!monster) {
            for (const killed of MonsterManager.killedMonsters) {
                if (killed.id === monsterId) {
                    monster = killed
                    break
                }
            }
        }
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
        this.addCharacterTargetDamageNumber(char, damage, hitType, hitQuality, time)
    },

    addCharacterTargetDamageNumber(char: Character, damage: number, hitType: string = 'h', hitQuality: 'P' | 'N' | 'G' | null = null, time: number = Date.now()) {
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
        removeExpiredOverlayEntries(this.damageNumbers, time)
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
        removeExpiredOverlayEntries(this.emeraldGainNumbers, time)
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
        removeExpiredOverlayEntries(this.itemGainNumbers, time)
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
            icon.src = UiIconManager.getUrl(normalizedUrl)
            this.itemGainIcons.set(normalizedUrl, icon)
        }
        return icon
    },

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

    },

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
            const selected = TargetSelector.target === char
            const scale = selected ? this.getSelectedNamePopScale(TargetSelector.selectedTime, time) : 1
            const alpha = this.getTemporaryNameAlpha(
                char,
                char.nameDisplayTime,
                time,
                selected ? TargetSelector.selectedTime : time,
            )
            this.renderScaledOutlinedText(basePos.x, currentTextY, name, tightText, char.getRelationToMyPlayer(), nameFontSize, scale, alpha,
                true, isPartyTarget(char) ? PARTY_TARGET_COLOR : null)
            currentTextY += actionName ? nameFontSize / 2 + actionFontSize / 2 + 6 : 0
        }

        if (actionName) {
            const actionTextAlpha = 0.5 + ((Math.sin(time / 220) + 1) / 2) * 0.5
            this.renderOutlinedText(basePos.x, currentTextY, '* ' + actionName + ' *', tightText, 'NEUTRAL', actionFontSize, undefined, actionTextAlpha, null, true)
        }
    },

    renderName(
        pos: Vector3,
        name: string,
        tightText: boolean,
        relation: 'ALLY' | 'ENEMY' | 'NEUTRAL',
        useGradient: boolean = false,
        scale: number = 1,
        alpha: number = 1,
    ) {
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
            return
        }
        if (scale === 1 && alpha === 1) {
            this.renderOutlinedText(pos.x, pos.y - 6, name, tightText, relation, this.fontSize, pos, 1, null, useGradient)
            return
        }
        this.renderScaledOutlinedText(pos.x, pos.y - 6, name, tightText, relation, this.fontSize, scale, alpha, useGradient)
    },

    renderScaledOutlinedText(
        x: number,
        y: number,
        text: string,
        tightText: boolean,
        relation: 'ALLY' | 'ENEMY' | 'NEUTRAL',
        fontSize: number,
        scale: number,
        alpha: number,
        useGradient: boolean = true,
        color: string | null = null,
    ) {
        if (scale === 1) {
            this.renderOutlinedText(x, y, text, tightText, relation, fontSize, undefined, alpha, color, useGradient)
            return
        }
        const ctx = this.overlayCtx!
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(scale, scale)
        this.renderOutlinedText(0, 0, text, tightText, relation, fontSize, undefined, alpha, color, useGradient)
        ctx.restore()
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
