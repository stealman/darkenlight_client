type SnowCoverSource = {
    position: {x: number, z: number}
}

type SnowCoverStaticSource = SnowCoverSource & {
    type: number
    getSizeX(): number
    getSizeZ(): number
}

export const isShrubType = (type: number) => type >= 101 && type <= 104
    || type >= 121 && type <= 124
    || type >= 141 && type <= 144

const addStoneEntranceMask = (mask: Set<number>, entrance: SnowCoverStaticSource, mapSize: number) => {
    const sourceX = Math.floor(entrance.position.x)
    const sourceZ = Math.floor(entrance.position.z)
    const sizeX = entrance.getSizeX()
    const sizeZ = entrance.getSizeZ()
    const runsAlongX = sizeX > sizeZ
    const width = runsAlongX ? sizeX : sizeZ
    const depth = runsAlongX ? sizeZ : sizeX

    for (let depthOffset = 0; depthOffset < depth; depthOffset++) {
        for (const widthOffset of [0, width - 1]) {
            const x = sourceX + (runsAlongX ? widthOffset : depthOffset)
            const z = sourceZ + (runsAlongX ? depthOffset : widthOffset)
            if (x >= 0 && z >= 0 && x < mapSize && z < mapSize) {
                mask.add(x * mapSize + z)
            }
        }
    }
}

export function sameSnowMask(previous: ReadonlySet<number>, next: ReadonlySet<number>) {
    if (previous === next) return true
    if (previous.size !== next.size) return false
    for (const tile of next) if (!previous.has(tile)) return false
    return true
}

export const createSnowCoverMask = (statics: SnowCoverStaticSource[], mapSize: number) => {
    const mask = new Set<number>()
    for (const object of statics) {
        if (isShrubType(object.type)) {
            const startX = Math.floor(object.position.x)
            const startZ = Math.floor(object.position.z)
            const endX = Math.min(mapSize, startX + object.getSizeX())
            const endZ = Math.min(mapSize, startZ + object.getSizeZ())
            for (let x = Math.max(0, startX); x < endX; x++) {
                for (let z = Math.max(0, startZ); z < endZ; z++) {
                    const tile = x * mapSize + z
                    mask.add(tile)
                }
            }
        } else if (object.type === 281) {
            addStoneEntranceMask(mask, object, mapSize)
        }
    }
    return mask
}
