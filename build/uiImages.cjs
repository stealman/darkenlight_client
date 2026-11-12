const fs = require('node:fs')
const path = require('node:path')
const {createHash} = require('node:crypto')
const {createCanvas, loadImage} = require('@napi-rs/canvas')
const settings = require('../src/gui/uiImageSettings.json')

async function collectUiImages(publicDirectory, entries, originalEntries = []) {
    if (!Number.isFinite(settings.pixelSize) || settings.pixelSize <= 1) throw new Error('UI pixel size must be greater than one')
    if (!Number.isFinite(settings.saturation) || settings.saturation < 0) throw new Error('UI saturation must be zero or greater')
    const urls = {}
    const files = new Map()
    function emit(buffer) {
        const hash = createHash('sha256').update(buffer).digest('hex')
        const fileName = `assets/ui-images/${hash}.png`
        files.set(fileName, {fileName, source: buffer})
        return `/${fileName}`
    }
    // Keep memory bounded: source icons can be much larger than their UI size.
    for (const {imagePath} of entries) {
        const image = await loadImage(fs.readFileSync(path.join(publicDirectory, imagePath.slice(1))))
        const canvas = createCanvas(image.width, image.height)
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        const saturation = imagePath.startsWith('/images/items/armor/') ? 1 : settings.saturation
        if (saturation !== 1) {
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
            const data = imageData.data
            for (let index = 0; index < data.length; index += 4) {
                const red = data[index], green = data[index + 1], blue = data[index + 2]
                const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
                data[index] = luminance + (red - luminance) * saturation
                data[index + 1] = luminance + (green - luminance) * saturation
                data[index + 2] = luminance + (blue - luminance) * saturation
            }
            context.putImageData(imageData, 0, 0)
        }
        const smoothUrl = emit(await canvas.encode('png'))
        const pixelSize = settings.pixelSize
        if (Number.isInteger(pixelSize)) {
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
            const data = imageData.data
            for (let y = 0; y < canvas.height; y += pixelSize) {
                for (let x = 0; x < canvas.width; x += pixelSize) {
                    const width = Math.min(pixelSize, canvas.width - x)
                    const height = Math.min(pixelSize, canvas.height - y)
                    let alpha = 0, red = 0, green = 0, blue = 0
                    for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
                        const index = ((y + dy) * canvas.width + x + dx) * 4
                        const a = data[index + 3]
                        alpha += a
                        red += data[index] * a
                        green += data[index + 1] * a
                        blue += data[index + 2] * a
                    }
                    const rgba = [alpha ? Math.round(red / alpha) : 0, alpha ? Math.round(green / alpha) : 0,
                        alpha ? Math.round(blue / alpha) : 0, Math.round(alpha / (width * height))]
                    for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
                        data.set(rgba, ((y + dy) * canvas.width + x + dx) * 4)
                    }
                }
            }
            context.putImageData(imageData, 0, 0)
        } else {
            const scaled = createCanvas(Math.max(1, Math.round(canvas.width / pixelSize)), Math.max(1, Math.round(canvas.height / pixelSize)))
            const scaledContext = scaled.getContext('2d')
            scaledContext.imageSmoothingEnabled = true
            scaledContext.imageSmoothingQuality = 'high'
            scaledContext.drawImage(canvas, 0, 0, scaled.width, scaled.height)
            context.clearRect(0, 0, canvas.width, canvas.height)
            context.imageSmoothingEnabled = false
            context.drawImage(scaled, 0, 0, scaled.width, scaled.height, 0, 0, canvas.width, canvas.height)
        }
        urls[imagePath] = {smoothUrl, pixelatedUrl: emit(await canvas.encode('png'))}
    }
    for (const {imagePath} of originalEntries) {
        const url = emit(fs.readFileSync(path.join(publicDirectory, imagePath.slice(1))))
        urls[imagePath] = {smoothUrl: url, pixelatedUrl: url}
    }
    return {urls, files: [...files.values()]}
}

module.exports = {collectUiImages}
