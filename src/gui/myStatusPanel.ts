import { MyPlayer } from '@/data/myPlayer'
import { AffectGroupData } from '@/network/messageIfs'

export const MyStatusPanel = {
    panel: null as HTMLDivElement | null,
    bodyEl: null as HTMLDivElement | null,
    nameEl: null as HTMLSpanElement | null,
    hpBlockEls: [] as HTMLDivElement[],
    hpFillEls: [] as HTMLDivElement[],
    stBarEl: null as HTMLDivElement | null,
    stBlockEls: [] as HTMLDivElement[],
    stFillEls: [] as HTMLDivElement[],
    mpBarEl: null as HTMLDivElement | null,
    mpBlockEls: [] as HTMLDivElement[],
    mpFillEls: [] as HTMLDivElement[],
    affectsRowEl: null as HTMLDivElement | null,
    affectsIconsEl: null as HTMLDivElement | null,

    initialize() {
        if (this.panel) {
            this.panel.remove()
            this.panel = null
        }

        this.panel = document.createElement('div')
        this.panel.id = 'myStatusPanel'

        this.bodyEl = document.createElement('div')
        this.bodyEl.className = 'myStatusPanelBody'

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

        const hpRow = document.createElement('div')
        hpRow.className = 'statusRow statusRowMain'
        hpRow.appendChild(hpBlocks)
        hpRow.appendChild(this.nameEl)

        const secondaryRow = document.createElement('div')
        secondaryRow.className = 'statusRow statusRowSecondary'

        const stBar = document.createElement('div')
        stBar.className = 'secondaryBar staminaBar'
        this.stBarEl = stBar

        const stBlocks = document.createElement('div')
        stBlocks.className = 'secondaryBlocks'

        this.stBlockEls = []
        this.stFillEls = []

        for (let i = 0; i < 10; i++) {
            const b = document.createElement('div')
            b.className = 'secondaryBlock'

            const fill = document.createElement('div')
            fill.className = 'secondaryBlockFill'
            b.appendChild(fill)

            stBlocks.appendChild(b)
            this.stBlockEls.push(b)
            this.stFillEls.push(fill)
        }

        stBar.appendChild(stBlocks)

        this.mpBarEl = document.createElement('div')
        this.mpBarEl.className = 'secondaryBar manaBar'

        const mpBlocks = document.createElement('div')
        mpBlocks.className = 'secondaryBlocks'

        this.mpBlockEls = []
        this.mpFillEls = []

        for (let i = 0; i < 10; i++) {
            const b = document.createElement('div')
            b.className = 'secondaryBlock'

            const fill = document.createElement('div')
            fill.className = 'secondaryBlockFill'
            b.appendChild(fill)

            mpBlocks.appendChild(b)
            this.mpBlockEls.push(b)
            this.mpFillEls.push(fill)
        }

        this.mpBarEl.appendChild(mpBlocks)

        secondaryRow.appendChild(stBar)
        secondaryRow.appendChild(this.mpBarEl)

        this.affectsRowEl = document.createElement('div')
        this.affectsRowEl.className = 'statusRowAffects'

        this.affectsIconsEl = document.createElement('div')
        this.affectsIconsEl.className = 'affectsIcons'

        this.affectsRowEl.appendChild(this.affectsIconsEl)

        this.bodyEl.appendChild(hpRow)
        this.bodyEl.appendChild(secondaryRow)
        this.panel.appendChild(this.bodyEl)
        this.panel.appendChild(this.affectsRowEl)
        document.body.appendChild(this.panel)
        this.refreshAffectGroups()
    },

    setMyName(name: string) {
        if (this.nameEl) {
            this.nameEl.textContent = name
        }
    },

    refreshAffectGroups() {
        if (!this.affectsRowEl || !this.affectsIconsEl) {
            return
        }

        this.affectsIconsEl.innerHTML = ''

        const affectGroups = Array.isArray(MyPlayer.affectGroups) ? MyPlayer.affectGroups as AffectGroupData[] : []
        this.affectsRowEl.style.display = affectGroups.length > 0 ? 'flex' : 'none'

        for (const affectGroup of affectGroups) {
            const iconEl = document.createElement('div')
            iconEl.className = 'affectIcon'
            iconEl.title = this.getAffectGroupTitle(affectGroup)
            iconEl.dataset.affectId = affectGroup.id.toString()

            const textEl = document.createElement('span')
            textEl.className = 'affectIconText'
            textEl.textContent = affectGroup.id.toString()

            iconEl.appendChild(textEl)

            if (affectGroup.af.length > 1) {
                const countEl = document.createElement('span')
                countEl.className = 'affectIconCount'
                countEl.textContent = affectGroup.af.length.toString()
                iconEl.appendChild(countEl)
            }

            this.affectsIconsEl.appendChild(iconEl)
        }
    },

    getAffectGroupTitle(affectGroup: AffectGroupData) {
        const effectDetails = affectGroup.af
            .map(effect => `type ${effect[0]}, duration ${effect[1]}, power ${effect[2]}`)
            .join(' | ')

        return effectDetails
            ? `Affect group ${affectGroup.id}: ${effectDetails}`
            : `Affect group ${affectGroup.id}`
    },

    onFrame(actualTime: number) {
        if (!this.panel || !this.nameEl || !MyPlayer.myChar || !this.stBarEl || !this.mpBarEl) return

        const hpPercent = MyPlayer.myChar.maxHp > 0 ? Math.max(0, Math.min(100, MyPlayer.myChar.hp / MyPlayer.myChar.maxHp * 100)) : 0
        const stPercent = MyPlayer.myChar.maxSt > 0 ? Math.max(0, Math.min(100, MyPlayer.myChar.st / MyPlayer.myChar.maxSt * 100)) : 0
        const mpPercent = MyPlayer.myChar.maxMp > 0 ? Math.max(0, Math.min(100, MyPlayer.myChar.mp / MyPlayer.myChar.maxMp * 100)) : 0
        const hasMana = MyPlayer.myChar.maxMp > 0
        const secondarySegmentCount = hasMana ? 5 : 10
        const secondarySegmentSize = 100 / secondarySegmentCount

        for (let i = 0; i < 10; i++) {
            const start = i * 10
            const within = hpPercent - start
            const fillPct = Math.max(0, Math.min(10, within)) * 10 // 0..100

            const fillEl = this.hpFillEls[i]
            fillEl.style.width = `${fillPct}%`
        }

        for (let i = 0; i < 10; i++) {
            const fillEl = this.stFillEls[i]
            if (i >= secondarySegmentCount) {
                fillEl.style.width = '0%'
                continue
            }

            const start = i * secondarySegmentSize
            const within = stPercent - start
            const fillPct = Math.max(0, Math.min(secondarySegmentSize, within)) / secondarySegmentSize * 100
            fillEl.style.width = `${fillPct}%`
        }

        for (let i = 0; i < 10; i++) {
            const fillEl = this.mpFillEls[i]
            if (i >= secondarySegmentCount) {
                fillEl.style.width = '0%'
                continue
            }

            const start = i * secondarySegmentSize
            const within = mpPercent - start
            const fillPct = Math.max(0, Math.min(secondarySegmentSize, within)) / secondarySegmentSize * 100
            fillEl.style.width = `${fillPct}%`
        }

        this.mpBarEl.style.display = hasMana ? 'block' : 'none'
        this.stBarEl.classList.toggle('fullWidth', !hasMana)
        this.stBarEl.classList.toggle('halfSegments', hasMana)
        this.mpBarEl.classList.toggle('halfSegments', hasMana)
    }
}

