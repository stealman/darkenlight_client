export type CharacterGender = 'M' | 'F'

export function resolveCharacterGender(value: unknown): CharacterGender {
    return value === 'F' ? 'F' : 'M'
}

// The finished head is ID 1; migrate the former preview ID 2 as well.
export function resolveCharacterHeadTypeId(headTypeId?: number): number {
    return headTypeId === 2 ? 1 : headTypeId ?? 1
}

export interface CharacterHairAppearance {
    hairTypeId: number
    hairColorId: number
}

export function resolveCharacterHairAppearance(data: Partial<CharacterHairAppearance>): CharacterHairAppearance {
    return {
        hairTypeId: Number.isInteger(data.hairTypeId) && data.hairTypeId! >= 1 && data.hairTypeId! <= 4 ? data.hairTypeId! : 1,
        hairColorId: Number.isInteger(data.hairColorId) && data.hairColorId! >= 1 && data.hairColorId! <= 16 ? data.hairColorId! : 1,
    }
}
