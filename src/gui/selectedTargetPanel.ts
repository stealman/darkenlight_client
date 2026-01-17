import { TargetingManager } from '@/gui/targettingManager'

export const SelectedTargetPanel = {
    panel: null as HTMLDivElement | null,
    nameEl: null as HTMLSpanElement | null,
    hpBlockEls: [] as HTMLDivElement[],
    hpFillEls: [] as HTMLDivElement[],

    initialize() {
        if (this.panel) {
            this.panel.remove()
            this.panel = null
        }

        this.panel = document.createElement('div')
        this.panel.id = 'selectedTargetPanel'

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

    onFrame(actualTime: number) {
        if (!this.panel || !this.nameEl) return

        const target = TargetingManager.selectedTarget
        if (!target) {
            this.panel.style.display = 'none'
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
    }
}

