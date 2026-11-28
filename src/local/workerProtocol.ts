import type {CharacterProfile} from './saveStore'
import type {GameCommand, GameMessage} from '../network/transport'
export type LocalGameMode = 'play' | 'authoring'

export function characterGameMode(profile: CharacterProfile): LocalGameMode {
    // GM saves created before this field existed always used the authoring world.
    return profile.gm && profile.authoring !== false ? 'authoring' : 'play'
}

export interface WorkerStart {
    kind: 'start'
    mode: LocalGameMode
    baseUrl: string
    authoringToken: string
    slot: string
    profile?: CharacterProfile
    bundle?: import('./worldBundle').LocalWorldBundle
}

export type HostMessage = WorkerStart
    | {kind: 'frame', frame: GameCommand, connectionId: string}
    | {kind: 'connect' | 'disconnect', connectionId: string}
    | {kind: 'save' | 'stop' | 'inspect', requestId: number}
    | {kind: 'io-result', requestId: number, value?: string | null, error?: string}

export type WorkerMessage = {kind: 'ready'}
    | {kind: 'frame', frame: GameMessage[], connectionId: string}
    | {kind: 'error', error: string}
    | {kind: 'save-error', error: string}
    | {kind: 'done', requestId: number, error?: string, value?: number}
    | {kind: 'io', requestId: number, operation: 'load-save' | 'write-save', slot: string, value?: string}
