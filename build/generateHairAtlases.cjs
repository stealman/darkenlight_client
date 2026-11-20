const {readFileSync, writeFileSync} = require('node:fs')
const {join} = require('node:path')
const {decode, encode} = require('fast-png')
const palette = require('../src/babylon/character/hairPalette.json')

const tileSize = 256
const padding = 8
const contentSize = tileSize - 2 * padding
const size = tileSize * 4
const directory = join(__dirname, '../public/models/human')

for (const gender of ['male', 'female']) {
    const name = `human_${gender}_hair_1`
    const source = decode(readFileSync(join(directory, name + '.png')))
    if (source.width !== tileSize || source.height !== tileSize || source.depth !== 8 || source.channels < 3) {
        throw new Error(`Expected an 8-bit RGB or RGBA ${tileSize}² texture: ${name}`)
    }
    const data = new Uint8Array(size * size * 3)
    palette.forEach(({color}, tile) => {
        const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16))
        const originX = tile % 4 * tileSize
        const originY = Math.floor(tile / 4) * tileSize
        const sample = index => Math.floor(Math.max(0, Math.min(contentSize - 1, index - padding)) * (tileSize - 1) / (contentSize - 1))
        for (let y = 0; y < tileSize; y++) {
            for (let x = 0; x < tileSize; x++) {
                const input = (sample(y) * tileSize + sample(x)) * source.channels
                const luminance = 0.2126 * source.data[input] + 0.7152 * source.data[input + 1] + 0.0722 * source.data[input + 2]
                const shade = 0.45 + luminance / 255 * 0.9
                const output = ((originY + y) * size + originX + x) * 3
                for (let channel = 0; channel < 3; channel++) data[output + channel] = Math.min(255, Math.round(rgb[channel] * shade))
            }
        }
    })
    writeFileSync(join(directory, name + '_atlas.png'), encode({width: size, height: size, channels: 3, data}))
}
