import { TargetingManager } from '@/gui/targettingManager'
import { TooltipOverlayContent, TooltipOverlayManager } from '@/gui/tooltipOverlayManager'
import { t } from '@/i18n'

export const SelectedTargetPanel = {
    tooltipOwnerKey: 'selected-target-panel' as string,
    tooltipRefreshIntervalMs: 250 as number,
    panel: null as HTMLDivElement | null,
    nameEl: null as HTMLSpanElement | null,
    hpBlockEls: [] as HTMLDivElement[],
    hpFillEls: [] as HTMLDivElement[],
    lastTooltipRefreshBucket: null as number | null,

    initialize() {
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

        this.panel.appendChild(hpBlocks)
        this.panel.appendChild(this.nameEl)
        document.body.appendChild(this.panel)
    },

    buildTooltipContent(): TooltipOverlayContent | null {
        const target = TargetingManager.selectedTarget
        if (!target) {
            return null
        }

        const titleMeta = target.getObjectType() === 'C' && 'className' in target
            ? `(${target.className})`
            : null

        return {
            title: target.getName(),
            titleMeta,
            rows: [
                {
                    label: t('common.health'),
                    value: `${Math.max(0, Math.round(target.hpPercent ?? 0))}%`,
                },
            ],
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
            this.panel.style.display = 'none'
            if (TooltipOverlayManager.isVisibleFor(this.tooltipOwnerKey)) {
                TooltipOverlayManager.hideOwner(this.tooltipOwnerKey)
            }
            this.lastTooltipRefreshBucket = null
            return
        }

        this.panel.style.display = 'flex'
        this.nameEl.textContent = target.getName()

        // Add class enemy/ally based on relation
        const relation = target.getRelationToMyPlayer()
        this.panel.classList.remove('enemy', 'ally', 'neutral')
        if (relation === 'ENEMY') {
            this.panel.classList.add('enemy')
        } else if (relation === 'ALLY') {
            this.panel.classList.add('ally')
        } else {
            this.panel.classList.add('neutral')
        }

        const hpPercent = Math.max(0, Math.min(100, target.hpPercent ?? 0))

        for (let i = 0; i < 10; i++) {
            const start = i * 10
            const within = hpPercent - start
            const fillPct = Math.max(0, Math.min(10, within)) * 10 // 0..100

            const fillEl = this.hpFillEls[i]
            fillEl.style.width = `${fillPct}%`
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

