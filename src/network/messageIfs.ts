
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

export interface AttackableCombatTO {
    id: number
    spd1?: number
    spd2?: number

    str?: number
    agi?: number
    int?: number
    wis?: number

    patk?: number
    aaCd?: number
}

export interface  AutoAttackMessage {
    id: number
    tgt: number
    tp: string
    dur: number
    cd: number
    ef: string // GFX
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
    wCat?: string
    hReq?: number
    tags?: string[]
    dmgTypes?: string[]
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

export interface CharacterCraftingMessage {
    id: number
    dur: number
    type: string
}

export interface CharacterCraftingResultMessage {
    id: number
    g: number
    q: number
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

export interface PlaySoundMessage {
    id: number
    sound: string
}

export interface AffectGroupData {
    id: number
    p: number
    af: AffectData[]
    lastUpdatedAt?: number
}

export interface AffectData {
    data: number[] // [typeId, duration, power]
}

export interface PubliclyVisibleAffectData {
    id: number
    tgt: number
    tp: string // C - character, M - monster
    p: number
}

export interface EffectDamageMessage {
    tp: string // C - character, M - monster
    id: number
    d: number
    ef: number[]
    ids: number[] // IDS of authors of the effect, used for displaying correct names in damage numbers
}

export interface CraftingRecipe {
    diff: number
    ing: { res: ItemTO, qty: number }[]
    item: ItemTO
    skill: string
}

export interface CraftingInitMenuData {
    recipes: CraftingRecipe[]
    type: string
    x: number
    z: number
}

export interface NpcVendorCatalogItem {
    tp: string
    cb: number
    name: string
    img: string
    price: number
    atts?: Record<string, number | string>
    wCat?: string
    dmgTypes?: string[]
    bundleSize?: number
}

export interface NpcUseFeatureData {
    type: string
    categories?: Record<string, NpcVendorCatalogItem[]>
}

export interface NpcUseData {
    id: number
    name: string
    title: string
    features: NpcUseFeatureData[]
}

export interface GMNpcDetailsData {
    id: number
    name: string
    title: string
    type: string
    bodyType: string
    equipment: Record<string, {modelId: number, materialId: number}>
    features: any[]
    wanderingRange: number
}
