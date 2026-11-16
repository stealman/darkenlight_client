import { AccountCharacterClaimMsg, AccountCharacterCreateMsg, AccountCharacterNameCheckMsg, GuestCharacterCreateMsg, GuestCharacterNameCheckMsg, LoginMsg, Message, PlayerRegistrationMsg } from '@/network/messages'
import { MonsterCatalog } from '@/data/monsterCatalog'
import { MonsterCatalogRequest } from '@/network/messages'
import { MessageProcessor } from '@/network/messageProcessor'
import {WebSocketTransport, type GameTransport} from './transport'
import {WorkerTransport} from '@/local/workerTransport'
import type {LocalGameMode} from '@/local/workerProtocol'
import type {CharacterProfile} from '@/local/saveStore'

type OutgoingMessage = Message & {sentTime?: number}

export const Connector = {
    transport: null as GameTransport | null,
    generation: 0,
    sentMessages: [] as OutgoingMessage[],
    queuedMessages: [] as OutgoingMessage[],
    responseQueue: Promise.resolve() as Promise<void>,
    lastSecondLimit: 10,

    moveMessageTimeout: 50,
    lastMoveMessage: null as Message | null,
    lastSentMoveMessage: null as Message | null,
    lastMoveMessageTime: 0,

    async initialize(mode: LocalGameMode = 'play', profile?: CharacterProfile) {
        const generation = ++this.generation
        if (this.transport) {
            this.transport.onFrame = null
            this.transport.onClose = null
            this.transport.onError = null
            await this.transport.close()
        }
        this.resetSession()
        this.responseQueue = Promise.resolve()
        const parameters = new URLSearchParams(window.location.search)
        const remoteUrl = import.meta.env.DEV && parameters.get('transport') === 'websocket'
            ? import.meta.env.VITE_GAME_WS_URL || `ws://${window.location.hostname}:3000` : null
        const transport = remoteUrl ? new WebSocketTransport(remoteUrl)
            : new WorkerTransport(mode, profile?.id || parameters.get('save') || 'default', profile)
        this.transport = transport
        MonsterCatalog.reset(types => this.sendMessage(new MonsterCatalogRequest(types)))
        transport.onFrame = frame => {
            if (generation !== this.generation) return
            const response = frame
            this.responseQueue = this.responseQueue.then(() => {
                if (generation === this.generation) return MessageProcessor.processResponse(response)
            }).catch(error => {
                console.error('Failed to process game response:', error)
                window.dispatchEvent(new CustomEvent('game:application-error', {detail: {message: String(error)}}))
            })
        }
        transport.onClose = error => {
            if (generation === this.generation) window.dispatchEvent(new CustomEvent('game:application-error', {
                detail: {message: error?.message || 'Game connection closed.'},
            }))
        }
        transport.onError = transport.onClose
        await transport.ready
    },

    async closeConnection() {
        ++this.generation
        this.resetSession()
        if (this.transport) {
            this.transport.onFrame = null
            this.transport.onClose = null
            this.transport.onError = null
        }
        // Queued frames are invalidated by generation. A handler already in
        // progress must finish before its caller tears down world data.
        await this.responseQueue
        await this.transport?.close()
        this.transport = null
    },

    async save() { await this.transport?.save() },

    sendLoginRequest(username: string, password: string, guestName: string | null) {
        const loginMsg = new LoginMsg(username, password, guestName)
        this.transport!.send(loginMsg)
    },

    checkGuestCharacterName(name: string) {
        this.transport!.send(new GuestCharacterNameCheckMsg(name))
    },

    createGuestCharacter(name: string, classKey: 'FIGHTER' | 'MYSTIC') {
        this.transport!.send(new GuestCharacterCreateMsg(name, classKey))
    },

    registerPlayer(email: string, password: string) {
        this.transport!.send(new PlayerRegistrationMsg(email, password))
    },

    checkAccountCharacterName(name: string) {
        this.transport!.send(new AccountCharacterNameCheckMsg(name))
    },

    createAccountCharacter(name: string, classKey: 'FIGHTER' | 'MYSTIC') {
        this.transport!.send(new AccountCharacterCreateMsg(name, classKey))
    },

    claimGuestCharacter(name: string) {
        this.transport!.send(new AccountCharacterClaimMsg(name))
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

    cancelPendingMoveMessage() {
        this.lastMoveMessage = null
        this.lastSentMoveMessage = null
        this.lastMoveMessageTime = new Date().getTime()
    },

    resetSession() {
        this.queuedMessages = []
        this.sentMessages = []
        this.cancelPendingMoveMessage()
    },

    sendMessage(msg: Message) {
        const time = new Date().getTime()

        // Remove from sentMessages all that are older than 1 second
        this.sentMessages = this.sentMessages.filter((m) => m.sentTime! + 1000 > time)

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
        this.sentMessages = this.sentMessages.filter((m) => m.sentTime! + 1000 > time)

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

    doSend(msg: OutgoingMessage, time: number) {
        // console.log('Sending message:', msg)
        this.transport!.send(msg)
        msg.sentTime = time
    }
}

