import {reactive} from 'vue'
import type {ChatEntry, ChatPacketData, CharacterSpeechData} from '@/network/messageIfs'

export type ChatChannel = ChatEntry['channel']
export const ChatManager = {
    characterId: 0,
    characterName: '',
    visible: false,
    hudVisible: false,
    state: reactive({messages: [] as ChatEntry[], recent: [] as string[], error: '', errorName: '', errorVersion: 0,
        active: 'public' as ChatChannel, unread: {public: 0, private: 0, party: 0}}),
    initialize(id: number, name: string) {
        this.characterId = id
        this.characterName = name
        this.state.messages = []
        this.state.recent = []
        this.state.error = ''
        this.state.unread = {public: 0, private: 0, party: 0}
        try {
            const saved = JSON.parse(localStorage.getItem(`chat:${id}`) || '{}')
            this.state.messages = (Array.isArray(saved.messages) ? saved.messages : []).filter((entry: ChatEntry) =>
                entry && ['public', 'private', 'party'].includes(entry.channel) && typeof entry.text === 'string'
                && typeof entry.from === 'string' && typeof entry.id === 'string' && Number.isFinite(entry.time)).slice(-600)
            this.rebuildRecent()
        } catch { /* Storage can be unavailable. */ }
    },
    save() {
        try { localStorage.setItem(`chat:${this.characterId}`, JSON.stringify({messages: this.state.messages})) } catch { /* Keep chat usable without storage. */ }
    },
    rebuildRecent() {
        const people: string[] = []
        for (const message of [...this.state.messages].reverse()) {
            if (message.channel !== 'private') continue
            const name = message.from === this.characterName ? message.to : message.from
            if (name && !people.includes(name)) people.push(name)
            if (people.length === 5) break
        }
        this.state.recent = people
    },
    add(entry: ChatEntry) {
        if (this.state.messages.some(message => message.id === entry.id)) return
        this.state.messages.push(entry)
        this.state.messages = this.state.messages.filter(message => message.channel !== entry.channel)
            .concat(this.state.messages.filter(message => message.channel === entry.channel).slice(-200))
            .sort((a, b) => a.time - b.time)
        if ((!this.visible && !this.hudVisible) || this.state.active !== entry.channel) this.state.unread[entry.channel]++
        this.rebuildRecent()
        this.save()
    },
    speech(data: CharacterSpeechData) {
        this.add({id: `speech:${data.id}:${data.time}:${data.text}`, channel: 'public', from: data.name,
            text: data.text, time: data.time})
    },
    receive(data: ChatPacketData) {
        if (data.error) {
            this.state.error = data.error
            this.state.errorName = data.name || ''
            this.state.errorVersion++
        }
        if (data.history) {
            // Merge by ID so messages received while the history request was running survive.
            for (const message of data.history) {
                if (!this.state.messages.some(existing => existing.id === message.id)) this.state.messages.push(message)
            }
            this.state.messages.sort((a, b) => a.time - b.time)
            this.state.messages = this.state.messages.filter(m => m.channel !== 'private')
                .concat(this.state.messages.filter(m => m.channel === 'private').slice(-100)).sort((a, b) => a.time - b.time)
            this.rebuildRecent()
            this.save()
        }
        if (data.entry) this.add(data.entry)
    },
}
