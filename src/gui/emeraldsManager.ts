import { MiniMap } from '@/utils/minimap'
import { AudioManager } from '@/babylon/audio/audioManager'
import { OverlayManager } from '@/gui/overlay/overlayManager'

export const EmeraldsManager = {
    size: 32 as number,
    iconBaseSize: 24 as number,
    emeraldsInfoPanel: null as HTMLDivElement,
    emeraldsInfoIcon: null as HTMLImageElement,
    emeraldsInfoCount: null as HTMLDivElement,

    myEmeralds: 0 as number,
    displayedEmeralds: 0 as number,
    animationStartDifference: 0 as number,

    lastActializationTime: 0 as number,

    formatEmeraldAmount(amount: number) {
        return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    },

    initialize() {
        this.emeraldsInfoPanel = document.getElementById("emeralds-info") as HTMLDivElement
        this.emeraldsInfoIcon = document.getElementById("emeralds-info-icon") as HTMLImageElement
        this.emeraldsInfoCount = document.getElementById("emeralds-info-count") as HTMLDivElement
        this.setSize(this.size)
    },

    updatePositions(miniMapSize: number) {
        this.emeraldsInfoPanel.style.right = `${miniMapSize + this.size + (15 / window.devicePixelRatio)}px`
        this.emeraldsInfoPanel.style.top = `5px`
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
        this.iconBaseSize = size * 0.75

        if (this.emeraldsInfoIcon != null) {
            this.emeraldsInfoIcon.style.width = `${this.iconBaseSize}px`
            this.emeraldsInfoIcon.style.height = `${this.iconBaseSize}px`
        }
        this.updatePositions(MiniMap.canvasSize || 100)
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
        if (immediate) {
            this.displayedEmeralds = amount
            this.emeraldsInfoCount.innerText = this.formatEmeraldAmount(this.displayedEmeralds)
        }
    }
}
