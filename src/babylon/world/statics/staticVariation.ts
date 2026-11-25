import type { Matrix } from '@babylonjs/core'

type StaticTile = {x: number, z: number}
type StaticPartOrigin = StaticTile & {y: number}

const orientationSalts = {X: 0, Z: 104729, '-X': 209759, '+X': 314693, '-Z': 419669, '+Z': 524591} as const
type StaticVariationOrientation = keyof typeof orientationSalts

function tileSeed(worldId: number, tile: StaticTile) {
    return Math.imul(worldId, 73856093) ^ Math.imul(tile.x, 19349663) ^ Math.imul(tile.z, 83492791)
}

function mixSeed(seed: number) {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822519)
    seed = Math.imul(seed ^ (seed >>> 13), 3266489917)
    return (seed ^ (seed >>> 16)) >>> 0
}

function indexedVariation(sample: (part: number, channel: number) => number) {
    return {
        unit: (part: number, channel = 0) => sample(part, channel),
        signed: (part: number, channel = 0) => sample(part, channel) * 2 - 1,
    }
}

// Sample stable part and channel indices in the constructor. Adding a channel leaves the other picks intact.
export function createStaticVariation(worldId: number, tile: StaticTile, type: number) {
    const seed = tileSeed(worldId, tile) ^ Math.imul(type, 2654435761)
    return indexedVariation((part, channel) =>
        mixSeed(seed ^ Math.imul(part + 1, 1597334677) ^ Math.imul(channel + 1, 3812015801)) / 0x100000000)
}

// Preserve existing fence and palisade layouts, whose original seed used orientation in place of type.
export function createOrientedStaticVariation(worldId: number, tile: StaticTile, orientation: StaticVariationOrientation) {
    const seed = tileSeed(worldId, tile)
    const orientationSalt = orientationSalts[orientation]
    return indexedVariation((part, channel) =>
        mixSeed(seed ^ Math.imul(part * 10 + channel + orientationSalt, 2654435761)) / 0xffffffff)
}

// Existing cemetery and fireplace shapes use a sine-based distribution.
export function createSineStaticVariation(seed: number, partStep: number, channelStep = 0, scale = 43758.5453) {
    return indexedVariation((part, channel) => {
        const value = Math.sin(seed + part * partStep + channel * channelStep) * scale
        return value - Math.floor(value)
    })
}

// Sequential picks are useful for an existing layout whose number of pieces is itself a random pick.
export function createStaticVariationSequence(worldId: number, tile: StaticTile, type: number) {
    let seed = tileSeed(worldId, tile) ^ Math.imul(type, 2654435761)
    return () => {
        seed = (seed + 0x6D2B79F5) | 0
        let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
        return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
    }
}

// Keep the cached part in object space. Render batches can mutate their copy for effects like deletion bounce.
export function placeStaticPart(part: Matrix, origin: StaticPartOrigin) {
    const m = part.m
    return part.clone().setTranslationFromFloats(m[12] + origin.x, m[13] + origin.y, m[14] + origin.z)
}
