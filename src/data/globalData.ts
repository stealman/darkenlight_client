import { PlayerData } from '@/data/playerData'

export const Data = {
    worldId: 0 as number,
    worldName: "" as string,
    myChar: null as PlayerData,

    setMyChar(char: PlayerData) {
        this.myChar = char
    }
}
