export const getSurfaceMapPixelValue = (red: number, green: number, blue: number) => {
    if (red === 255 && green === 255 && blue === 255) return 'Snow'
    if (red === 128 && green === 128 && blue === 128) return 'Stone path'
    if (red === 192 && green === 160 && blue === 112) return 'Beige stone path'
    return 'Empty'
}
