export class StaticObjectInfo {
    type: number
    name: string
    blocking: boolean = false
    size: number = 1
    collisionTolerance: number = 0
    soundDistance: number = 0
    soundKey: string | null = null

    constructor(type: number, name: string, blocking: boolean, size: number, collisionTolerance: number, soundDistance: number, soundKey: string | null) {
        this.type = type
        this.name = name
        this.blocking = blocking
        this.size = size
        this.collisionTolerance = collisionTolerance
        this.soundDistance = soundDistance
        this.soundKey = soundKey
    }
}

export const StaticObjectsCodebook: Map<number, StaticObjectInfo> = new Map([
    [101, new StaticObjectInfo(101, 'Shrub2x2_1', true, 2, 0.4, 0, null)],
    [102, new StaticObjectInfo(102, 'Shrub2x2_2', true, 2, 0.4, 0, null)],
    [103, new StaticObjectInfo(103, 'Shrub2x2_3', true, 2, 0.4, 0, null)],
    [104, new StaticObjectInfo(104, 'Shrub2x2_4', true, 2, 0.4, 0, null)],

    [121, new StaticObjectInfo(121, 'Shrub1x1_tall_1', true, 1, 0.2, 0, null)],
    [122, new StaticObjectInfo(122, 'Shrub1x1_tall_2', true, 1, 0.2, 0, null)],
    [123, new StaticObjectInfo(123, 'Shrub1x1_tall_3', true, 1, 0.2, 0, null)],
    [124, new StaticObjectInfo(124, 'Shrub1x1_tall_4', true, 1, 0.2, 0, null)],

    [141, new StaticObjectInfo(141, 'Shrub1x1_small_1', false, 1, 0, 0, null)],
    [142, new StaticObjectInfo(142, 'Shrub1x1_small_2', false, 1, 0, 0, null)],
    [143, new StaticObjectInfo(143, 'Shrub1x1_small_3', false, 1, 0, 0, null)],
    [144, new StaticObjectInfo(144, 'Shrub1x1_small_4', false, 1, 0, 0, null)],

    [201, new StaticObjectInfo(201, 'Wall2_GRAY', true, 1, 0, 0, null)],
    [202, new StaticObjectInfo(202, 'Wall2_RED', true, 1, 0, 0, null)],

    [221, new StaticObjectInfo(221, 'Wall3_GRAY', true, 1, 0, 0, null)],
    [222, new StaticObjectInfo(222, 'Wall3_RED', true, 1, 0, 0, null)],

    [241, new StaticObjectInfo(241, 'FireplaceSmall', false, 1, 0, 4, 'CAMPFIRE')],
    [242, new StaticObjectInfo(242, 'FireplaceLarge', true, 2, 0.3, 6, 'CAMPFIRE')],

    [261, new StaticObjectInfo(261, 'WallTorch', false, 1, 0, 0, null)],
])
