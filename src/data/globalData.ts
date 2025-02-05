import { PlayerData } from '@/data/playerData'

export const Data = {
    worldId: "",
    worldName: "",
    myChar: null as PlayerData,

    setMyChar(char: PlayerData) {
        this.myChar = char
    }
}
