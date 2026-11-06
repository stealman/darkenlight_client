import { shallowReactive } from 'vue'
import type { MonsterCatalogEntry } from '@/network/messageIfs'

// Public type metadata only; runtime state continues to arrive with individual monsters.
export const MonsterCatalog = {
    entries: shallowReactive(new Map<number, MonsterCatalogEntry | null>()),
    pending: new Set<number>(),
    queued: new Set<number>(),
    send: null as ((types: number[]) => void) | null,

    reset(send: (types: number[]) => void) {
        this.entries.clear()
        this.pending.clear()
        this.queued.clear()
        this.send = send
    },

    get(type: number): MonsterCatalogEntry | null | undefined {
        if (this.send && !this.entries.has(type) && !this.pending.has(type)) {
            this.pending.add(type)
            this.queued.add(type)
            queueMicrotask(() => this.flush())
        }
        return this.entries.get(type)
    },

    flush() {
        while (this.send && this.queued.size) {
            const types = Array.from(this.queued).slice(0, 64)
            types.forEach(type => this.queued.delete(type))
            this.send(types)
        }
    },

    receive(data: {entries: MonsterCatalogEntry[], missing: number[]}) {
        for (const entry of data.entries) {
            this.entries.set(entry.type, entry)
            this.pending.delete(entry.type)
        }
        for (const type of data.missing) {
            this.entries.set(type, null)
            this.pending.delete(type)
        }
    },
}
