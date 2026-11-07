import {reactive} from 'vue'
import {t} from '@/i18n'
import {Item} from '@/data/items/item'
import type {ActivityLogData, PartyStateData} from '@/network/messageIfs'

export interface ActivityEntry {id: number; time: number; text: string; color?: string; negative?: boolean; positive?: boolean; kill?: {before: string; name: string; after: string; color?: string}; damage?: {before: string; value: string; after: string}}
function expandHealingHighlight(entry: ActivityEntry): ActivityEntry {
    const part = entry.damage
    if (entry.color === '#20ff20' && part && /\+\s*$/.test(part.before) && /^\s*HP\b/.test(part.after)) {
        const prefix = part.before.match(/\+\s*$/)![0]
        const suffix = part.after.match(/^\s*HP\b/)![0]
        part.before = part.before.slice(0, -prefix.length)
        part.value = prefix + part.value + suffix
        part.after = part.after.slice(suffix.length)
    }
    return entry
}

export const ActivityLogManager = {
    characterId: 0,
    lastAttackWeaponName: '',
    lastAttackSkillName: '',
    rememberAttackWeapon(weapon: Item | null) {
        this.lastAttackWeaponName = weapon?.name || t('activityLog.unarmed')
    },
    state: reactive({entries: [] as ActivityEntry[]}),
    initialize(id: number) {
        this.characterId = id
        this.lastAttackWeaponName = ''
        this.lastAttackSkillName = ''
        this.state.entries = []
        try {
            const saved = JSON.parse(localStorage.getItem(`activityLog:${id}`) || '[]')
            if (Array.isArray(saved)) this.state.entries = saved.filter(e => e && Number.isFinite(e.id) && Number.isFinite(e.time) && typeof e.text === 'string' && (!e.color || /^#[0-9a-f]{6}$/i.test(e.color))).slice(-1000).map((entry: ActivityEntry) => {
                // Retain the new presentation for history written before split damage values.
                const hit = entry.text.match(/(\d+) \((?:perfect|normal|glance)\)$/)
                if (!entry.damage && entry.color && hit) {
                    const offset = entry.text.length - hit[0].length
                    entry.damage = {before: entry.text.slice(0, offset), value: hit[1], after: entry.text.slice(offset + hit[1].length)}
                    entry.negative = /(?:ty|you):/.test(entry.damage.before) && Number(hit[1]) > 0
                }
                if (entry.damage) {
                    entry.damage.after = entry.damage.after.replace(/ \((?:perfect|normal|glance)\)$/, '')
                    entry.text = entry.damage.before + entry.damage.value + entry.damage.after
                }
                if (/^(?:Zahozeno|Dropped):/.test(entry.text)) entry.negative = true
                const kill = entry.text.match(/^(Zabil jsi: |You killed: )(.+)$/)
                if (!entry.kill && kill) entry.kill = {before: kill[1], name: kill[2], after: ''}
                return expandHealingHighlight(entry)
            })
        } catch { /* Storage is optional. */ }
    },
    add(text: string, color?: string, time = Date.now(), details: Pick<ActivityEntry, 'negative' | 'positive' | 'damage' | 'kill'> = {}) {
        if (!this.characterId) return
        const last = this.state.entries[this.state.entries.length - 1]
        const id = Math.max(Date.now(), (last?.id || 0) + 1)
        this.state.entries.push(expandHealingHighlight({id, time, text, color, ...details}))
        if (this.state.entries.length > 1000) this.state.entries.splice(0, this.state.entries.length - 1000)
        try { localStorage.setItem(`activityLog:${this.characterId}`, JSON.stringify(this.state.entries)) } catch { /* Retain the in-memory log. */ }
    },
    partyChanged(previous: PartyStateData | null, next: PartyStateData | null, myId: number) {
        const add = (key: string, name = '') => this.add(t(`activityLog.${key}`, {name}), undefined, undefined, {positive: true})
        if (!previous && next) {
            add(next.leaderId === myId ? 'partyCreated' : 'partyJoined')
            for (const member of next.members) if (member.id !== myId) add('partyMemberJoined', member.name)
        } else if (previous && !next) {
            add('partyLeft')
        } else if (previous && next) {
            for (const member of next.members) {
                if (!previous.members.some(old => old.id === member.id)) add('partyMemberJoined', member.name)
            }
            for (const member of previous.members) {
                if (!next.members.some(current => current.id === member.id)) add('partyMemberLeft', member.name)
            }
        }
    },
    worldChanged(from: string, to: string) {
        this.add(t('activityLog.worldChanged', {from, to}), undefined, undefined, {positive: true})
    },
    receive(data: ActivityLogData) {
        this.add(t(`activityLog.${data.event}`, {item: data.item ? Item.fromData(data.item).name || '?' : '', quantity: data.quantity || 1}), undefined, data.time, {negative: data.event === 'drop'})
    },
}
