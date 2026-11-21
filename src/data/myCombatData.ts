import { AttackableCombatTO } from '@/network/messageIfs'
import { reactive } from 'vue'

export const MyCombatData = reactive({
    str: 0,
    agi: 0,
    int: 0,
    wis: 0,

    patk: 0,
    aaCd: 0,
    armor: 0,
    precision: 0,
    defense: 0,
    arcaneInterference: 0,

    consumeData(data: AttackableCombatTO) {
        if (data.str != null) {
            this.str = data.str
        }
        if (data.agi != null) {
            this.agi = data.agi
        }
        if (data.int != null) {
            this.int = data.int
        }
        if (data.wis != null) {
            this.wis = data.wis
        }
        if (data.patk != null) {
            this.patk = data.patk
        }
        if (data.aaCd != null) {
            this.aaCd = data.aaCd
        }
        if (data.armor != null) {
            this.armor = data.armor
        }
        if (data.precision != null) {
            this.precision = data.precision
        }
        if (data.defense != null) {
            this.defense = data.defense
        }
        if (data.arcaneInterference != null) {
            this.arcaneInterference = data.arcaneInterference
        }

        console.log("Updated combat data:", data)
    }
})
