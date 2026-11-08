import { ref } from 'vue'
import { AudioManager } from '@/babylon/audio/audioManager'
import type { WoodenSignpost } from '@/babylon/world/statics/objects/woodenSignpost'
import { MyPlayer } from '@/data/myPlayer'
import { TooltipOverlayManager } from '@/gui/tooltipOverlayManager'

export const SignpostReader = {
    entries: ref<Array<{direction: string, arrowRotation: number, text: string}>>([]),
    openedAt: 0,
    open(signpost: WoodenSignpost) {
        if (MyPlayer.isDead.value) return
        MyPlayer.stopMove()
        TooltipOverlayManager.hide()
        this.entries.value = signpost.getReadingEntries()
        this.openedAt = Date.now()
        AudioManager.playGuiButtonClick()
    },
    close() {
        if (!this.entries.value.length) return
        this.entries.value = []
        AudioManager.playGuiButtonClick()
    },
    closeFromBackdrop() {
        if (Date.now() - this.openedAt >= 300) this.close()
    },
}
