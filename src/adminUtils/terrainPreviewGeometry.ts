import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import type { Mesh } from '@babylonjs/core'
import { Materials, PlaneEnum1, TerrainEnum1 } from '@/babylon/materials'
import { terrainBevelMask, terrainVerticalBevelMask } from '@/babylon/world/beveledTerrain'
import {
    createBeveledTerrainVertexData, TERRAIN_BEVEL_DROP, TERRAIN_VERTICAL_BEVEL_WIDTH,
    TerrainCorner, TerrainEdge, TerrainVerticalCorner,
} from '@/babylon/world/beveledTerrainBlock'
import { getTerrainHeightOffset, WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import type { MapBlock } from '@/data/worldDataManager'
import { createTerrainPreviewPlane, muddyDirtPatterns, terrainCoverPatterns, TERRAIN_ATLAS_TILES } from './terrainAtlasPreview'
import { addTerrainPreviewRoof, configureTerrainPreviewBatch, TerrainPreviewBatch } from './terrainPreviewBatch'
import type { TerrainPreviewTriangle } from './terrainPreviewBatch'

const WALL_DIRECTIONS = [[0, -1], [-1, 0], [0, 1], [1, 0]] as const
const WALL_UNDERLAP = 0.60
const MIN_TERRACE_STEP = 0.5
const POND_FLOOR_DEPTH = 0.65
const EDGE_BITS = [TerrainEdge.North, TerrainEdge.West, TerrainEdge.South, TerrainEdge.East] as const
const EDGE_MASK = TerrainEdge.North | TerrainEdge.West | TerrainEdge.South | TerrainEdge.East
const SNOW_DIRT = TerrainEnum1.TERRAIN_SNOW_MUDDY_DIRT.index
const SNOW_DRY_DIRT = TerrainEnum1.TERRAIN_SNOW_DIRT.index
const SNOW_WINTER_GRASS = TerrainEnum1.TERRAIN_SNOW_GRASS_WINTER.index
const SNOW_ROCK = TerrainEnum1.TERRAIN_SNOW_ROCK.index
const ROCK = TerrainEnum1.TERRAIN_ROCK.index
const DIRT = TerrainEnum1.TERRAIN_DIRT.index
const atlasType = (block: MapBlock) => {
    const type = block.snowed ? block.type + 100 : block.type
    return type === SNOW_DRY_DIRT || type === SNOW_WINTER_GRASS || type === SNOW_ROCK ? SNOW_DIRT : type
}
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
const ROOF_CORNERS = [
    [-1, -1, TerrainCorner.NorthWest, TerrainEdge.North | TerrainEdge.West],
    [1, -1, TerrainCorner.NorthEast, TerrainEdge.North | TerrainEdge.East],
    [1, 1, TerrainCorner.SouthEast, TerrainEdge.South | TerrainEdge.East],
    [-1, 1, TerrainCorner.SouthWest, TerrainEdge.South | TerrainEdge.West],
] as const

export type TerrainPreviewSurfaces = {
    stride: number
    atlasTops: ReadonlyMap<number, Map<number, number>>
    roofs: ReadonlyMap<number, TerrainPreviewTriangle[]>
    wetCorners: ReadonlyMap<number, number>
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

export function createTerrainPreviewGeometry(plane: Mesh, atlasTypes: readonly number[]) {
    const scene = plane.getScene()
    configureTerrainPreviewBatch(plane, Materials.createPlaneMaterial(scene))

    const deposits = createTerrainPreviewPlane(plane, 'adminUtilsTerrainDeposits')
    // Ore and coal are only in the block atlas. Use the same top-face UV rectangle on a plane.
    configureTerrainPreviewBatch(deposits, Materials.createTerrainMaterial1(scene))


    const snowMask = new Set<number>()
    const templates = new Map<string, TerrainPreviewTriangle[]>()
    const getTemplate = (mask: number, heightOffset: number, cornerSteps?: readonly number[]) => {
        const key = `${mask}:${heightOffset}:${cornerSteps?.join(',') ?? ''}`
        let faces = templates.get(key)
        if (!faces) {
            faces = []
            const {positions, normals, indices} = createBeveledTerrainVertexData(mask, false, heightOffset, cornerSteps)
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
        TerrainPreviewBatch | undefined): TerrainPreviewSurfaces => {
        const tops = new TerrainPreviewBatch()
        const oreTops = new TerrainPreviewBatch()
        const walls = new TerrainPreviewBatch()
        const dirtWalls = new TerrainPreviewBatch()
        const rockWalls = new TerrainPreviewBatch()
        const stride = map.length
        const atlasTops = new Map(atlasTypes.map(type => [type, new Map<number, number>()]))
        const roofs = new Map<number, TerrainPreviewTriangle[]>()
        const wetCorners = new Map<number, number>()
        const cornerFloors = new Map<number, TerrainPreviewTriangle[]>()
        const heights = map.map(row => row.map(block => block.type === WATER_BLOCK_TYPE
            ? block.height - POND_FLOOR_DEPTH
            : atlasType(block) === SNOW_DIRT ? block.totalHeight : block.height + getTerrainHeightOffset(block, false)))
        const flatSnowRoofs = map.map(row => row.map(block => atlasType(block) === SNOW_DIRT))
        const cornerSteps = heights.map((row, x) => row.map((top, z) => ROOF_CORNERS.map(([dx, dz]) => {
            // Every tile sharing this corner at the same elevation computes the same height.
            if (flatSnowRoofs[x][z]) return 0
            const neighbors = [[x + dx, z], [x, z + dz], [x + dx, z + dz]]
            const meetsSnow = neighbors.some(([nx, nz]) => flatSnowRoofs[nx]?.[nz] && Math.abs(heights[nx][nz] - top) < 1e-6)
            if (meetsSnow) return 0
            const drops = neighbors.some(([nx, nz]) => (heights[nx]?.[nz] ?? top) < top - 1e-6)
            return drops ? -1 : 0
        })))
        for (let x = 0; x < map.length; x++) {
            for (let z = 0; z < map[x].length; z++) {
                const block = map[x][z]
                if (block.type === WATER_BLOCK_TYPE) {
                    atlasTops.get(DIRT)!.set(x * stride + z, heights[x][z])
                    continue
                }
                const isRock = block.type === ROCK
                const baseWallBatch = isRock ? rockWalls : block.type === DIRT ? dirtWalls : walls
                const atlas = atlasTops.get(atlasType(block))
                const deposit = block.minableCoal || block.minableOreAvailable
                const top = heights[x][z]
                const flatSnowRoof = flatSnowRoofs[x][z]
                const adjacent = WALL_DIRECTIONS.map(([dx, dz]) => heights[x + dx]?.[z + dz])
                const lower = adjacent.map(height => height ?? -1)
                let edges = flatSnowRoof ? 0 : terrainBevelMask(map, x, z, snowMask) & EDGE_MASK
                adjacent.forEach((height, side) => {
                    if (height !== undefined && top <= height + 1e-6) edges &= ~EDGE_BITS[side]
                })
                const steps = cornerSteps[x][z]
                let bevel = edges
                let wetMask = 0
                ROOF_CORNERS.forEach(([dx, dz, corner, sides], index) => {
                    if (steps[index] && !(edges & sides)) bevel |= corner
                    if (!isRock && [heights[x + dx]?.[z], heights[x]?.[z + dz], heights[x + dx]?.[z + dz]]
                        .some(height => height !== undefined && height > top + MIN_TERRACE_STEP)) wetMask |= 1 << index
                })
                const bottom = Math.min(...lower)
                const tileRoof: TerrainPreviewTriangle[] = []

                for (let level = block.height, layer = 0; layer === 0 || level > bottom + 1e-6; level--, layer++) {
                    const upper = layer === 0 ? top : level
                    const heightOffset = upper - level
                    const base = level - 1
                    const vertical = terrainVerticalBevelMask(map, x, z, level, snowMask)
                    const mask = (layer === 0 ? bevel : 0) | vertical
                    if (vertical) addCornerFloors(cornerFloors, heights, cornerSteps, x, z, level, vertical)
                    const dirtEdgesAt = (side: number) => {
                        const foot = adjacent[side]
                        if (foot === undefined || top - foot <= MIN_TERRACE_STEP) return undefined
                        const [dx, dz] = WALL_DIRECTIONS[side]
                        const lowerBlock = map[x + dx][z + dz]
                        const lowerAtlas = lowerBlock.type !== ROCK && atlasTops.has(lowerBlock.type) && !lowerBlock.snowed
                            && !lowerBlock.minableCoal && !lowerBlock.minableOreAvailable
                        return {
                            top: layer === 0 && atlas && !block.snowed && !deposit ? top : undefined,
                            foot: !isRock && lowerAtlas && foot >= base - 1e-6 ? foot : undefined,
                        }
                    }
                    const wallBatch = (side: number, triangles: number) => {
                        const foot = adjacent[side]
                        if (!takeWall || foot === undefined || top - foot <= MIN_TERRACE_STEP) return baseWallBatch
                        const topY = layer === 0 ? top - (flatSnowRoof ? 0 : TERRAIN_BEVEL_DROP) : undefined
                        const bottomY = foot >= base - 1e-6 ? foot : undefined
                        if (topY === undefined && bottomY === undefined) return baseWallBatch
                        const [dx, dz] = WALL_DIRECTIONS[side]
                        return takeWall({x, z, lowerX: x + dx, lowerZ: z + dz, topY, bottomY}, triangles) ?? baseWallBatch
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
                            wallBatch(side, 2).addPlane(matrix, wallUv(x, z, side, layer, isRock), {
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
                            wallBatch(contactSide, 1).addTriangle(triangle, wallUv(x, z, side, layer, isRock),
                                [project(a), project(b), project(c)], dirtEdgesAt(contactSide))
                        }
                    }
                }

                const roof = tileRoof.length ? tileRoof : undefined
                if (deposit) {
                    addTerrainPreviewRoof(oreTops, Matrix.Translation(x, top, z), TerrainEnum1.getTerrainForBlock(block),
                        roof, {blockAtlas: true})
                } else if (atlas) {
                    const key = x * stride + z
                    atlas.set(key, top)
                    if (roof) roofs.set(key, roof)
                    if (wetMask) wetCorners.set(key, wetMask)
                } else {
                    addTerrainPreviewRoof(tops, Matrix.Translation(x, top, z), PlaneEnum1.getPlaneForBlock(block), roof)
                }
            }
        }
        for (const [key, floors] of cornerFloors) {
            const x = Math.floor(key / stride), z = key % stride
            const block = map[x][z]
            if (block.type === WATER_BLOCK_TYPE || atlasTops.get(atlasType(block))?.has(key)) continue
            const placement = Matrix.Translation(x, heights[x][z], z)
            if (block.minableCoal || block.minableOreAvailable) {
                addTerrainPreviewRoof(oreTops, placement, TerrainEnum1.getTerrainForBlock(block), floors,
                    {blockAtlas: true, mirrorAtTileEdge: true})
            } else {
                addTerrainPreviewRoof(tops, placement, PlaneEnum1.getPlaneForBlock(block), floors, {mirrorAtTileEdge: true})
            }
        }
        tops.apply(plane)
        oreTops.apply(deposits)
        return {stride, atlasTops, roofs, wetCorners, cornerFloors, walls, dirtWalls, rockWalls}
    }
    return {render, deposits}
}

function addCornerFloors(
    floors: Map<number, TerrainPreviewTriangle[]>, heights: number[][], cornerSteps: number[][][],
    x: number, z: number, level: number, vertical: number,
) {
    for (const [dx, dz, bit] of VERTICAL_CORNERS) {
        if (!(vertical & bit)) continue
        const sideX = heights[x + dx][z]
        const sideZ = heights[x][z + dz]
        const floorHeight = Math.max(sideX, sideZ)
        // Close the bevel only where it meets the next terrace.
        if (floorHeight < level - 1 - 1e-6) continue
        const donorX = sideX >= sideZ ? x + dx : x
        const donorZ = sideX >= sideZ ? z : z + dz
        const key = donorX * heights.length + donorZ
        const cornerX = x + dx / 2, cornerZ = z + dz / 2
        const heightAt = (tileX: number, tileZ: number, px: number, pz: number) => {
            const index = ROOF_CORNERS.findIndex(([sx, sz]) =>
                sx === Math.sign(px - tileX) && sz === Math.sign(pz - tileZ))
            return heights[tileX][tileZ] + cornerSteps[tileX][tileZ][index] * TERRAIN_BEVEL_DROP
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
