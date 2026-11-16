const fs = require('node:fs')
const path = require('node:path')
const {createHash} = require('node:crypto')
const {createCanvas, loadImage} = require('@napi-rs/canvas')
const settings = require('../src/gui/uiImageSettings.json')

async function collectUiImages(publicDirectory, entries, originalEntries = []) {
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
        urls[imagePath] = emit(await canvas.encode('png'))
    }
    for (const {imagePath} of originalEntries) {
        const url = emit(fs.readFileSync(path.join(publicDirectory, imagePath.slice(1))))
        urls[imagePath] = url
    }
    return {urls, files: [...files.values()]}
}

module.exports = {collectUiImages}
