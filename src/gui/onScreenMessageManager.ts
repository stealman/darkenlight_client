import { AudioManager } from '@/babylon/audio/audioManager'

export const OnScreenMessageSeverities = {
    INFO: 'INFO',
    ERROR: 'ERROR',
    SUCCESS: 'SUCCESS',
}

type OnScreenMessageSeverity = typeof OnScreenMessageSeverities[keyof typeof OnScreenMessageSeverities]

type OnScreenMessage = {
    text: string
    severity: OnScreenMessageSeverity
    expiresAt: number
    element: HTMLDivElement
}

export const OnScreenMessageManager = {
    MESSAGE_DURATION: 2000 as number,
    messages: [] as OnScreenMessage[],

    initialize() {

    },

    addMessage(text: string, severity: OnScreenMessageSeverity = 'INFO') {
        const msgPanel = document.getElementById("onscreen-messages-panel")
        if (!msgPanel) {
            return
        }

        const msgDiv = document.createElement("div")
        msgDiv.className = `noselect onscreen-message ${severity.toLowerCase()}`
        msgDiv.innerText = text

        msgPanel.insertBefore(msgDiv, msgPanel.firstChild)

        this.messages.push({
            text,
            severity,
            expiresAt: Date.now() + this.MESSAGE_DURATION,
            element: msgDiv,
        })

        if (severity === 'ERROR') {
            AudioManager.playGuiFail()
        }
    },

    onFrame(time: number) {
        for (let i = this.messages.length - 1; i >= 0; i--) {
            const msg = this.messages[i]
            if (time >= msg.expiresAt) {
                msg.element.remove()
                this.messages.splice(i, 1)
            }
        }
    }
}
