export class CharacterAction {
    name: string
    image: string
    toggleable: boolean
    nameLoc: string
    descLoc: string

    constructor(name: string, image: string, toggleable: boolean, nameLoc: string, descLoc: string) {
        this.name = name
        this.image = image
        this.toggleable = toggleable
        this.nameLoc = nameLoc
        this.descLoc = descLoc
    }

    get description(): string {
        if (!this.descLoc) {
            return this.nameLoc
        }

        return `${this.nameLoc}: ${this.descLoc}`
    }
}

export const CharacterActions = {
    AUTO_ATTACK: new CharacterAction("AUTO_ATTACK", "btn_attack_sword", true, "Auto útok",
        "Postava automaticky útočí na vybraný cíl, dokud je v dosahu."),

    HEAL: new CharacterAction("HEAL", "btn_heal", false, "Léčba",
        "Použiješ obvaz ke svému vyléčení. Pokud nejsi zraněn a je vybrána jiná postava, použiješ obvaz na ni."),

    HEALING_POTION: new CharacterAction("HEALING_POTION", "btn_heal_potion", false,
        "Lektvar Zdraví",
        "Použiješ Lektvar Zdraví pokud je v inventáři a jsi zraněn. Použije se vždy nejsilnější dostupný lektvar."),

    MANA_POTION: new CharacterAction("MANA_POTION", "btn_mana_potion", false,
        "Lektvar Many",
        "Použiješ Lektvar Many pokud je v inventáři a nemáš plnou manu. Použije se vždy nejsilnější dostupný lektvar."),

    MINING: new CharacterAction("MINING", "btn_pickaxe", false, "", ""),
    LUMBERJACKING: new CharacterAction("LUMBERJACKING", "btn_lumber", false, "", ""),

    getActionByName(name: string): CharacterAction {
        for (const key in this) {
            if (this[key as keyof typeof this].name === name) {
                return this[key as keyof typeof this]
            }
        }
    }
}
