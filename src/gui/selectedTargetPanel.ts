import { MyPlayer } from '@/data/myPlayer'
import { Monster } from '@/babylon/monsters/monster'
import { TargetingManager } from '@/gui/targettingManager'
import { TooltipOverlayContent, TooltipOverlayManager } from '@/gui/tooltipOverlayManager'
import { t } from '@/i18n'
import { MonsterCatalog } from '@/data/monsterCatalog'
import type { TooltipOverlayRow } from '@/gui/tooltipOverlayManager'
import { GameClasses } from '@/data/gameClass'

export const SelectedTargetPanel = {
    tooltipOwnerKey: 'selected-target-panel' as string,
    tooltipRefreshIntervalMs: 250 as number,
    panel: null as HTMLDivElement | null,
    nameEl: null as HTMLSpanElement | null,
    nameTextEl: null as HTMLSpanElement | null,
    skullsEl: null as HTMLSpanElement | null,
    hpBlockEls: [] as HTMLDivElement[],
    hpFillEls: [] as HTMLDivElement[],
    lastTooltipRefreshBucket: null as number | null,

    renderedTarget: null as {name: string, skulls: number, relation: string, hp: number} | null,

    initialize() {
        this.renderedTarget = null
        if (this.panel) {
            this.panel.remove()
            this.panel = null
        }

        this.panel = document.createElement('div')
        this.panel.id = 'selectedTargetPanel'
        this.panel.onmouseenter = (event) => this.onPanelMouseEnter(event)
        this.panel.onmousemove = (event) => this.onPanelMouseMove(event)
        this.panel.onmouseleave = () => this.onPanelMouseLeave()
        this.panel.onclick = (event) => this.onPanelClick(event)

        const hpBlocks = document.createElement('div')
        hpBlocks.className = 'hpBlocks'

        this.hpBlockEls = []
        this.hpFillEls = []

        for (let i = 0; i < 10; i++) {
            const b = document.createElement('div')
            b.className = 'hpBlock'

            const fill = document.createElement('div')
            fill.className = 'hpFill'
            b.appendChild(fill)

            hpBlocks.appendChild(b)
            this.hpBlockEls.push(b)
            this.hpFillEls.push(fill)
        }

        this.nameEl = document.createElement('span')
        this.nameEl.className = 'targetName'
        this.skullsEl = document.createElement('span')
        this.skullsEl.className = 'targetSkulls'
        this.skullsEl.setAttribute('aria-hidden', 'true')
        this.skullsEl.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8 1a6 6 0 0 0-4 10.47V15h2v-2h1v2h2v-2h1v2h2v-3.53A6 6 0 0 0 8 1ZM5.5 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM8 9l-1 2h2Z"/></svg>'.repeat(3)
        this.nameTextEl = document.createElement('span')
        this.nameTextEl.className = 'ui-text-gradient ui-text-gradient--no-shadow'
        this.nameEl.append(this.nameTextEl, this.skullsEl)

        this.panel.appendChild(hpBlocks)
        this.panel.appendChild(this.nameEl)
        document.body.appendChild(this.panel)
    },

    buildTooltipContent(): TooltipOverlayContent | null {
        const target = TargetingManager.selectedTarget
        if (!target) {
            return null
        }

        const gameClass = target.getObjectType() === 'C' && 'className' in target && typeof target.className === 'string'
            ? GameClasses.getByKey(target.className)
            : null
        const gameClassKey = gameClass?.key.toLowerCase() ?? ''
        const classLocalizationKey = gameClassKey ? `classes.${gameClassKey}` : ''
        const localizedClassName = classLocalizationKey ? t(classLocalizationKey) : ''

        const rows: TooltipOverlayRow[] = []
        if (target instanceof Monster) {
            const info = MonsterCatalog.get(target.mobType.id)
            if (info) {
                const categoryKey = `skills.monsterKnowledge.categories.${info.category}`
                const category = t(categoryKey)
                const knowledge = MyPlayer.myCharRef.value?.monsterKnowledge.find(entry => entry.category === info.category)
                rows.push({
                    label: category === categoryKey ? info.category : category,
                    separator: '',
                    value: t('skills.monsterKnowledge.damageBonus', {percent: knowledge?.damageBonusPercent ?? 0}),
                    className: 'ui-tooltip-row--monster-category',
                })
            }
            if (target.huntable && !info?.tags.includes('ANIMAL')) {
                rows.push({
                    value: t('skills.monsterKnowledge.huntable'),
                    className: 'ui-tooltip-row--huntable',
                })
            }
            if (info) {
                for (const tag of info.tags) {
                    const tagKey = `skills.monsterKnowledge.tags.${tag}`
                    const name = t(tagKey)
                    if (tag === 'ANIMAL' && target.huntable) {
                        rows.push({
                            label: name === tagKey ? tag : name,
                            separator: ',',
                            value: t('skills.monsterKnowledge.huntable'),
                            className: 'ui-tooltip-row--huntable ui-tooltip-row--huntable-animal',
                        })
                        continue
                    }
                    rows.push({
                        value: name === tagKey ? tag : name,
                        className: tag === 'UNDEAD' ? 'ui-tooltip-row--undead' : 'ui-tooltip-row--monster-tag',
                    })
                }
            }
        }

        return {
            title: target.getName(),
            titleAction: target.getObjectType() === 'C' && target.id !== MyPlayer.myChar?.id
                && 'isBot' in target && target.isBot === false ? {
                    icon: '/images/icons/buttons/btn_speech.png',
                    label: t('chat.writeTo', {name: target.getName()}),
                    onClick: () => window.dispatchEvent(new CustomEvent('ui:open-private-chat', {detail: {name: target.getName()}})),
                } : undefined,
            titleMeta: gameClass ? (localizedClassName === classLocalizationKey ? gameClass.name : localizedClassName) : null,
            titleClassName: 'ui-tooltip-title--character-name ui-text-gradient',
            titleMetaClassName: gameClassKey
                ? `ui-tooltip-title-meta--character-class ui-text-gradient ui-text-gradient--accent ui-tooltip-title-meta--${gameClassKey}`
                : null,
            rows,
            variant: target.getRelationToMyPlayer() === 'ALLY' ? 'positive' : 'adverse',
        }
    },

    markTooltipRefreshNow() {
        this.lastTooltipRefreshBucket = Math.floor(Date.now() / this.tooltipRefreshIntervalMs)
    },

    onPanelMouseEnter(event: MouseEvent) {
        if (!TargetingManager.selectedTarget || TooltipOverlayManager.pinned) {
            return
        }

        const content = this.buildTooltipContent()
        if (!content) {
            return
        }

        TooltipOverlayManager.showFromEvent({
            ownerKey: this.tooltipOwnerKey,
            event,
            content,
        })
        this.markTooltipRefreshNow()
    },

    onPanelMouseMove(event: MouseEvent) {
        TooltipOverlayManager.moveFromEvent(this.tooltipOwnerKey, event)
    },

    onPanelMouseLeave() {
        if (TooltipOverlayManager.isVisibleFor(this.tooltipOwnerKey)) {
            TooltipOverlayManager.hideOwnerIfNotPinned(this.tooltipOwnerKey)
            this.lastTooltipRefreshBucket = null
        }
    },

    onPanelClick(event: MouseEvent) {
        const content = this.buildTooltipContent()
        if (!content) {
            return
        }

        const didShow = TooltipOverlayManager.togglePinnedFromEvent({
            ownerKey: this.tooltipOwnerKey,
            event,
            content,
        })
        if (!didShow) {
            this.lastTooltipRefreshBucket = null
            return
        }

        this.markTooltipRefreshNow()
    },

    onFrame(actualTime: number) {
        if (!this.panel || !this.nameEl) return

        const target = TargetingManager.selectedTarget
        if (!target) {
            this.renderedTarget = null
            if (!this.panel.classList.contains('empty')) {
                this.panel.classList.remove('enemy', 'ally', 'neutral')
                this.panel.classList.add('empty')
                this.nameTextEl!.textContent = ''
                this.skullsEl!.style.display = 'none'
                for (const fillEl of this.hpFillEls) fillEl.style.width = '0%'
            }
            if (TooltipOverlayManager.isVisibleFor(this.tooltipOwnerKey)) {
                TooltipOverlayManager.hideOwner(this.tooltipOwnerKey)
            }
            this.lastTooltipRefreshBucket = null
            return
        }

        const previous = this.renderedTarget
        if (!previous) this.panel.classList.remove('empty')
        const skulls = target.getObjectType() === 'M' && 'skulls' in target && typeof target.skulls === 'number' ? target.skulls : 0
        const skullCount = Math.max(0, Math.min(3, skulls))
        if (!previous || previous.skulls !== skullCount) {
            this.skullsEl!.style.display = skullCount ? '' : 'none'
            for (let i = 0; i < 3; i++) (this.skullsEl!.children[i] as SVGElement).style.display = i < skullCount ? '' : 'none'
        }
        const name = target.getName()
        if (!previous || previous.name !== name) this.nameTextEl!.textContent = name
        const relation = target.getRelationToMyPlayer()
        if (!previous || previous.relation !== relation) {
            this.panel.classList.toggle('enemy', relation === 'ENEMY')
            this.panel.classList.toggle('ally', relation === 'ALLY')
            this.panel.classList.toggle('neutral', relation !== 'ENEMY' && relation !== 'ALLY')
        }
        const hpPercent = Math.max(0, Math.min(100, target.hpPercent ?? 0))
        if (!previous || previous.hp !== hpPercent) {
            for (let i = 0; i < 10; i++) {
                const fillPct = Math.max(0, Math.min(10, hpPercent - i * 10)) * 10
                this.hpFillEls[i].style.width = `${fillPct}%`
            }
        }
        if (!previous || previous.name !== name || previous.skulls !== skullCount || previous.relation !== relation || previous.hp !== hpPercent) {
            this.renderedTarget = {name, skulls: skullCount, relation, hp: hpPercent}
        }

        if (TooltipOverlayManager.isVisibleFor(this.tooltipOwnerKey)) {
            const currentRefreshBucket = Math.floor(actualTime / this.tooltipRefreshIntervalMs)
            if (this.lastTooltipRefreshBucket === currentRefreshBucket) {
                return
            }

            const content = this.buildTooltipContent()
            if (!content) {
                TooltipOverlayManager.hideOwner(this.tooltipOwnerKey)
                this.lastTooltipRefreshBucket = null
                return
            }

            TooltipOverlayManager.refresh(content)
            this.lastTooltipRefreshBucket = currentRefreshBucket
        }
    }
}

