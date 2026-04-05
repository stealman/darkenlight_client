import { MyPlayer } from '@/data/myPlayer'
import { ClientAffectGroup } from '@/data/affects'

export const MyStatusPanel = {
    affectIconSizePx: 0 as number,
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

    // Affects
    affectsRowEl: null as HTMLDivElement | null,
    affectsIconsEl: null as HTMLDivElement | null,
    affectIconEls: new Map<number, HTMLDivElement>(),

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
        this.affectIconEls.clear()

        this.affectsRowEl.appendChild(this.affectsIconsEl)

        this.bodyEl.appendChild(hpRow)
        this.bodyEl.appendChild(secondaryRow)
        this.panel.appendChild(this.bodyEl)
        this.panel.appendChild(this.affectsRowEl)
        document.body.appendChild(this.panel)
        this.onResize()
        this.refreshAffectGroups()
    },

    onResize() {
        if (!this.panel) {
            return
        }

        const dpr = window.devicePixelRatio || 1
        const shortestSide = Math.min(window.innerWidth, window.innerHeight)
        const isLandscape = window.innerWidth > window.innerHeight
        const touchFactor = window.matchMedia('(pointer: coarse)').matches ? 1.15 : 1
        const landscapeBoost = isLandscape ? 1.2 : 1
        const dprBoost = Math.min(1.35, Math.max(1, dpr * 0.9))
        const iconSizePx = Math.round(Math.max(20, Math.min(39, shortestSide * 0.045 * touchFactor * landscapeBoost * dprBoost * 0.75)))
        const countSizePx = Math.max(12, Math.round(iconSizePx * 0.37))
        const countOffsetPx = Math.max(3, Math.round(iconSizePx * 0.1))

        this.affectIconSizePx = iconSizePx
        this.panel.style.setProperty('--affect-icon-size', `${iconSizePx}px`)
        this.panel.style.setProperty('--affect-icon-count-size', `${countSizePx}px`)
        this.panel.style.setProperty('--affect-icon-count-offset', `${countOffsetPx}px`)
        this.panel.style.setProperty('--affect-icon-count-font-size', `${Math.max(10, Math.round(countSizePx * 0.62))}px`)
        this.panel.style.setProperty('--affect-icon-gap', `${Math.max(4, Math.round(iconSizePx * 0.11))}px`)
        this.panel.style.setProperty('--affect-icon-adverse-gap', `${iconSizePx / 2}px`)
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

        const affectGroups = Array.isArray(MyPlayer.affectGroups) ? MyPlayer.affectGroups as ClientAffectGroup[] : []
        const sortedAffectGroups = [...affectGroups]
            .sort((a, b) => Number(a.isAdverse()) - Number(b.isAdverse()))

        this.affectsRowEl.style.display = sortedAffectGroups.length > 0 ? 'flex' : 'none'
        const affectGroupIds = new Set(sortedAffectGroups.map((affectGroup) => affectGroup.id))

        for (const [affectId, iconEl] of this.affectIconEls) {
            if (affectGroupIds.has(affectId)) {
                continue
            }

            iconEl.remove()
            this.affectIconEls.delete(affectId)
        }

        const firstAdverseAffectId = sortedAffectGroups.find((affectGroup) => affectGroup.isAdverse())?.id ?? null

        for (const affectGroup of sortedAffectGroups) {
            let iconEl = this.affectIconEls.get(affectGroup.id)
            if (!iconEl) {
                iconEl = this.createAffectIconEl(affectGroup)
                this.affectIconEls.set(affectGroup.id, iconEl)
            } else {
                this.updateAffectIconEl(iconEl, affectGroup, affectGroup.id === firstAdverseAffectId)
            }

            if (!iconEl.isConnected) {
                this.updateAffectIconEl(iconEl, affectGroup, affectGroup.id === firstAdverseAffectId)
            }
            this.affectsIconsEl.appendChild(iconEl)
        }
    },

    createAffectIconEl(affectGroup: ClientAffectGroup) {
        const iconEl = document.createElement('div')
        iconEl.className = 'affectIcon'

        const imageEl = document.createElement('img')
        imageEl.className = 'affectIconImage'
        imageEl.alt = ''
        iconEl.appendChild(imageEl)

        this.updateAffectIconEl(iconEl, affectGroup, false)

        return iconEl
    },

    updateAffectIconEl(iconEl: HTMLDivElement, affectGroup: ClientAffectGroup, isFirstAdverse: boolean) {
        iconEl.title = affectGroup.getTitle()
        iconEl.dataset.affectId = affectGroup.id.toString()
        iconEl.classList.toggle('adverse', affectGroup.isAdverse())
        iconEl.classList.toggle('positive', !affectGroup.isAdverse())
        iconEl.classList.toggle('firstAdverse', isFirstAdverse)

        const imageEl = iconEl.querySelector('.affectIconImage') as HTMLImageElement | null
        if (imageEl) {
            imageEl.src = affectGroup.getImageUrl()
            imageEl.style.display = affectGroup.getImageUrl() ? 'block' : 'none'
        }

        let countEl = iconEl.querySelector('.affectIconCount') as HTMLSpanElement | null
        if (affectGroup.af.length > 1) {
            if (!countEl) {
                countEl = document.createElement('span')
                countEl.className = 'affectIconCount'
                iconEl.appendChild(countEl)
            }
            countEl.textContent = affectGroup.af.length.toString()
            return
        }

        countEl?.remove()
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
