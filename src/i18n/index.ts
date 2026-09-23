import { computed, ref } from 'vue'
import cs from '@/i18n/locales/cs.json'
import csItems from '@/i18n/locales/cs_items.json'
import csSkills from '@/i18n/locales/cs_skills.json'
import csAffects from '@/i18n/locales/cs_affects.json'
import en from '@/i18n/locales/en.json'
import enItems from '@/i18n/locales/en_items.json'
import enSkills from '@/i18n/locales/en_skills.json'
import enAffects from '@/i18n/locales/en_affects.json'

export const supportedLocales = ['cs', 'en'] as const
export type SupportedLocale = typeof supportedLocales[number]

const mergeLocaleMessages = (...sources: any[]) => {
    const result: Record<string, any> = {}

    for (const source of sources) {
        for (const [key, value] of Object.entries(source ?? {})) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = mergeLocaleMessages(result[key] ?? {}, value)
                continue
            }

            result[key] = value
        }
    }

    return result
}

const messages = {
    cs: mergeLocaleMessages(cs, csItems, csSkills, csAffects),
    en: mergeLocaleMessages(en, enItems, enSkills, enAffects),
} as const

const currentLocale = ref<SupportedLocale>('cs')

const normalizeLocale = (locale: string | null | undefined): SupportedLocale => {
    return supportedLocales.includes(locale as SupportedLocale) ? locale as SupportedLocale : 'cs'
}

const resolveMessage = (locale: SupportedLocale, key: string): string | null => {
    const segments = key.split('.')
    let current: any = messages[locale]

    for (const segment of segments) {
        if (current == null || typeof current !== 'object' || !(segment in current)) {
            return null
        }

        current = current[segment]
    }

    return typeof current === 'string' ? current : null
}

const interpolate = (template: string, params: Record<string, string | number | boolean>): string => {
    return template.replace(/\{(\w+)\}/g, (_, token) => String(params[token] ?? `{${token}}`))
}

export const setLocale = (locale: string | null | undefined) => {
    currentLocale.value = normalizeLocale(locale)
    document.documentElement.lang = currentLocale.value
}

export const getLocale = () => currentLocale.value

export const t = (key: string, params: Record<string, string | number | boolean> = {}) => {
    const message = resolveMessage(currentLocale.value, key) ?? resolveMessage('cs', key) ?? key
    return interpolate(message, params)
}

export const useI18n = () => {
    return {
        locale: computed(() => currentLocale.value),
        setLocale,
        t,
    }
}
