import { createTerrainFoliageRenderer } from "./terrainFoliageRenderer"
import { createTerrainSurfaceRenderer } from './terrainSurfaceRenderer'
import { ArcRotateCamera, Mesh, Scene, TransformNode, Vector3 } from '@babylonjs/core'
import type { ArcRotateCameraPointersInput } from '@babylonjs/core'
import { TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { Renderer } from '@/babylon/scene/renderer'
import { SNOW_BLOCK_HEIGHT } from '@/babylon/world/beveledTerrainBlock'
import { createOutdoorTerrain } from '@/babylon/world/outdoorTerrain'
import { createSnowCoverMask } from '@/babylon/world/snowCoverMask'
import { WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import { MapBlock } from '@/data/worldDataManager'
import { Settings } from '@/settings/settings'
import { LOCAL_TRANSITION_NOISE_PERIOD, terrainBoundaryOffset, TERRAIN_TRANSITION_REACH } from './terrainTransitionMaterial'
import { terrainWithoutSnow } from './terrainLocalTransitions'

const TERRAIN_PREVIEW_STORAGE_KEY = 'darkenlight.adminUtils.terrainPreview'
const SIZE = 30
const MUDDY_DIRT = TerrainEnum1.TERRAIN_MUDDY_DIRT.index
const DIRT = TerrainEnum1.TERRAIN_DIRT.index
const GRASS = TerrainEnum1.TERRAIN_GRASS.index
const WINTER_GRASS = TerrainEnum1.TERRAIN_GRASS_WINTER.index
const isGrass = (type: number) => type === WINTER_GRASS || type === GRASS
const SNOW_DIRT = TerrainEnum1.TERRAIN_SNOW_MUDDY_DIRT.index
const SNOW_DRY_DIRT = TerrainEnum1.TERRAIN_SNOW_DIRT.index
const SNOW_WINTER_GRASS = TerrainEnum1.TERRAIN_SNOW_GRASS_WINTER.index
const ROCK = TerrainEnum1.TERRAIN_ROCK.index
const SNOW_ROCK = TerrainEnum1.TERRAIN_SNOW_ROCK.index
const isPreviewSnow = (type: number) => type === SNOW_DIRT || type === SNOW_DRY_DIRT || type === SNOW_WINTER_GRASS || type === SNOW_ROCK
const CENTER = (SIZE - 1) / 2
// Keep both the region grid and world-space shader coordinates close to Greyvein Camp.
const SNOW_MUD_X = 936, SNOW_MUD_Z = 984
// Preserve the transition noise phase and the three-tile atlas phase when translating the preview.
const snowMudShift = (origin: number) => Math.round((origin + CENTER) / LOCAL_TRANSITION_NOISE_PERIOD) * LOCAL_TRANSITION_NOISE_PERIOD
const SNOW_MUD_SHIFT_X = snowMudShift(SNOW_MUD_X), SNOW_MUD_SHIFT_Z = snowMudShift(SNOW_MUD_Z)
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

const snowTerraceHeight = (x: number, z: number) =>
    Number(x >= 10 && x <= 19 && z >= 14 && z <= 20 && (x <= 16 || z >= 16))
const snowTerraceTrees = [{position: {x: 12, z: 14}}, {position: {x: 15, z: 18}}]
const snowTerraceShrub = {type: 121, position: {x: 18, z: 15}, getSizeX: () => 1, getSizeZ: () => 1}
const snowTerraceProps = [...snowTerraceTrees, snowTerraceShrub].map(source => {
    const {x, z} = source.position
    return {x: x - CENTER, y: snowTerraceHeight(x, z), z: z - CENTER, shrub: 'type' in source}
})

function createSnowTerracePreview(hideSnow: boolean) {
    const {mask} = createSnowCoverMask([], [snowTerraceShrub], SIZE, 1, snowTerraceHeight)
    const snow = [0, 1].map(level => {
        const block = new MapBlock(level, WINTER_GRASS)
        block.snowed = true
        block.computeData()
        block.heightOffset = 0
        block.totalHeight = block.walkHeight = level
        return block
    })
    const bare = snow.map(terrainWithoutSnow)
    return Array.from({length: SIZE}, (_, x) => Array.from({length: SIZE}, (_, z) =>
        (hideSnow && mask.has(x * SIZE + z) ? bare : snow)[snowTerraceHeight(x, z)]))
}

const snowMudProps = snowTerraceProps.map(prop => ({
    ...prop, x: prop.x + CENTER + SNOW_MUD_X, z: prop.z + CENTER + SNOW_MUD_Z,
}))

const snowMudCenteredProps = snowMudProps.map(prop => ({
    ...prop, x: prop.x - SNOW_MUD_SHIFT_X, z: prop.z - SNOW_MUD_SHIFT_Z,
}))

function createSnowMudPreview() {
    const {mask} = createSnowCoverMask([], [snowTerraceShrub], SIZE, 1, snowTerraceHeight)
    const layers = [0, 1].map(height => {
        const mud = new MapBlock(height, MUDDY_DIRT)
        const snow = new MapBlock(height, MUDDY_DIRT)
        const grass = new MapBlock(height, WINTER_GRASS)
        snow.snowed = true
        for (const block of [mud, snow, grass]) {
            block.computeData()
            block.heightOffset = 0
            block.totalHeight = block.walkHeight = height
        }
        return {mud, snow, grass}
    })
    const patch = Array.from({length: SIZE}, (_, x) => Array.from({length: SIZE}, (_, z) => {
        const {mud, snow, grass} = layers[snowTerraceHeight(x, z)]
        // A straight edge, a diagonal crossing the terrace, and a stepped edge.
        const edge = z < 12 ? 14 : z < 20 ? 19 - Math.abs(z - 15) : z < 24 ? 12 : 17
        if (x <= edge) return snow
        // Let a third surface touch the blend, with isolated snow beyond the main edge.
        if (x >= 20 && z >= 13 && z <= 17) return grass
        return x >= 17 && x <= 18 && z >= 21 && z <= 22 ? snow : mud
    }))
    // Supply the normal world indices while sharing the empty padding outside the fixture.
    const depth = SNOW_MUD_Z + SIZE + 5
    const empty = new MapBlock(0, 0)
    empty.computeData()
    const emptyRow = new Array<MapBlock>(depth).fill(empty)
    const map = new Array<MapBlock[]>(depth).fill(emptyRow)
    patch.forEach((row, x) => {
        const padded = emptyRow.slice()
        row.forEach((block, z) => { padded[SNOW_MUD_Z + z] = block })
        map[SNOW_MUD_X + x] = padded
    })
    const snowMask = new Set(Array.from(mask, tile =>
        (SNOW_MUD_X + Math.floor(tile / SIZE)) * depth + SNOW_MUD_Z + tile % SIZE))
    return {map, snowMask}
}

function createRockOverMudPreview() {
    const mud = new MapBlock(0, MUDDY_DIRT)
    const rock = new MapBlock(1, ROCK)
    const snowyRock = new MapBlock(1, ROCK)
    snowyRock.snowed = true
    for (const block of [mud, rock, snowyRock]) block.computeData()
    return Array.from({length: SIZE}, (_, x) => Array.from({length: SIZE}, (_, z) =>
        snowTerraceHeight(x, z) ? (x < 15 || z < 17 ? snowyRock : rock) : mud))
}

export function createTerrainPreview(
    scene: Scene,
    parent: TransformNode,
    assetCamera: ArcRotateCamera,
    ground: Mesh,
    setLighting: (active: boolean) => void,
    setSnowTerraceProps: (props: readonly {x: number, y: number, z: number, shrub: boolean}[]) => void,
) {
    const controls = document.createElement('section')
    controls.hidden = true
    controls.innerHTML = `
        <label class="admin-utils__field">Oblast <select id="terrainSource">
            <option value="demo">Testovací terén</option>
            <option value="snowTerrace">Sníh u stromu a keře</option>
            <option value="snowMud">Přechody sněhu a bahna</option>
            <option value="rockOverMud">Zasněžená skála nad bahnem</option>
        </select></label>
        <label class="admin-utils__field" id="terrainSnowMaskField" hidden>
            <span><input id="terrainSnowMask" type="checkbox" checked> Potlačit sníh pod stromem a keřem</span>
        </label>
        <label class="admin-utils__field" id="terrainWorldCoordinatesField" hidden>
            <span><input id="terrainWorldCoordinates" type="checkbox" checked> Použít světové souřadnice</span>
        </label>
        <label class="admin-utils__field">Povrch A<select id="terrainPrimary"></select></label>
        <label class="admin-utils__field">Povrch B<select id="terrainSecondary"><option value="">Bez druhého povrchu</option></select></label>
        <label class="admin-utils__field"><span>Intenzita slunce <output for="terrainLightIntensity">100 %</output></span>
            <input id="terrainLightIntensity" type="range" min="0" max="200" value="100"></label>
        <div class="admin-utils__field"><label><input id="terrainFoliage" type="checkbox" checked> Zobrazit vegetaci</label></div>
        <button type="button">Vycentrovat pohled</button>`
    const source = controls.querySelector<HTMLSelectElement>('#terrainSource')!
    const snowMaskField = controls.querySelector<HTMLLabelElement>('#terrainSnowMaskField')!
    const snowMask = controls.querySelector<HTMLInputElement>('#terrainSnowMask')!
    const coordinatesField = controls.querySelector<HTMLLabelElement>('#terrainWorldCoordinatesField')!
    const worldCoordinates = controls.querySelector<HTMLInputElement>('#terrainWorldCoordinates')!
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
    const hasSnowProps = () => source.value === 'snowTerrace' || source.value === 'snowMud'
    let worldTerrainRoot: TransformNode | undefined
    let worldTerrain: ReturnType<typeof createOutdoorTerrain> | undefined
    let snowMudPreview: ReturnType<typeof createSnowMudPreview> | undefined
    const emptySnowMask = new Set<number>()
    const updateProps = () => setSnowTerraceProps(hasSnowProps() && foliageToggle.checked
        ? source.value === 'snowMud' ? (worldCoordinates.checked ? snowMudProps : snowMudCenteredProps) : snowTerraceProps
        : [])
    foliageToggle.onchange = () => {
        foliage.setEnabled(foliageToggle.checked)
        worldTerrain?.setFoliageVisible(foliageToggle.checked)
        updateProps()
    }

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
    pointers.buttons = [0, 2]
    const onPointerMove = pointers.onTouch.bind(pointers)
    pointers.onTouch = (point, offsetX, offsetY) => {
        if (point?.type === 'touch') {
            camera.inertialPanningX -= offsetX / camera.panningSensibility
            camera.inertialPanningY += offsetY / camera.panningSensibility
            return
        }
        onPointerMove(point, offsetX, offsetY)
    }

    const worldOffset = new Vector3(SNOW_MUD_X + CENTER, 0, SNOW_MUD_Z + CENTER)
    const sunOffset = Vector3.Zero()
    const placeSun = (worldPreview: boolean) => {
        const x = worldPreview ? worldOffset.x - (worldCoordinates.checked ? 0 : SNOW_MUD_SHIFT_X) : 0
        const z = worldPreview ? worldOffset.z - (worldCoordinates.checked ? 0 : SNOW_MUD_SHIFT_Z) : 0
        Lights.sunLight.position.x += x - sunOffset.x
        Lights.sunLight.position.z += z - sunOffset.z
        sunOffset.set(x, 0, z)
    }
    const placeWorldPreview = () => {
        worldTerrainRoot?.position.set(
            worldCoordinates.checked ? 0 : -SNOW_MUD_SHIFT_X, 0,
            worldCoordinates.checked ? 0 : -SNOW_MUD_SHIFT_Z,
        )
    }
    const transitionBoundary = new Vector3(CENTER, 0, 0)
    let renderers: {
        surface: ReturnType<typeof createTerrainSurfaceRenderer>
        foliage: ReturnType<typeof createTerrainFoliageRenderer>
    } | undefined
    const update = () => {
        const snowTerrace = source.value === 'snowTerrace'
        const rockOverMud = source.value === 'rockOverMud'
        const snowMud = source.value === 'snowMud'
        const localBoundaries = source.value !== 'demo'
        updateProps()
        terrain.setEnabled(!snowMud)
        placeSun(snowMud)
        if (snowMud) {
            snowMudPreview ??= createSnowMudPreview()
            if (!worldTerrainRoot) {
                worldTerrainRoot = new TransformNode('adminUtilsWorldTerrainOrigin', scene)
                worldTerrainRoot.parent = parent
            }
            placeWorldPreview()
            worldTerrain ??= createOutdoorTerrain(worldTerrainRoot, {
                minX: SNOW_MUD_X, minZ: SNOW_MUD_Z,
                maxX: SNOW_MUD_X + SIZE - 1, maxZ: SNOW_MUD_Z + SIZE - 1,
            })
            worldTerrain.render(snowMudPreview.map, worldOffset,
                snowMask.checked ? snowMudPreview.snowMask : emptySnowMask, 0)
            worldTerrain.setFoliageVisible(foliageToggle.checked)
            return
        }
        worldTerrain?.setEnabled(false)
        transitionBoundary.z = Number(localBoundaries)
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
        const demoMap = HEIGHTS.map((row, x) => row.map((height, z) => {
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
        const map = snowTerrace ? createSnowTerracePreview(snowMask.checked)
            : rockOverMud ? createRockOverMudPreview() : demoMap
        const transitionTiles = !localBoundaries && hasTransitions ? findTransitionTiles(map) : undefined
        renderers ??= {
            surface: createTerrainSurfaceRenderer(scene, terrain, transitionBoundary,
                {map: demoMap, center: CENTER, boundaries: BOUNDARIES, isBank: isPondBankTile}),
            foliage: createTerrainFoliageRenderer(scene, foliage),
        }
        renderers.surface.render(map, {transitionTiles, snow, snowPartner, snowOnRock, rockPartner, dirtPartner,
            shoreSurface: first, grassType, snowRockOnSoil, localBoundaries})
        renderers.foliage.render(map, {
            atPondBank: localBoundaries ? () => false : isPondBankTile,
            transitionWeight: (x, z) => {
                if (!transitionTiles?.[Math.round(x)][Math.round(z)]) return 0
                const distance = Math.abs(x - CENTER - terrainBoundaryOffset(z))
                return Math.max(0, 1 - distance / TERRAIN_TRANSITION_REACH)
            },
        })
    }
    const resetCamera = () => {
        camera.target.copyFrom(target)
        if (source.value === 'snowMud') {
            camera.target.addInPlace(worldOffset)
            if (!worldCoordinates.checked) {
                camera.target.x -= SNOW_MUD_SHIFT_X
                camera.target.z -= SNOW_MUD_SHIFT_Z
            }
        }
        camera.panningOriginTarget.copyFrom(camera.target)
        camera.radius = radius
        camera.inertialPanningX = camera.inertialPanningY = camera.inertialRadiusOffset = 0
    }
    const changeSurface = () => {
        try {
            localStorage.setItem(TERRAIN_PREVIEW_STORAGE_KEY, JSON.stringify({primary: primary.value, secondary: secondary.value}))
        } catch { /* Storage may be unavailable. */ }
        update()
    }
    const showSource = () => {
        primary.disabled = secondary.disabled = source.value !== 'demo'
        snowMaskField.hidden = !hasSnowProps()
        coordinatesField.hidden = source.value !== 'snowMud'
        update()
        resetCamera()
    }
    source.onchange = showSource
    snowMask.onchange = update
    worldCoordinates.onchange = () => {
        const direction = worldCoordinates.checked ? 1 : -1
        const dx = direction * SNOW_MUD_SHIFT_X, dz = direction * SNOW_MUD_SHIFT_Z
        camera.target.x += dx
        camera.target.z += dz
        camera.panningOriginTarget.x += dx
        camera.panningOriginTarget.z += dz
        placeWorldPreview()
        placeSun(true)
        updateProps()
    }
    primary.onchange = changeSurface
    secondary.onchange = changeSurface
    controls.querySelector('button')!.onclick = resetCamera
    return {
        controls,
        setActive(active: boolean) {
            if (active === !controls.hidden) return
            controls.hidden = !active
            const worldPreview = source.value === 'snowMud'
            terrain.setEnabled(active && !worldPreview)
            worldTerrain?.setEnabled(active && worldPreview)
            if (!active) placeSun(false)
            ground.setEnabled(!active)
            setLighting(active)
            if (active) {
                baseSunIntensity = Lights.sunLight.intensity
                updateLightIntensity()
                assetCamera.detachControl()
                resetCamera()
                scene.activeCamera = camera
                camera.attachControl(false, false, 2)
                placeSun(worldPreview)
                if (renderers || worldTerrain) updateProps()
                else showSource()
            } else {
                camera.detachControl()
                scene.activeCamera = assetCamera
                assetCamera.attachControl(true)
            }
        },
    }
}
