import { t } from '@/i18n'

export class CharacterAction {
    name: string
    image: string
    toggleable: boolean
    nameKey: string
    descKey: string

    constructor(name: string, image: string, toggleable: boolean, nameKey: string, descKey: string) {
        this.name = name
        this.image = image
        this.toggleable = toggleable
        this.nameKey = nameKey
        this.descKey = descKey
    }

    get nameLoc(): string {
        return this.nameKey ? t(this.nameKey) : ''
    }

    get descLoc(): string {
        return this.descKey ? t(this.descKey) : ''
    }

    get description(): string {
        if (!this.descLoc) {
            return this.nameLoc
        }

        return `${this.nameLoc}: ${this.descLoc}`
    }
}

export class CharacterTimedAction {
    type: string
    craftingType: string | null
    characterId: number
    startedAt: number
    endsAt: number | null
    x: number | null
    z: number | null

    constructor(type: string, characterId: number, dur: number | null, x: number | null, z: number | null, craftingType: string | null = null) {
        this.type = type
        this.craftingType = craftingType
        this.characterId = characterId
        this.startedAt = Date.now()
        this.endsAt = dur != null ? this.startedAt + dur : null
        this.x = x
        this.z = z
    }

    tryFinish(actualTime: number): boolean {
        if (this.endsAt == null) {
            return false
        }

        if (actualTime < this.endsAt) {
            return false
        }
        return true
    }

    hasTimer(): boolean {
        return this.endsAt != null
    }

    getProgressPercent(actualTime: number): number {
        if (this.endsAt == null) {
            return 0
        }

        const totalDuration = this.endsAt - this.startedAt
        if (totalDuration <= 0) {
            return 100
        }

        const elapsed = actualTime - this.startedAt
        return Math.max(0, Math.min(100, (elapsed / totalDuration) * 100))
    }

    getDisplayName(): string {
        if (this.type === CharacterActions.CRAFTING.name && this.craftingType) {
            const key = `crafting.${this.craftingType}`
            const displayName = t(key)
            return displayName !== key ? displayName : CharacterActions.CRAFTING.nameLoc
        }

        return CharacterActions.getActionByName(this.type)?.nameLoc || this.type
    }
}

export const CharacterActions = {
    AUTO_ATTACK: new CharacterAction('AUTO_ATTACK', 'btn_attack_sword', true, 'actions.autoAttackName',
        'actions.autoAttackDescription'),

    HEAL: new CharacterAction('HEAL', 'btn_heal', false, 'actions.healName',
        'actions.healDescription'),

    HEALING_POTION: new CharacterAction('HEALING_POTION', 'btn_heal_potion', false,
        'actions.healingPotionName',
        'actions.healingPotionDescription'),

    MANA_POTION: new CharacterAction('MANA_POTION', 'btn_mana_potion', false,
        'actions.manaPotionName',
        'actions.manaPotionDescription'),

    MINING: new CharacterAction('MINING', 'btn_pickaxe', false, '', ''),
    LUMBERJACKING: new CharacterAction('LUMBERJACKING', 'btn_lumber', false, '', ''),

    EQUIP_STORED_WEAPONS: new CharacterAction('EQUIP_STORED_WEAPONS', 'btn_romanian1_2', false,
        'actions.equipStoredWeaponsName',
        'actions.equipStoredWeaponsDescription'),

    CAMPING: new CharacterAction('CAMPING', 'btn_camp', true, 'actions.campingName', 'actions.campingDescription'),
    RESTING: new CharacterAction('RESTING', 'btn_rest', true, 'actions.restingName', 'actions.restingDescription'),
    CRAFTING: new CharacterAction('CRAFTING', '', false, 'crafting.title', ''),

    getActionByName(name: string): CharacterAction | undefined {
        const actions = [
            this.AUTO_ATTACK,
            this.HEAL,
            this.HEALING_POTION,
            this.MANA_POTION,
            this.MINING,
            this.LUMBERJACKING,
            this.EQUIP_STORED_WEAPONS,
            this.CAMPING,
            this.RESTING,
            this.CRAFTING,
        ]

        return actions.find((action) => action.name === name)
    }
}
