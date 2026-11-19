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
    hairColor: string
    hairLightness: number
}

export function resolveCharacterHairAppearance(data: Partial<CharacterHairAppearance>): CharacterHairAppearance {
    return {
        hairTypeId: Number.isInteger(data.hairTypeId) && data.hairTypeId! >= 1 && data.hairTypeId! <= 4 ? data.hairTypeId! : 1,
        hairColor: typeof data.hairColor === 'string' && /^#[\da-f]{6}$/i.test(data.hairColor) ? data.hairColor.toLowerCase() : '#664e0a',
        hairLightness: Number.isFinite(data.hairLightness) && data.hairLightness! >= -2 && data.hairLightness! <= 4 ? data.hairLightness! : 0.6,
    }
}
