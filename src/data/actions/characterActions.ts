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

    getActionByName(name: string): CharacterAction | undefined {
        const actions = [
            this.AUTO_ATTACK,
            this.HEAL,
            this.HEALING_POTION,
            this.MANA_POTION,
            this.MINING,
            this.LUMBERJACKING,
        ]

        return actions.find((action) => action.name === name)
    }
}
