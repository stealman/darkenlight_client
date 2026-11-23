import { Matrix, Mesh, Vector2 } from '@babylonjs/core'
import type { Scene, TransformNode, Vector3 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import type { MapBlock } from '@/data/worldDataManager'
import { findTerrainTransitions, terrainSurface } from './terrainLocalTransitions'
import { Builder } from '@/babylon/builder'
import { MaterialEnum1, Materials, TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'
import { Settings } from '@/settings/settings'
import { createTerrainAtlasPreview, createTerrainPreviewPlane, muddyDirtPatterns, terrainCoverPatterns } from './terrainAtlasPreview'
import type { TerrainAtlasTileFilter } from './terrainAtlasPreview'
import { addTerrainPreviewRoof, configureTerrainEdgeLighting, configureMuddyDirtWetness, configureSnowmelt, configureSnowGlints, configureTerrainPreviewBatch, TerrainPreviewBatch } from './terrainPreviewBatch'
import type { SubmitTerrainBatch } from './terrainPreviewBatch'
import { createTerrainPreviewGeometry } from './terrainPreviewGeometry'
import { createTerrainPreviewWater } from './terrainPreviewWater'
import { createTerrainTransitionMaterial, POND_BANK_FLAG, TERRAIN_TRANSITION_REACH } from './terrainTransitionMaterial'
import muddyDirtColorUrl from './assets/muddy-dirt-atlas.png'
import dirtColorUrl from './assets/dirt-atlas.png'
import muddyDirtNormalUrl from './assets/muddy-dirt-normal-atlas.png'
import winterGrassColorUrl from './assets/winter-grass-atlas.png'
import grassColorUrl from './assets/grass-atlas.png'
import winterGrassNormalUrl from './assets/winter-grass-normal-atlas.png'
import snowColorUrl from './assets/snow-atlas.png'
import snowNormalUrl from './assets/snow-normal-atlas.png'
import rockColorUrl from './assets/rock-atlas.png'
import rockNormalUrl from './assets/rock-normal-atlas.png'

const MUDDY_DIRT = TerrainEnum1.TERRAIN_MUDDY_DIRT.index
const DIRT = TerrainEnum1.TERRAIN_DIRT.index
const GRASS = TerrainEnum1.TERRAIN_GRASS.index
const WINTER_GRASS = TerrainEnum1.TERRAIN_GRASS_WINTER.index
const GRASS_TYPES = [WINTER_GRASS, GRASS] as const
const isGrass = (type: number) => type === WINTER_GRASS || type === GRASS
const SNOW_DIRT = TerrainEnum1.TERRAIN_SNOW_MUDDY_DIRT.index
const ROCK = TerrainEnum1.TERRAIN_ROCK.index
const ADJACENT_TILES = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
// Match the shader's corner order: -X/-Z, +X/-Z, -X/+Z, +X/+Z.
const ISLAND_CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const

function touchesTile(x: number, z: number, includes: (x: number, z: number) => boolean) {
    return ADJACENT_TILES.some(([dx, dz]) => includes(x + dx, z + dz))
        || ISLAND_CORNERS.some(([dx, dz]) => includes(x + dx, z + dz))
}

function grassIslandMasks(map: MapBlock[][]) {
    const flat = map.map((row, x) => row.map((block, z) => {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (map[x + dx]?.[z + dz]?.totalHeight !== block.totalHeight) return false
            }
        }
        return true
    }))
    // Adjacent tiles use the same weight at a shared corner so islands fade cleanly between them.
    return flat.map((row, x) => row.map((isFlat, z) => {
        if (!isFlat) return 0
        let mask = 0
        ISLAND_CORNERS.forEach(([dx, dz], index) => {
            if (flat[x + dx]?.[z] && flat[x]?.[z + dz] && flat[x + dx]?.[z + dz]) mask |= 1 << index
        })
        return mask
    }))
}

type TerrainRenderOptions = {
    transitionTiles?: boolean[][]
    snow?: boolean
    snowPartner?: number
    snowOnRock?: boolean
    rockPartner?: number
    dirtPartner?: number
    shoreSurface?: number
    grassType?: number
    snowRockOnSoil?: boolean
    localBoundaries?: boolean
    drawPaths?: boolean
    includeTile?: (x: number, z: number) => boolean
    originX?: number
    originZ?: number
    submit?: SubmitTerrainBatch
}

type TerrainDemo = {map: MapBlock[][], center: number, boundaries: number[], isBank: (x: number, z: number) => boolean}

export function createTerrainSurfaceRenderer(scene: Scene, parent: TransformNode, transitionBoundary: Vector3, demo?: TerrainDemo) {
    const wetness = !!demo || Settings.isDetalLevelHigh()
    const plane = Builder.createHorizontalPlane(scene, parent, 1, 0)
    plane.name = 'adminUtilsTerrainTops'
    plane.receiveShadows = Settings.isShadowsEnabled()
    const geometry = createTerrainPreviewGeometry(plane, [MUDDY_DIRT, DIRT, ...GRASS_TYPES, SNOW_DIRT, ROCK])
    const pond = demo && createTerrainPreviewWater(plane, demo.map, demo.isBank, demo.center)
    const paths = demo && Builder.createWrappedBlock(scene, parent)
    if (paths) {
        paths.name = 'adminUtilsStarterStonePaths'
        paths.material = Materials.blockMat1
        paths.receiveShadows = plane.receiveShadows
        Lights.addShadowCaster(paths, false)
    }
    const dirtAtlas = createTerrainAtlasPreview(plane, 'adminUtilsMuddyDirt', {
        type: MUDDY_DIRT, colorUrl: muddyDirtColorUrl,
        normal: {url: muddyDirtNormalUrl, strength: 4}, patterns: muddyDirtPatterns, roundDirtEdges: true, wetDirt: wetness,
    })
    pond?.applyShoreWetness(dirtAtlas.material)
    const dryDirtAtlas = createTerrainAtlasPreview(plane, 'adminUtilsDirt', {
        type: DIRT, colorUrl: dirtColorUrl,
        normal: {url: muddyDirtNormalUrl, strength: 4}, patterns: muddyDirtPatterns, roundDirtEdges: true,
    })
    const grassAtlases = GRASS_TYPES.map(type => {
        const name = type === GRASS ? 'Grass' : 'WinterGrass'
        const atlas = createTerrainAtlasPreview(plane, type === GRASS ? 'adminUtilsGrassTerrain' : 'adminUtilsWinterGrass', {
            type, colorUrl: type === GRASS ? grassColorUrl : winterGrassColorUrl,
            normal: {url: winterGrassNormalUrl, strength: 0.75}, patterns: terrainCoverPatterns,
        })
        return {type, name, atlas}
    })
    const grassMaterials = new Set(grassAtlases.map(({atlas}) => atlas.material))
    const snowAtlas = createTerrainAtlasPreview(plane, 'adminUtilsSnowDirt', {
        type: SNOW_DIRT, colorUrl: snowColorUrl,
        normal: {url: snowNormalUrl, strength: 1.5}, patterns: terrainCoverPatterns, varyAdjacentPatches: true,
    })
    configureSnowGlints(snowAtlas.material)
    const rockAtlas = createTerrainAtlasPreview(plane, 'adminUtilsRock', {
        type: ROCK, colorUrl: rockColorUrl,
        normal: {url: rockNormalUrl, strength: 1.5},
        patterns: terrainCoverPatterns, varyAdjacentPatches: true, roundRockTop: true, showRockDeposits: true,
    })
    const wetTransitions = new Set<Mesh>()
    const createTransition = (name: string, cover: PBRCustomMaterial, substrate = dirtAtlas.material,
                              wallSoil = dirtAtlas.material, blendRockWalls = false) => {
        const mesh = createTerrainPreviewPlane(plane, name)
        const withDirt = substrate === dirtAtlas.material
        const withGrass = grassMaterials.has(substrate)
        const withRock = substrate === rockAtlas.material
        const mudCover = cover === dirtAtlas.material
        const dryCover = cover === dryDirtAtlas.material
        const drySubstrate = substrate === dryDirtAtlas.material
        const soilRockWalls = withRock && (mudCover || dryCover)
        const atPond = pond && !blendRockWalls && ((withDirt && (grassMaterials.has(cover) || cover === snowAtlas.material))
            || (mudCover && (withRock || drySubstrate)))
        const material = createTerrainTransitionMaterial(name, cover, substrate,
            (mudCover || dryCover ? muddyDirtPatterns : terrainCoverPatterns)[0].origins[0],
            (withDirt || drySubstrate ? muddyDirtPatterns : terrainCoverPatterns)[0].origins[0], transitionBoundary,
            withGrass ? wallSoil : undefined, withRock, atPond && pond ? {...pond, coverOnBank: mudCover} : undefined, soilRockWalls,
            blendRockWalls ? rockAtlas.material : undefined)
        configureTerrainPreviewBatch(mesh, material, false)
        configureTerrainEdgeLighting(material, mudCover || soilRockWalls ? 'vec2(1.0)' : 'dirtCoverage', withRock && !mudCover)
        if (wetness && (mudCover || withDirt || (withGrass && wallSoil === dirtAtlas.material))) {
            configureMuddyDirtWetness(material, mudCover ? 'cover' : withGrass ? 'walls' : 'mixed',
                blendRockWalls ? '(1.0 - wallRockWeight)' : undefined)
            wetTransitions.add(mesh)
        }
        if (cover === snowAtlas.material) {
            if (wetness) configureSnowmelt(material, withGrass)
            configureSnowGlints(material, withGrass ? 'grass' : 'standard')
        }
        if (atPond) {
            pond?.applyShoreWetness(material, mudCover ? 'grassWeight' : '(1.0 - grassWeight)')
        }
        return mesh
    }
    const snowTransition = createTransition('adminUtilsSnowMuddyDirt', snowAtlas.material)
    const snowRockTransition = createTransition('adminUtilsSnowRock', snowAtlas.material, rockAtlas.material)
    const snowRockMuddyWalls = createTransition('adminUtilsSnowRockMuddyWalls', snowAtlas.material, dirtAtlas.material, dirtAtlas.material, true)
    const snowRockDirtWalls = createTransition('adminUtilsSnowRockDirtWalls', snowAtlas.material, dryDirtAtlas.material, dirtAtlas.material, true)
    const mudRockTransition = createTransition('adminUtilsMuddyDirtRock', dirtAtlas.material, rockAtlas.material)
    const snowDirtTransition = createTransition('adminUtilsSnowDirtTransition', snowAtlas.material, dryDirtAtlas.material)
    const dirtRockTransition = createTransition('adminUtilsDirtRock', dryDirtAtlas.material, rockAtlas.material)
    const mudDirtTransition = createTransition('adminUtilsMuddyDirtDirt', dirtAtlas.material, dryDirtAtlas.material)
    const grassTransitions = new Map(grassAtlases.map(({type, name, atlas}) => [type, {
        mud: createTransition(`adminUtils${name}MuddyDirt`, atlas.material),
        rock: createTransition(`adminUtils${name}Rock`, atlas.material, rockAtlas.material),
        dirt: createTransition(`adminUtils${name}Dirt`, atlas.material, dryDirtAtlas.material),
        snow: createTransition(`adminUtilsSnow${name}`, snowAtlas.material, atlas.material),
        snowOnDirt: createTransition(`adminUtilsSnow${name}DirtWalls`, snowAtlas.material, atlas.material, dryDirtAtlas.material),
    }]))
    const pondTransitions = new Map([
        ...Array.from(grassTransitions, ([type, transitions]) => [type, transitions.mud] as const), [DIRT, mudDirtTransition],
        [ROCK, mudRockTransition], [SNOW_DIRT, snowTransition],
    ])
    const transitionMeshes = [snowTransition, snowRockTransition, snowRockMuddyWalls, snowRockDirtWalls,
        mudRockTransition, snowDirtTransition, dirtRockTransition, mudDirtTransition,
        ...Array.from(grassTransitions.values()).flatMap(transitions => Object.values(transitions))]
    const meshes = [plane, geometry.deposits, dirtAtlas.mesh, dryDirtAtlas.mesh, snowAtlas.mesh, rockAtlas.mesh,
        ...grassAtlases.map(({atlas}) => atlas.mesh), ...transitionMeshes]
    for (const mesh of meshes) {
        Lights.addShadowCaster(mesh, false)
        if (!demo) {
            mesh.name = mesh.name.replace('adminUtils', 'world')
            mesh.isPickable = mesh.thinInstanceEnablePicking = true
            mesh.setEnabled(false)
            Lights.registerSharedLightMesh(mesh)
        }
    }
    const render = (map: MapBlock[][], options: TerrainRenderOptions) => {
        const {transitionTiles, snow = false, snowPartner = 0, snowOnRock = false, rockPartner = 0, dirtPartner = 0,
            shoreSurface = 0, grassType = WINTER_GRASS, snowRockOnSoil = false, localBoundaries = true,
            drawPaths = false, includeTile, originX = 0, originZ = 0, submit} = options
        pond?.mesh.setEnabled(!localBoundaries)
        if (!localBoundaries) pond?.setLevel(map)
        const pathMatrices: Matrix[] = []
        const pathUvs: Vector2[] = []
        if (drawPaths) {
            map.forEach((row, x) => row.forEach((block, z) => {
                if (!block.stonePath && !block.beigeStonePath) return
                const matrix = Matrix.Scaling(1, 0.12, 1)
                matrix.setTranslationFromFloats(x, block.height + 0.56, z)
                pathMatrices.push(matrix)
                pathUvs.push((block.beigeStonePath ? MaterialEnum1.ROCK1_BEIGE : MaterialEnum1.ROCK1).uv)
            }))
        }
        if (paths) {
            updateWorldInstanceBuffers(paths, pathMatrices, pathUvs)
            paths.setEnabled(pathMatrices.length > 0)
        }
        const localTransitions = localBoundaries ? findTerrainTransitions(map, (cover, substrate) => {
            const coverGrass = grassTransitions.get(cover)
            const substrateGrass = grassTransitions.get(substrate)
            if (cover === SNOW_DIRT) return substrateGrass?.snow
                ?? (substrate === ROCK ? snowRockTransition : substrate === DIRT ? snowDirtTransition
                    : substrate === MUDDY_DIRT ? snowTransition : undefined)
            if (coverGrass) return substrate === MUDDY_DIRT ? coverGrass.mud
                : substrate === ROCK ? coverGrass.rock : substrate === DIRT ? coverGrass.dirt : undefined
            if (cover === MUDDY_DIRT) return substrate === ROCK ? mudRockTransition : substrate === DIRT ? mudDirtTransition : undefined
            return cover === DIRT && substrate === ROCK ? dirtRockTransition : undefined
        }) : undefined
        const pondCover = shoreSurface >= 100 && shoreSurface < 200 ? SNOW_DIRT : shoreSurface
        const pondTransition = pondTransitions.get(pondCover)
        const withRock = snowOnRock || !!rockPartner
        const soilRockWalls = rockPartner === DIRT || rockPartner === MUDDY_DIRT
        const snowGrass = isGrass(snowPartner)
        const grass = grassTransitions.get(grassType)!
        const transitionMesh = rockPartner === MUDDY_DIRT ? mudRockTransition : isGrass(rockPartner) ? grass.rock
            : rockPartner === DIRT ? dirtRockTransition : snowOnRock ? snowRockTransition : snowGrass ? grass.snow
                : snowPartner === DIRT ? snowDirtTransition : snow ? snowTransition : dirtPartner === MUDDY_DIRT ? mudDirtTransition
                    : isGrass(dirtPartner) ? grass.dirt : grass.mud
        const batches = new Map<Mesh, {geometry: TerrainPreviewBatch, surfaceData: number[], wallData: number[], boundaryData: number[]}>()
        const batchFor = (mesh: Mesh) => {
            let batch = batches.get(mesh)
            if (!batch) {
                batch = {geometry: new TerrainPreviewBatch(), surfaceData: [], wallData: [], boundaryData: []}
                batches.set(mesh, batch)
            }
            return batch
        }
        // 0 is bare dirt, 1 is the cover, 2 follows the horizontal blend, 3 is winter grass beside snow.
        const wallCoverAt = (x: number, z: number, mesh: Mesh) => {
            if (transitionTiles?.[x][z]) return 2
            const block = map[x][z]
            if (snow && block.snowed) return 1
            if (rockPartner) return block.type === rockPartner ? 1 : 0
            if (dirtPartner) return block.type === dirtPartner ? 1 : 0
            if (isGrass(block.type) && !block.snowed) {
                return mesh === grass.snow || mesh === grass.snowOnDirt ? 3 : snow ? 0 : 1
            }
            return 0
        }
        const surfaces = geometry.render(map, ({x, z, lowerX, lowerZ, topY, bottomY}, triangles) => {
            const type = map[x][z].type
            const isRock = type === ROCK
            if (localBoundaries) {
                const upper = map[x][z]
                const lower = map[lowerX][lowerZ]
                const snowAtEdge = upper.snowed || lower.snowed
                const dirtBase = type === DIRT
                const grassEdge = grassTransitions.get(upper.type) ?? grassTransitions.get(lower.type)
                const mesh = snowAtEdge
                    ? (isRock ? snowRockTransition : grassEdge ? (dirtBase ? grassEdge.snowOnDirt : grassEdge.snow)
                        : dirtBase ? snowDirtTransition : snowTransition)
                    : isRock ? grassEdge?.rock : dirtBase ? grassEdge?.dirt : grassEdge?.mud
                if (!mesh || (topY === undefined && bottomY === undefined)) return
                const fringeAt = (block: MapBlock) => {
                    if (block.stonePath || block.beigeStonePath) return 0
                    const surface = terrainSurface(block)
                    return surface === SNOW_DIRT ? 1 : !isGrass(surface) ? 0
                        : !snowAtEdge ? 1 : (mesh === grassEdge?.snow || mesh === grassEdge?.snowOnDirt) ? 3 : 0
                }
                const top = topY === undefined ? 0 : fringeAt(upper)
                const foot = bottomY === undefined ? 0 : fringeAt(lower)
                if (!top && !foot) return
                const batch = batchFor(mesh)
                for (let i = 0; i < triangles; i++) {
                    batch.surfaceData.push(x, z, 0, 0)
                    batch.wallData.push(topY ?? 0, bottomY ?? 0, top, foot)
                    batch.boundaryData.push(0, 0, 0, 0)
                }
                return batch.geometry
            }
            if (soilRockWalls) {
                if ((!isRock && type !== rockPartner) || Math.abs(x - demo!.boundaries[z]) > TERRAIN_TRANSITION_REACH) return
                const batch = batchFor(transitionMesh)
                for (let i = 0; i < triangles; i++) {
                    batch.surfaceData.push(x, z, 0, isRock ? 0 : 1)
                    batch.wallData.push(0, 0, 1, 0)
                }
                return batch.geometry
            }
            if (snowRockOnSoil && (isRock || type === snowPartner) && Math.abs(x - demo!.boundaries[z]) <= TERRAIN_TRANSITION_REACH) {
                const mesh = snowPartner === DIRT ? snowRockDirtWalls : snowRockMuddyWalls
                const topCover = topY === undefined ? 0 : wallCoverAt(x, z, mesh)
                const bottomCover = bottomY === undefined ? 0 : wallCoverAt(lowerX, lowerZ, mesh)
                const batch = batchFor(mesh)
                for (let i = 0; i < triangles; i++) {
                    batch.surfaceData.push(x, z, 0, isRock ? 1 : 0)
                    batch.wallData.push(topY ?? 0, bottomY ?? 0, topCover, bottomCover)
                }
                return batch.geometry
            }
            if (topY === undefined && bottomY === undefined) return
            if (!snow && isRock !== withRock) return
            if (!snow && dirtPartner && type !== DIRT) return
            // Match the wall's own atlas even when the horizontal snow boundary uses a different pair.
            const wallGrass = grassTransitions.get(type) ?? grassTransitions.get(map[lowerX][lowerZ].type)
            const mesh = snow ? (isRock ? snowRockTransition
                : snowGrass ? (type === DIRT ? grass.snowOnDirt : grass.snow)
                    : type === DIRT ? snowDirtTransition : snowTransition)
                : !transitionTiles && wallGrass ? wallGrass.mud : transitionMesh
            const topCover = topY === undefined ? 0 : wallCoverAt(x, z, mesh)
            const bottomCover = bottomY === undefined ? 0 : wallCoverAt(lowerX, lowerZ, mesh)
            if (!topCover && !bottomCover) return
            const batch = batchFor(mesh)
            for (let i = 0; i < triangles; i++) {
                batch.surfaceData.push(x, z, 0, 0)
                batch.wallData.push(topY ?? 0, bottomY ?? 0, topCover, bottomCover)
            }
            return batch.geometry
        }, includeTile, originX, originZ, submit, !!demo)
        const islandMasks = transitionTiles || localTransitions ? grassIslandMasks(map) : undefined
        const takeTile = (type: number, cover?: boolean): TerrainAtlasTileFilter => {
            return (matrix, uv, x, z, roof, wetCorners, floor) => {
                const localTransition = localTransitions?.[x]?.[z]
                const bank = !localBoundaries && !!demo?.isBank(x, z)
                const pondTile = !localBoundaries && !!demo && pondTransition && (type === MUDDY_DIRT ? bank
                    : type === pondCover && map[x][z].type !== WATER_BLOCK_TYPE && map[x][z].height === 0
                        && touchesTile(x, z, demo.isBank))
                if (!localTransition && !pondTile && (cover === undefined || !transitionTiles?.[x][z])) return false
                const batch = batchFor(localTransition?.material ?? (pondTile ? pondTransition : transitionMesh))
                const first = batch.geometry.count
                batch.geometry.tile = x * surfaces.stride + z
                const options = {roundDirtEdges: !!pondTile || !snowGrass, wetCorners}
                addTerrainPreviewRoof(batch.geometry, matrix, uv, roof, options)
                if (floor) addTerrainPreviewRoof(batch.geometry, matrix, uv, floor, {...options, mirrorAtTileEdge: true})
                const angle = Math.atan2(matrix.m[2], matrix.m[0])
                // The low bit identifies the placed material, followed by four corner flags and the bank bit.
                const placedCover = pondTile ? (pondCover === ROCK || pondCover === DIRT ? bank : !bank) : localTransition?.cover ?? cover
                const flags = ((islandMasks?.[x][z] ?? 0) << 1) | (placedCover ? 1 : 0) | (pondTile ? POND_BANK_FLAG : 0)
                for (let i = first; i < batch.geometry.count; i++) {
                    batch.surfaceData.push(x, z, angle, flags)
                    batch.wallData.push(0, 0, 0, 0)
                    if (localTransition) batch.boundaryData.push(...localTransition.field)
                }
                return true
            }
        }
        dirtAtlas.render(surfaces, takeTile(MUDDY_DIRT, rockPartner === MUDDY_DIRT || dirtPartner === MUDDY_DIRT ? true
            : snowGrass || withRock || dirtPartner || snowPartner === DIRT ? undefined : false), surfaces.walls, submit)
        dryDirtAtlas.render(surfaces, takeTile(DIRT, rockPartner === DIRT ? true
            : dirtPartner || snowPartner === DIRT ? false : undefined), surfaces.dirtWalls, submit)
        for (const {type, atlas} of grassAtlases) {
            atlas.render(surfaces, takeTile(type, type !== grassType ? undefined : snowGrass ? false
                : rockPartner === type || (!withRock && !snow) ? true : undefined), undefined, submit)
        }
        snowAtlas.render(surfaces, takeTile(SNOW_DIRT, snow ? true : undefined), undefined, submit)
        rockAtlas.render(surfaces, takeTile(ROCK, withRock ? false : undefined), surfaces.rockWalls, submit)
        for (const mesh of transitionMeshes) {
            const batch = batches.get(mesh)
            if (!batch?.geometry.count) {
                if (!submit) mesh.setEnabled(false)
                continue
            }
            const attributes = [
                {kind: 'terrainSurface', stride: 4, values: batch.surfaceData},
                {kind: 'terrainWallContact', stride: 4, values: batch.wallData},
                {kind: 'terrainBoundaryCorners', stride: 4,
                    values: localBoundaries ? batch.boundaryData : new Array<number>(batch.surfaceData.length).fill(0)},
            ]
            if (submit) submit(mesh, batch.geometry, [...batch.geometry.attributes(true, wetTransitions.has(mesh)), ...attributes])
            else {
                for (const {kind, stride, values} of attributes) mesh.thinInstanceSetBuffer(kind, new Float32Array(values), stride)
                batch.geometry.apply(mesh, true, wetTransitions.has(mesh))
            }
        }
    }
    return {render, meshes}
}
