export class StaticObjectInfo {
    type: number
    name: string
    blocking: boolean = false
    size: number = 1
    sizeX: number = 1
    sizeZ: number = 1
    collisionTolerance: number = 0
    soundDistance: number = 0
    soundKey: string | null = null
    walkable: boolean = false

    constructor(type: number, name: string, blocking: boolean, size: number, collisionTolerance: number, soundDistance: number, soundKey: string | null, sizeZ: number = size, walkable: boolean = false) {
        this.type = type
        this.name = name
        this.blocking = blocking
        this.size = size
        this.sizeX = size
        this.sizeZ = sizeZ
        this.collisionTolerance = collisionTolerance
        this.soundDistance = soundDistance
        this.soundKey = soundKey
        this.walkable = walkable
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
    [203, new StaticObjectInfo(203, 'PalisadeWall2', true, 1, 0.375, 0, null)],
    [204, new StaticObjectInfo(204, 'PalisadeSmall', true, 1, 0.41, 0, null)],
    [205, new StaticObjectInfo(205, 'PalisadeSpiked', true, 1, 0, 0, null)],
    [206, new StaticObjectInfo(206, 'WalkableBlock', false, 1, 0, 0, null, 1, true)],
    [207, new StaticObjectInfo(207, 'CampFence', true, 1, 0.39, 0, null)],
    [208, new StaticObjectInfo(208, 'CemeteryIronFence', true, 1, 0.44, 0, null)],
    [209, new StaticObjectInfo(209, 'RuinedCemeteryWall', true, 1, 0.3, 0, null)],
    [210, new StaticObjectInfo(210, 'CemeteryStoneWall', true, 1, 0.3, 0, null)],

    [221, new StaticObjectInfo(221, 'Wall3_GRAY', true, 1, 0, 0, null)],
    [222, new StaticObjectInfo(222, 'Wall3_RED', true, 1, 0, 0, null)],

    [241, new StaticObjectInfo(241, 'FireplaceSmall', false, 1, 0, 4, 'CAMPFIRE')],
    [242, new StaticObjectInfo(242, 'FireplaceLarge', true, 2, 0.45, 6, 'CAMPFIRE')],

    [261, new StaticObjectInfo(261, 'WallTorch', false, 1, 0, 2, 'CAMPFIRE')],
    [262, new StaticObjectInfo(262, 'TorchStand', true, 1, 0.3, 2, 'CAMPFIRE')],
    [263, new StaticObjectInfo(263, 'LanternStand', true, 1, 0.3, 2, 'CAMPFIRE')],
    [281, new StaticObjectInfo(281, 'StoneEntrance', true, 4, 0, 0, null, 2)],

    [301, new StaticObjectInfo(301, 'CampBench', false, 2, 0, 0, null, 1)],
    [302, new StaticObjectInfo(302, 'PlankPile', false, 1, 0, 0, null)],
    [303, new StaticObjectInfo(303, 'LogPile', true, 1, 0.12, 0, null)],
    [304, new StaticObjectInfo(304, 'SupplyCrate', true, 1, 0.12, 0, null)],
    [305, new StaticObjectInfo(305, 'CampBarrel', true, 1, 0.12, 0, null)],
    [306, new StaticObjectInfo(306, 'HayStack', true, 1, 0.2, 0, null)],
    [307, new StaticObjectInfo(307, 'StumpWithAxe', true, 1, 0.2, 0, null)],
    [308, new StaticObjectInfo(308, 'WaterTrough1x1', false, 1, 0, 0, null, 1, true)],
    [309, new StaticObjectInfo(309, 'WaterTrough2x1', false, 2, 0, 0, null, 1, true)],
    [310, new StaticObjectInfo(310, 'StoneWell', true, 1, 0.1, 0, null)],

    [321, new StaticObjectInfo(321, 'CemeteryHeadstone', true, 1, 0.33, 0, null)],
    [322, new StaticObjectInfo(322, 'CemeteryCross', true, 1, 0.34, 0, null)],
    [323, new StaticObjectInfo(323, 'StoneTomb', true, 1, 0.18, 0, null, 2)],
    [324, new StaticObjectInfo(324, 'CemeteryObelisk', true, 1, 0.28, 0, null)],
    [325, new StaticObjectInfo(325, 'StoneGargoyle', true, 1, 0.28, 0, null)],
    [328, new StaticObjectInfo(328, 'GargoyleOnPedestal', true, 1, 0.14, 0, null)],
    [329, new StaticObjectInfo(329, 'StoneFrameGrave', false, 1, 0, 0, null, 2, true)],
    [330, new StaticObjectInfo(330, 'DisplacedStoneFrameGrave', false, 1, 0, 0, null, 2, true)],
    [331, new StaticObjectInfo(331, 'CemeteryHeadstone2', true, 1, 0.33, 0, null)],
    [332, new StaticObjectInfo(332, 'CemeteryHeadstone3', true, 1, 0.33, 0, null)],
    [333, new StaticObjectInfo(333, 'CemeteryPedestal', true, 1, 0.14, 0, null)],
    [334, new StaticObjectInfo(334, 'CemeteryCrossPedestal', false, 1, 0, 0, null)],
    [335, new StaticObjectInfo(335, 'FallenCemeteryCross', false, 1, 0, 0, null)],
    [336, new StaticObjectInfo(336, 'FallenCemeteryHeadstone', false, 1, 0, 0, null)],
    [337, new StaticObjectInfo(337, 'CemeteryEmberBowl', true, 1, 0.3, 2, 'CAMPFIRE')],
])
