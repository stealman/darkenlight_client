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
import { createWinterGrassFoliage, createGrassFootTufts, greenGrassFoliageOffset, rockPebbleOffset, snowFoliageOffset, styleTerrainFoliage } from './winterGrassFoliage'
import { createWaterEdgeTufts, insetTuftFromLedges } from './terrainFoliagePatches'
import { createRockWallLichen, rockFoliage, styleRockLichen } from './rockFoliage'
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
import foliageAtlasUrl from './assets/muddy-dirt-foliage.png'
import foliageNormalAtlasUrl from './assets/muddy-dirt-foliage-normal.png'

const TERRAIN_PREVIEW_STORAGE_KEY = 'darkenlight.adminUtils.terrainPreview'
const SIZE = 30
const MUDDY_DIRT = TerrainEnum1.TERRAIN_MUDDY_DIRT.index
const DIRT = TerrainEnum1.TERRAIN_DIRT.index
const GRASS = TerrainEnum1.TERRAIN_GRASS.index
const WINTER_GRASS = TerrainEnum1.TERRAIN_GRASS_WINTER.index
const GRASS_TYPES = [WINTER_GRASS, GRASS] as const
const isGrass = (type: number) => type === WINTER_GRASS || type === GRASS
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
        <label class="admin-utils__field"><span>Intenzita slunce <output for="terrainLightIntensity">100 %</output></span>
            <input id="terrainLightIntensity" type="range" min="0" max="200" value="100"></label>
        <div class="admin-utils__field"><label><input id="terrainFoliage" type="checkbox" checked> Zobrazit vegetaci</label></div>
        <button type="button">Vycentrovat pohled</button>`
    const primary = controls.querySelector<HTMLSelectElement>('#terrainPrimary')!
    const secondary = controls.querySelector<HTMLSelectElement>('#terrainSecondary')!
    const foliageToggle = controls.querySelector<HTMLInputElement>('#terrainFoliage')!
    const lightIntensity = controls.querySelector<HTMLInputElement>('#terrainLightIntensity')!
    const lightIntensityOutput = controls.querySelector<HTMLOutputElement>('output[for="terrainLightIntensity"]')!
    let baseSunIntensity = 0
    const updateLightIntensity = () => {
        const percent = lightIntensity.valueAsNumber
        lightIntensityOutput.value = `${percent} %`
        if (!controls.hidden) Lights.sunLight.intensity = baseSunIntensity * percent / 100
    }
    lightIntensity.oninput = updateLightIntensity
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
    try {
        const saved: {primary?: string, secondary?: string} | null = JSON.parse(localStorage.getItem(TERRAIN_PREVIEW_STORAGE_KEY) ?? 'null')
        const savedPrimary = saved?.primary
        const savedSecondary = saved?.secondary
        if (savedPrimary !== undefined && Array.from(primary.options).some(option => option.value === savedPrimary)) primary.value = savedPrimary
        if (savedSecondary !== undefined && Array.from(secondary.options).some(option => option.value === savedSecondary)) secondary.value = savedSecondary
    } catch { /* The preview also works without stored settings. */ }

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
        && (block.type === MUDDY_DIRT || isGrass(block.type) || block.type === ROCK)
    const transitionBoundary = new Vector2(CENTER, 0)
    let renderAtlases: (map: MapBlock[][], transitionTiles: boolean[][] | undefined,
                        snow: boolean, snowPartner: number, snowOnRock: boolean, rockPartner: number, dirtPartner: number,
                        shoreSurface: number, grassType: number, snowRockOnSoil: boolean) => void
    let render: (() => void) | undefined
    const update = () => {
        const first = Number(primary.value)
        const second = Number(secondary.value)
        const snow = isPreviewSnow(first) || isPreviewSnow(second)
        const besideSnow = isPreviewSnow(first) ? second : isPreviewSnow(second) ? first : 0
        const snowPartner = isGrass(besideSnow) || besideSnow === MUDDY_DIRT || besideSnow === DIRT || besideSnow === ROCK ? besideSnow : 0
        const snowOnRock = snowPartner === ROCK || (!snowPartner && (first === SNOW_ROCK || second === SNOW_ROCK))
        const snowRockOnSoil = (first === SNOW_ROCK || second === SNOW_ROCK) && (snowPartner === DIRT || snowPartner === MUDDY_DIRT)
        const besideRock = first === ROCK ? second : second === ROCK ? first : 0
        const rockPartner = besideRock === MUDDY_DIRT || besideRock === DIRT || isGrass(besideRock) ? besideRock : 0
        const besideDirt = first === DIRT ? second : second === DIRT ? first : 0
        const dirtPartner = besideDirt === MUDDY_DIRT || isGrass(besideDirt) ? besideDirt : 0
        const grassType = isGrass(first) ? first : isGrass(second) ? second : WINTER_GRASS
        const hasTransitions = !!snowPartner || !!rockPartner || !!dirtPartner || (first === MUDDY_DIRT && isGrass(second))
            || (isGrass(first) && second === MUDDY_DIRT)
        const coverFirst = snowPartner ? isPreviewSnow(first) : first === (rockPartner || dirtPartner || grassType)
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
            if (isPreviewSnow(surface) || (hasTransitions && isGrass(surface))) {
                block.heightOffset = isPreviewSnow(surface) && !snowPartner ? SNOW_BLOCK_HEIGHT : 0
                block.totalHeight = block.walkHeight = height + block.heightOffset
            } else if (bank && isGrass(surface)) {
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
            const type = block.type === DIRT || (block.snowed && isGrass(block.type)) ? MUDDY_DIRT : block.type
            if (!block.snowed && type === block.type) return block
            return Object.assign(new MapBlock(block.height, type), block, {type, snowed: false})
        }))
        const profiles = createMuddyDirtFoliageProfiles(foliageMap, Lights.sunLight.direction)
        profiles.set(ROCK, rockFoliage)
        const muddyFoot = createMuddyDirtFootFoliage(foliageMap, Lights.sunLight.direction)
        const blendedDecals = [...muddyFoot.moss, ...createRockWallLichen(map)]
        const footTufts = [...GRASS_TYPES.flatMap(type => createGrassFootTufts(foliageMap, type)), ...muddyFoot.tufts]
        const grassFoliage = createWinterGrassFoliage((x, z) => {
            const tileX = Math.round(x)
            const tileZ = Math.round(z)
            if (!transitionTiles?.[tileX][tileZ]) return 0
            const distance = Math.abs(x - CENTER - terrainBoundaryOffset(z))
            return Math.max(0, 1 - distance / TERRAIN_TRANSITION_REACH)
        })
        for (const type of GRASS_TYPES) profiles.set(type, grassFoliage)
        const shoreTufts = createWaterEdgeTufts(foliageMap, profiles)
        render = () => {
            renderAtlases(map, transitionTiles, snow, snowPartner, snowOnRock, rockPartner, dirtPartner, first, grassType, snowRockOnSoil)
            FoliageManager.renderFoliageArea(foliageMap, emptyMask, emptyMask, supportsFoliage, {
                profiles,
                extraTuftPasses: 2,
                extraTufts: [...footTufts, ...shoreTufts],
                adjustTuftPlacement: matrix => insetTuftFromLedges(foliageMap, matrix),
                groundDecals: muddyFoot.pebbles,
                blendedDecals,
                mapAtlasOffset: (uv, matrix, layer) => {
                    const block = map[Math.round(matrix.m[12])]?.[Math.round(matrix.m[14])]
                    if (block?.snowed) return snowFoliageOffset(uv, layer)
                    if (block?.type === GRASS) return greenGrassFoliageOffset(uv, layer)
                    return block?.type === ROCK ? rockPebbleOffset(uv, matrix, layer) : uv
                },
            })
        }
        if (firstRender) {
            const plane = Builder.createHorizontalPlane(scene, terrain, 1, 0)
            plane.name = 'adminUtilsTerrainTops'
            plane.receiveShadows = Settings.isShadowsEnabled()
            const geometry = createTerrainPreviewGeometry(plane, [MUDDY_DIRT, DIRT, ...GRASS_TYPES, SNOW_DIRT, ROCK])
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
                normal: {url: snowNormalUrl, strength: 1}, patterns: terrainCoverPatterns, varyAdjacentPatches: true,
            })
            configureSnowGlints(snowAtlas.material)
            const rockAtlas = createTerrainAtlasPreview(plane, 'adminUtilsRock', {
                type: ROCK, colorUrl: rockColorUrl,
                normal: {url: rockNormalUrl, strength: 1},
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
                const atPond = !blendRockWalls && ((withDirt && (grassMaterials.has(cover) || cover === snowAtlas.material))
                    || (mudCover && (withRock || drySubstrate)))
                const material = createTerrainTransitionMaterial(name, cover, substrate,
                    (mudCover || dryCover ? muddyDirtPatterns : terrainCoverPatterns)[0].origins[0],
                    (withDirt || drySubstrate ? muddyDirtPatterns : terrainCoverPatterns)[0].origins[0], transitionBoundary,
                    withGrass ? wallSoil : undefined, withRock, atPond ? {...pond, coverOnBank: mudCover} : undefined, soilRockWalls,
                    blendRockWalls ? rockAtlas.material : undefined)
                configureTerrainPreviewBatch(mesh, material, false)
                configureTerrainEdgeLighting(material, mudCover || soilRockWalls ? 'vec2(1.0)' : 'dirtCoverage', withRock && !mudCover)
                if (mudCover || withDirt || (withGrass && wallSoil === dirtAtlas.material)) {
                    configureMuddyDirtWetness(material, mudCover ? 'cover' : withGrass ? 'walls' : 'mixed',
                        blendRockWalls ? '(1.0 - wallRockWeight)' : undefined)
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
            for (const mesh of [plane, geometry.deposits, dirtAtlas.mesh, dryDirtAtlas.mesh, snowAtlas.mesh, rockAtlas.mesh,
                ...grassAtlases.map(({atlas}) => atlas.mesh), ...transitionMeshes]) {
                Lights.addShadowCaster(mesh, false)
            }
            renderAtlases = (map, transitionTiles, snow, snowPartner, snowOnRock, rockPartner, dirtPartner, shoreSurface, grassType, snowRockOnSoil) => {
                pond.setLevel(map)
                const pondCover = isPreviewSnow(shoreSurface) ? SNOW_DIRT : shoreSurface
                const pondTransition = pondTransitions.get(pondCover)
                const withRock = snowOnRock || !!rockPartner
                const soilRockWalls = rockPartner === DIRT || rockPartner === MUDDY_DIRT
                const snowGrass = isGrass(snowPartner)
                const grass = grassTransitions.get(grassType)!
                const transitionMesh = rockPartner === MUDDY_DIRT ? mudRockTransition : isGrass(rockPartner) ? grass.rock
                    : rockPartner === DIRT ? dirtRockTransition : snowOnRock ? snowRockTransition : snowGrass ? grass.snow
                        : snowPartner === DIRT ? snowDirtTransition : snow ? snowTransition : dirtPartner === MUDDY_DIRT ? mudDirtTransition
                            : isGrass(dirtPartner) ? grass.dirt : grass.mud
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
                    if (isGrass(block.type) && !block.snowed) {
                        return mesh === grass.snow || mesh === grass.snowOnDirt ? 3 : snow ? 0 : 1
                    }
                    return 0
                }
                const surfaces = geometry.render(map, ({x, z, lowerX, lowerZ, topY, bottomY}, triangles) => {
                    const type = map[x][z].type
                    const isRock = type === ROCK
                    if (soilRockWalls) {
                        if ((!isRock && type !== rockPartner) || Math.abs(x - BOUNDARIES[z]) > TERRAIN_TRANSITION_REACH) return
                        const batch = batchFor(transitionMesh)
                        for (let i = 0; i < triangles; i++) {
                            batch.surfaceData.push(x, z, 0, isRock ? 0 : 1)
                            batch.wallData.push(0, 0, 1, 0)
                        }
                        return batch.geometry
                    }
                    if (snowRockOnSoil && (isRock || type === snowPartner) && Math.abs(x - BOUNDARIES[z]) <= TERRAIN_TRANSITION_REACH) {
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
                })
                const islandMasks = transitionTiles ? grassIslandMasks(map) : undefined
                const takeTile = (type: number, cover?: boolean): TerrainAtlasTileFilter => {
                    return (matrix, uv, x, z, roof, wetCorners, floor) => {
                        const bank = isPondBankTile(x, z)
                        const pondTile = pondTransition && (type === MUDDY_DIRT ? bank
                            : type === pondCover && map[x][z].type !== WATER_BLOCK_TYPE && map[x][z].height === 0
                                && touchesTile(x, z, isPondBankTile))
                        if (!pondTile && (cover === undefined || !transitionTiles?.[x][z])) return false
                        const batch = batchFor(pondTile ? pondTransition : transitionMesh)
                        const first = batch.geometry.count
                        const options = {roundDirtEdges: !!pondTile || !snowGrass, wetCorners}
                        addTerrainPreviewRoof(batch.geometry, matrix, uv, roof, options)
                        if (floor) addTerrainPreviewRoof(batch.geometry, matrix, uv, floor, {...options, mirrorAtTileEdge: true})
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
                for (const {type, atlas} of grassAtlases) {
                    atlas.render(surfaces, takeTile(type, type !== grassType ? undefined : snowGrass ? false
                        : rockPartner === type || (!withRock && !snow) ? true : undefined))
                }
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
    const changeSurface = () => {
        try {
            localStorage.setItem(TERRAIN_PREVIEW_STORAGE_KEY, JSON.stringify({primary: primary.value, secondary: secondary.value}))
        } catch { /* Storage may be unavailable. */ }
        update()
    }
    primary.onchange = changeSurface
    secondary.onchange = changeSurface
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
                baseSunIntensity = Lights.sunLight.intensity
                updateLightIntensity()
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
