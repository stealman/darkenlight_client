import { Vector3 } from '@babylonjs/core'
import { CanvasTextUtils, createOverlayRaster, removeExpiredOverlayEntries } from '@/gui/canvasTextUtils'
import type { OverlayCanvasView } from '@/gui/canvasTextUtils'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { CharacterManager } from '@/babylon/character/characterManager'
import { NpcManager } from '@/babylon/npc/npcManager'
import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { MyPlayer } from '@/data/myPlayer'
import type Character from '@/babylon/character/character'
import { ViewportManager } from '@/utils/viewport'
import { TargetSelector } from '@/gui/overlay/targetSelector'
import { isPartyTarget, PARTY_TARGET_COLOR } from '@/gui/overlay/partyTarget'
import type { CharacterSpeechData, ChatEntry } from '@/network/messageIfs'

interface SpeechBubble {
    color?: string
    lines: string[]
    width: number
    expiresAt: number
    image: HTMLCanvasElement | null
    height: number
}

interface TemporaryNameFadeState {
    displayUntil: number
    appearedAt: number
}

export class OverlayLabels {
    temporaryNameFadeStates = new WeakMap<object, TemporaryNameFadeState>()
    speech = new Map<Character, SpeechBubble[]>()
    private fontListenerInitialized = false

    constructor(private readonly view: OverlayCanvasView) {}

    initialize() {
        if (!this.fontListenerInitialized && document.fonts) {
            document.fonts.addEventListener('loadingdone', () => this.invalidateTextRasters())
            this.fontListenerInitialized = true
        }
    }

    reset() {
        this.speech.clear()
        this.temporaryNameFadeStates = new WeakMap<object, TemporaryNameFadeState>()
    }

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
    }

    getTemporaryNameAlpha(owner: object, displayUntil: number, time: number, appearedAt: number = time) {
        let state = this.temporaryNameFadeStates.get(owner)
        if (!state || state.displayUntil !== displayUntil) {
            state = { displayUntil, appearedAt: state && state.displayUntil > time ? state.appearedAt : appearedAt }
            this.temporaryNameFadeStates.set(owner, state)
        }

        const fadeInAlpha = Math.max(0, Math.min(1, (time - state.appearedAt) / 140))
        const fadeOutAlpha = Math.max(0, Math.min(1, (displayUntil - time) / 200))
        return Math.min(fadeInAlpha, fadeOutAlpha)
    }

    addChatSpeech(entry: ChatEntry) {
        if (entry.channel === 'public' || entry.from === MyPlayer.myChar?.name) return
        for (const id of CharacterManager.visibleCharacters) {
            const char = CharacterManager.characters.get(id)
            if (char?.name !== entry.from) continue
            this.addSpeech({id, name: entry.from, text: entry.text, time: entry.time}, entry.channel)
            return
        }
    }

    addSpeech(data: CharacterSpeechData, channel: ChatEntry['channel'] = 'public') {
        const char = data.id === MyPlayer.myChar?.id ? MyPlayer.myChar : CharacterManager.characters.get(data.id)
        if (!char || typeof data.text !== 'string' || !this.view.ctx) return
        const text = data.text.slice(0, channel === 'public' ? 100 : 500).trim()
        if (!text) return
        // Measure on the same kind of offscreen canvas used for rasterization.
        // The mobile spacing correction belongs only to direct overlay text.
        const {ctx} = createOverlayRaster(1, 1)
        ctx.font = `${Math.max(12, this.view.fontSize - 2)}px "Roboto", Arial, sans-serif`
        ctx.fontKerning = 'normal'
        const textWidth = (value: string) => CanvasTextUtils.getTextWidth(ctx, value, false)
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
        const bubbles = this.speech.get(char) || []
        const color = channel === 'public' ? '#e9dabe'
            : `rgb(${getComputedStyle(document.documentElement).getPropertyValue(channel === 'private' ? '--ui-accent-purple' : '--ui-attribute-agility').trim()})`
        bubbles.push({lines, color, width: 0, height: 0, image: null, expiresAt: Date.now() + 3000 + (text.length - 1) * 3000 / 99})
        this.prepareSpeechBubble(bubbles[bubbles.length - 1])
        this.speech.set(char, bubbles)
    }

    prepareSpeechBubble(bubble: SpeechBubble) {
        const size = Math.max(12, this.view.fontSize - 2)
        const {canvas, ctx} = createOverlayRaster(1, 1)
        ctx.font = `${size}px "Roboto", Arial, sans-serif`
        ctx.fontKerning = 'normal'
        bubble.width = Math.max(...bubble.lines.map(line => CanvasTextUtils.getTextWidth(ctx, line, false))) + 20
        bubble.height = bubble.lines.length * (size + 4) + 14
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.ceil(bubble.width * dpr)
        canvas.height = Math.ceil(bubble.height * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.font = `${size}px "Roboto", Arial, sans-serif`
        ctx.fontKerning = 'normal'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = 'rgba(40, 38, 32, 0.4)'
        ctx.beginPath()
        ctx.roundRect(0, 0, bubble.width, bubble.height, 8)
        ctx.fill()
        ctx.fillStyle = bubble.color || '#e9dabe'
        ctx.textAlign = 'center'
        bubble.lines.forEach((line, index) => {
            ctx.fillText(line, bubble.width / 2, 7 + (index + .5) * (size + 4))
        })
        bubble.image = canvas
    }

    renderSpeech(time: number) {
        const ctx = this.view.ctx!
        ctx.save()
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
                if (!bubble.image) this.prepareSpeechBubble(bubble)
                const height = bubble.height
                const x = Math.max(bubble.width / 2 + 4, Math.min(this.view.canvas.clientWidth - bubble.width / 2 - 4, pos.x))
                const top = bottom - height
                ctx.globalAlpha = Math.min(1, (bubble.expiresAt - time) / 200)
                ctx.drawImage(bubble.image!, x - bubble.width / 2, top, bubble.width, height)
                bottom = top - 6
            }
        })
        ctx.restore()
    }

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
    }

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
    }

    renderCharacterLabel(pos: Vector3, char: Character, time: number, tightText: boolean) {
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
            return
        }

        const name = char.nameDisplayTime > time ? char.name : ''
        const actionName = char.activeTimedAction?.getDisplayName() || ''

        if (!name && !actionName) {
            return
        }

        const ctx = this.view.ctx!
        const basePos = new Vector3(pos.x, pos.y, pos.z)
        const nameFontSize = this.view.fontSize
        const actionFontSize = Math.max(12, this.view.fontSize - 2)
        const spacingFix = this.view.letterSpacingFix
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
    }

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
            this.renderOutlinedText(pos.x, pos.y - 6, name, tightText, relation, this.view.fontSize, pos, 1, null, useGradient)
            return
        }
        this.renderScaledOutlinedText(pos.x, pos.y - 6, name, tightText, relation, this.view.fontSize, scale, alpha, useGradient)
    }

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
        const ctx = this.view.ctx!
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(scale, scale)
        this.renderOutlinedText(0, 0, text, tightText, relation, fontSize, undefined, alpha, color, useGradient)
        ctx.restore()
    }

    renderNpcLabel(pos: Vector3, name: string, title: string, tightText: boolean) {
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
            return
        }
        if (!title) {
            this.renderName(pos, name, tightText, 'NEUTRAL', true)
            return
        }

        const ctx = this.view.ctx!
        const titleText = `[${title}]`
        const titleFontSize = Math.max(12, this.view.fontSize - 2)
        const spacingFix = this.view.letterSpacingFix
        ctx.font = `${this.view.fontSize}px "Roboto", Arial, sans-serif`
        const nameWidth = CanvasTextUtils.getTextWidth(ctx, name, tightText, spacingFix)
        ctx.font = `${titleFontSize}px "Roboto", Arial, sans-serif`
        const titleWidth = CanvasTextUtils.getTextWidth(ctx, titleText, tightText, spacingFix)
        const totalHeight = this.view.fontSize + titleFontSize + 6

        ViewportManager.movePositionToScreen(pos, Math.max(nameWidth, titleWidth) / 2, totalHeight + 10)

        const nameY = pos.y - totalHeight + this.view.fontSize / 2
        this.renderOutlinedText(pos.x, nameY, name, tightText, 'NEUTRAL', this.view.fontSize, undefined, 1, null, true)
        this.renderOutlinedText(pos.x, nameY + this.view.fontSize / 2 + titleFontSize / 2 + 6, titleText, tightText, 'NEUTRAL', titleFontSize, undefined, 1, '#e9dabe', true)
    }

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
        renderCtx?: CanvasRenderingContext2D,
    ) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(fontSize) || !Number.isFinite(textAlpha)) {
            return
        }

        const ctx = renderCtx ?? this.view.ctx!
        ctx.font = `${fontSize}px "Roboto", Arial, sans-serif`
        ctx.fontKerning = 'normal'
        ctx.textBaseline = 'middle'

        const spacingFix = this.view.letterSpacingFix
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
    }

    renderTimedActionProgressBar(centerX: number, y: number, percent: number) {
        const ctx = this.view.ctx!
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
    }

    invalidateTextRasters() {
        this.speech.forEach(bubbles => bubbles.forEach(bubble => { bubble.image = null }))
    }
}
