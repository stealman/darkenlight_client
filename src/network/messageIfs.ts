export interface AttackableBasicTO {
    id: number
    hp: number
    mhp: number
    hpp: number
}

export interface  AutoAttackMessage {
    id: number
    tgt: number
    tp: string
    dur: number
}

export interface AutoAttackResult {
    h: string
    d: number
    c: boolean
    tgt: AttackableBasicTO
}

export interface AutoAttackResultMessage {
    id: number
    tgt: number
    tp: string
    res: AutoAttackResult
}

export interface  HealingMessage {
    id: number
    tgt: number
    tp: string
    dur: number
}

export interface  HealingResultMessage {
    id: number
    tgt: number
    tp: string
    res: HealingResult
}

export interface HealingResult {
    hp: number
    tgt: AttackableBasicTO
}
