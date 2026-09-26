
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
    armor?: number
    armorPen?: number
    precision?: number
    defense?: number
    arcaneInterference?: number
}

export interface GuestCharacterNameCheckData {
    name: string
    exists: boolean
}

export interface PlayerRegistrationData {
    success: boolean
    email: string | null
    message: string | null
}

export type PhysicalWeaponSkillKey = 'swords' | 'axes' | 'maces' | 'polearms' | 'bows'
export type ArmorSkillKey = 'leatherArmor' | 'chainArmor' | 'plateArmor' | 'shields'
export type UtilitySkillKey = 'camping' | 'healing'
export type SkillKey = PhysicalWeaponSkillKey | ArmorSkillKey | UtilitySkillKey

export interface SkillProgressTO {
    rank: number
    experience: number
    trainingPoints: number
    currentExperienceRequired?: number
    nextExperienceRequired?: number
    nextTrainingRequired?: number
    weaponAttackBonusPercent?: number
    weaponAttackBonusPercentPerRank?: number
    armorBonusPercent?: number
    armorBonusPercentPerRank?: number
      actionSpeedBonusPercent?: number
      actionSpeedBonusPercentPerRank?: number
      bandageHealingAmountMinimum?: number
      bandageHealingAmountMaximum?: number
      bandageHealingAmountMinimumPerRank?: number
      bandageHealingAmountMaximumPerRank?: number
}

export type SkillSetTO = Partial<Record<SkillKey, SkillProgressTO>> & {
    activeTrainingSkill?: SkillKey
    trainingPointsPerSecond?: number
}

export type SkillCapsTO = Partial<Record<SkillKey, number>>

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
    q: 'P' | 'N' | 'G' | null
    tgt: AttackableBasicTO
}

export interface AutoAttackResultMessage {
    id: number
    tgt: number
    tp: string
    sec?: boolean
    res: AutoAttackResult
}

export interface CombatApproachMessage {
    x: number
    z: number
    a: number
    d: number
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
    aCat?: string
    hReq?: number
    tags?: string[]
    dmgTypes?: string[]
    slot?: string
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
    add: string // attribute that was added - HP, MP or ST
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
    item: ItemTO
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
    price: number
}

export interface CraftingInitMenuData {
    recipes: CraftingRecipe[]
    type: string
    x: number
    z: number
    npcId?: number
}

export interface NpcVendorCatalogItem {
    tp: string
    cb: number
    name: string
    img: string
    price: number
    atts?: Record<string, number | string>
    wCat?: string
    aCat?: string
    dmgTypes?: string[]
    bundleSize?: number
}

export interface NpcHealerService {
    id: string
    name: string
    img: string
    price: number
}

export interface NpcRepairItem {
    id: number
    price: number
}

export interface ClassPromotionRequirementData {
    labelKey: string
    met: boolean
    type?: 'skill' | 'skillCount'
    minimumRank?: number
    count?: number
    skill?: SkillKey
    skillGroup?: 'weapons' | 'armor'
}

export interface ClassPromotionOptionData {
    targetClass: string
    descriptionKey: string
    requirements: ClassPromotionRequirementData[]
    eligible: boolean
}

export interface NpcUseFeatureData {
    type: string
    categories?: Record<string, NpcVendorCatalogItem[]>
    services?: NpcHealerService[]
    repairItems?: NpcRepairItem[]
    craftingCategories?: string[]
    skillLearningPrice?: number
    promotions?: ClassPromotionOptionData[]
}

export interface NpcUseData {
    id: number
    name: string
    titleCZ: string
    titleEN: string
    features: NpcUseFeatureData[]
}

export interface BankStateData {
    items: ItemTO[]
    capacity: number
}

export interface GMNpcDetailsData {
    id: number
    name: string
    titleCZ: string
    titleEN: string
    type: string
    bodyType: string
    equipment: Record<string, {modelId: number, materialId: number}>
    features: any[]
    wanderingRange: number
}

export interface GMItemCodebookItem {
    type: string
    id: number
    name: string
}
