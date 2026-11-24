import { createTerrainFoliageRenderer } from "./terrainFoliageRenderer"
import { createTerrainSurfaceRenderer } from './terrainSurfaceRenderer'
import { ArcRotateCamera, Mesh, Scene, TransformNode, Vector3 } from '@babylonjs/core'
import type { ArcRotateCameraPointersInput } from '@babylonjs/core'
import { TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { Renderer } from '@/babylon/scene/renderer'
import { SNOW_BLOCK_HEIGHT } from '@/babylon/world/beveledTerrainBlock'
import { WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import { MapBlock } from '@/data/worldDataManager'
import { createStonePathRenderer } from '@/babylon/world/stonePathRenderer'
import { Settings } from '@/settings/settings'
import { terrainBoundaryOffset, TERRAIN_TRANSITION_REACH } from './terrainTransitionMaterial'

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

export function createTerrainPreview(
    scene: Scene,
    parent: TransformNode,
    assetCamera: ArcRotateCamera,
    ground: Mesh,
    setLighting: (active: boolean) => void,
) {
    const controls = document.createElement('section')
    controls.className = "admin-utils__terrain-options"
    controls.hidden = true
    controls.innerHTML = `
        <h3>Testovací terén</h3>
        <label class="admin-utils__field">Povrch A<select id="terrainPrimary"></select></label>
        <label class="admin-utils__field">Povrch B<select id="terrainSecondary"><option value="">Bez druhého povrchu</option></select></label>
        <label class="admin-utils__field"><span>Intenzita slunce <output for="terrainLightIntensity">100 %</output></span>
            <input id="terrainLightIntensity" type="range" min="0" max="200" value="100"></label>
        <label class="admin-utils__field"><input id="terrainFoliage" type="checkbox" checked> Zobrazit vegetaci</label>
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
    const target = new Vector3(0, cameraViewY, -2.8)
    const cameraOrigin = new Vector3(0, cameraViewY, 0)
    const offsetAt = (percent: number) => cameraPosition.scale(percent / Settings.cameraDistance).subtract(cameraOrigin)
    const offset = offsetAt(90)
    const alpha = Math.atan2(offset.z, offset.x)
    const beta = Math.atan2(Math.hypot(offset.x, offset.z), offset.y)
    const radius = offset.length() * 0.76
    const camera = new ArcRotateCamera('adminUtilsTerrainCamera', alpha, beta, radius, target.clone(), scene)
    camera.lowerAlphaLimit = camera.upperAlphaLimit = alpha
    camera.lowerBetaLimit = camera.upperBetaLimit = beta
    camera.lowerRadiusLimit = radius * 0.42
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

    const transitionBoundary = new Vector3(CENTER, 0, 0)
    let renderers: {
        surface: ReturnType<typeof createTerrainSurfaceRenderer>
        foliage: ReturnType<typeof createTerrainFoliageRenderer>
        paths: ReturnType<typeof createStonePathRenderer>
    } | undefined
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
            // A wide bend crosses the two preview substrates. Branches and a single pad
            // expose the outside edges and show both stone palettes on either surface.
            if ((x >= 9 && x <= 20 && z >= 11 && z <= 12)
                || (x >= 17 && x <= 19 && z === 13)
                || (x === 11 && z >= 13 && z <= 15)) {
                block.stonePath = true
            } else if ((x >= 12 && x <= 19 && z === 9)
                || (x >= 15 && x <= 18 && z === 8)
                || (x === 13 && z === 14)) {
                block.beigeStonePath = true
            }
            return block
        }))
        const transitionTiles = hasTransitions ? findTransitionTiles(demoMap) : undefined
        renderers ??= {
            surface: createTerrainSurfaceRenderer(scene, terrain, transitionBoundary,
                {map: demoMap, center: CENTER, boundaries: BOUNDARIES, isBank: isPondBankTile}),
            foliage: createTerrainFoliageRenderer(scene, foliage),
            paths: createStonePathRenderer(scene, terrain),
        }
        renderers.surface.render(demoMap, {transitionTiles, snow, snowPartner, snowOnRock, rockPartner, dirtPartner,
            shoreSurface: first, grassType, snowRockOnSoil, localBoundaries: false})
        renderers.foliage.render(demoMap, {
            atPondBank: isPondBankTile,
            pavingMoss: true,
            transitionWeight: (x, z) => {
                if (!transitionTiles?.[Math.round(x)][Math.round(z)]) return 0
                const distance = Math.abs(x - CENTER - terrainBoundaryOffset(z))
                return Math.max(0, 1 - distance / TERRAIN_TRANSITION_REACH)
            },
        })
        renderers.paths.render(demoMap, (x, z) => demoMap[x]?.[z]?.totalHeight)
    }
    const resetCamera = () => {
        camera.target.copyFrom(target)
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
                if (!renderers) update()
            } else {
                camera.detachControl()
                scene.activeCamera = assetCamera
                assetCamera.attachControl(true)
            }
        },
    }
}
