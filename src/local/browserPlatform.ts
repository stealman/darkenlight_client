import {decode, encode, convertIndexedToRgb} from 'fast-png'
import bcrypt from 'bcryptjs'
import type {RgbaImage, RuntimePlatform} from '@game/runtime/platform'

export function decodeMapPng(bytes: Uint8Array): RgbaImage {
    const png = decode(bytes)
    let source = png.data
    let channels = png.channels
    if (png.palette) {
        source = convertIndexedToRgb(png)
        channels = png.palette[0].length
    }
    const data = new Uint8Array(png.width * png.height * 4)
    const scale = png.depth === 16 ? 257 : 1
    for (let pixel = 0; pixel < png.width * png.height; pixel++) {
        const offset = pixel * channels
        data[pixel * 4] = Math.round(source[offset] / scale)
        data[pixel * 4 + 1] = Math.round(source[offset + (channels >= 3 ? 1 : 0)] / scale)
        data[pixel * 4 + 2] = Math.round(source[offset + (channels >= 3 ? 2 : 0)] / scale)
        data[pixel * 4 + 3] = channels === 2 || channels === 4 ? Math.round(source[offset + channels - 1] / scale) : 255
    }
    return {width: png.width, height: png.height, data}
}

export function browserPlatform(io: Pick<RuntimePlatform, 'readFile' | 'writeFile'>): RuntimePlatform {
    return {
        ...io,
        decodePng: async bytes => decodeMapPng(bytes),
        encodePng: async image => encode({...image, channels: 4, depth: 8}),
        hashPassword: secret => bcrypt.hash(secret, 10),
        checkPassword: (secret, hash) => bcrypt.compare(secret, hash),
    }
}
