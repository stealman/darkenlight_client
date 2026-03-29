export interface AttackableBasicTO {
    id: number
    hp: number
    mhp: number
    hpp: number
    mp?: number
    mmp?: number
    mpp?: number
    st?: number
    mst?: number
    stp?: number
}

export interface  AutoAttackMessage {
    id: number
    tgt: number
    tp: string
    dur: number
    cd: number
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

export interface CharacterGatheringMessage {
    id: number
    gt: string
    dur: number
    x: number
    z: number
}

export interface CharacterGatheringResultMessage {
    id: number
    gt: string
    g: number // gained ID
    q: number // gained quantity
}

export interface HealingResult {
    hp: number
    dt: AttackableBasicTO
}

export interface ItemTO {
    id: number
    tp: string // Codebool type W/A/J/T/R - weapon/armor/jewel/trinket/resource
    cb: number // Codebook id
    mId: number
    matId: number
    name: string
    img: string
    atts: Map<string, number | string>
}

export interface GroundItemTO {
    item: ItemTO
    pos: { x: number, z: number }
}

export interface EmeraldsChangeMessage {
    em: number
    ch: number
    mobId: number
}

export interface PotionUsedMessage {
    tp: string
    id: number
    cd: number
    add: number // att that was added - HP or MP
    val: number // value of the added att
}

export interface CharacterCampingMessage {
    id: number
    dur: number
    x: number
    z: number
}

export interface CharacterRestingMessage {
    id: number
    x: number
    z: number
}

export interface TextMessage {
    txt: string
    sev: string
}
