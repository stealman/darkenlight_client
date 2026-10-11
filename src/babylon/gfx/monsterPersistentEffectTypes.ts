export const MonsterPersistentEffectTypes = {
    SPECTRAL_AURA: 'spectralAura',
    WRAITH_LORD_DOWNWARD_SMOKE: 'wraithLordDownwardSmoke',
} as const

export type MonsterPersistentEffectType = (typeof MonsterPersistentEffectTypes)[keyof typeof MonsterPersistentEffectTypes]
