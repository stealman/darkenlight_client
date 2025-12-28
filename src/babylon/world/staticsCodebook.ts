export class StaticObjectInfo {
    type: number
    name: string
    blocking: boolean = false
    size: number = 1
    collisionTolerance: number = 0

    constructor(type: number, name: string, blocking: boolean, size: number, collisionTolerance: number) {
        this.type = type
        this.name = name
        this.blocking = blocking
        this.size = size
        this.collisionTolerance = collisionTolerance
    }
}

export const StaticObjectsCodebook: Map<number, StaticObjectInfo> = new Map([
    [101, new StaticObjectInfo(101, 'Shrub2x2_1', true, 2, 0.2)],
    [102, new StaticObjectInfo(102, 'Shrub2x2_2', true, 2, 0.2)],
    [103, new StaticObjectInfo(103, 'Shrub2x2_3', true, 2, 0.2)],
    [104, new StaticObjectInfo(104, 'Shrub2x2_4', true, 2, 0.2)],
])
