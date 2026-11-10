import {t} from '@/i18n'
import type {MealData} from '@/network/messageIfs'

export const mealBonusKeys = ['hpRegen', 'mpRegen', 'staminaReduction', 'manaReduction', 'experience'] as const

export function getMealBonusRows(meal: Partial<MealData>, includeDuration: boolean = true) {
    const bonuses = [
        {key: 'experience', label: 'experienceGain', reduction: false},
        {key: 'hpRegen', label: 'healthRegeneration', reduction: false},
        {key: 'mpRegen', label: 'manaRegeneration', reduction: false},
        {key: 'staminaReduction', label: 'autoAttackStaminaCost', reduction: true},
        {key: 'manaReduction', label: 'manaCost', reduction: true},
    ] as const
    const rows = bonuses.filter(bonus => Number(meal[bonus.key]) > 0).map(bonus => ({
        label: t(`affects.${bonus.label}`),
        value: t(bonus.reduction ? 'affects.mealStaminaCostValue' : 'affects.restingRegenerationValue', {
            total: Math.round(Number(meal[bonus.key]) * 1000) / 10,
        }),
        separator: '',
        className: bonus.key === 'experience' ? 'ui-tooltip-row--meal-experience' : null,
    }))
    if (includeDuration && Number(meal.duration) > 0) rows.unshift({
        label: t('affects.duration'),
        value: t('affects.durationMinutes', {minutes: Number(meal.duration) / 60}),
        separator: '',
        className: 'ui-tooltip-row--meal-duration',
    })
    return rows
}
