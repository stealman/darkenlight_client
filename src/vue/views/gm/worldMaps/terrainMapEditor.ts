export const getTerrainMapPixelValue = (red, green, blue, environmentCategory) => {
    if (red === 0 && green === 255 && blue === 0) return 'Grass'
    if (red === 128 && green === 128 && blue === 128) return 'Mountain'
    if (red === 110 && green === 90 && blue === 60) return 'Muddy Dirt'
    if (red === 0 && green === 0 && blue === 255) return 'Water'
    if (red === 0 && green === 0 && blue === 0 && environmentCategory === 'dungeon') return 'Empty'
    return 'Dirt'
}
