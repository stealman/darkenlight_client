export interface GameMessage {
    t: number
    d: any
}

/** Commands retain their wire shape; only the WebSocket adapter encodes JSON. */
export interface GameCommand {
    t: number
    d?: any
    login?: string
    password?: string
    guestName?: string | null
}
export interface GameTransport {
    readonly ready: Promise<void>
    readonly open: boolean
    onFrame: ((frame: GameMessage[]) => void) | null
    onClose: ((error?: Error) => void) | null
    onError: ((error: Error) => void) | null
    send(frame: GameCommand): void
    close(): Promise<void>
    save(): Promise<void>
}

export class WebSocketTransport implements GameTransport {
    readonly ready: Promise<void>
    readonly socket: WebSocket
    onFrame: ((frame: GameMessage[]) => void) | null = null
    onClose: ((error?: Error) => void) | null = null
    onError: ((error: Error) => void) | null = null

    constructor(url: string) {
        this.socket = new WebSocket(url)
        this.ready = new Promise((resolve, reject) => {
            this.socket.onopen = () => resolve()
            this.socket.onerror = () => reject(new Error('Unable to connect to game server'))
        })
        this.socket.onmessage = event => this.onFrame?.(JSON.parse(event.data))
        this.socket.onclose = () => this.onClose?.()
    }
    get open() { return this.socket.readyState === WebSocket.OPEN }
    send(frame: GameCommand) { this.socket.send(JSON.stringify(frame)) }
    async close() { this.socket.close() }
    async save() {}
}
