import { MyPlayer } from '@/data/myPlayer'

export const MyStatusPanel = {
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
        this.panel.id = 'myStatusPanel'

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
        this.nameEl.className = 'myName'

        this.panel.appendChild(hpBlocks)
        this.panel.appendChild(this.nameEl)
        document.body.appendChild(this.panel)
    },

    setMyName(name: string) {
        if (this.nameEl) {
            this.nameEl.textContent = name
        }
    },

    onFrame(actualTime: number) {
        if (!this.panel || !this.nameEl || !MyPlayer.myChar) return

        const hpPercent = Math.max(0, Math.min(100, MyPlayer.myChar.hp / MyPlayer.myChar.maxHp * 100))

        for (let i = 0; i < 10; i++) {
            const start = i * 10
            const within = hpPercent - start
            const fillPct = Math.max(0, Math.min(10, within)) * 10 // 0..100

            const fillEl = this.hpFillEls[i]
            fillEl.style.width = `${fillPct}%`
        }
    }
}

