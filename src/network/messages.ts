import { Data } from '@/data/globalData'
import { Utils } from '@/utils/utils'

export interface Message {
    t: number
    d: any
}

export class LoginMsg {
    t: number = 1
    login: string
    password: string

    constructor(login: string, password: string) {
        this.login = login
        this.password = password
    }
}

export class MyCharMoveMsg implements Message {
    t: number = 5
    d: any

    constructor() {
        let angle = Data.myChar.getMoveAngle()
        if (angle != null) {
            angle = Utils.roundToTwoDecimals(angle += Math.PI / 4)
        }

        this.d = [Utils.roundToTwoDecimals(Data.myChar.pos.x), Utils.roundToTwoDecimals(Data.myChar.pos.z), angle, Data.myChar.getActualSpeed()]
    }
}

export class FetchWorldDataMsg implements Message {
    t: number = 2
    d: any

    constructor(worldId: number, x: number, z: number) {
        this.d = { worldId: worldId , x: x, z: z}
    }
}

export class GMSaveMapDataMsg implements Message {
    t: number = 1000
    d: any

    constructor() {

    }
}

export class GMTerrainChange implements Message {
    t: number = 1001
    d: any

    constructor(data: [{ x: number, z: number, height: number }]) {
        this.d = { changeType: "terrain", data: data }
    }
}
