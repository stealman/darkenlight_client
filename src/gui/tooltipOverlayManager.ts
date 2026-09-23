export type TooltipOverlayRow = {
    label?: string
    value: string
}

export type TooltipOverlayContent = {
    title: string
    titleMeta?: string | null
    topRightText?: string | null
    description?: string | null
    rows?: TooltipOverlayRow[]
    variant?: 'neutral' | 'positive' | 'adverse'
}

type ShowTooltipOptions = {
    pinned?: boolean
    ownerKey?: string | null
    triggerEl?: HTMLElement | null
}

type EventTooltipOptions = {
    ownerKey: string
    event: MouseEvent
    content: TooltipOverlayContent
    pinned?: boolean
}

const TOOLTIP_OFFSET_X = 18
const TOOLTIP_OFFSET_Y = 18
const TOOLTIP_VIEWPORT_PADDING = 8

export const TooltipOverlayManager = {
    rootEl: null as HTMLDivElement | null,
    titleEl: null as HTMLDivElement | null,
    titleMetaEl: null as HTMLSpanElement | null,
    topRightEl: null as HTMLDivElement | null,
    descriptionEl: null as HTMLDivElement | null,
    rowsEl: null as HTMLDivElement | null,
    visible: false,
    pinned: false,
    ownerKey: null as string | null,
    triggerEl: null as HTMLElement | null,
    pointerX: 0,
    pointerY: 0,
    content: null as TooltipOverlayContent | null,

    initialize() {
        if (this.rootEl) {
            return
        }

        const rootEl = document.createElement('div')
        rootEl.id = 'uiTooltipOverlay'
        rootEl.className = 'ui-tooltip-overlay'
        rootEl.style.display = 'none'

        const headerEl = document.createElement('div')
        headerEl.className = 'ui-tooltip-header'

        const titleWrapEl = document.createElement('div')
        titleWrapEl.className = 'ui-tooltip-title-wrap'

        const titleEl = document.createElement('div')
        titleEl.className = 'ui-tooltip-title'

        const titleMetaEl = document.createElement('span')
        titleMetaEl.className = 'ui-tooltip-title-meta'

        titleWrapEl.appendChild(titleEl)
        titleWrapEl.appendChild(titleMetaEl)

        const topRightEl = document.createElement('div')
        topRightEl.className = 'ui-tooltip-top-right'

        headerEl.appendChild(titleWrapEl)
        headerEl.appendChild(topRightEl)

        const descriptionEl = document.createElement('div')
        descriptionEl.className = 'ui-tooltip-description'

        const rowsEl = document.createElement('div')
        rowsEl.className = 'ui-tooltip-rows'

        rootEl.appendChild(headerEl)
        rootEl.appendChild(descriptionEl)
        rootEl.appendChild(rowsEl)

        document.body.appendChild(rootEl)
        document.addEventListener('pointerdown', this.onDocumentPointerDown, true)
        document.addEventListener('keydown', this.onDocumentKeyDown)
        window.addEventListener('blur', this.hide)

        this.rootEl = rootEl
        this.titleEl = titleEl
        this.titleMetaEl = titleMetaEl
        this.topRightEl = topRightEl
        this.descriptionEl = descriptionEl
        this.rowsEl = rowsEl
    },

    show(content: TooltipOverlayContent, x: number, y: number, options: ShowTooltipOptions = {}) {
        this.initialize()
        if (!this.rootEl || !this.titleEl || !this.descriptionEl || !this.rowsEl) {
            return
        }

        this.visible = true
        this.pinned = options.pinned === true
        this.ownerKey = options.ownerKey ?? null
        this.triggerEl = options.triggerEl ?? null
        this.pointerX = x
        this.pointerY = y
        this.content = content

        this.renderContent(content)
        this.rootEl.style.display = 'flex'
        this.positionAt(x, y)
    },

    hide: () => {
        if (!TooltipOverlayManager.rootEl) {
            return
        }

        TooltipOverlayManager.visible = false
        TooltipOverlayManager.pinned = false
        TooltipOverlayManager.ownerKey = null
        TooltipOverlayManager.triggerEl = null
        TooltipOverlayManager.content = null
        TooltipOverlayManager.rootEl.style.display = 'none'
    },

    refresh(content?: TooltipOverlayContent | null) {
        if (!this.visible || !this.rootEl) {
            return
        }

        if (content) {
            this.content = content
            this.renderContent(content)
        } else if (this.content) {
            this.renderContent(this.content)
        }

        this.positionAt(this.pointerX, this.pointerY)
    },

    positionAt(x: number, y: number) {
        if (!this.rootEl) {
            return
        }

        this.pointerX = x
        this.pointerY = y

        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const rect = this.rootEl.getBoundingClientRect()
        const maxLeft = Math.max(TOOLTIP_VIEWPORT_PADDING, viewportWidth - rect.width - TOOLTIP_VIEWPORT_PADDING)
        const maxTop = Math.max(TOOLTIP_VIEWPORT_PADDING, viewportHeight - rect.height - TOOLTIP_VIEWPORT_PADDING)

        const left = Math.max(TOOLTIP_VIEWPORT_PADDING, Math.min(x + TOOLTIP_OFFSET_X, maxLeft))
        const top = Math.max(TOOLTIP_VIEWPORT_PADDING, Math.min(y + TOOLTIP_OFFSET_Y, maxTop))

        this.rootEl.style.left = `${left}px`
        this.rootEl.style.top = `${top}px`
    },

    isPinnedFor(ownerKey: string) {
        return this.visible && this.pinned && this.ownerKey === ownerKey
    },

    isVisibleFor(ownerKey: string) {
        return this.visible && this.ownerKey === ownerKey
    },

    showFromEvent(options: EventTooltipOptions) {
        this.show(
            options.content,
            options.event.clientX,
            options.event.clientY,
            {
                pinned: options.pinned === true,
                ownerKey: options.ownerKey,
                triggerEl: options.event.currentTarget as HTMLElement | null,
            }
        )
    },

    moveFromEvent(ownerKey: string, event: MouseEvent) {
        if (!this.isVisibleFor(ownerKey) || this.pinned) {
            return
        }

        this.positionAt(event.clientX, event.clientY)
    },

    hideOwner(ownerKey: string) {
        if (!this.isVisibleFor(ownerKey)) {
            return
        }

        this.hide()
    },

    hideOwnerIfNotPinned(ownerKey: string) {
        if (!this.isVisibleFor(ownerKey) || this.isPinnedFor(ownerKey)) {
            return
        }

        this.hide()
    },

    togglePinnedFromEvent(options: EventTooltipOptions) {
        if (this.isPinnedFor(options.ownerKey)) {
            this.hide()
            return false
        }

        this.showFromEvent({
            ...options,
            pinned: true,
        })
        return true
    },

    renderContent(content: TooltipOverlayContent) {
        if (!this.rootEl || !this.titleEl || !this.descriptionEl || !this.rowsEl) {
            return
        }

        this.rootEl.classList.toggle('variant-positive', content.variant === 'positive')
        this.rootEl.classList.toggle('variant-adverse', content.variant === 'adverse')

        this.titleEl.textContent = content.title ?? ''
        if (this.titleMetaEl) {
            this.titleMetaEl.textContent = content.titleMeta ?? ''
            this.titleMetaEl.style.display = content.titleMeta ? 'inline' : 'none'
        }

        if (this.topRightEl) {
            this.topRightEl.textContent = content.topRightText ?? ''
            this.topRightEl.style.display = content.topRightText ? 'block' : 'none'
        }

        const description = content.description?.trim?.() ?? ''
        this.descriptionEl.textContent = description
        this.descriptionEl.style.display = description ? 'block' : 'none'

        this.rowsEl.replaceChildren()
        const rows = Array.isArray(content.rows) ? content.rows : []
        this.rowsEl.style.display = rows.length > 0 ? 'flex' : 'none'

        for (const row of rows) {
            const rowEl = document.createElement('div')
            rowEl.className = 'ui-tooltip-row'

            if (row.label) {
                const labelEl = document.createElement('span')
                labelEl.className = 'ui-tooltip-row-label'
                labelEl.textContent = `${row.label}:`
                rowEl.appendChild(labelEl)
            }

            const valueEl = document.createElement('span')
            valueEl.className = 'ui-tooltip-row-value'
            valueEl.textContent = row.value
            rowEl.appendChild(valueEl)

            this.rowsEl.appendChild(rowEl)
        }
    },

    onDocumentPointerDown(event: PointerEvent) {
        if (!TooltipOverlayManager.visible) {
            return
        }

        const target = event.target as Node | null
        if (target && TooltipOverlayManager.rootEl?.contains(target)) {
            return
        }

        if (target && TooltipOverlayManager.triggerEl?.contains(target)) {
            return
        }

        TooltipOverlayManager.hide()
    },

    onDocumentKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            TooltipOverlayManager.hide()
        }
    },
}
