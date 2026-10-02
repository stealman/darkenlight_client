export const TERRAIN_TYPES = [
    {id: 1, label: 'Dirt', color: [128, 64, 32]},
    {id: 2, label: 'Grass', color: [0, 255, 0]},
    {id: 3, label: 'Mountain', color: [128, 128, 128]},
    {id: 4, label: 'Muddy Dirt', color: [110, 90, 60]},
    {id: 50, label: 'Water', color: [0, 0, 255]},
    {id: 0, label: 'Empty', color: [0, 0, 0]},
]

export const getTerrainColor = (type) => TERRAIN_TYPES.find((terrain) => terrain.id === type)?.color ?? [128, 64, 32]

export const getTerrainTypeByColor = (red, green, blue) => TERRAIN_TYPES.find((terrain) => terrain.color[0] === red && terrain.color[1] === green && terrain.color[2] === blue)?.id ?? 1

export const getTerrainMapPixelValue = (red, green, blue, environmentCategory) => {
    if (red === 0 && green === 255 && blue === 0) return 'Grass'
    if (red === 128 && green === 128 && blue === 128) return 'Mountain'
    if (red === 110 && green === 90 && blue === 60) return 'Muddy Dirt'
    if (red === 0 && green === 0 && blue === 255) return 'Water'
    if (red === 0 && green === 0 && blue === 0 && environmentCategory === 'dungeon') return 'Empty'
    return 'Dirt'
}

export const getConnectedAreaByTerrain = (pixelContext, width, height, start) => {
    const pixels = pixelContext.getImageData(0, 0, width, height).data
    const startIndex = (start.z * width + start.x) * 4
    const targetRed = pixels[startIndex]
    const targetGreen = pixels[startIndex + 1]
    const targetBlue = pixels[startIndex + 2]
    const visited = new Uint8Array(width * height)
    const queue = new Int32Array(width * height)
    const connected = new Set()
    let readIndex = 0
    let writeIndex = 1
    queue[0] = start.z * width + start.x
    visited[queue[0]] = 1
    while (readIndex < writeIndex) {
        const index = queue[readIndex++]
        connected.add(index)
        const x = index % width
        const z = Math.floor(index / width)
        const tryAdd = (neighborIndex) => {
            const pixelIndex = neighborIndex * 4
            if (!visited[neighborIndex]
                && pixels[pixelIndex] === targetRed
                && pixels[pixelIndex + 1] === targetGreen
                && pixels[pixelIndex + 2] === targetBlue) {
                visited[neighborIndex] = 1
                queue[writeIndex++] = neighborIndex
            }
        }
        if (x > 0) tryAdd(index - 1)
        if (x < width - 1) tryAdd(index + 1)
        if (z > 0) tryAdd(index - width)
        if (z < height - 1) tryAdd(index + width)
    }
    return connected
}
