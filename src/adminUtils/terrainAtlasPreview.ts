import { Matrix, Mesh, Texture, Vector2 } from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'
import type { MapBlock } from '@/data/worldDataManager'
import { terrainNoiseShader } from '@/babylon/world/terrainNoiseShader'
import { Builder } from '@/babylon/builder'
import { Materials, TerrainEnum1 } from '@/babylon/materials'
import { addTerrainPreviewRoof, COAL_DEPOSIT, configureTerrainEdgeLighting, configureMuddyDirtWetness, configureRockDeposits, configureTerrainPreviewBatch, TerrainPreviewBatch } from './terrainPreviewBatch'
import type { SubmitTerrainBatch, TerrainPreviewTriangle } from './terrainPreviewBatch'
import type { TerrainPreviewSurfaces } from './terrainPreviewGeometry'
import { muddyDirtLayout, muddyDirtPatterns, terrainCoverLayout, terrainCoverPatterns, TERRAIN_ATLAS_TILES,
    visitBakedTerrainAtlasPatches, visitTerrainAtlasPlacements } from '@/babylon/world/terrainAtlasPlacement'
import dirtColorUrl from './assets/dirt-atlas.png'
import muddyDirtColorUrl from './assets/muddy-dirt-atlas.png'
import dirtNormalUrl from './assets/muddy-dirt-normal-atlas.png'
import rockColorUrl from './assets/rock-atlas.png'
import rockNormalUrl from './assets/rock-normal-atlas.png'
import snowColorUrl from './assets/snow-atlas.png'
import snowNormalUrl from './assets/snow-normal-atlas.png'
export { muddyDirtPatterns, terrainCoverPatterns, TERRAIN_ATLAS_TILES } from '@/babylon/world/terrainAtlasPlacement'


type TerrainAtlas = {
    type: number
    colorUrl: string
    normal: {url: string, strength: number}
    roundDirtEdges?: boolean
    wetDirt?: boolean
    roundRockTop?: boolean
    showRockDeposits?: boolean
    varyAdjacentPatches?: boolean
    patterns: ReadonlyArray<{size: number, origins: readonly (readonly number[])[]}>
}

const rockAtlas: TerrainAtlas = {
    type: TerrainEnum1.TERRAIN_ROCK.index, colorUrl: rockColorUrl,
    normal: {url: rockNormalUrl, strength: 1.5}, patterns: terrainCoverPatterns,
    varyAdjacentPatches: true, roundRockTop: true, showRockDeposits: true,
}
const snowAtlas: TerrainAtlas = {
    type: TerrainEnum1.TERRAIN_SNOW_MUDDY_DIRT.index, colorUrl: snowColorUrl,
    normal: {url: snowNormalUrl, strength: 1.5}, patterns: terrainCoverPatterns, varyAdjacentPatches: true,
}

export function createRockAtlas(plane: Mesh, name: string) {
    return createTerrainAtlasPreview(plane, name, rockAtlas)
}

export function createSnowAtlas(plane: Mesh, name: string) {
    return createTerrainAtlasPreview(plane, name, snowAtlas)
}

export function getRockDeposit(block: MapBlock) {
    if (block.minableCoal) return COAL_DEPOSIT
    if (!block.minableOreAvailable) return 0
    const tier = block.minableOre ?? 3
    return tier >= 1 && tier <= 5 ? tier : 3
}

const blockAtlasCells = terrainCoverPatterns[terrainCoverPatterns.length - 1].origins

export function terrainBlockAtlasUv(x: number, z: number, level: number) {
    const hash = Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663) ^ Math.imul(level, 83492791)
    const [u, v] = blockAtlasCells[(hash >>> 0) % blockAtlasCells.length]
    return new Vector2(u, TERRAIN_ATLAS_TILES - v - 1)
}

export function dungeonRockUv(block: MapBlock, x: number, z: number, level: number) {
    const uv = terrainBlockAtlasUv(x, z, level)
    uv.x += (getRockDeposit(block) + 1) * TERRAIN_ATLAS_TILES
    return uv
}

function createBlockAtlasMaterial(scene: Scene, name: string, atlas: TerrainAtlas) {
    const material = createAtlasMaterial(scene, name, atlas)
    material.Vertex_Before_PositionUpdated(`
        vec2 faceUV = positionUpdated.xz + 0.5;
        #ifdef NORMAL
        if (abs(normal.y) < 0.5) {
            faceUV = vec2(abs(normal.x) > 0.5 ? positionUpdated.z : positionUpdated.x, positionUpdated.y) + 0.5;
        }
        #endif
        uvUpdated = vec2(mod(uvc.x, ${TERRAIN_ATLAS_TILES}.0), uvc.y) + clamp(faceUV, 0.005, 0.995);
    `)
    return material
}

export function createSnowBlockMaterial(scene: Scene, name: string) {
    return createBlockAtlasMaterial(scene, name, snowAtlas)
}

export function createDungeonRockMaterial(scene: Scene, name: string) {
    const material = createBlockAtlasMaterial(scene, name, rockAtlas)
    material.Fragment_Definitions(terrainNoiseShader)
    configureRockDeposits(material, `floor(uvc.x / ${TERRAIN_ATLAS_TILES}.0) - 1.0`)
    return material
}


export type TerrainAtlasTileFilter = (
    matrix: Matrix, uv: Vector2, x: number, z: number, roof: readonly TerrainPreviewTriangle[] | undefined, wetCorners: number,
    floor?: readonly TerrainPreviewTriangle[],
) => boolean

export function createTerrainPreviewPlane(plane: Mesh, name: string) {
    const mesh = Builder.createHorizontalPlane(plane.getScene(), null, 1, 0)
    mesh.parent = plane.parent
    mesh.name = name
    mesh.receiveShadows = plane.receiveShadows
    mesh.setEnabled(false)
    return mesh
}

export function createDirtAtlas(plane: Mesh, name: string, muddy: boolean, wetDirt = false) {
    return createTerrainAtlasPreview(plane, name, {
        type: (muddy ? TerrainEnum1.TERRAIN_MUDDY_DIRT : TerrainEnum1.TERRAIN_DIRT).index,
        colorUrl: muddy ? muddyDirtColorUrl : dirtColorUrl,
        normal: {url: dirtNormalUrl, strength: 4}, patterns: muddyDirtPatterns, roundDirtEdges: true, wetDirt,
    })
}

export function createTerrainAtlasPreview(plane: Mesh, name: string, atlas: TerrainAtlas) {
    const mesh = createTerrainPreviewPlane(plane, name)
    const material = createAtlasMaterial(plane.getScene(), name, atlas)
    configureTerrainPreviewBatch(mesh, material)
    const {roundDirtEdges = false, roundRockTop = false, wetDirt = false, showRockDeposits = false} = atlas
    const roundEdges = roundDirtEdges || roundRockTop
    const layout = atlas.patterns === muddyDirtPatterns ? muddyDirtLayout : terrainCoverLayout
    if (roundEdges) configureTerrainEdgeLighting(material, undefined, roundRockTop)
    if (wetDirt) configureMuddyDirtWetness(material, 'solid')
    if (showRockDeposits) configureRockDeposits(material)

    const render = ({atlasTops, stride, width, originX, originZ, includeTile, roofs, wetCorners,
                        rockDeposits, cornerFloors, compiled}: Omit<TerrainPreviewSurfaces, 'walls' | 'dirtWalls' | 'rockWalls'>,
                    takeTile?: TerrainAtlasTileFilter,
                    batch = new TerrainPreviewBatch(), submit?: SubmitTerrainBatch,
                    canMergeTile?: (x: number, z: number) => boolean) => {
        const remaining = atlasTops.get(atlas.type)!
        const flatTiles: {key: number, matrix: Matrix, uv: Vector2}[] = []
        const submitTile = (tileKey: number, tileX: number, tileZ: number, y: number, code: number, stageFlat = true) => {
            if (includeTile && !includeTile(tileX, tileZ)) return
            const turn = code & 3
            const matrix = Matrix.RotationY(turn * Math.PI / 2)
            matrix.setTranslationFromFloats(tileX, y, tileZ)
            const [u, v] = layout.cells[code >> 2]
            const uv = new Vector2(u, v)
            const floor = cornerFloors.get(tileKey)
            const roof = roofs.get(tileKey)
            const footMask = wetCorners.get(tileKey) ?? 0
            const wetMask = wetDirt ? footMask : 0
            const depositKind = showRockDeposits ? rockDeposits.get(tileKey) ?? 0 : 0
            const options = {roundDirtEdges: roundEdges, wetCorners: wetMask, depositKind}
            // The corner extension and its roof must use the same material blend.
            if (!depositKind && takeTile?.(matrix, uv, tileX, tileZ, roof, footMask, floor)) return
            if (stageFlat && !floor && !roof && !wetMask && !depositKind && canMergeTile?.(tileX, tileZ)) {
                flatTiles.push({key: tileKey, matrix, uv})
                return
            }
            batch.tile = tileKey
            if (floor) addTerrainPreviewRoof(batch, matrix, uv, floor, {...options, mirrorAtTileEdge: true})
            addTerrainPreviewRoof(batch, matrix, uv, roof, options)
        }
        const finishPatch = (x: number, z: number, height: number, size: number, cell: number, turn: number) => {
            if (size > 1 && flatTiles.length === size * size) {
                const matrix = Matrix.Scaling(size, 1, size).multiply(Matrix.RotationY(turn * Math.PI / 2))
                const offset = (size - 1) / 2
                matrix.setTranslationFromFloats(x + offset, height, z + offset)
                const [u, v] = layout.cells[cell]
                batch.tile = x * stride + z
                batch.addPlane(matrix, new Vector2(u, v), {atlasSpan: size})
            } else {
                for (const tile of flatTiles) {
                    batch.tile = tile.key
                    batch.addPlane(tile.matrix, tile.uv)
                }
            }
            flatTiles.length = 0
        }
        if (compiled) {
            const readCode = (x: number, z: number) => compiled.atlas[(x + originX) * compiled.depth + z + originZ]
            if (canMergeTile && includeTile) {
                visitBakedTerrainAtlasPatches(remaining, stride, width, layout, includeTile, readCode, submitTile, finishPatch)
            }
            const unbaked = new Map<number, number>()
            for (const [key, height] of remaining) {
                const x = Math.floor(key / stride), z = key % stride
                const code = readCode(x, z)
                if (!code) unbaked.set(key, height)
                else submitTile(key, x, z, height, code, false)
            }
            // Existing compiled maps have no atlas placements for pond floors.
            visitTerrainAtlasPlacements(unbaked, stride, width, originX, originZ, layout, !!atlas.varyAdjacentPatches,
                !!includeTile, submitTile, canMergeTile ? finishPatch : undefined)
        } else {
            visitTerrainAtlasPlacements(remaining, stride, width, originX, originZ, layout, !!atlas.varyAdjacentPatches,
                !!includeTile, submitTile, canMergeTile ? finishPatch : undefined)
        }

        if (submit) submit(mesh, batch, batch.attributes(roundEdges, wetDirt, showRockDeposits))
        else batch.apply(mesh, roundEdges, wetDirt, showRockDeposits)
    }
    return {mesh, material, render}
}

function createAtlasMaterial(scene: Scene, name: string, atlas: TerrainAtlas) {
    // Equal UV scales keep the normal strength consistent across quarter turns.
    const scale = 1 / TERRAIN_ATLAS_TILES
    const material = Materials.getPBRCustomMaterial(scene, name, '', atlas.colorUrl, scale, scale, false)
    const color = material.albedoTexture!
    color.wrapU = color.wrapV = Texture.CLAMP_ADDRESSMODE
    const normal = new Texture(atlas.normal.url, scene)
    normal.gammaSpace = false
    normal.level = atlas.normal.strength
    normal.wrapU = normal.wrapV = Texture.CLAMP_ADDRESSMODE
    normal.uScale = normal.vScale = scale
    material.bumpTexture = normal
    return material
}
