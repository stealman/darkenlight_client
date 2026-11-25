
export interface CharacterAppearanceData {
    gender?: 'M' | 'F'
    headTypeId?: number
    hairTypeId?: number
    hairColorId?: number
}

export interface MonsterSpawnData {
    skulls?: number
    woolCooldown?: number
    id: number
    tp: number
    x: number
    z: number
    hpp: number | string
    mv?: number[]
    paf?: [{tp: number, p: number}]
    role?: string
    alignment?: 'evil' | 'neutral' | 'friendly'
    huntable?: boolean
    guard?: any
}

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
    precision?: number
    defense?: number
    arcaneInterference?: number
}

export interface DayNightCycleSync {
    phase: number
    day: number
    cycleDurationMs: number
    paused?: boolean
}

export interface WorldMapDataMessage {
    areas?: import('../data/worldAreas').WorldArea[]
    areasRevision?: number
    noGrassTiles?: number[]
    id: number
    name: string
    size: number
    mapId: number
    seaWaterLevel?: number | null
    environment?: {type: 'outdoor' | 'indoor', category?: string}
    dayNightCycle?: DayNightCycleSync
    mapChunk?: any
    foggyAreas?: FoggyAreaData[]
}

export type GrassExclusionChange = {worldId: number, tile: number, excluded: boolean} | {error: true}

export interface FoggyAreaData {
    id: number
    x: number
    z: number
    width: number
    depth: number
    rotation: number
    intensity: number
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

export interface AccountCharacterNameCheckData {
    name: string
    exists: boolean
    message?: string
    claimable?: boolean
    className?: string
}

export type MagicArrowCastMessage = {
    id: number, tgt: number, tp: string, worldId: number,
    event: {phase: 'charge', x: number, y: number, z: number}
        | {phase: 'release', x: number, y: number, z: number, flightMs: number}
        | {phase: 'impact', res: AutoAttackResult}
}

export type HealingSpellCastMessage = {
    id: number, targetId: number, worldId: number,
    event: {phase: 'charge', x: number, z: number}
        | {phase: 'heal', x: number, y: number, z: number, amount: number, hpPercent: number}
}

export type HealerTreatmentMessage = {id: number, worldId: number}

export type PhysicalWeaponSkillKey = 'swords' | 'axes' | 'maces' | 'polearms' | 'bows' | 'stavesAndWands'
export type ArmorSkillKey = 'leatherArmor' | 'chainArmor' | 'plateArmor' | 'shields'
export type UtilitySkillKey = 'camping' | 'healing' | 'cooking'
export type GatheringSkillKey = 'mining' | 'lumberjacking' | 'hunting'
export type CombatSkillKey = 'powerStrike' | 'preciseShot'
export type SkillKey = PhysicalWeaponSkillKey | ArmorSkillKey | UtilitySkillKey | GatheringSkillKey | CombatSkillKey | 'magicArrow'

export interface SkillProgressTO {
    maxWoodResourceKey?: string
    maxMiningOreResourceKey?: string
    maxHuntingHideResourceKey?: string
    maxHuntingBowstringResourceKey?: string
    lumberjackingCapacityPreservationPercent?: number
    lumberjackingStaminaReductionPercent?: number
    miningStaminaReductionPercent?: number
    rank: number
    experience: number
    currentExperienceRequired?: number
    nextExperienceRequired?: number
    weaponAttackBonusPercent?: number
    weaponAttackBonusPercentPerRank?: number
    powerStrikeDamageBonusPercent?: number
    powerStrikeDamageBonusPercentPerRank?: number
    preciseShotDamageBonusPercent?: number
    preciseShotDamageBonusPercentPerRank?: number
    armorBonusPercent?: number
    armorBonusPercentPerRank?: number
    actionSpeedBonusPercent?: number
    actionSpeedBonusPercentPerRank?: number
    restingRegenBonusPercent?: number
    restingRegenBonusPercentPerRank?: number
    bandageHealingAmountMinimum?: number
    bandageHealingAmountMaximum?: number
    bandageHealingAmountMinimumPerRank?: number
    bandageHealingAmountMaximumPerRank?: number
}

export type SkillSetTO = Partial<Record<SkillKey, SkillProgressTO>>

export type SkillCapsTO = Partial<Record<SkillKey, number>>

export interface  AutoAttackMessage {
    id: number
    tgt: number
    tp: string
    dur: number
    cd: number
    ef?: string | null // GFX
    ps?: boolean
    pcd?: number
    prs?: boolean
    prscd?: number
}

export interface PowerStrikeQueueStateMessage {
    q: boolean
}

export interface PreciseShotQueueStateMessage {
    q: boolean
}

export interface AutoAttackResult {
    h: string
    d: number
    q: 'P' | 'N' | 'G' | null
    tgt: AttackableBasicTO
    fx?: 'silverUndead'
    a?: 's' | 'b'
    v?: number
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

export interface PushThroughMessage {
    id: number
    x: number
    y: number
    z: number
    a: number
    dur: number
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
    atts: Map<string, number | string> // Weapon/shield precision/defense are percentage modifiers, not final scores.
    wCat?: string
    aCat?: string
    hReq?: number
    tags?: string[]
    dmgTypes?: string[]
    slot?: string
}

export interface GroundItemTO {
    dropFrom?: { x: number, y: number, z: number }
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
    params?: Record<string, string | number | boolean>
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
    meal?: MealData
    level?: number
    data: number[] // [typeId, duration, power]
}

export interface MealData {
    itemId: number
    category: 'CATEGORY_1' | 'CATEGORY_2'
    level: number
    image: string
    name: string
    duration: number
    hpRegen: number
    mpRegen: number
    staminaReduction: number
    manaReduction: number
    experience: number
}

export interface PubliclyVisibleAffectData {
    id: number
    tgt: number
    tp: string // C - character, M - monster
    p: number
    timed?: boolean
}

export interface EffectDamageMessage {
    tp: string // C - character, M - monster
    id: number
    d: number
    ef: number[]
    ids: number[] // IDS of authors of the effect, used for displaying correct names in damage numbers
}

export interface CraftingRecipe {
    qualityMin?: number
    qualityMax?: number
    outputQuantity?: number
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
    atts?: Record<string, number | string> // Weapon/shield precision/defense are percentage modifiers.
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

export interface ContainerStateData extends BankStateData {
    containerId: string
    open?: boolean
}

export interface GMNpcDetailsData extends CharacterAppearanceData {
    spawn: {x: number, z: number}
    id: number
    name: string
    titleCZ: string
    titleEN: string
    type: string
    bodyType: string
    equipment: Record<string, {modelId: number, materialId: number}>
    features: any[]
    wanderingRange: number
    guard?: {
        level: number
        aggroRange: number
        pursueRange: number
        respawnSeconds: number
        patrolPoints: Array<{x: number, z: number}>
    }
}

export interface GMBotDetailsData extends CharacterAppearanceData {
    id: number
    name: string
    origin: {worldId: number, x: number, z: number}
}

export interface GMBotStatusData {
    id: number
    name: string
    className: string
    controllerActive: boolean
    state: string
    alive: boolean
    deadForSeconds?: number | null
    respawnInSeconds?: number | null
    world: {id: number, name: string}
    position: {x: number, y: number, z: number}
    origin: {worldId: number, x: number, z: number} | null
    vitals: {hp: number, maxHp: number, mp: number, maxMp: number, stamina: number, maxStamina: number, tired: boolean}
    action: string | null
    movement?: {type: string | null, speed: number, target: {x: number, z: number} | null, queuedWaypoints: number}
    plan?: {
        goal: string | null
        woodland?: {key: string, x: number, z: number} | null
        remainingSeconds: number
        spawn: {id: number, x: number, z: number} | null
        monster: {id: number, name: string, x: number, z: number} | null
        retreatDestination: {x: number, z: number} | null
    }
    navigation?: {
        purpose: string | null
        destination: {x: number, z: number} | null
        waypoint: {x: number, z: number} | null
        backtrackTarget: {x: number, z: number} | null
        failedPlans: number
        trailPoints: number
    }
    supplies?: {bandages: number, emeralds: number}
    equipment?: Array<{slot: string, name: string, cbId: number, durability: number | null, maxDurability: number | null}>
    home?: {
        healerId: number | null
        guardSafePoint: {x: number, z: number} | null
        fireplace: {x: number, z: number} | null
    }
}

export interface GMExistingBotsData {
    bots: GMBotStatusData[]
}

export interface GMItemCodebookItem {
    type: string
    id: number
    name: string
    modelId?: number
    materialId?: number
}

export interface GMWorldsData {
    worlds: Array<{id: number, name: string}>
    characters: Array<{id: number, name: string, worldId: number}>
}

export interface GMWorldSettingsData {
    id: number
    name: string
    size: number
    mapId: number
    seaWaterLevel: number | null
    environment: {type: 'outdoor' | 'indoor', category?: string}
    attributes: Record<string, unknown>
}

export interface GMWorldMapImageData {
    worldId: number
    mapType: 'height' | 'terrain' | 'surface' | 'biome' | 'gathering'
    image: string
    trees?: Array<{x: number, z: number}>
}

export interface GMWorldBiomeTreesChangedData {
    worldId: number
    removedTrees: Array<{x: number, z: number}>
    addedTrees: Array<{x: number, z: number}>
}

export interface GMStaticDeleteInfoData {
    x: number
    z: number
    barrelCount: number
    itemCount: number
}

export interface PartyStateData {
    leaderId: number
    members: Array<{
        id: number, name: string, worldId: number, x: number, z: number,
        hp?: number, maxHp?: number, st?: number, maxSt?: number, mp?: number, maxMp?: number,
    }>
}

export interface MonsterKnowledgeTO {
    category: string
    experience: number
    level: number
    damageBonusPercent: number
    progressPercent: number
    nextExperienceRequired: number
}

export interface CharacterSpeechData {
    id: number
    text: string
    name: string
    time: number
}

export interface MonsterAggroAlertData {
    id: number
    worldId: number
}

export interface MonsterDangerChangedData {
    worldId: number
    monsters: Array<{id: number, skulls: number}>
}

export type MonsterSpecialAttribute = {type: 'PHYSICAL_PIERCE' | 'PHYSICAL_SLASH' | 'PHYSICAL_BLUNT' | 'DEFENSE_MELEE' | 'DEFENSE_MISSILE', value: number}

export interface MonsterCatalogEntry {
    type: number
    name: string
    category: string
    specialAttributes?: readonly MonsterSpecialAttribute[]
    tags: string[]
}

export interface ActivityLogData {
    event: 'pickup' | 'purchase' | 'drop' | 'campfire' | 'craft'
    item?: ItemTO
    quantity?: number
    time?: number
}

export interface CharacterPickupData {
    id: number
    worldId: number
    item: ItemTO
    quantity: number
    time: number
}

export interface GMSpawnStatusData {
    worldId: number
    spawns: Array<{id: number, count: number, nextSpawnInGameHours: number | null}>
}

export interface WorldAreasData {
    signpostTargets?: {
        currentAreaId: number | null
        currentAreaName: string
        targets: Array<{id: number, name: string, x: number, z: number, depth: number}>
    }

    worldId: number
    size: number
    revision: number
    areas: import('../data/worldAreas').WorldArea[]
    requestId?: string
    saved?: boolean
    error?: string
}
