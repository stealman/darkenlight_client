import { ArcRotateCamera, Mesh, Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import type { ArcRotateCameraPointersInput, PBRMaterial } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { Renderer } from '@/babylon/scene/renderer'
import { FoliageManager } from '@/babylon/world/foliageManager'
import { MapBlock } from '@/data/worldDataManager'
import { Settings } from '@/settings/settings'
import { createTerrainAtlasPreview, createTerrainPreviewPlane, muddyDirtPatterns } from './terrainAtlasPreview'
import type { TerrainAtlasTileFilter } from './terrainAtlasPreview'
import { addTerrainPreviewRoof, configureDirtEdgeLighting, configureTerrainPreviewBatch, TerrainPreviewBatch } from './terrainPreviewBatch'
import { createTerrainPreviewGeometry } from './terrainPreviewGeometry'
import { createTerrainTransitionMaterial, terrainBoundaryOffset, TERRAIN_TRANSITION_REACH } from './terrainTransitionMaterial'
import { createMuddyDirtFoliageProfiles } from './muddyDirtFoliage'
import { createWinterGrassFoliage, styleWinterGrassFoliage } from './winterGrassFoliage'
import muddyDirtColorUrl from './assets/muddy-dirt-atlas.png'
import muddyDirtNormalUrl from './assets/muddy-dirt-normal-atlas.png'
import winterGrassColorUrl from './assets/winter-grass-atlas.png'
import winterGrassNormalUrl from './assets/winter-grass-normal-atlas.png'
import foliageAtlasUrl from './assets/muddy-dirt-foliage.png'
import foliageNormalAtlasUrl from './assets/muddy-dirt-foliage-normal.png'

const SIZE = 30
const MUDDY_DIRT = TerrainEnum1.TERRAIN_MUDDY_DIRT.index
const WINTER_GRASS = TerrainEnum1.TERRAIN_GRASS_WINTER.index
// Atlas origins in 128 px tiles from the top left.
const WINTER_GRASS_PATTERNS = [
    {size: 3, origins: [
        [0.0625, 0.0625], [3.1875, 0.0625], [6.3125, 0.0625], [9.4375, 0.0625], [12.5625, 0.0625],
        [0.0625, 3.1875], [3.1875, 3.1875], [6.3125, 3.1875],
    ]},
    {size: 2, origins: [
        [9.4375, 3.1875], [11.5625, 3.1875], [13.6875, 3.1875],
        [0.0625, 6.3125], [2.1875, 6.3125], [4.3125, 6.3125],
    ]},
    {size: 1, origins: [[6.4375, 6.3125], [7.5625, 6.3125], [8.6875, 6.3125], [9.8125, 6.3125], [10.9375, 6.3125]]},
]
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

function findTransitionTiles(map: MapBlock[][]) {
    const tiles = map.map(row => row.map(() => false))
    const queue: Array<[number, number]> = []
    const inBand = (x: number, z: number) => Math.abs(x - BOUNDARIES[z]) <= TERRAIN_TRANSITION_REACH
    const add = (x: number, z: number) => {
        tiles[x][z] = true
        queue.push([x, z])
    }
    // Start at actual same-height grass/dirt contacts, including those along Z on a terrace.
    map.forEach((row, x) => row.forEach((block, z) => {
        if (!inBand(x, z)) return
        if (ADJACENT_TILES.some(([dx, dz]) => {
            const neighbor = map[x + dx]?.[z + dz]
            return neighbor?.totalHeight === block.totalHeight && neighbor.type !== block.type
        })) add(x, z)
    }))
    for (let i = 0; i < queue.length; i++) {
        const [x, z] = queue[i]
        const height = map[x][z].totalHeight
        for (const [dx, dz] of ADJACENT_TILES) {
            const nx = x + dx, nz = z + dz
            if (tiles[nx]?.[nz] === false && inBand(nx, nz) && map[nx][nz].totalHeight === height) add(nx, nz)
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
        if (typeof entry === 'function') continue
        const label = name.replace(/^TERRAIN_/, '').toLowerCase().replaceAll('_', ' ')
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
    const supportsFoliage = (block: MapBlock) => !block.snowed && (block.type === MUDDY_DIRT || block.type === WINTER_GRASS)
    const transitionBoundary = new Vector2(CENTER, 0)
    let renderAtlases: (map: MapBlock[][], transitionTiles: boolean[][] | undefined) => void
    let render: (() => void) | undefined
    const update = () => {
        const first = Number(primary.value)
        const second = Number(secondary.value)
        const hasTransitions = (first === WINTER_GRASS && second === MUDDY_DIRT)
            || (first === MUDDY_DIRT && second === WINTER_GRASS)
        transitionBoundary.y = hasTransitions ? (first === WINTER_GRASS ? -1 : 1) : 0
        const map = HEIGHTS.map((row, x) => row.map((height, z) => {
            const boundary = BOUNDARIES[z]
            const surface = second && x > boundary ? second : first
            const block = new MapBlock(height, surface % 100)
            block.snowed = surface >= 100 && surface < 1000
            block.setMinable(surface >= 2000 ? 'C' : surface >= 1000 ? 'M' : null)
            block.computeData()
            // In this preview pair, both materials share the same surface at each height.
            if (hasTransitions && surface === WINTER_GRASS) {
                block.heightOffset = 0
                block.totalHeight = block.walkHeight = height
            }
            return block
        }))
        const transitionTiles = hasTransitions ? findTransitionTiles(map) : undefined
        const firstRender = !render
        const profiles = createMuddyDirtFoliageProfiles(map, Lights.sunLight.direction)
        profiles.set(WINTER_GRASS, createWinterGrassFoliage((x, z) => {
            const tileX = Math.round(x)
            const tileZ = Math.round(z)
            if (!transitionTiles?.[tileX][tileZ]) return 0
            const distance = Math.abs(x - CENTER - terrainBoundaryOffset(z))
            return Math.max(0, 1 - distance / TERRAIN_TRANSITION_REACH)
        }))
        render = () => {
            renderAtlases(map, transitionTiles)
            FoliageManager.renderFoliageArea(map, emptyMask, emptyMask, supportsFoliage, {
                profiles,
                extraTuftPasses: 2,
            })
        }
        if (firstRender) {
            const plane = Builder.createHorizontalPlane(scene, terrain, 1, 0)
            plane.name = 'adminUtilsTerrainTops'
            plane.receiveShadows = Settings.isShadowsEnabled()
            const geometry = createTerrainPreviewGeometry(plane, [MUDDY_DIRT, WINTER_GRASS])
            const dirtAtlas = createTerrainAtlasPreview(plane, 'adminUtilsMuddyDirt', {
                type: MUDDY_DIRT, colorUrl: muddyDirtColorUrl,
                normal: {url: muddyDirtNormalUrl, strength: 4}, patterns: muddyDirtPatterns, roundDirtEdges: true,
            })
            const grassAtlas = createTerrainAtlasPreview(plane, 'adminUtilsWinterGrass', {
                type: WINTER_GRASS, colorUrl: winterGrassColorUrl,
                normal: {url: winterGrassNormalUrl, strength: 0.75},
                patterns: WINTER_GRASS_PATTERNS,
            })
            const transitionName = 'adminUtilsWinterGrassMuddyDirt'
            const transitionMesh = createTerrainPreviewPlane(plane, transitionName)
            const transitionMaterial = createTerrainTransitionMaterial(transitionName, grassAtlas.material, dirtAtlas.material,
                WINTER_GRASS_PATTERNS[0].origins[0], muddyDirtPatterns[0].origins[0], transitionBoundary)
            configureTerrainPreviewBatch(transitionMesh, transitionMaterial, false)
            configureDirtEdgeLighting(transitionMaterial, true)
            for (const mesh of [plane, geometry.deposits, dirtAtlas.mesh, grassAtlas.mesh, transitionMesh]) {
                Lights.addShadowCaster(mesh, false)
            }
            renderAtlases = (map, transitionTiles) => {
                const transitions = new TerrainPreviewBatch()
                const surfaceData: number[] = []
                const wallData: number[] = []
                // 0 is bare dirt, 1 is solid grass, 2 follows the horizontal blend at the contact.
                const grassAt = (x: number, z: number) => {
                    if (transitionTiles?.[x][z]) return 2
                    const block = map[x][z]
                    return block.type === WINTER_GRASS && !block.snowed ? 1 : 0
                }
                const surfaces = geometry.render(map, ({x, z, lowerX, lowerZ, topY, bottomY}, triangles) => {
                    const topGrass = topY === undefined ? 0 : grassAt(x, z)
                    const bottomGrass = bottomY === undefined ? 0 : grassAt(lowerX, lowerZ)
                    if (!topGrass && !bottomGrass) return
                    for (let i = 0; i < triangles; i++) {
                        surfaceData.push(x, z, 0, 0)
                        wallData.push(topY ?? 0, bottomY ?? 0, topGrass, bottomGrass)
                    }
                    return transitions
                })
                const islandMasks = transitionTiles ? grassIslandMasks(map) : undefined
                const takeTile = (grass: boolean): TerrainAtlasTileFilter | undefined => {
                    if (!transitionTiles || !islandMasks) return
                    return (matrix, uv, x, z, roof) => {
                        if (!transitionTiles[x][z]) return false
                        const first = transitions.count
                        addTerrainPreviewRoof(transitions, matrix, uv, roof, {roundDirtEdges: true})
                        const angle = Math.atan2(matrix.m[2], matrix.m[0])
                        // The low bit identifies the base material; the next four hold the corner flags.
                        const flags = (islandMasks[x][z] << 1) | (grass ? 1 : 0)
                        for (let i = first; i < transitions.count; i++) {
                            surfaceData.push(x, z, angle, flags)
                            wallData.push(0, 0, 0, 0)
                        }
                        return true
                    }
                }
                dirtAtlas.render(surfaces, takeTile(false), surfaces.walls)
                grassAtlas.render(surfaces, takeTile(true))
                if (transitions.count) {
                    transitionMesh.thinInstanceSetBuffer('terrainSurface', new Float32Array(surfaceData), 4)
                    transitionMesh.thinInstanceSetBuffer('terrainWallContact', new Float32Array(wallData), 4)
                }
                transitions.apply(transitionMesh, true)
            }
            FoliageManager.initialize(scene, foliage, {
                atlasUrl: foliageAtlasUrl,
                atlasCellPixels: 64,
                blendedGround: true,
                groundNormals: {atlasUrl: foliageNormalAtlasUrl, opaqueStrength: 1.8, blendedStrength: 0.8},
            })
            const moss = FoliageManager.blendedGroundMesh!
            moss.receiveShadows = true
            const mossMaterial = moss.material as PBRMaterial
            mossMaterial.albedoColor.set(0.82, 0.84, 0.81)
            mossMaterial.emissiveTexture = mossMaterial.albedoTexture
            mossMaterial.emissiveColor.set(0.08, 0.08, 0.08)
            const groundFoliage = FoliageManager.groundMesh!
            groundFoliage.receiveShadows = true
            // Give the crossed billboards some fill on faces turned away from the sun.
            const foliageMaterial = FoliageManager.foliageMaterial!
            foliageMaterial.emissiveTexture = foliageMaterial.albedoTexture
            foliageMaterial.emissiveColor.set(0.34, 0.34, 0.34)
            styleWinterGrassFoliage(foliageMaterial, groundFoliage.material as typeof foliageMaterial)
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
