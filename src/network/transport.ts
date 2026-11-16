/** JSON frames are the boundary for every game transport, including local play. */
export interface GameTransport {
    readonly ready: Promise<void>
    readonly open: boolean
    onFrame: ((frame: string) => void) | null
    onClose: ((error?: Error) => void) | null
    onError: ((error: Error) => void) | null
    send(frame: string): void
    close(): Promise<void>
    save(): Promise<void>
}

export class WebSocketTransport implements GameTransport {
    readonly ready: Promise<void>
    readonly socket: WebSocket
    onFrame: ((frame: string) => void) | null = null
    onClose: ((error?: Error) => void) | null = null
    onError: ((error: Error) => void) | null = null

    constructor(url: string) {
        this.socket = new WebSocket(url)
        this.ready = new Promise((resolve, reject) => {
            this.socket.onopen = () => resolve()
            this.socket.onerror = () => reject(new Error('Unable to connect to game server'))
        })
        this.socket.onmessage = event => this.onFrame?.(event.data)
        this.socket.onclose = () => this.onClose?.()
    }
    get open() { return this.socket.readyState === WebSocket.OPEN }
    send(frame: string) { this.socket.send(frame) }
    async close() { this.socket.close() }
    async save() {}
}
