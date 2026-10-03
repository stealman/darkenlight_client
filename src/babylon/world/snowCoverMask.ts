type SnowCoverSource = {
    position: {x: number, z: number}
}

const deterministicRoll = (sourceX: number, sourceZ: number, x: number, z: number, salt: number) => {
    let value = Math.imul(sourceX + salt, 374761393) + Math.imul(sourceZ - salt, 668265263)
    value ^= Math.imul(x, 1274126177) + Math.imul(z, 1442695041)
    value = Math.imul(value ^ value >>> 13, 1274126177)
    return ((value ^ value >>> 16) >>> 0) / 4294967295
}

export const isShrubType = (type: number) => type >= 101 && type <= 104
    || type >= 121 && type <= 124
    || type >= 141 && type <= 144

const addSourceMask = (mask: Set<number>, source: SnowCoverSource, mapSize: number, salt: number, getHeight: (x: number, z: number) => number) => {
    const sourceX = Math.floor(source.position.x)
    const sourceZ = Math.floor(source.position.z)
    if (sourceX < 0 || sourceZ < 0 || sourceX >= mapSize || sourceZ >= mapSize) {
        return
    }
    const sourceHeight = getHeight(sourceX, sourceZ)
    mask.add(sourceX * mapSize + sourceZ)

    const neighbors = []
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
        for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
            if (offsetX === 0 && offsetZ === 0) {
                continue
            }
            const x = sourceX + offsetX
            const z = sourceZ + offsetZ
            if (x >= 0 && z >= 0 && x < mapSize && z < mapSize) {
                neighbors.push({x, z, offsetX, offsetZ, roll: deterministicRoll(sourceX, sourceZ, x, z, salt)})
            }
        }
    }
    neighbors.sort((a, b) => a.roll - b.roll)
    const neighborCount = 1 + Math.floor(deterministicRoll(sourceX, sourceZ, sourceX, sourceZ, salt + 73) * 3)
    let addedNeighbors = 0
    const pendingNeighbors = neighbors.filter((neighbor) => getHeight(neighbor.x, neighbor.z) === sourceHeight)
    while (addedNeighbors < neighborCount && pendingNeighbors.length > 0) {
        let addedInPass = false
        for (let index = 0; index < pendingNeighbors.length && addedNeighbors < neighborCount;) {
            const neighbor = pendingNeighbors[index]
            const isDiagonal = neighbor.offsetX !== 0 && neighbor.offsetZ !== 0
            const hasCrossConnection = !isDiagonal
                || mask.has((sourceX + neighbor.offsetX) * mapSize + sourceZ)
                || mask.has(sourceX * mapSize + sourceZ + neighbor.offsetZ)
            if (!hasCrossConnection) {
                index++
                continue
            }
            mask.add(neighbor.x * mapSize + neighbor.z)
            pendingNeighbors.splice(index, 1)
            addedNeighbors++
            addedInPass = true
        }
        if (!addedInPass) {
            break
        }
    }
}

export const createSnowCoverMask = (
    trees: SnowCoverSource[],
    statics: Array<SnowCoverSource & {type: number}>,
    mapSize: number,
    worldId: number,
    getHeight: (x: number, z: number) => number,
) => {
    const mask = new Set<number>()
    for (const tree of trees) {
        addSourceMask(mask, tree, mapSize, worldId * 101 + 11, getHeight)
    }
    for (const object of statics) {
        if (isShrubType(object.type)) {
            addSourceMask(mask, object, mapSize, worldId * 101 + object.type, getHeight)
        }
    }
    return mask
}
