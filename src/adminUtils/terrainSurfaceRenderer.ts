import type { Mesh, Scene, TransformNode, Vector3 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import type { StepCoverage } from '@/babylon/world/terrainStepField'
import type { MapBlock } from '@/data/worldDataManager'
import { visitBakedTerrainTransitions } from '@/babylon/world/terrainRenderData'
import type { TerrainRenderData } from '@/babylon/world/terrainRenderData'
import { findTerrainTransitions, hasTerrainTransition, terrainSurface } from '@/babylon/world/terrainTransitionField'
import { Builder } from '@/babylon/builder'
import { TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import { configureTerrainNoiseTexture } from '@/babylon/world/terrainSurfaceShader'
import { Settings } from '@/settings/settings'
import { createDirtAtlas, createRockAtlas, createSnowAtlas, createTerrainAtlasPreview, createTerrainPreviewPlane, muddyDirtPatterns, terrainCoverPatterns } from './terrainAtlasPreview'
import type { TerrainAtlasTileFilter } from './terrainAtlasPreview'
import { addTerrainPreviewRoof, configureTerrainEdgeLighting, configureMuddyDirtWetness, configureSnowmelt, configureSnowGlints, configureTerrainPreviewBatch, TerrainPreviewBatch } from './terrainPreviewBatch'
import type { SubmitTerrainBatch } from './terrainPreviewBatch'
import { PAVING_SNOW_ATTRIBUTE, PAVING_SNOW_FLAG_SHIFT } from './terrainPreviewBatch'
import { createTerrainPreviewGeometry } from './terrainPreviewGeometry'
import { createTerrainPreviewWater } from './terrainPreviewWater'
import { createTerrainTransitionMaterial, POND_BANK_FLAG, TERRAIN_TRANSITION_REACH } from './terrainTransitionMaterial'
import { terrainTextureUrls } from '@/babylon/world/terrainTextureUrls'

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
    includeTile?: (x: number, z: number) => boolean
    originX?: number
    originZ?: number
    submit?: SubmitTerrainBatch
    compiled?: TerrainRenderData
    compiledRegion?: {x: number, z: number}
}

type TerrainDemo = {map: MapBlock[][], center: number, boundaries: number[], isBank: (x: number, z: number) => boolean}

export function createTerrainSurfaceRenderer(scene: Scene, parent: TransformNode, transitionBoundary: Vector3, demo?: TerrainDemo,
    renderPavingSnow = true) {
    const wetness = !!demo || Settings.isDetalLevelHigh()
    const snowGlints = !!demo || !Settings.isDetalLevelLow()
    // Keep one noise mode across terrain patches and transitions. Reserve six maps plus the marks/shadow mask.
    const terrainSamplers = 7
    const lowDetailTransitions = !demo && Settings.isDetalLevelLow()
    const simplifiedWallFringe = !demo && (Settings.isDetalLevelLow() || Settings.isDetailLevelMedium())
    const plane = Builder.createHorizontalPlane(scene, parent, 1, 0)
    plane.setEnabled(false)
    plane.receiveShadows = Settings.isShadowsEnabled()
    const geometry = createTerrainPreviewGeometry([MUDDY_DIRT, DIRT, ...GRASS_TYPES, SNOW_DIRT, ROCK])
    const pond = demo && createTerrainPreviewWater(plane, demo.map, demo.isBank, demo.center)
    const dirtAtlas = createDirtAtlas(plane, 'adminUtilsMuddyDirt', true, wetness)
    pond?.applyShoreWetness(dirtAtlas.material)
    const dryDirtAtlas = createDirtAtlas(plane, 'adminUtilsDirt', false)
    const grassAtlases = GRASS_TYPES.map(type => {
        const name = type === GRASS ? 'Grass' : 'WinterGrass'
        const atlas = createTerrainAtlasPreview(plane, type === GRASS ? 'adminUtilsGrassTerrain' : 'adminUtilsWinterGrass', {
            type, colorUrl: type === GRASS ? terrainTextureUrls.grass : terrainTextureUrls.winterGrass,
            normal: {url: terrainTextureUrls.winterGrassNormal, strength: 0.75}, patterns: terrainCoverPatterns,
        })
        return {type, name, atlas}
    })
    const grassMaterials = new Set(grassAtlases.map(({atlas}) => atlas.material))
    const snowAtlas = createSnowAtlas(plane, 'adminUtilsSnowDirt')
    configureSnowGlints(snowAtlas.material, undefined, renderPavingSnow, snowGlints)
    const rockAtlas = createRockAtlas(plane, 'adminUtilsRock')
    if (!demo) {
        for (const {material} of [dirtAtlas, dryDirtAtlas, rockAtlas]) configureTerrainNoiseTexture(material, terrainSamplers)
        if (renderPavingSnow || snowGlints) configureTerrainNoiseTexture(snowAtlas.material, terrainSamplers)
    }
    const wetTransitions = new Set<Mesh>()
    const snowTransitions = new Set<Mesh>()
    const stepMaterials = new Map<PBRCustomMaterial, StepCoverage>([
        [snowAtlas.material, {snow: 'snowGlintCoverage'}],
        [dirtAtlas.material, {soil: '1.0'}],
        [dryDirtAtlas.material, {soil: '1.0'}],
    ])
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
            blendRockWalls ? rockAtlas.material : undefined, cover === snowAtlas.material, grassMaterials.has(cover),
            lowDetailTransitions, simplifiedWallFringe)
        configureTerrainPreviewBatch(mesh, material, false)
        configureTerrainEdgeLighting(material, mudCover || soilRockWalls ? 'vec2(1.0)' : 'dirtCoverage', withRock && !mudCover)
        if (wetness && (mudCover || withDirt || (withGrass && wallSoil === dirtAtlas.material))) {
            configureMuddyDirtWetness(material, mudCover ? 'cover' : withGrass ? 'walls' : 'mixed',
                blendRockWalls ? '(1.0 - wallRockWeight)' : undefined)
            wetTransitions.add(mesh)
        }
        const snowCover = cover === snowAtlas.material
        if (snowCover) {
            if (wetness) configureSnowmelt(material, withGrass)
            configureSnowGlints(material, withGrass ? 'grass' : 'standard', renderPavingSnow, snowGlints)
            if (renderPavingSnow) snowTransitions.add(mesh)
        }
        const soilCover = mudCover || dryCover
        const soilSubstrate = withDirt || drySubstrate
        if (snowCover || soilCover || soilSubstrate) {
            stepMaterials.set(material, {
                snow: snowCover ? 'snowGlintCoverage' : undefined,
                soil: soilCover || soilSubstrate
                    ? `(wall ? 0.0 : ${soilCover ? soilSubstrate ? '1.0' : 'grassWeight' : '1.0 - grassWeight'})`
                    : undefined,
            })
        }
        if (atPond) {
            pond?.applyShoreWetness(material, mudCover ? 'grassWeight' : '(1.0 - grassWeight)')
        }
        if (!demo) configureTerrainNoiseTexture(material, terrainSamplers)
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
    const meshes = [dirtAtlas.mesh, dryDirtAtlas.mesh, snowAtlas.mesh, rockAtlas.mesh,
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
            includeTile, originX = 0, originZ = 0, submit, compiled, compiledRegion} = options
        pond?.mesh.setEnabled(!localBoundaries)
        if (!localBoundaries) pond?.setLevel(map)
        const materialFor = (cover: number, substrate: number) => {
            if (!hasTerrainTransition(cover, substrate)) return undefined
            const coverGrass = grassTransitions.get(cover)
            const substrateGrass = grassTransitions.get(substrate)
            if (cover === SNOW_DIRT) return substrateGrass?.snow
                ?? (substrate === ROCK ? snowRockTransition : substrate === DIRT ? snowDirtTransition
                    : substrate === MUDDY_DIRT ? snowTransition : undefined)
            if (coverGrass) return substrate === MUDDY_DIRT ? coverGrass.mud
                : substrate === ROCK ? coverGrass.rock : substrate === DIRT ? coverGrass.dirt : undefined
            if (cover === MUDDY_DIRT) return substrate === ROCK ? mudRockTransition : substrate === DIRT ? mudDirtTransition : undefined
            return cover === DIRT && substrate === ROCK ? dirtRockTransition : undefined
        }
        let localTransitions: ReturnType<typeof findTerrainTransitions<Mesh>> | undefined
        if (localBoundaries) {
            const hasWater = map.some(row => row.some(tile => tile.type === WATER_BLOCK_TYPE))
            // Let the neighboring ground material carry across the rim onto the dirt bed.
            const read = !hasWater && compiled && compiledRegion && visitBakedTerrainTransitions(compiled, compiledRegion.x, compiledRegion.z,
                (worldX, worldZ, coverType, substrateType, field, snowmeltOnly) => {
                    if (snowmeltOnly && !wetness) return
                    const x = worldX - originX, z = worldZ - originZ
                    const material = materialFor(coverType, substrateType)
                    if (!material || !map[x]?.[z]) return
                    localTransitions ??= map.map(() => [])
                    localTransitions[x][z] = {cover: terrainSurface(map[x][z]) === coverType, coverType, substrateType, material, field, snowmeltOnly}
                })
            if (!read) localTransitions = findTerrainTransitions(map, materialFor, wetness,
                tile => tile.type === WATER_BLOCK_TYPE ? MUDDY_DIRT : terrainSurface(tile))
        }
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
        const batches = new Map<Mesh, {geometry: TerrainPreviewBatch, surfaceData: number[], wallData: number[],
            boundaryData: number[], footBoundaryData: number[]}>()
        const batchFor = (mesh: Mesh) => {
            let batch = batches.get(mesh)
            if (!batch) {
                batch = {geometry: new TerrainPreviewBatch(), surfaceData: [], wallData: [], boundaryData: [], footBoundaryData: []}
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
                const upperField = localTransitions?.[x][z]
                const lowerField = localTransitions?.[lowerX][lowerZ]
                const topTransition = upperField?.snowmeltOnly ? undefined : upperField
                const footTransition = lowerField?.snowmeltOnly ? undefined : lowerField
                const muddyRockFoot = isRock && bottomY !== undefined && lower.type === MUDDY_DIRT
                    && !lower.stonePath && !lower.beigeStonePath && (!lower.snowed || footTransition?.material === snowTransition)
                const snowAtEdge = (topY !== undefined && (upper.snowed || topTransition?.coverType === SNOW_DIRT))
                    || (bottomY !== undefined && (lower.snowed || footTransition?.coverType === SNOW_DIRT))
                const dirtBase = type === DIRT
                const grassEdge = grassTransitions.get(upper.type) ?? grassTransitions.get(lower.type)
                const exposedGrass = isGrass(terrainSurface(upper)) || isGrass(terrainSurface(lower))
                const soilSnow = isRock ? snowRockTransition : dirtBase || isGrass(type) ? snowDirtTransition : snowTransition
                const mesh = muddyRockFoot ? snowRockMuddyWalls : snowAtEdge
                    ? (isRock || !grassEdge || !exposedGrass || topTransition?.material === soilSnow || footTransition?.material === soilSnow
                        ? soilSnow : dirtBase ? grassEdge.snowOnDirt : grassEdge.snow)
                    : isRock ? grassEdge?.rock : dirtBase ? grassEdge?.dirt : grassEdge?.mud
                if (!mesh || (topY === undefined && bottomY === undefined)) return
                // Local snow uses the terrace field (4) or continues a solid cover (5).
                const fringeAt = (block: MapBlock, transition: typeof topTransition) => {
                    if (block.stonePath || block.beigeStonePath) return 0
                    if (transition?.coverType === SNOW_DIRT) {
                        // Only continue grass when the terrace and wall share that substrate.
                        return mesh === grassEdge?.snow || mesh === grassEdge?.snowOnDirt
                            ? transition.material === grassEdge.snow ? 4 : 6 : 4
                    }
                    const surface = terrainSurface(block)
                    return surface === SNOW_DIRT ? 5 : !isGrass(surface) ? 0
                        : !snowAtEdge ? 1 : (mesh === grassEdge?.snow || mesh === grassEdge?.snowOnDirt) ? 3 : 0
                }
                const top = topY === undefined ? 0 : fringeAt(upper, topTransition)
                // Mud is a separate contact at the base of the rock and can continue emerging snow there.
                const foot = muddyRockFoot && footTransition?.coverType !== SNOW_DIRT ? 7
                    : bottomY === undefined ? 0 : fringeAt(lower, footTransition)
                if (!top && !foot) return
                const batch = batchFor(mesh)
                const angle = Math.atan2(lowerZ - z, lowerX - x)
                for (let i = 0; i < triangles; i++) {
                    batch.surfaceData.push(x, z, angle, 0)
                    batch.wallData.push(topY ?? 0, bottomY ?? 0, top, foot)
                    batch.boundaryData.push(...(topTransition?.field ?? [0, 0, 0, 0]))
                    batch.footBoundaryData.push(...(footTransition?.field ?? [0, 0, 0, 0]))
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
        }, includeTile, originX, originZ, !!demo, localBoundaries, compiled)
        const islandMasks = transitionTiles || localTransitions ? grassIslandMasks(map) : undefined
        const pavingAt = (x: number, z: number) => {
            const tile = map[x]?.[z]
            if (tile && tile.type > 0 && tile.type < WATER_BLOCK_TYPE && (tile.stonePath || tile.beigeStonePath)) return tile
        }
        const canMergeTile = (x: number, z: number) => !pavingAt(x, z)
        const pavingFlags = (x: number, z: number) => {
            const tile = pavingAt(x, z)
            if (!tile) return 0
            const paved = (dx: number, dz: number) => pavingAt(x + dx, z + dz)?.height === tile.height
            return 16 | (paved(-1, 0) ? 0 : 1) | (paved(1, 0) ? 0 : 2)
                | (paved(0, -1) ? 0 : 4) | (paved(0, 1) ? 0 : 8)
                | (paved(-1, -1) ? 0 : 32) | (paved(1, -1) ? 0 : 64)
                | (paved(-1, 1) ? 0 : 128) | (paved(1, 1) ? 0 : 256)
        }
        const takeTile = (type: number, cover?: boolean): TerrainAtlasTileFilter => {
            return (matrix, uv, x, z, roof, wetCorners, floor) => {
                const localTransition = localTransitions?.[x]?.[z]
                const bank = !localBoundaries && !!demo?.isBank(x, z)
                const pondTile = !localBoundaries && !!demo && pondTransition && (type === MUDDY_DIRT ? bank
                    : type === pondCover && map[x][z].type !== WATER_BLOCK_TYPE && map[x][z].height === 0
                        && touchesTile(x, z, demo.isBank))
                if (!localTransition && !pondTile && (cover === undefined || !transitionTiles?.[x][z])) return false
                const mesh = localTransition?.material ?? (pondTile ? pondTransition : transitionMesh)
                const batch = batchFor(mesh)
                const first = batch.geometry.count
                batch.geometry.tile = x * surfaces.stride + z
                const options = {roundDirtEdges: !!pondTile || !snowGrass, wetCorners}
                addTerrainPreviewRoof(batch.geometry, matrix, uv, roof, options)
                if (floor) addTerrainPreviewRoof(batch.geometry, matrix, uv, floor, {...options, mirrorAtTileEdge: true})
                const angle = Math.atan2(matrix.m[2], matrix.m[0])
                // Material, four island corners, the pond bank and the paved snow edges.
                const placedCover = pondTile ? (pondCover === ROCK || pondCover === DIRT ? bank : !bank)
                    : localTransition?.cover ?? cover
                const paving = snowTransitions.has(mesh) ? pavingFlags(x, z) * PAVING_SNOW_FLAG_SHIFT : 0
                const flags = ((islandMasks?.[x][z] ?? 0) << 1) | (placedCover ? 1 : 0) | (pondTile ? POND_BANK_FLAG : 0) | paving
                for (let i = first; i < batch.geometry.count; i++) {
                    batch.surfaceData.push(x, z, angle, flags)
                    batch.wallData.push(0, 0, 0, 0)
                    if (localTransition) {
                        batch.boundaryData.push(...localTransition.field)
                        batch.footBoundaryData.push(0, 0, 0, 0)
                    }
                }
                return true
            }
        }
        dirtAtlas.render(surfaces, takeTile(MUDDY_DIRT, rockPartner === MUDDY_DIRT || dirtPartner === MUDDY_DIRT ? true
            : snowGrass || withRock || dirtPartner || snowPartner === DIRT ? undefined : false), surfaces.walls, submit, canMergeTile)
        dryDirtAtlas.render(surfaces, takeTile(DIRT, rockPartner === DIRT ? true
            : dirtPartner || snowPartner === DIRT ? false : undefined), surfaces.dirtWalls, submit, canMergeTile)
        for (const {type, atlas} of grassAtlases) {
            atlas.render(surfaces, takeTile(type, type !== grassType ? undefined : snowGrass ? false
                : rockPartner === type || (!withRock && !snow) ? true : undefined), undefined, submit, canMergeTile)
        }
        snowAtlas.render(surfaces, takeTile(SNOW_DIRT, snow ? true : undefined), undefined, renderPavingSnow ? (mesh, batch, attributes) => {
            const values: number[] = []
            batch.forEachInstance(tile => {
                const x = Math.floor(tile / surfaces.stride), z = tile % surfaces.stride
                values.push(x + originX, z + originZ, pavingFlags(x, z))
            })
            const paving = {kind: PAVING_SNOW_ATTRIBUTE, stride: 3, values}
            if (submit) submit(mesh, batch, [...attributes, paving])
            else {
                if (values.length) mesh.thinInstanceSetBuffer(paving.kind, new Float32Array(values), paving.stride)
                batch.apply(mesh)
            }
        } : submit, canMergeTile)
        rockAtlas.render(surfaces, takeTile(ROCK, withRock ? false : undefined), surfaces.rockWalls, submit, canMergeTile)
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
                {kind: 'terrainFootBoundaryCorners', stride: 4,
                    values: localBoundaries ? batch.footBoundaryData : new Array<number>(batch.surfaceData.length).fill(0)},
            ]
            if (submit) submit(mesh, batch.geometry, [...batch.geometry.attributes(true, wetTransitions.has(mesh)), ...attributes])
            else {
                for (const {kind, stride, values} of attributes) mesh.thinInstanceSetBuffer(kind, new Float32Array(values), stride)
                batch.geometry.apply(mesh, true, wetTransitions.has(mesh))
            }
        }
    }
    return {render, meshes, stepMaterials}
}
