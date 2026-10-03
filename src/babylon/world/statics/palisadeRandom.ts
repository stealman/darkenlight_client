import { MyPlayer } from '@/data/myPlayer'

export function getPalisadeRandom(
    x: number,
    z: number,
    orientation: 'X' | 'Z' | '-X' | '+X' | '-Z' | '+Z',
    elementIndex: number,
    salt: number,
): number {
    const orientationSalt = {
        X: 0,
        Z: 104729,
        '-X': 209759,
        '+X': 314693,
        '-Z': 419669,
        '+Z': 524591,
    }[orientation]
    let hash = (MyPlayer.worldId * 73856093)
        ^ (x * 19349663)
        ^ (z * 83492791)
        ^ ((elementIndex * 10 + salt + orientationSalt) * 2654435761)
    hash = Math.imul(hash ^ (hash >>> 16), 2246822519)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489917)
    hash ^= hash >>> 16
    return (hash >>> 0) / 4294967295
}
