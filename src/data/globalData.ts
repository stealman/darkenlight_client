import { PlayerData } from '@/data/playerData'
import { ref } from 'vue'

export const Data = {
    worldId: 0 as number,
    worldName: "" as string,
    myChar: null as PlayerData,
    myCharRef: ref(null),

    aaActive: true as boolean,

    setMyChar(char: PlayerData) {
        this.myChar = char
        this.myCharRef.value = char
    }
}
