import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import type { Mesh } from '@babylonjs/core'
import { TerrainEnum1 } from '@/babylon/materials'
import { terrainVerticalBevelMask } from '@/babylon/world/beveledTerrain'
import {
    createBeveledTerrainVertexData, TERRAIN_BEVEL_DROP, TERRAIN_VERTICAL_BEVEL_WIDTH,
    TerrainVerticalCorner,
} from '@/babylon/world/beveledTerrainBlock'
import { isSnowRoof, outdoorSurfaceHeight, terrainRoofCornerSteps, terrainRoofShape, terrainSurfaceAtlasType as atlasType,
    TERRAIN_CARDINAL_EDGES, TERRAIN_ROOF_CORNERS as ROOF_CORNERS,
    TERRAIN_STEP_HEIGHT as MIN_TERRACE_STEP } from '@/babylon/world/terrainRoofShape'
import type { TerrainRenderData } from '@/babylon/world/terrainRenderData'
import { createWaterBedSlope } from '@/babylon/world/terrainWaterBed'
import { getTerrainHeightOffset, WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import type { MapBlock } from '@/data/worldDataManager'
import { createDirtAtlas, getRockDeposit, muddyDirtPatterns, terrainCoverPatterns, TERRAIN_ATLAS_TILES } from './terrainAtlasPreview'
import { TerrainPreviewBatch } from './terrainPreviewBatch'
import type { TerrainPreviewTriangle } from './terrainPreviewBatch'

const WALL_DIRECTIONS = [[0, -1], [-1, 0], [0, 1], [1, 0]] as const
const WALL_UNDERLAP = 0.60
const POND_FLOOR_DEPTH = 0.65
const SNOW_DIRT = TerrainEnum1.TERRAIN_SNOW_MUDDY_DIRT.index
const ROCK = TerrainEnum1.TERRAIN_ROCK.index
const DIRT = TerrainEnum1.TERRAIN_DIRT.index
const MUDDY_DIRT = TerrainEnum1.TERRAIN_MUDDY_DIRT.index
const WALL_ROTATIONS = WALL_DIRECTIONS.map((_, index) => Matrix.RotationYawPitchRoll(
    index * Math.PI / 2, -Math.PI / 2, 0,
))
const wallUvs = (patterns: typeof muddyDirtPatterns) => patterns.find(pattern => pattern.size === 1)!
    .origins.map(([left, top]) => new Vector2(left, TERRAIN_ATLAS_TILES - top - 1))
const MUD_WALL_UVS = wallUvs(muddyDirtPatterns)
const ROCK_WALL_UVS = wallUvs(terrainCoverPatterns)
const VERTICAL_CORNERS = [
    [-1, -1, TerrainVerticalCorner.NorthWest], [1, -1, TerrainVerticalCorner.NorthEast],
    [1, 1, TerrainVerticalCorner.SouthEast], [-1, 1, TerrainVerticalCorner.SouthWest],
] as const

export type TerrainPreviewSurfaces = {
    stride: number
    width: number
    originX: number
    originZ: number
    includeTile?: (x: number, z: number) => boolean
    compiled?: TerrainRenderData
    atlasTops: ReadonlyMap<number, Map<number, number>>
    roofs: ReadonlyMap<number, TerrainPreviewTriangle[]>
    wetCorners: ReadonlyMap<number, number>
    rockDeposits: ReadonlyMap<number, number>
    cornerFloors: ReadonlyMap<number, TerrainPreviewTriangle[]>
    walls: TerrainPreviewBatch
    dirtWalls: TerrainPreviewBatch
    rockWalls: TerrainPreviewBatch
}

export type TerrainWallContact = {
    x: number
    z: number
    lowerX: number
    lowerZ: number
    topY: number | undefined
    bottomY: number | undefined
}

function addWaterFloorWalls(batch: TerrainPreviewBatch, x: number, z: number, floor: number, originX: number, originZ: number,
    heightAt: (x: number, z: number) => number | undefined) {
    WALL_DIRECTIONS.forEach(([dx, dz], side) => {
        const bottom = heightAt(x + dx, z + dz)
        if (bottom === undefined || bottom >= floor) return
        const height = floor - bottom
        const matrix = Matrix.Scaling(1, 1, height).multiply(WALL_ROTATIONS[side])
        matrix.setTranslationFromFloats(x + dx * 0.5, floor - height / 2, z + dz * 0.5)
        batch.addPlane(matrix, wallUv(x + originX, z + originZ, side, 0, false))
    })
}

export function createIndoorWaterFloor(plane: Mesh) {
    const atlas = createDirtAtlas(plane, 'worldWaterFloor', true)
    atlas.mesh.isPickable = atlas.mesh.thinInstanceEnablePicking = true
    const empty = new Map<number, never>()
    return {
        mesh: atlas.mesh,
        render(map: MapBlock[][], floors: Map<number, number>) {
            const stride = map[0].length
            const dirtWalls = new TerrainPreviewBatch()
            const roofs = new Map<number, TerrainPreviewTriangle[]>()
            const heightAt = (x: number, z: number) => outdoorSurfaceHeight(map[x]?.[z])
            for (const [key, height] of floors) {
                dirtWalls.tile = key
                const x = Math.floor(key / stride), z = key % stride
                const slope = createWaterBedSlope(x, z, height, map[x][z].height, heightAt)
                if (slope) roofs.set(key, slope)
                addWaterFloorWalls(dirtWalls, x, z, height, 0, 0, heightAt)
            }
            atlas.render({
                stride, width: map.length, originX: 0, originZ: 0, atlasTops: new Map([[MUDDY_DIRT, floors]]),
                roofs, wetCorners: empty, rockDeposits: empty, cornerFloors: empty,
            }, undefined, dirtWalls)
        },
    }
}

export function createTerrainPreviewGeometry(atlasTypes: readonly number[]) {
    const templates = new Map<string, TerrainPreviewTriangle[]>()
    const getTemplate = (mask: number, heightOffset: number, cornerSteps?: readonly number[]) => {
        const key = `${mask}:${heightOffset}:${cornerSteps?.join(',') ?? ''}`
        let faces = templates.get(key)
        if (!faces) {
            faces = []
            const {positions, normals, indices} = createBeveledTerrainVertexData(mask, heightOffset, cornerSteps)
            for (let i = 0; i < indices!.length; i += 3) {
                const a = indices![i] * 3, b = indices![i + 1] * 3, c = indices![i + 2] * 3
                const normal = Vector3.FromArray(normals!, a)
                if (normal.y < -1e-6) continue
                faces.push({
                    normal,
                    points: [Vector3.FromArray(positions!, a), Vector3.FromArray(positions!, b), Vector3.FromArray(positions!, c)],
                })
            }
            templates.set(key, faces)
        }
        return faces
    }

    const render = (map: MapBlock[][], takeWall?: (contact: TerrainWallContact, triangles: number) =>
        TerrainPreviewBatch | undefined, includeTile?: (x: number, z: number) => boolean,
                    originX = 0, originZ = 0, previewWater = true, localBoundaries = false,
                    compiled?: TerrainRenderData): TerrainPreviewSurfaces => {
        const walls = new TerrainPreviewBatch()
        const dirtWalls = new TerrainPreviewBatch()
        const rockWalls = new TerrainPreviewBatch()
        const stride = map[0]?.length ?? 0
        const atlasTops = new Map(atlasTypes.map(type => [type, new Map<number, number>()]))
        const roofs = new Map<number, TerrainPreviewTriangle[]>()
        const wetCorners = new Map<number, number>()
        const rockDeposits = new Map<number, number>()
        const cornerFloors = new Map<number, TerrainPreviewTriangle[]>()
        const heights = map.map(row => row.map(block => !previewWater ? outdoorSurfaceHeight(block)
            : block.type <= 0 ? undefined : block.type === WATER_BLOCK_TYPE
                ? block.height - POND_FLOOR_DEPTH
            : localBoundaries ? block.height
                : atlasType(block) === SNOW_DIRT ? block.totalHeight : block.height + getTerrainHeightOffset(block, false)))
        const heightAt = (x: number, z: number) => heights[x]?.[z]
        const snowAt = (x: number, z: number) => isSnowRoof(map[x]?.[z])
        const shapes = (x: number, z: number) => {
            const top = heightAt(x, z)
            if (top === undefined) return 0
            const tile = map[x][z]
            const isLevelWater = (tx: number, tz: number) => {
                const neighbor = map[tx]?.[tz]
                return neighbor?.type === WATER_BLOCK_TYPE && neighbor.height === tile.height
            }
            // A level bank meets the rounded water bed at the full height of its roof.
            if (TERRAIN_CARDINAL_EDGES.some(([dx, dz]) => isLevelWater(x + dx, z + dz))
                || ROOF_CORNERS.some(([dx, dz]) => isLevelWater(x + dx, z + dz))) {
                return terrainRoofShape(x, z, tile, top, (tx, tz) => isLevelWater(tx, tz) ? tile.height : heightAt(tx, tz), snowAt)
            }
            return compiled ? compiled.shapes[(x + originX) * compiled.depth + z + originZ]
                : terrainRoofShape(x, z, tile, top, heightAt, snowAt)
        }
        for (let x = 0; x < map.length; x++) {
            for (let z = 0; z < map[x].length; z++) {
                const block = map[x][z]
                if (block.type <= 0) continue
                if (block.type === WATER_BLOCK_TYPE) {
                    const floor = heights[x][z]!
                    walls.tile = x * stride + z
                    atlasTops.get(MUDDY_DIRT)!.set(walls.tile, floor)
                    if (!includeTile || includeTile(x, z)) {
                        const slope = createWaterBedSlope(x, z, floor, block.height, heightAt, originX, originZ)
                        if (slope) roofs.set(walls.tile, slope)
                        if (!previewWater) addWaterFloorWalls(walls, x, z, floor, originX, originZ, heightAt)
                    }
                    continue
                }
                const isRock = block.type === ROCK
                const baseWallBatch = isRock ? rockWalls : block.type === DIRT ? dirtWalls : walls
                const atlas = atlasTops.get(atlasType(block)) ?? atlasTops.get(DIRT)!
                const useRockDeposit = isRock && !block.snowed
                const top = heights[x][z]!
                const key = x * stride + z
                atlas.set(key, top)
                if (includeTile && !includeTile(x, z)) {
                    // A clipped corner on a neighboring cliff can expose part of this chunk's floor.
                    if (WALL_DIRECTIONS.some(([dx, dz]) => includeTile(x + dx, z + dz))) {
                        const bottom = Math.min(...WALL_DIRECTIONS.map(([dx, dz]) => heights[x + dx]?.[z + dz] ?? -1))
                        for (let level = block.height; level > bottom + 1e-6; level--) {
                            const vertical = terrainVerticalBevelMask(map, x, z, level)
                            if (vertical) addCornerFloors(cornerFloors, heights, shapes, x, z, level, vertical)
                        }
                    }
                    continue
                }
                const flatSnowRoof = isSnowRoof(block)
                const adjacent = WALL_DIRECTIONS.map(([dx, dz]) => heights[x + dx]?.[z + dz])
                const lower = adjacent.map(height => height ?? -1)
                const shape = shapes(x, z)
                const steps = terrainRoofCornerSteps(shape)
                const bevel = shape & 255
                const wetMask = shape >> 12
                const bottom = Math.min(...lower)
                const tileRoof: TerrainPreviewTriangle[] = []
                baseWallBatch.tile = key

                for (let level = block.height, layer = 0; layer === 0 || level > bottom + 1e-6; level--, layer++) {
                    const upper = layer === 0 ? top : level
                    const heightOffset = upper - level
                    const base = level - 1
                    const vertical = terrainVerticalBevelMask(map, x, z, level)
                    const mask = (layer === 0 ? bevel : 0) | vertical
                    if (vertical) addCornerFloors(cornerFloors, heights, shapes, x, z, level, vertical)
                    const dirtEdgesAt = (side: number) => {
                        const foot = adjacent[side]
                        if (foot === undefined || top - foot <= MIN_TERRACE_STEP) return undefined
                        const [dx, dz] = WALL_DIRECTIONS[side]
                        const lowerBlock = map[x + dx][z + dz]
                        const lowerAtlas = lowerBlock.type !== ROCK && atlasTops.has(lowerBlock.type) && !lowerBlock.snowed
                            && !lowerBlock.minableCoal && !lowerBlock.minableOreAvailable
                        return {
                            top: layer === 0 && !block.snowed ? top : undefined,
                            foot: (!isRock || (localBoundaries && lowerBlock.type === MUDDY_DIRT))
                                && lowerAtlas && foot >= base - 1e-6 ? foot : undefined,
                        }
                    }
                    const wallBatch = (side: number, triangles: number) => {
                        const foot = adjacent[side]
                        if (!takeWall || foot === undefined || top - foot <= MIN_TERRACE_STEP) return baseWallBatch
                        const topY = layer === 0 ? top - (flatSnowRoof ? 0 : TERRAIN_BEVEL_DROP) : undefined
                        const bottomY = foot >= base - 1e-6 ? foot : undefined
                        const [dx, dz] = WALL_DIRECTIONS[side]
                        const batch = takeWall({x, z, lowerX: x + dx, lowerZ: z + dz, topY, bottomY}, triangles) ?? baseWallBatch
                        batch.tile = key
                        return batch
                    }
                    if (!mask) {
                        for (let side = 0; side < WALL_DIRECTIONS.length; side++) {
                            const height = Math.min(1 + heightOffset, upper - lower[side])
                            if (height <= 1e-6) continue
                            const [dx, dz] = WALL_DIRECTIONS[side]
                            const overlap = adjacent[side] !== undefined && lower[side] >= base - 1e-6 ? WALL_UNDERLAP : 0
                            const wallHeight = height + overlap
                            const matrix = Matrix.Scaling(1, 1, wallHeight).multiply(WALL_ROTATIONS[side])
                            matrix.setTranslationFromFloats(x + dx * 0.5, upper - wallHeight / 2, z + dz * 0.5)
                            wallBatch(side, 2).addPlane(matrix, wallUv(x + originX, z + originZ, side, layer, isRock), {
                                bottomV: -overlap / height, dirtEdges: dirtEdgesAt(side),
                            })
                        }
                        continue
                    }

                    for (const face of getTemplate(mask, heightOffset, layer === 0 ? steps : undefined)) {
                        const {normal} = face
                        const isRoof = normal.y > 1e-6
                        if (isRoof && layer !== 0) continue
                        // Straight sides only face their own neighbor. Diagonal faces span two exposed sides.
                        const side = normal.z < -1e-6 ? 0 : normal.x < -1e-6 ? 1 : normal.z > 1e-6 ? 2 : 3
                        if (!isRoof && upper <= lower[side] + 1e-6) continue
                        const xSide = normal.x < 0 ? 1 : 3
                        const zSide = normal.z < 0 ? 0 : 2
                        const contactSide = Math.abs(normal.x) > 1e-6 && Math.abs(normal.z) > 1e-6
                            ? (lower[xSide] >= lower[zSide] ? xSide : zSide) : side
                        const wallBase = adjacent[contactSide]
                        // Keep the soft shadow map covered just below the receiver, without lowering the roof.
                        const underlap = !isRoof && wallBase !== undefined && wallBase >= base - 1e-6 ? WALL_UNDERLAP : 0
                        const lowerBy = (point: Vector3) => point.y <= -0.5 + 1e-6 ? underlap : 0
                        const [a, b, c] = face.points
                        const toWorld = (point: Vector3) =>
                            new Vector3(x + point.x, upper + (point.y - 0.5) * (1 + heightOffset) - lowerBy(point), z + point.z)
                        const triangle: TerrainPreviewTriangle = {
                            points: [toWorld(a), toWorld(b), toWorld(c)],
                            normal: new Vector3(normal.x, normal.y / (1 + heightOffset), normal.z).normalize(),
                        }
                        if (isRoof) {
                            tileRoof.push(triangle)
                        } else {
                            const project = (point: Vector3) =>
                                new Vector2(-normal.z * point.x + normal.x * point.z + 0.5,
                                    point.y + 0.5 - lowerBy(point) / (1 + heightOffset))
                            wallBatch(contactSide, 1).addTriangle(triangle, wallUv(x + originX, z + originZ, side, layer, isRock),
                                [project(a), project(b), project(c)], dirtEdgesAt(contactSide))
                        }
                    }
                }

                const rockDeposit = useRockDeposit ? getRockDeposit(block) : 0
                if (rockDeposit) rockDeposits.set(key, rockDeposit)
                if (tileRoof.length) roofs.set(key, tileRoof)
                if (wetMask) wetCorners.set(key, wetMask)
            }
        }
        return {stride, width: map.length, originX, originZ, includeTile, compiled,
            atlasTops, roofs, wetCorners, rockDeposits, cornerFloors, walls, dirtWalls, rockWalls}
    }
    return {render}
}

function addCornerFloors(
    floors: Map<number, TerrainPreviewTriangle[]>, heights: (number | undefined)[][], shapes: (x: number, z: number) => number,
    x: number, z: number, level: number, vertical: number,
) {
    for (const [dx, dz, bit] of VERTICAL_CORNERS) {
        if (!(vertical & bit)) continue
        const sideX = heights[x + dx][z]
        const sideZ = heights[x][z + dz]
        if (sideX === undefined || sideZ === undefined) continue
        const floorHeight = Math.max(sideX, sideZ)
        // Close the bevel only where it meets the next terrace.
        if (floorHeight < level - 1 - 1e-6) continue
        const donorX = sideX >= sideZ ? x + dx : x
        const donorZ = sideX >= sideZ ? z : z + dz
        const key = donorX * heights[0].length + donorZ
        const cornerX = x + dx / 2, cornerZ = z + dz / 2
        const heightAt = (tileX: number, tileZ: number, px: number, pz: number) => {
            const index = ROOF_CORNERS.findIndex(([sx, sz]) =>
                sx === Math.sign(px - tileX) && sz === Math.sign(pz - tileZ))
            return heights[tileX][tileZ]! + terrainRoofCornerSteps(shapes(tileX, tileZ))[index] * TERRAIN_BEVEL_DROP
        }
        const y = heightAt(donorX, donorZ, cornerX, cornerZ)
        const edgeX = sideZ === floorHeight ? heightAt(x, z + dz, cornerX - dx, cornerZ) : y
        const edgeZ = sideX === floorHeight ? heightAt(x + dx, z, cornerX, cornerZ - dz) : y
        const corner = new Vector3(cornerX, y, cornerZ)
        const towardX = new Vector3(cornerX - dx * TERRAIN_VERTICAL_BEVEL_WIDTH,
            y + (edgeX - y) * TERRAIN_VERTICAL_BEVEL_WIDTH, cornerZ)
        const towardZ = new Vector3(cornerX,
            y + (edgeZ - y) * TERRAIN_VERTICAL_BEVEL_WIDTH, cornerZ - dz * TERRAIN_VERTICAL_BEVEL_WIDTH)
        const points: TerrainPreviewTriangle['points'] = dx === dz
            ? [corner, towardX, towardZ] : [corner, towardZ, towardX]
        const triangle = {points, normal: Vector3.Cross(points[2].subtract(corner), points[1].subtract(corner)).normalize()}
        const tileFloors = floors.get(key)
        if (tileFloors) tileFloors.push(triangle)
        else floors.set(key, [triangle])
    }
}

function wallUv(x: number, z: number, side: number, layer: number, isRock: boolean) {
    const hash = Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663)
        ^ Math.imul(side + layer * WALL_DIRECTIONS.length, 83492791)
    const variants = isRock ? ROCK_WALL_UVS : MUD_WALL_UVS
    return variants[(hash >>> 0) % variants.length]
}
