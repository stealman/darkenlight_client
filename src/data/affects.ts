import { t } from '@/i18n'
import { AffectData, AffectGroupData } from '@/network/messageIfs'

export class AffectGroupDefinition {
    id: number
    nameKey: string
    icon: string
    adverse: boolean = false
    displayDuration: boolean = true

    constructor(id: number, nameKey: string, icon: string, adverse: boolean, displayDuration: boolean = true) {
        this.id = id
        this.nameKey = nameKey
        this.icon = icon
        this.adverse = adverse
        this.displayDuration = displayDuration
    }

    getNameLocalized() {
        return t('affects.' + this.nameKey + 'Name')
    }

    getDescriptionLocalized() {
        return t('affects.' + this.nameKey + 'Description')
    }

    getImageUrl() {
        return 'images/icons/' + this.icon + '.png'
    }
}

export class ClientAffectGroup {
    id: number
    p: number
    af: AffectData[]
    lastUpdatedAt: number

    constructor(data: AffectGroupData) {
        this.id = data.id
        this.p = data.p
        this.af = data.af
        this.lastUpdatedAt = data.lastUpdatedAt ?? Date.now()
    }

    static fromServerData(data: AffectGroupData) {
        return new ClientAffectGroup({
            ...data,
            lastUpdatedAt: Date.now(),
        })
    }

    getDefinition() {
        return AffectGroups[this.id as keyof typeof AffectGroups]
    }

    getLocalizedName() {
        return this.getDefinition()?.getNameLocalized() ?? `Affect group ${this.id}`
    }

    getLocalizedDescription() {
        const definition = this.getDefinition()
        if (!definition) {
            return ''
        }

        const description = definition.getDescriptionLocalized()
        const fallbackKey = `affects.${definition.nameKey}Description`
        return description === fallbackKey ? '' : description
    }

    getImageUrl() {
        return this.getDefinition()?.getImageUrl() ?? ''
    }

    getPowerLabel() {
        const nameKey = this.getDefinition()?.nameKey
        if (nameKey === 'resting') {
            const level = this.getIconBadgeLabel()
            return level === null ? '' : `(${level})`
        }
        return nameKey === 'damagedWeapon' || nameKey === 'damagedArmor' ? `(-${this.p}%)` : `(${this.p})`
    }

    getIconBadgeLabel(): string | null {
        if (this.getDefinition()?.nameKey === 'resting') {
            const level = this.af.find(affect => affect.data[0] === 3)?.level
            return level !== undefined ? String(level) : null
        }
        if (!Number.isFinite(this.p) || this.p <= 0) return null
        const power = Math.round(this.p * 10) / 10
        switch (this.getDefinition()?.nameKey) {
            case 'damagedWeapon':
            case 'damagedArmor':
                return String(this.p >= 75 ? 3 : this.p >= 50 ? 2 : 1)
            case 'slow':
            case 'meal':
            case 'flameArrows':
            case 'burning':
                return String(power)
            default:
                return null
        }
    }

    isAdverse() {
        return this.getDefinition()?.adverse ?? false
    }

    shouldDisplayDuration() {
        return this.getDefinition()?.displayDuration === true
    }

    getMinDurationSeconds() {
        const durations = this.af
            .map((effect) => effect?.data?.[1])
            .filter((duration): duration is number => typeof duration === 'number')

        return durations.length > 0 ? Math.min(...durations) : null
    }

    getRemainingDurationSeconds(actualTime: number = Date.now()) {
        const minDuration = this.getMinDurationSeconds()
        if (minDuration == null) {
            return null
        }

        const elapsedSeconds = Math.max(0, Math.floor((actualTime - this.lastUpdatedAt) / 1000))
        return Math.max(0, minDuration - elapsedSeconds)
    }

    getFormattedRemainingDuration(actualTime: number = Date.now()) {
        const remainingDuration = this.getRemainingDurationSeconds(actualTime)
        if (remainingDuration == null) {
            return '-'
        }

        const totalSeconds = Math.floor(remainingDuration)
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        }

        return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }
}

export class PubliclyVisibleAffect {
    id: number
    p: number

    constructor(id: number, p: number, public timed: boolean = true) {
        this.id = id
        this.p = p
    }
}

export const AffectGroups = {
    1: new AffectGroupDefinition(1, 'tired', 'affects/tired', true, false),
    2: new AffectGroupDefinition(2, 'meal', 'affects/meal', false),
    3: new AffectGroupDefinition(3, 'resting', 'buttons/btn_rest', false, false),
    4: new AffectGroupDefinition(4, 'flameArrows', 'affects/flame_arrow', false),
    5: new AffectGroupDefinition(5, 'slow', 'affects/slow', true),
    6: new AffectGroupDefinition(6, 'burning', 'buttons/btn_burning_flames', true),
    7: new AffectGroupDefinition(7, 'damagedWeapon', 'affects/damaged_weapon', true, false),
    8: new AffectGroupDefinition(8, 'damagedArmor', 'affects/damaged_armor', true, false),
}
