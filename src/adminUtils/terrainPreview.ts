import { ArcRotateCamera, Mesh, Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import type { ArcRotateCameraPointersInput } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { Builder } from '@/babylon/builder'
import { TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { Renderer } from '@/babylon/scene/renderer'
import { FoliageManager } from '@/babylon/world/foliageManager'
import { SNOW_BLOCK_HEIGHT } from '@/babylon/world/beveledTerrainBlock'
import { WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import { MapBlock } from '@/data/worldDataManager'
import { Settings } from '@/settings/settings'
import { createTerrainAtlasPreview, createTerrainPreviewPlane, muddyDirtPatterns, terrainCoverPatterns } from './terrainAtlasPreview'
import type { TerrainAtlasTileFilter } from './terrainAtlasPreview'
import { addTerrainPreviewRoof, configureTerrainEdgeLighting, configureMuddyDirtWetness, configureSnowmelt, configureSnowGlints, configureTerrainPreviewBatch, TerrainPreviewBatch } from './terrainPreviewBatch'
import { createTerrainPreviewGeometry } from './terrainPreviewGeometry'
import { createTerrainPreviewWater } from './terrainPreviewWater'
import { createTerrainTransitionMaterial, terrainBoundaryOffset, POND_BANK_FLAG, TERRAIN_TRANSITION_REACH } from './terrainTransitionMaterial'
import { createMuddyDirtFoliageProfiles, createMuddyDirtFootFoliage } from './muddyDirtFoliage'
import { createWinterGrassFoliage, createWinterGrassFootTufts, rockPebbleOffset, snowFoliageOffset, styleTerrainFoliage } from './winterGrassFoliage'
import { insetTuftFromLedges } from './terrainFoliagePatches'
import { createRockWallLichen, rockFoliage, styleRockLichen } from './rockFoliage'
import muddyDirtColorUrl from './assets/muddy-dirt-atlas.png'
import dirtColorUrl from './assets/dirt-atlas.png'
import muddyDirtNormalUrl from './assets/muddy-dirt-normal-atlas.png'
import winterGrassColorUrl from './assets/winter-grass-atlas.png'
import winterGrassNormalUrl from './assets/winter-grass-normal-atlas.png'
import snowColorUrl from './assets/snow-atlas.png'
import snowNormalUrl from './assets/snow-normal-atlas.png'
import rockColorUrl from './assets/rock-atlas.png'
import rockNormalUrl from './assets/rock-normal-atlas.png'
import foliageAtlasUrl from './assets/muddy-dirt-foliage.png'
import foliageNormalAtlasUrl from './assets/muddy-dirt-foliage-normal.png'

const SIZE = 30
const MUDDY_DIRT = TerrainEnum1.TERRAIN_MUDDY_DIRT.index
const DIRT = TerrainEnum1.TERRAIN_DIRT.index
const GRASS = TerrainEnum1.TERRAIN_GRASS.index
const WINTER_GRASS = TerrainEnum1.TERRAIN_GRASS_WINTER.index
const SNOW_DIRT = TerrainEnum1.TERRAIN_SNOW_MUDDY_DIRT.index
const SNOW_DRY_DIRT = TerrainEnum1.TERRAIN_SNOW_DIRT.index
const SNOW_WINTER_GRASS = TerrainEnum1.TERRAIN_SNOW_GRASS_WINTER.index
const ROCK = TerrainEnum1.TERRAIN_ROCK.index
const SNOW_ROCK = TerrainEnum1.TERRAIN_SNOW_ROCK.index
const isPreviewSnow = (type: number) => type === SNOW_DIRT || type === SNOW_DRY_DIRT || type === SNOW_WINTER_GRASS || type === SNOW_ROCK
const CENTER = (SIZE - 1) / 2
const BOUNDARIES = Array.from({length: SIZE}, (_, z) => CENTER + terrainBoundaryOffset(z))
const ADJACENT_TILES = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
// Match the shader's corner order: -X/-Z, +X/-Z, -X/+Z, +X/+Z.
const ISLAND_CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const
const HILLS = [
    {x: 6, z: 8, radius: 6, height: 3},
    {x: 15, z: 20, radius: 7, height: 5},
    {x: 24, z: 9, radius: 5, height: 3},
]
const HEIGHTS = Array.from({length: SIZE}, (_, x) => Array.from({length: SIZE}, (_, z) =>
    Math.max(0, ...HILLS.map(hill => Math.round(hill.height * (1 - Math.hypot(x - hill.x, z - hill.z) / hill.radius))))))
// Inclusive X ranges for the pond's six rows in the clearing before the central hill.
const POND_START_Z = 17
const POND_ROWS = [[4, 6], [3, 7], [3, 8], [3, 8], [4, 8], [6, 7]] as const

function isPondTile(x: number, z: number) {
    const row = POND_ROWS[z - POND_START_Z]
    return row !== undefined && x >= row[0] && x <= row[1]
}

function touchesTile(x: number, z: number, includes: (x: number, z: number) => boolean) {
    return ADJACENT_TILES.some(([dx, dz]) => includes(x + dx, z + dz))
        || ISLAND_CORNERS.some(([dx, dz]) => includes(x + dx, z + dz))
}

function isPondBankTile(x: number, z: number) {
    return HEIGHTS[x]?.[z] === 0 && !isPondTile(x, z) && touchesTile(x, z, isPondTile)
}

function findTransitionTiles(map: MapBlock[][]) {
    const tiles = map.map(row => row.map(() => false))
    const queue: Array<[number, number]> = []
    const inBand = (x: number, z: number) => Math.abs(x - BOUNDARIES[z]) <= TERRAIN_TRANSITION_REACH && !isPondBankTile(x, z)
    const add = (x: number, z: number) => {
        tiles[x][z] = true
        queue.push([x, z])
    }
    // Start at actual same-height material contacts, including those along Z on a terrace.
    map.forEach((row, x) => row.forEach((block, z) => {
        if (!inBand(x, z) || block.type === WATER_BLOCK_TYPE) return
        if (ADJACENT_TILES.some(([dx, dz]) => {
            const neighbor = map[x + dx]?.[z + dz]
            return neighbor?.totalHeight === block.totalHeight && neighbor.type !== WATER_BLOCK_TYPE && !isPondBankTile(x + dx, z + dz)
                && (neighbor.type !== block.type || neighbor.snowed !== block.snowed)
        })) add(x, z)
    }))
    for (let i = 0; i < queue.length; i++) {
        const [x, z] = queue[i]
        const height = map[x][z].totalHeight
        for (const [dx, dz] of ADJACENT_TILES) {
            const nx = x + dx, nz = z + dz
            if (tiles[nx]?.[nz] === false && inBand(nx, nz) && map[nx][nz].totalHeight === height
                && map[nx][nz].type !== WATER_BLOCK_TYPE) add(nx, nz)
        }
    }
    return tiles
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

export function createTerrainPreview(
    scene: Scene,
    parent: TransformNode,
    assetCamera: ArcRotateCamera,
    ground: Mesh,
    setLighting: (active: boolean) => void,
) {
    const controls = document.createElement('section')
    controls.hidden = true
    controls.innerHTML = `
        <label class="admin-utils__field">Povrch A<select id="terrainPrimary"></select></label>
        <label class="admin-utils__field">Povrch B<select id="terrainSecondary"><option value="">Bez druhého povrchu</option></select></label>
        <div class="admin-utils__field"><label><input id="terrainFoliage" type="checkbox" checked> Zobrazit vegetaci</label></div>
        <button type="button">Vycentrovat pohled</button>`
    const primary = controls.querySelector<HTMLSelectElement>('#terrainPrimary')!
    const secondary = controls.querySelector<HTMLSelectElement>('#terrainSecondary')!
    const foliageToggle = controls.querySelector<HTMLInputElement>('#terrainFoliage')!
    for (const [name, entry] of Object.entries(TerrainEnum1)) {
        if (typeof entry === 'function' || (name.startsWith('TERRAIN_SNOW_') && !isPreviewSnow(entry.index))) continue
        const label = entry.index === SNOW_DIRT ? 'snow-muddy-dirt' : entry.index === SNOW_DRY_DIRT ? 'snow-dirt' : entry.index === SNOW_WINTER_GRASS ? 'snow-grass-winter'
            : entry.index === SNOW_ROCK ? 'snow-rock'
            : name.replace(/^TERRAIN_/, '').toLowerCase().replaceAll('_', ' ')
        primary.add(new Option(label, String(entry.index)))
        secondary.add(new Option(label, String(entry.index)))
    }
    primary.value = String(WINTER_GRASS)
    secondary.value = String(MUDDY_DIRT)

    const terrain = new TransformNode('adminUtilsTerrain', scene)
    terrain.parent = parent
    terrain.position.set(-CENTER, 0, -CENTER)
    terrain.setEnabled(false)

    const foliage = new TransformNode('adminUtilsTerrainFoliage', scene)
    foliage.parent = terrain
    foliage.setEnabled(foliageToggle.checked)
    foliageToggle.onchange = () => foliage.setEnabled(foliageToggle.checked)

    const {cameraPosition, cameraViewY} = Renderer.getCameraSetup()
    const target = new Vector3(0, cameraViewY, 0)
    const offsetAt = (percent: number) => cameraPosition.scale(percent / Settings.cameraDistance).subtract(target)
    const offset = offsetAt(90)
    const alpha = Math.atan2(offset.z, offset.x)
    const beta = Math.atan2(Math.hypot(offset.x, offset.z), offset.y)
    const radius = offset.length()
    const camera = new ArcRotateCamera('adminUtilsTerrainCamera', alpha, beta, radius, target.clone(), scene)
    camera.lowerAlphaLimit = camera.upperAlphaLimit = alpha
    camera.lowerBetaLimit = camera.upperBetaLimit = beta
    camera.lowerRadiusLimit = offsetAt(80).length()
    camera.upperRadiusLimit = offsetAt(100).length()
    camera.mapPanning = true
    camera.panningSensibility = 180
    camera.panningOriginTarget.copyFrom(target)
    camera.panningDistanceLimit = SIZE / Math.SQRT2
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput')
    const pointers = camera.inputs.attached.pointers as ArcRotateCameraPointersInput
    pointers.buttons = [2]

    const emptyMask = new Set<number>()
    const supportsFoliage = (block: MapBlock, x: number, z: number) => !block.snowed && !isPondBankTile(x, z)
        && (block.type === MUDDY_DIRT || block.type === WINTER_GRASS || block.type === ROCK)
    const transitionBoundary = new Vector2(CENTER, 0)
    let renderAtlases: (map: MapBlock[][], transitionTiles: boolean[][] | undefined,
                        snow: boolean, snowPartner: number, snowOnRock: boolean, rockPartner: number, dirtPartner: number, shoreSurface: number) => void
    let render: (() => void) | undefined
    const update = () => {
        const first = Number(primary.value)
        const second = Number(secondary.value)
        const snow = isPreviewSnow(first) || isPreviewSnow(second)
        const besideSnow = isPreviewSnow(first) ? second : isPreviewSnow(second) ? first : 0
        const snowPartner = besideSnow === WINTER_GRASS || besideSnow === MUDDY_DIRT || besideSnow === DIRT || besideSnow === ROCK ? besideSnow : 0
        const snowOnRock = snowPartner === ROCK || (!snowPartner && (first === SNOW_ROCK || second === SNOW_ROCK))
        const besideRock = first === ROCK ? second : second === ROCK ? first : 0
        const rockPartner = besideRock === MUDDY_DIRT || besideRock === DIRT || besideRock === WINTER_GRASS ? besideRock : 0
        const besideDirt = first === DIRT ? second : second === DIRT ? first : 0
        const dirtPartner = besideDirt === MUDDY_DIRT || besideDirt === WINTER_GRASS ? besideDirt : 0
        const hasTransitions = !!snowPartner || !!rockPartner || !!dirtPartner || (first === MUDDY_DIRT && second === WINTER_GRASS)
            || (first === WINTER_GRASS && second === MUDDY_DIRT)
        const coverFirst = snowPartner ? isPreviewSnow(first) : first === (rockPartner || dirtPartner || WINTER_GRASS)
        transitionBoundary.y = hasTransitions ? (coverFirst ? -1 : 1) : 0
        const map = HEIGHTS.map((row, x) => row.map((height, z) => {
            if (isPondTile(x, z)) {
                const block = new MapBlock(height, WATER_BLOCK_TYPE)
                block.computeData()
                return block
            }
            const boundary = BOUNDARIES[z]
            const surface = second && x > boundary ? second : first
            const bank = isPondBankTile(x, z)
            const block = new MapBlock(height, bank ? MUDDY_DIRT : surface % 100)
            block.snowed = !bank && surface >= 100 && surface < 1000
            block.setMinable(!bank && surface >= 2000 ? 'C' : !bank && surface >= 1000 ? 'M' : null)
            block.computeData()
            // Blend level surfaces in the preview while retaining a thin snow cap when shown alone.
            if (isPreviewSnow(surface) || (hasTransitions && surface === WINTER_GRASS)) {
                block.heightOffset = isPreviewSnow(surface) && !snowPartner ? SNOW_BLOCK_HEIGHT : 0
                block.totalHeight = block.walkHeight = height + block.heightOffset
            } else if (bank && (surface === GRASS || surface === WINTER_GRASS)) {
                block.heightOffset = 0.1
                block.totalHeight = block.walkHeight = height + block.heightOffset
            }
            return block
        }))
        const transitionTiles = hasTransitions ? findTransitionTiles(map) : undefined
        const firstRender = !render
        // Plain dirt and snowy winter grass share the muddy-dirt foliage profile.
        const foliageMap = map.map((row, x) => row.map((block, z) => {
            if (isPondBankTile(x, z)) return block
            const type = block.type === DIRT || (block.snowed && block.type === WINTER_GRASS) ? MUDDY_DIRT : block.type
            if (!block.snowed && type === block.type) return block
            return Object.assign(new MapBlock(block.height, type), block, {type, snowed: false})
        }))
        const profiles = createMuddyDirtFoliageProfiles(foliageMap, Lights.sunLight.direction)
        profiles.set(ROCK, rockFoliage)
        const muddyFoot = createMuddyDirtFootFoliage(foliageMap, Lights.sunLight.direction)
        const blendedDecals = [...muddyFoot.moss, ...createRockWallLichen(map)]
        const footTufts = [...createWinterGrassFootTufts(foliageMap), ...muddyFoot.tufts]
        profiles.set(WINTER_GRASS, createWinterGrassFoliage((x, z) => {
            const tileX = Math.round(x)
            const tileZ = Math.round(z)
            if (!transitionTiles?.[tileX][tileZ]) return 0
            const distance = Math.abs(x - CENTER - terrainBoundaryOffset(z))
            return Math.max(0, 1 - distance / TERRAIN_TRANSITION_REACH)
        }))
        render = () => {
            renderAtlases(map, transitionTiles, snow, snowPartner, snowOnRock, rockPartner, dirtPartner, first)
            FoliageManager.renderFoliageArea(foliageMap, emptyMask, emptyMask, supportsFoliage, {
                profiles,
                extraTuftPasses: 2,
                extraTufts: footTufts,
                adjustTuftPlacement: matrix => insetTuftFromLedges(foliageMap, matrix),
                groundDecals: muddyFoot.pebbles,
                blendedDecals,
                mapAtlasOffset: (uv, matrix, layer) => {
                    const block = map[Math.round(matrix.m[12])]?.[Math.round(matrix.m[14])]
                    if (block?.snowed) return snowFoliageOffset(uv, layer)
                    return block?.type === ROCK ? rockPebbleOffset(uv, matrix, layer) : uv
                },
            })
        }
        if (firstRender) {
            const plane = Builder.createHorizontalPlane(scene, terrain, 1, 0)
            plane.name = 'adminUtilsTerrainTops'
            plane.receiveShadows = Settings.isShadowsEnabled()
            const geometry = createTerrainPreviewGeometry(plane, [MUDDY_DIRT, DIRT, WINTER_GRASS, SNOW_DIRT, ROCK])
            const pond = createTerrainPreviewWater(plane, map, isPondBankTile, CENTER)
            const dirtAtlas = createTerrainAtlasPreview(plane, 'adminUtilsMuddyDirt', {
                type: MUDDY_DIRT, colorUrl: muddyDirtColorUrl,
                normal: {url: muddyDirtNormalUrl, strength: 4}, patterns: muddyDirtPatterns, roundDirtEdges: true, wetDirt: true,
            })
            pond.applyShoreWetness(dirtAtlas.material)
            const dryDirtAtlas = createTerrainAtlasPreview(plane, 'adminUtilsDirt', {
                type: DIRT, colorUrl: dirtColorUrl,
                normal: {url: muddyDirtNormalUrl, strength: 4}, patterns: muddyDirtPatterns, roundDirtEdges: true,
            })
            const grassAtlas = createTerrainAtlasPreview(plane, 'adminUtilsWinterGrass', {
                type: WINTER_GRASS, colorUrl: winterGrassColorUrl,
                normal: {url: winterGrassNormalUrl, strength: 0.75},
                patterns: terrainCoverPatterns,
            })
            const snowAtlas = createTerrainAtlasPreview(plane, 'adminUtilsSnowDirt', {
                type: SNOW_DIRT, colorUrl: snowColorUrl,
                normal: {url: snowNormalUrl, strength: 1}, patterns: terrainCoverPatterns, varyAdjacentPatches: true,
            })
            configureSnowGlints(snowAtlas.material)
            const rockAtlas = createTerrainAtlasPreview(plane, 'adminUtilsRock', {
                type: ROCK, colorUrl: rockColorUrl,
                normal: {url: rockNormalUrl, strength: 1},
                patterns: terrainCoverPatterns, varyAdjacentPatches: true, roundRockTop: true,
            })
            const wetTransitions = new Set<Mesh>()
            const createTransition = (name: string, cover: PBRCustomMaterial, substrate = dirtAtlas.material, wallSoil = dirtAtlas.material) => {
                const mesh = createTerrainPreviewPlane(plane, name)
                const withDirt = substrate === dirtAtlas.material
                const withGrass = substrate === grassAtlas.material
                const withRock = substrate === rockAtlas.material
                const mudCover = cover === dirtAtlas.material
                const dryCover = cover === dryDirtAtlas.material
                const drySubstrate = substrate === dryDirtAtlas.material
                const atPond = (withDirt && (cover === grassAtlas.material || cover === snowAtlas.material))
                    || (mudCover && (withRock || drySubstrate))
                const material = createTerrainTransitionMaterial(name, cover, substrate,
                    (mudCover || dryCover ? muddyDirtPatterns : terrainCoverPatterns)[0].origins[0],
                    (withDirt || drySubstrate ? muddyDirtPatterns : terrainCoverPatterns)[0].origins[0], transitionBoundary,
                    withGrass ? wallSoil : undefined, withRock, atPond ? {...pond, coverOnBank: mudCover} : undefined)
                configureTerrainPreviewBatch(mesh, material, false)
                configureTerrainEdgeLighting(material, mudCover ? 'vec2(1.0)' : 'dirtCoverage', withRock && !mudCover)
                if (mudCover || withDirt || (withGrass && wallSoil === dirtAtlas.material)) {
                    configureMuddyDirtWetness(material, mudCover ? 'cover' : withGrass ? 'walls' : 'mixed')
                    wetTransitions.add(mesh)
                }
                if (cover === snowAtlas.material) {
                    configureSnowmelt(material, withGrass)
                    configureSnowGlints(material, withGrass ? 'grass' : 'standard')
                }
                if (atPond) {
                    pond.applyShoreWetness(material, mudCover ? 'grassWeight' : '(1.0 - grassWeight)')
                }
                return mesh
            }
            const grassTransition = createTransition('adminUtilsWinterGrassMuddyDirt', grassAtlas.material)
            const snowTransition = createTransition('adminUtilsSnowMuddyDirt', snowAtlas.material)
            const snowGrassTransition = createTransition('adminUtilsSnowWinterGrass', snowAtlas.material, grassAtlas.material)
            const snowGrassDirtWalls = createTransition('adminUtilsSnowWinterGrassDirtWalls', snowAtlas.material, grassAtlas.material, dryDirtAtlas.material)
            const snowRockTransition = createTransition('adminUtilsSnowRock', snowAtlas.material, rockAtlas.material)
            const grassRockTransition = createTransition('adminUtilsWinterGrassRock', grassAtlas.material, rockAtlas.material)
            const mudRockTransition = createTransition('adminUtilsMuddyDirtRock', dirtAtlas.material, rockAtlas.material)
            const grassDirtTransition = createTransition('adminUtilsWinterGrassDirt', grassAtlas.material, dryDirtAtlas.material)
            const snowDirtTransition = createTransition('adminUtilsSnowDirtTransition', snowAtlas.material, dryDirtAtlas.material)
            const dirtRockTransition = createTransition('adminUtilsDirtRock', dryDirtAtlas.material, rockAtlas.material)
            const mudDirtTransition = createTransition('adminUtilsMuddyDirtDirt', dirtAtlas.material, dryDirtAtlas.material)
            const pondTransitions = new Map([
                [WINTER_GRASS, grassTransition], [DIRT, mudDirtTransition],
                [ROCK, mudRockTransition], [SNOW_DIRT, snowTransition],
            ])
            const transitionMeshes = [grassTransition, snowTransition, snowGrassTransition, snowGrassDirtWalls, snowRockTransition, grassRockTransition,
                mudRockTransition, grassDirtTransition, snowDirtTransition, dirtRockTransition, mudDirtTransition]
            for (const mesh of [plane, geometry.deposits, dirtAtlas.mesh, dryDirtAtlas.mesh, grassAtlas.mesh, snowAtlas.mesh, rockAtlas.mesh, ...transitionMeshes]) {
                Lights.addShadowCaster(mesh, false)
            }
            renderAtlases = (map, transitionTiles, snow, snowPartner, snowOnRock, rockPartner, dirtPartner, shoreSurface) => {
                pond.setLevel(map)
                const pondCover = isPreviewSnow(shoreSurface) ? SNOW_DIRT : shoreSurface
                const pondTransition = pondTransitions.get(pondCover)
                const withRock = snowOnRock || !!rockPartner
                const snowGrass = snowPartner === WINTER_GRASS
                const transitionMesh = rockPartner === MUDDY_DIRT ? mudRockTransition : rockPartner === WINTER_GRASS ? grassRockTransition
                    : rockPartner === DIRT ? dirtRockTransition : snowOnRock ? snowRockTransition : snowGrass ? snowGrassTransition
                        : snowPartner === DIRT ? snowDirtTransition : snow ? snowTransition : dirtPartner === MUDDY_DIRT ? mudDirtTransition
                            : dirtPartner === WINTER_GRASS ? grassDirtTransition : grassTransition
                const batches = new Map<Mesh, {geometry: TerrainPreviewBatch, surfaceData: number[], wallData: number[]}>()
                const batchFor = (mesh: Mesh) => {
                    let batch = batches.get(mesh)
                    if (!batch) {
                        batch = {geometry: new TerrainPreviewBatch(), surfaceData: [], wallData: []}
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
                    if (block.type === WINTER_GRASS && !block.snowed) {
                        return mesh === snowGrassTransition || mesh === snowGrassDirtWalls ? 3 : snow ? 0 : 1
                    }
                    return 0
                }
                const surfaces = geometry.render(map, ({x, z, lowerX, lowerZ, topY, bottomY}, triangles) => {
                    const type = map[x][z].type
                    const isRock = type === ROCK
                    if (!snow && isRock !== withRock) return
                    if (!snow && dirtPartner && type !== DIRT) return
                    // Match the wall's own atlas even when the horizontal snow boundary uses a different pair.
                    const mesh = snow ? (isRock ? snowRockTransition
                        : snowGrass ? (type === DIRT ? snowGrassDirtWalls : snowGrassTransition)
                            : type === DIRT ? snowDirtTransition : snowTransition) : transitionMesh
                    const topCover = topY === undefined ? 0 : wallCoverAt(x, z, mesh)
                    const bottomCover = bottomY === undefined ? 0 : wallCoverAt(lowerX, lowerZ, mesh)
                    if (!topCover && !bottomCover) return
                    const batch = batchFor(mesh)
                    for (let i = 0; i < triangles; i++) {
                        batch.surfaceData.push(x, z, 0, 0)
                        batch.wallData.push(topY ?? 0, bottomY ?? 0, topCover, bottomCover)
                    }
                    return batch.geometry
                })
                const islandMasks = transitionTiles ? grassIslandMasks(map) : undefined
                const takeTile = (type: number, cover?: boolean): TerrainAtlasTileFilter => {
                    return (matrix, uv, x, z, roof, wetCorners) => {
                        const bank = isPondBankTile(x, z)
                        const pondTile = pondTransition && (type === MUDDY_DIRT ? bank
                            : type === pondCover && map[x][z].type !== WATER_BLOCK_TYPE && map[x][z].height === 0
                                && touchesTile(x, z, isPondBankTile))
                        if (!pondTile && (cover === undefined || !transitionTiles?.[x][z])) return false
                        const batch = batchFor(pondTile ? pondTransition : transitionMesh)
                        const first = batch.geometry.count
                        addTerrainPreviewRoof(batch.geometry, matrix, uv, roof, {roundDirtEdges: !!pondTile || !snowGrass, wetCorners})
                        const angle = Math.atan2(matrix.m[2], matrix.m[0])
                        // The low bit identifies the placed material, followed by four corner flags and the bank bit.
                        const placedCover = pondTile ? (pondCover === ROCK || pondCover === DIRT ? bank : !bank) : cover
                        const flags = ((islandMasks?.[x][z] ?? 0) << 1) | (placedCover ? 1 : 0) | (pondTile ? POND_BANK_FLAG : 0)
                        for (let i = first; i < batch.geometry.count; i++) {
                            batch.surfaceData.push(x, z, angle, flags)
                            batch.wallData.push(0, 0, 0, 0)
                        }
                        return true
                    }
                }
                dirtAtlas.render(surfaces, takeTile(MUDDY_DIRT, rockPartner === MUDDY_DIRT || dirtPartner === MUDDY_DIRT ? true
                    : snowGrass || withRock || dirtPartner || snowPartner === DIRT ? undefined : false), surfaces.walls)
                dryDirtAtlas.render(surfaces, takeTile(DIRT, rockPartner === DIRT ? true
                    : dirtPartner || snowPartner === DIRT ? false : undefined), surfaces.dirtWalls)
                grassAtlas.render(surfaces, takeTile(WINTER_GRASS, snowGrass ? false
                    : rockPartner === WINTER_GRASS || (!withRock && !snow) ? true : undefined))
                snowAtlas.render(surfaces, takeTile(SNOW_DIRT, snow ? true : undefined))
                rockAtlas.render(surfaces, takeTile(ROCK, withRock ? false : undefined), surfaces.rockWalls)
                for (const mesh of transitionMeshes) {
                    const batch = batches.get(mesh)
                    if (!batch?.geometry.count) {
                        mesh.setEnabled(false)
                        continue
                    }
                    mesh.thinInstanceSetBuffer('terrainSurface', new Float32Array(batch.surfaceData), 4)
                    mesh.thinInstanceSetBuffer('terrainWallContact', new Float32Array(batch.wallData), 4)
                    batch.geometry.apply(mesh, true, wetTransitions.has(mesh))
                }
            }
            FoliageManager.initialize(scene, foliage, {
                atlasUrl: foliageAtlasUrl,
                atlasCellPixels: 64,
                blendedGround: true,
                groundNormals: {atlasUrl: foliageNormalAtlasUrl, opaqueStrength: 1.8, blendedStrength: 0.8},
            })
            const moss = FoliageManager.blendedGroundMesh!
            moss.receiveShadows = true
            const mossMaterial = moss.material as PBRCustomMaterial
            mossMaterial.albedoColor.set(0.82, 0.84, 0.81)
            mossMaterial.emissiveTexture = mossMaterial.albedoTexture
            mossMaterial.emissiveColor.set(0.08, 0.08, 0.08)
            styleRockLichen(mossMaterial)
            const groundFoliage = FoliageManager.groundMesh!
            groundFoliage.receiveShadows = true
            // Give the crossed billboards some fill on faces turned away from the sun.
            const foliageMaterial = FoliageManager.foliageMaterial!
            foliageMaterial.emissiveTexture = foliageMaterial.albedoTexture
            foliageMaterial.emissiveColor.set(0.34, 0.34, 0.34)
            styleTerrainFoliage(foliageMaterial, groundFoliage.material as typeof foliageMaterial)
        }
        render()
    }
    const resetCamera = () => {
        camera.target.copyFrom(target)
        camera.radius = radius
        camera.inertialPanningX = camera.inertialPanningY = camera.inertialRadiusOffset = 0
    }
    primary.onchange = update
    secondary.onchange = update
    controls.querySelector('button')!.onclick = resetCamera
    return {
        controls,
        setActive(active: boolean) {
            if (active === !controls.hidden) return
            controls.hidden = !active
            terrain.setEnabled(active)
            ground.setEnabled(!active)
            setLighting(active)
            if (active) {
                assetCamera.detachControl()
                resetCamera()
                scene.activeCamera = camera
                camera.attachControl(false, false, 2)
                if (!render) update()
            } else {
                camera.detachControl()
                scene.activeCamera = assetCamera
                assetCamera.attachControl(true)
            }
        },
    }
}
