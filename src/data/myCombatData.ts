import { AttackableCombatTO } from '@/network/messageIfs'
import { reactive } from 'vue'

export const MyCombatData = reactive({
    str: 0,
    agi: 0,
    int: 0,
    wis: 0,

    patk: 0,
    aaCd: 0,

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

        console.log("Updated combat data:", data)
    }
})
