import { LoginMsg, Message } from '@/network/messages'
import { MessageProcessor } from '@/network/messageProcessor'

export const Connector = {
    socket: null as WebSocket,
    sentMessages: [] as Message[],
    queuedMessages: [] as Message[],
    lastSecondLimit: 10,

    moveMessageTimeout: 50,
    lastMoveMessage: null as Message | null,
    lastSentMoveMessage: null as Message | null,
    lastMoveMessageTime: 0,

    initialize() {
        const socketUrl = import.meta.env.DEV
            ? 'ws://192.168.0.227:3000'
            : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/game/ws`
        this.socket = new WebSocket(socketUrl)

        this.socket.onopen = () => {
            console.log('WS connection estabilished')
        }

        this.socket.onmessage = async (event) => {
           await MessageProcessor.processResponse(JSON.parse(event.data))
        }

        this.socket.onerror = (error) => {
            console.error('Chyba spojení:', error)
        }

        this.socket.onclose = () => {
            console.log('Spojení uzavřeno')
            document.getElementById("dialog-error-content")!.innerText = 'Připojení k serveru bylo ukončeno.'
            document.getElementById("dialog-error")!.style.display = 'flex'
        }
    },

    closeConnection() {
        if (this.socket) {
            this.socket.close()
        }
    },

    sendLoginRequest(username: string, password: string, guestName: string | null) {
        const loginMsg = new LoginMsg(username, password, guestName)
        this.socket.send(JSON.stringify(loginMsg))
    },

    sendMoveMessage(msg: Message) {
        this.lastMoveMessage = msg

        const time = new Date().getTime()
        if (time > this.lastMoveMessageTime + this.moveMessageTimeout) {
            this.doSend(msg, time)
            this.lastSentMoveMessage = msg
            this.lastMoveMessageTime = time
        }
    },

    sendMessage(msg: Message) {
        const time = new Date().getTime()

        // Remove from sentMessages all that are older than 1 second
        this.sentMessages = this.sentMessages.filter((m) => m.sentTime + 1000 > time)

        if (this.sentMessages.length < this.lastSecondLimit) {
            this.doSend(msg, time)
            this.sentMessages.push(msg)
        } else {
            this.queuedMessages.push(msg)
            console.log('Message queued')
        }
    },

    processMessages(time: number) {
        // Remove from sentMessages all that are older than 1 second
        this.sentMessages = this.sentMessages.filter((m) => m.sentTime + 1000 > time)

        if (this.queuedMessages.length > 0 && this.sentMessages.length < this.lastSecondLimit) {
            // Process up to 10 - sentMessages.length messages
            while (this.queuedMessages.length > 0 && this.sentMessages.length < this.lastSecondLimit) {
                const queuedMessage = this.queuedMessages.shift()!
                this.doSend(queuedMessage, time)
                this.sentMessages.push(queuedMessage)
            }
        }

        // If last move message was not sent due to timeout, send it now
        if (this.lastMoveMessage != null && this.lastSentMoveMessage != this.lastMoveMessage && time > this.lastMoveMessageTime + this.moveMessageTimeout) {
            this.doSend(this.lastMoveMessage, time)
            this.lastSentMoveMessage = this.lastMoveMessage
        }

        // If movement is active and lastMoveMessageTime is older than 2 seconds, send sync message
        /**
        if (MyPlayer.myChar.getMoveAngle() != null && MyPlayer.myChar.getActualSpeed() > 0 && time > this.lastMoveMessageTime + 2000) {
            this.lastMoveMessage = new MyCharMoveMsg()
            this.sendMoveMessage(this.lastMoveMessage)

            this.lastMoveMessageTime = time
            this.lastSentMoveMessage = this.lastMoveMessage
            this.lastMoveMessage['sentTime'] = time
            console.log('Sending sync message')
        }*/
    },

    doSend(msg: Message, time: number) {
        // console.log('Sending message:', msg)
        this.socket.send(JSON.stringify(msg))
        msg['sentTime'] = time
    }
}

