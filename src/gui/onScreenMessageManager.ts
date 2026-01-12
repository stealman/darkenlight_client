export const OnScreenMessageManager = {
    messages: [] as HTMLDivElement[],

    initialize() {

    },

    addMessage(text: string) {
        console.log("OnScreenMessageManager addMessage:", text)
        const msgPanel = document.getElementById("onscreen-messages-panel")

        // add mssage div to msgPanel
        const msgDiv = document.createElement("div")
        msgDiv.className = "noselect onscreen-message gray"
        msgDiv.innerText += text

        msgPanel?.insertBefore(msgDiv, msgPanel.firstChild)
        msgDiv.createdAt = Date.now()
        this.messages.push(msgDiv)
    },

    onFrame(time: number) {
        // Remove messages older than 2 seconds
        for (let i = this.messages.length - 1; i >= 0; i--) {
            const msg = this.messages[i]
            if (time - msg.createdAt > 2000) {
                msg.remove()
                this.messages.splice(i, 1)
            }
        }
    }
}
