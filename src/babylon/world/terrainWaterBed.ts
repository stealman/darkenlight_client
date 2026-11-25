import { Vector3 } from '@babylonjs/core'
import type { TerrainPreviewTriangle } from '@/adminUtils/terrainPreviewBatch'

const SUBDIVISIONS = 6
const SLOPE_GRADE = 0.4
const MAX_ROUNDING = 0.56
type HeightAt = (x: number, z: number) => number | undefined

function roundedDistance(distance: number, width: number) {
    return distance < width ? distance * distance / (2 * width) : distance - width / 2
}

function waterBedBanks(x: number, z: number, floor: number, waterline: number, heightAt: HeightAt) {
    const banks: {dx: number, dz: number, height: number}[] = []
    const range = Math.ceil((waterline - floor) / SLOPE_GRADE + MAX_ROUNDING / 2)
    for (let dx = -range; dx <= range; dx++) {
        for (let dz = -range; dz <= range; dz++) {
            if (!dx && !dz) continue
            const neighbor = heightAt(x + dx, z + dz)
            if (neighbor === undefined) continue
            const height = Math.min(neighbor, waterline)
            const gap = Math.hypot(Math.max(0, Math.abs(dx) - 1), Math.max(0, Math.abs(dz) - 1))
            if (height - roundedDistance(gap, MAX_ROUNDING) * SLOPE_GRADE > floor) banks.push({dx, dz, height})
        }
    }
    return banks
}

function sampleHeight(x: number, z: number, px: number, pz: number, floor: number, banks: ReturnType<typeof waterBedBanks>) {
    // World-space variation gently bends the transition across the tile grid.
    const wx = x + px, wz = z + pz
    const width = 0.38 + 0.11 * Math.sin(wx * 3.7 + wz * 4.9) + 0.07 * Math.sin(wx * 8.1 - wz * 6.3)
    let y = floor
    for (const bank of banks) {
        const dx = Math.max(0, Math.abs(px - bank.dx) - 0.5)
        const dz = Math.max(0, Math.abs(pz - bank.dz) - 0.5)
        // The shared grade keeps the ramp continuous across tile seams.
        y = Math.max(y, bank.height - roundedDistance(Math.hypot(dx, dz), width) * SLOPE_GRADE)
    }
    return y
}

export function sampleWaterBedHeight(x: number, z: number, floor: number, waterline: number, heightAt: HeightAt) {
    const tx = Math.round(x), tz = Math.round(z)
    return sampleHeight(tx, tz, x - tx, z - tz, floor, waterBedBanks(tx, tz, floor, waterline, heightAt))
}

export function createWaterBedSlope(x: number, z: number, floor: number, waterline: number,
    heightAt: HeightAt, originX = 0, originZ = 0): TerrainPreviewTriangle[] | undefined {
    const banks = waterBedBanks(x, z, floor, waterline, heightAt)
    if (!banks.length) return

    const points: Vector3[][] = []
    for (let u = 0; u <= SUBDIVISIONS; u++) {
        const row: Vector3[] = []
        const px = u / SUBDIVISIONS - 0.5
        for (let v = 0; v <= SUBDIVISIONS; v++) {
            const pz = v / SUBDIVISIONS - 0.5
            row.push(new Vector3(x + px, sampleHeight(x + originX, z + originZ, px, pz, floor, banks), z + pz))
        }
        points.push(row)
    }

    const triangles: TerrainPreviewTriangle[] = []
    const addTriangle = (a: Vector3, b: Vector3, c: Vector3) => {
        triangles.push({points: [a, b, c], normal: Vector3.Cross(c.subtract(a), b.subtract(a)).normalize()})
    }
    for (let u = 0; u < SUBDIVISIONS; u++) {
        for (let v = 0; v < SUBDIVISIONS; v++) {
            const a = points[u][v], b = points[u + 1][v], c = points[u + 1][v + 1], d = points[u][v + 1]
            addTriangle(a, b, c)
            addTriangle(c, d, a)
        }
    }
    return triangles
}
