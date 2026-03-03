import { Utils } from '@/utils/utils'
import { MyPlayer } from '@/data/myPlayer'

export interface Message {
    t: number
    d: any
}

export class LoginMsg {
    t: number = 1
    login: string
    password: string
    guestName: string | null

    constructor(login: string, password: string, guestName: string | null) {
        this.login = login
        this.password = password
        this.guestName = guestName
    }
}

export class FetchWorldDataMsg implements Message {
    t: number = 2
    d: any

    constructor(worldId: number, x: number, z: number) {
        this.d = { worldId: worldId , x: x, z: z}
    }
}

export class MyCharMoveMsg implements Message {
    t: number = 5
    d: any

    constructor() {
        let angle = MyPlayer.myChar.getMoveAngle()
        if (angle != null) {
            angle = Utils.roundToTwoDecimals(angle)
        }

        this.d = [Utils.roundToTwoDecimals(MyPlayer.myChar.pos.x), Utils.roundToTwoDecimals(MyPlayer.myChar.pos.z), angle, MyPlayer.myChar.getActualSpeed()]
    }
}

export class SelectAutoAttackTarget implements Message {
    t: number = 6
    d: any
    constructor(id: number, targetType: string) {
        this.d = { id: id, tp: targetType }
    }
}

export class AutoAttackBreak implements Message {
    t: number = 7
    d: any
    constructor() {}
}

export class LogoutMsg implements Message {
    t: number = 8
    d: any
    constructor() {}
}

export class StopAction implements Message {
    t: number = 9
    d: any
    constructor() {}
}

export class HealingSelfAction implements Message {
    t: number = 10
    d: any
    constructor() {
    }
}

export class HealingTargetAction implements Message {
    t: number = 11
    d: any
    constructor(tgtId: number, tgtType: string) {
        this.d = { id: tgtId, tp: tgtType }
    }
}

export class UnequipItemMsg implements Message {
    t: number = 12
    d: any
    constructor(id: number) {
        this.d = { id: id }
    }
}

export class EquipItemMsg implements Message {
    t: number = 13
    d: any

    constructor(slot: string, id: number) {
        this.d = { slot: slot, id: id }
    }
}

export class DropItemMsg implements Message {
    t: number = 14
    d: any

    constructor(id: number) {
        this.d = { id: id }
    }
}

export class PickItemMsg implements Message {
    t: number = 15
    d: any

    constructor(id: number) {
        this.d = { id: id }
    }
}

export class GMSaveMapDataMsg implements Message {
    t: number = 1000
    d: any
    constructor() {}
}

export class GMTerrainChange implements Message {
    t: number = 1001
    d: any

    constructor(data: [{ x: number, z: number, height: number }]) {
        this.d = { changeType: "terrain", data: data }
    }
}

export class GMStaticObjectChange implements Message {
    t: number = 1002
    d: any

    constructor(changeType: string, data) {
        this.d = { changeType: changeType, data: data }
    }
}

export class GMLoadSpawns implements Message {
    t: number = 1003
    d: any

    constructor() {
        this.d = { }
    }
}

export class GMSpawnAction implements Message {
    t: number = 1004
    d: any

    constructor(action: string, data: any) {
        this.d = { action: action, data: data }
    }
}

export class GMForceSaveDataMsg implements Message {
    t: number = 1005
    d: any

    constructor() {}
}

