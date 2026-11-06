import { AudioManager } from '@/babylon/audio/audioManager'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import { ref } from 'vue'

export const EmeraldsManager = {
    size: 32 as number,
    iconBaseSize: 24 as number,
    emeraldsInfoPanel: null as HTMLDivElement,
    emeraldsInfoIcon: null as HTMLImageElement,
    emeraldsInfoCount: null as HTMLSpanElement,

    myEmeralds: 0 as number,
    emeralds: ref(0),
    displayedEmeralds: 0 as number,
    animationStartDifference: 0 as number,

    lastActializationTime: 0 as number,

    formatEmeraldAmount(amount: number) {
        return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    },

    initialize() {
        this.emeraldsInfoPanel = document.createElement('div')
        this.emeraldsInfoPanel.id = 'emeralds-info'
        this.emeraldsInfoCount = document.createElement('span')
        this.emeraldsInfoCount.id = 'emeralds-info-count'
        this.emeraldsInfoCount.className = 'ui-emerald-text-gradient'
        this.emeraldsInfoCount.textContent = this.formatEmeraldAmount(this.displayedEmeralds)
        this.emeraldsInfoIcon = document.createElement('img')
        this.emeraldsInfoIcon.id = 'emeralds-info-icon'
        this.emeraldsInfoIcon.src = '/images/icons/emerald.png'
        this.emeraldsInfoIcon.alt = ''
        this.emeraldsInfoPanel.append(this.emeraldsInfoCount, this.emeraldsInfoIcon)
        document.getElementById('my-status-currency-host')?.replaceChildren(this.emeraldsInfoPanel)
        this.setSize(this.size)
    },

    onFrame(time: number) {
        const difference = this.myEmeralds - this.displayedEmeralds
        this.updateIconPulse(time, difference)
        if (difference === 0) {
            this.animationStartDifference = 0
            this.emeraldsInfoCount.innerText = this.formatEmeraldAmount(this.displayedEmeralds)
            return
        }

        if (this.animationStartDifference === 0) {
            this.animationStartDifference = Math.abs(difference)
        }

        const remainingDifference = Math.abs(difference)
        const progress = 1 - (remainingDifference / this.animationStartDifference)
        const tickInterval = 50 + (progress * 75)

        if (time - this.lastActializationTime < tickInterval) {
            return
        }

        const step = Math.max(1, Math.floor(remainingDifference * 0.075))
        const direction = difference > 0 ? 1 : -1
        this.displayedEmeralds += direction * step

        if ((direction > 0 && this.displayedEmeralds > this.myEmeralds) || (direction < 0 && this.displayedEmeralds < this.myEmeralds)) {
            this.displayedEmeralds = this.myEmeralds
        }

        AudioManager.playGuiTick()
        this.emeraldsInfoCount.innerText = this.formatEmeraldAmount(this.displayedEmeralds)
        this.lastActializationTime = time
    },

    setSize(size: number) {
        this.size = size
        this.iconBaseSize = Math.max(9, Math.min(13, size * 0.2))

        if (this.emeraldsInfoIcon != null) {
            this.emeraldsInfoIcon.style.width = `${this.iconBaseSize}px`
            this.emeraldsInfoIcon.style.height = `${this.iconBaseSize}px`
        }
        if (this.emeraldsInfoCount != null) {
            this.emeraldsInfoCount.style.fontSize = `${Math.max(9, Math.min(12, size * 0.2))}px`
        }
    },

    updateIconPulse(time: number, difference: number) {
        if (this.emeraldsInfoIcon == null) {
            return
        }

        if (difference === 0) {
            this.emeraldsInfoIcon.style.width = `${this.iconBaseSize}px`
            this.emeraldsInfoIcon.style.height = `${this.iconBaseSize}px`
            this.emeraldsInfoIcon.style.transform = 'none'
            this.emeraldsInfoIcon.style.opacity = '1'
            return
        }

        const pulse = Math.sin(time * 0.015)
        const opacity = 0.9 + (pulse * 0.1)

        this.emeraldsInfoIcon.style.opacity = `${opacity}`
    },

    setMyEmeralds(amount: number, immediate: boolean = false, change: number, mobId?: number) {
        if (mobId != null && mobId > 0 && change > 0) {
            OverlayManager.addMonsterEmeraldNumber(mobId, change)
        }

        if (amount !== this.myEmeralds) {
            this.animationStartDifference = Math.abs(amount - this.displayedEmeralds)
        }
        this.myEmeralds = amount
        this.emeralds.value = amount
        if (immediate) {
            this.displayedEmeralds = amount
            this.emeraldsInfoCount.innerText = this.formatEmeraldAmount(this.displayedEmeralds)
        }
    }
}
