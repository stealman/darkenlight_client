import type { MapBlock } from '@/data/worldDataManager'
import { Matrix } from '@babylonjs/core'
import { TerrainEnum1 } from '@/babylon/materials'
import { FoliageManager, GRASS_ROOT_INSET } from './foliageManager'
import type { GrassTuft } from './grassRenderer'
import { isShrubType } from './snowCoverMask'
import { StaticsManager } from './statics/staticsManager'
import { WATER_BLOCK_TYPE } from './terrainRoofShape'
import { TreeManager } from './treeManager'

export type GrassSource = {x: number, z: number, radius: number, kind: 'fire' | 'vegetation'}
const VEGETATION_DENSITY_BOOST = 1.45

// Each entry contains local X/Z, width and height for the tufts of one level.
const FORCED_GRASS_LAYOUTS = [
    [],
    [[0, 0, 0.39, 0.40]],
    [[0, 0, 0.55, 0.67]],
    [[0, 0, 0.72, 0.94]],
    [[0, 0.23, 0.49, 0.65], [-0.23, -0.15, 0.47, 0.55], [0.23, -0.13, 0.44, 0.58]],
    [[0, 0, 0.61, 0.82], [-0.53, -0.09, 0.46, 0.56], [0.53, 0.08, 0.49, 0.65],
        [0.09, -0.53, 0.48, 0.61], [-0.08, 0.53, 0.44, 0.54]],
] as const

export function createForcedGrassTufts(map: MapBlock[][], x: number, z: number, level: number,
    exclusions: ReadonlySet<number>, hiddenSnow: ReadonlySet<number>): GrassTuft[] {
    const ground = map[x]?.[z]
    const canGrow = (block?: MapBlock) => block && block.type > 0 && block.type < WATER_BLOCK_TYPE
        && block.type !== TerrainEnum1.TERRAIN_ROCK.index
    if (!ground || !canGrow(ground)) return []

    const depth = map[0].length
    return (FORCED_GRASS_LAYOUTS[level] ?? []).map(([dx, dz, width, height], index) => {
        const nextX = Math.round(x + dx), nextZ = Math.round(z + dz)
        const next = map[nextX]?.[nextZ]
        const spill = canGrow(next) && next.height === ground.height && !exclusions.has(nextX * depth + nextZ)
        const block = spill ? next : ground
        const yaw = FoliageManager.roll(x, z, 17501 + index) * Math.PI * 2
        const matrix = Matrix.Scaling(width, height, width).multiply(Matrix.RotationY(yaw))
        const inset = spill ? 1 : 0.52
        matrix.setTranslationFromFloats(x + dx * inset, block.height - GRASS_ROOT_INSET, z + dz * inset)
        return {matrix, forced: true, tone: block.type === TerrainEnum1.TERRAIN_GRASS.index ? 0 : 1,
            snowed: block.snowed && !hiddenSnow.has(spill ? nextX * depth + nextZ : x * depth + z)}
    })
}

export function getGrassSources(minX: number, minZ: number, maxX: number, maxZ: number): GrassSource[] {
    const sources: GrassSource[] = []
    const queryRadius = 4
    const add = (x: number, z: number, radius: number, kind: GrassSource['kind']) => {
        const dx = Math.max(minX - x, 0, x - maxX)
        const dz = Math.max(minZ - z, 0, z - maxZ)
        if (dx * dx + dz * dz <= radius * radius) sources.push({x, z, radius, kind})
    }
    TreeManager.collisionGrid.forEachInBounds(minX - queryRadius, minZ - queryRadius, maxX + queryRadius, maxZ + queryRadius, tree => {
        add(tree.position.x, tree.position.z, Math.min(queryRadius, 2.55 + tree.scale * 0.55), 'vegetation')
    })
    StaticsManager.collisionGrid.forEachInBounds(minX - queryRadius, minZ - queryRadius, maxX + queryRadius, maxZ + queryRadius, object => {
        const {x, z} = object.renderPosition
        if (object.type === 241 || object.type === 242) add(x, z, object.type === 241 ? 2 : 3, 'fire')
        else if (isShrubType(object.type)) add(x, z, 1.65 + object.getSize() * 0.4, 'vegetation')
    })
    return sources.sort((a, b) => a.x - b.x || a.z - b.z || a.radius - b.radius || a.kind.localeCompare(b.kind))
}

export function createGrassGrowth(map: MapBlock[][], originX: number, originZ: number, sources: readonly GrassSource[],
    isGrassTerrain: (type: number) => boolean) {
    const depth = map[0]?.length ?? 0
    const vegetation = new Float32Array(map.length * depth)
    const density = new Float32Array(vegetation.length)
    const terrainCorners = new Uint8Array(vegetation.length)
    const fires: GrassSource[] = []
    let hasVegetation = false
    for (const source of sources) {
        const localX = source.x - originX, localZ = source.z - originZ
        if (source.kind === 'fire') {
            fires.push(source)
            continue
        }
        const height = map[Math.round(localX)]?.[Math.round(localZ)]?.height
        if (height === undefined) continue
        hasVegetation = true
        const radiusSquared = source.radius ** 2
        for (let x = Math.max(0, Math.ceil(localX - source.radius)); x < map.length && x <= localX + source.radius; x++) {
            for (let z = Math.max(0, Math.ceil(localZ - source.radius)); z < depth && z <= localZ + source.radius; z++) {
                if (map[x][z].height !== height) continue
                const distance = (x - localX) ** 2 + (z - localZ) ** 2
                const falloff = Math.max(0, 1 - distance / radiusSquared)
                const index = x * depth + z
                vegetation[index] = Math.max(vegetation[index], falloff ** 2)
            }
        }
    }

    const atTile = (x: number, z: number) => {
        const index = x * depth + z
        if (density[index]) return density[index]
        const block = map[x][z]
        const rises = (dx: number, dz: number) => {
            const next = map[x + dx]?.[z + dz]
            return next && next.type > 0 && next.type < WATER_BLOCK_TYPE && next.height > block.height
        }
        const riseX = rises(-1, 0) || rises(1, 0)
        const riseZ = rises(0, -1) || rises(0, 1)
        const nearCorner = !riseX && !riseZ && (rises(-1, -1) || rises(-1, 1) || rises(1, -1) || rises(1, 1))
        const corner = riseX && riseZ
        terrainCorners[index] = corner ? 1 : 0
        const slope = corner ? 1.05 : riseX || riseZ ? 0.50 : nearCorner ? 0.32 : 0
        // A mean near one redistributes the base grass budget from gaps into patches.
        const patch = 0.45 + 0.52 * FoliageManager.patchDensity(x + originX, z + originZ)
        const terrainDensity = isGrassTerrain(block.type) ? 1 : 1.3
        const growth = terrainDensity * patch * (1 + Math.max(slope, vegetation[index] * VEGETATION_DENSITY_BOOST))
        density[index] = growth
        return growth
    }

    return {
        atTile,
        permits(x: number, z: number) {
            for (const fire of fires) {
                if ((x - fire.x) ** 2 + (z - fire.z) ** 2 < fire.radius ** 2) return false
            }
            return true
        },
        scaleAt(x: number, z: number, tileX: number, tileZ: number) {
            const index = tileX * depth + tileZ
            if (!density[index]) atTile(tileX, tileZ)
            const cornerBoost = terrainCorners[index] ? 0.35 : 0
            if (!hasVegetation) return 1 + cornerBoost

            // Interpolate between tile samples to keep the size transition smooth around a trunk.
            const left = Math.floor(x), top = Math.floor(z)
            const u = x - left, v = z - top
            const height = map[tileX][tileZ].height
            const sample = (tx: number, tz: number) => map[tx]?.[tz]?.height === height ? vegetation[tx * depth + tz] : 0
            const near = sample(left, top) * (1 - u) + sample(left + 1, top) * u
            const far = sample(left, top + 1) * (1 - u) + sample(left + 1, top + 1) * u
            return 1 + Math.max(cornerBoost, 0.4 * (near * (1 - v) + far * v))
        },
    }
}
