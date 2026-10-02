export const getSnowMapPixelValue = (red, green, blue) => red === green && green === blue && red >= 128 ? 'Snow' : 'Empty'

export const getConnectedAreaBySnow = (pixelContext, width, height, start) => {
    const [red, green, blue] = pixelContext.getImageData(start.x, start.z, 1, 1).data
    const isSnow = red === green && green === blue && red >= 128
    const selected = new Set()
    const pending = [start]

    while (pending.length) {
        const pixel = pending.pop()
        const index = pixel.z * width + pixel.x
        if (selected.has(index)) {
            continue
        }
        const [currentRed, currentGreen, currentBlue] = pixelContext.getImageData(pixel.x, pixel.z, 1, 1).data
        if ((currentRed === currentGreen && currentGreen === currentBlue && currentRed >= 128) !== isSnow) {
            continue
        }
        selected.add(index)
        if (pixel.x > 0) pending.push({x: pixel.x - 1, z: pixel.z})
        if (pixel.x < width - 1) pending.push({x: pixel.x + 1, z: pixel.z})
        if (pixel.z > 0) pending.push({x: pixel.x, z: pixel.z - 1})
        if (pixel.z < height - 1) pending.push({x: pixel.x, z: pixel.z + 1})
    }

    return selected
}
