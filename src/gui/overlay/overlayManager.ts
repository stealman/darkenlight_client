import type { Targetable } from '@/gui/targettingManager'
// Keep the existing initialization order of the targeting/character modules.
import '@/gui/targettingManager'
import { CanvasTextUtils, removeExpiredOverlayEntries } from '@/gui/canvasTextUtils'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { CharacterManager } from '@/babylon/character/characterManager'
import { MyPlayer } from '@/data/myPlayer'
import Character from '@/babylon/character/character'
import { Attackable } from '@/GameManager'
import { Item } from '@/data/items/item'
import { TargetSelector } from '@/gui/overlay/targetSelector'
import { DamageNumber } from '@/gui/overlay/damageNumber'
import { EmeraldGainNumber } from '@/gui/overlay/emeraldGainNumber'
import { ItemGainNumber } from '@/gui/overlay/itemGainNumber'
import { GmOreTierOverlay } from '@/gui/gm/oreTierOverlay'
import { TreeLevelOverlay } from '@/gui/gm/treeLevelOverlay'
import { UiIconManager } from '@/gui/uiIconManager'

import type { AutoAttackResult, CharacterSpeechData, MonsterAggroAlertData } from '@/network/messageIfs'

import type { OverlayCanvasView } from '@/gui/canvasTextUtils'
import { OverlayLabels } from '@/gui/overlay/overlayLabels'
import { OverlayIndicators } from '@/gui/overlay/overlayIndicators'

const view: OverlayCanvasView = {canvas: null!, ctx: null, fontSize: 14, letterSpacingFix: 0}
const labels = new OverlayLabels(view)
const indicators = new OverlayIndicators(view)

export const OverlayManager = {
    get overlayCanvas() { return view.canvas },
    get overlayCtx() { return view.ctx },
    get fontSize() { return view.fontSize },
    get letterSpacingFix() { return view.letterSpacingFix },
    damageNumbers: [] as DamageNumber[],
    emeraldGainNumbers: [] as EmeraldGainNumber[],
    itemGainNumbers: [] as ItemGainNumber[],
    emeraldGainIcon: null as HTMLImageElement | null,
    itemGainIcons: new Map<string, HTMLImageElement>(),
    iconStyleUnsubscribe: null as (() => void) | null,

    async initialize() {
        view.canvas = document.getElementById('overlayCanvas') as HTMLCanvasElement
        view.ctx = view.canvas.getContext('2d')
        view.ctx!.lineWidth = 1
        view.fontSize = window.devicePixelRatio > 1 ? 14 : 18
        indicators.initialize()
        this.emeraldGainIcon = new Image()
        this.refreshIconSources()
        if (!this.iconStyleUnsubscribe) {
            this.iconStyleUnsubscribe = UiIconManager.onStyleChanged(() => this.refreshIconSources())
        }
        labels.initialize()
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
        labels.reset()
        indicators.reset()
        this.damageNumbers = []
        this.emeraldGainNumbers = []
        this.itemGainNumbers = []
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

    onFrame(timeRate: number, time: number) {
        this.overlayCtx!.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height)

        if (MyPlayer.myChar.hpPercent < 25) {
            this.setBloodyInnerGlow(MyPlayer.myChar.hpPercent, time)
        }

        labels.renderNames(time, Math.abs(this.letterSpacingFix) > 0)
        this.renderDamageNumbers(time)
        this.renderEmeraldGainNumbers(time)
        this.renderItemGainNumbers(time)
        indicators.renderDamagedBars(time)
        indicators.renderMonsterAggroAlerts(time)
        indicators.renderHealingMarkers(time)
        labels.renderSpeech(time)
        GmOreTierOverlay.onFrame(this.overlayCtx!)
        TreeLevelOverlay.onFrame(this.overlayCtx!)
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

    addMonsterDamageNumber(monsterId: number, damage: number, hitType: string = 'h', hitQuality: 'P' | 'N' | 'G' | null = null, time: number = Date.now(), direction?: AutoAttackResult['a']) {
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
        const damageNumber = DamageNumber.fromHitMonster(MyPlayer.myChar, monster, damage, hitType, hitQuality, time, direction)
        if (!damageNumber) {
            return
        }
        this.damageNumbers.push(damageNumber)
    },

    addCharacterDamageNumber(charId: number, damage: number, hitType: string = 'h', hitQuality: 'P' | 'N' | 'G' | null = null, time: number = Date.now(), direction?: AutoAttackResult['a']) {
        const char = CharacterManager.characters.get(charId)
        if (!char) {
            return
        }
        this.addCharacterTargetDamageNumber(char, damage, hitType, hitQuality, time, direction)
    },

    addCharacterTargetDamageNumber(char: Character, damage: number, hitType: string = 'h', hitQuality: 'P' | 'N' | 'G' | null = null, time: number = Date.now(), direction?: AutoAttackResult['a']) {
        const damageNumber = DamageNumber.fromHitCharacter(MyPlayer.myChar, char, damage, hitType, hitQuality, time, direction)
        if (!damageNumber) {
            return
        }
        this.damageNumbers.push(damageNumber)
    },

    addMyCharDamageNumber(attacker: Attackable, damage: number, hitType: string = 'h', hitQuality: 'P' | 'N' | 'G' | null = null, time: number = Date.now(), direction?: AutoAttackResult['a']) {
        const damageNumber = DamageNumber.fromHitMyChar(attacker, damage, hitType, hitQuality, time, direction)
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

    addSpeech(data: CharacterSpeechData) {
        labels.addSpeech(data)
    },

    addChatSpeech(data: import('@/network/messageIfs').ChatEntry) {
        labels.addChatSpeech(data)
    },

    addMonsterAggroAlert(data: MonsterAggroAlertData) {
        indicators.addMonsterAggroAlert(data)
    },

    onResize() {
        const dpr = window.devicePixelRatio || 1
        labels.invalidateTextRasters()
        indicators.onResize()
        this.overlayCanvas.width = this.overlayCanvas.clientWidth * dpr
        this.overlayCanvas.height = this.overlayCanvas.clientHeight * dpr

        this.overlayCtx!.setTransform(dpr, 0, 0, dpr, 0, 0)
        view.letterSpacingFix = CanvasTextUtils.computeLetterSpacingFix(this.overlayCtx!, `${this.fontSize}px "Roboto", Arial, sans-serif`)
    },
}
