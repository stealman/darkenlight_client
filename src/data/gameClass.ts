export class GameClass {
    key: string
    name: string

    constructor(name: string) {
        this.key = name.toUpperCase()
        this.name = name
    }
}

export const GameClasses = {
    GM: new GameClass('GM'),
    FIGHTER: new GameClass('Fighter'),
    ADEPT: new GameClass('Adept'),

    getByKey(key: string): GameClass | null {
        const value = this[key as keyof typeof GameClasses]

        if (value instanceof GameClass) {
            return value
        }

        return null
    }
}
