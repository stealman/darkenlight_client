import { t } from '@/i18n'
import { AffectData, AffectGroupData } from '@/network/messageIfs'

export class AffectGroupDefinition {
    id: number
    nameKey: string
    icon: string
    adverse: boolean = false

    constructor(id: number, nameKey: string, icon: string, adverse: boolean = false) {
        this.id = id
        this.nameKey = nameKey
        this.icon = icon
        this.adverse = adverse
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

    getImageUrl() {
        return this.getDefinition()?.getImageUrl() ?? ''
    }

    isAdverse() {
        return this.getDefinition()?.adverse ?? false
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

    getTitle(actualTime: number = Date.now()) {
        const details: string[] = []
        const remainingDuration = this.getRemainingDurationSeconds(actualTime)

        if (remainingDuration != null) {
            details.push(`duration ${remainingDuration}`)
        }

        if (typeof this.p === 'number') {
            details.push(`power ${this.p}`)
        }

        return details.length > 0
            ? `${this.getLocalizedName()}: ${details.join(', ')}`
            : this.getLocalizedName()
    }
}

export class PubliclyVisibleAffect {
    id: number
    p: number

    constructor(id: number, p: number) {
        this.id = id
        this.p = p
    }
}

export const AffectGroups = {
    1: new AffectGroupDefinition(1, 'tired', 'affects/tired', true),
    2: new AffectGroupDefinition(2, 'affectGroup2', 'icon2.png'),
    3: new AffectGroupDefinition(3, 'resting', 'buttons/btn_rest'),
    4: new AffectGroupDefinition(4, 'flameArrows', 'affects/flame_arrow'),
    6: new AffectGroupDefinition(6, 'burning', 'buttons/btn_burning_flames', true),
}
