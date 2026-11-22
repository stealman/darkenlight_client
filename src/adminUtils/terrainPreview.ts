import { ArcRotateCamera, Mesh, Scene, TransformNode, Vector3 } from '@babylonjs/core'
import type { ArcRotateCameraPointersInput, PBRMaterial } from '@babylonjs/core'
import { TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { Renderer } from '@/babylon/scene/renderer'
import { FoliageManager } from '@/babylon/world/foliageManager'
import { TerrainManager } from '@/babylon/world/terrainManager'
import { MapBlock } from '@/data/worldDataManager'
import { Settings } from '@/settings/settings'
import { createTerrainAtlasPreview, muddyDirtPatterns } from './terrainAtlasPreview'
import { createMuddyDirtFoliageProfiles } from './muddyDirtFoliage'
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
const HILLS = [
    {x: 6, z: 8, radius: 6, height: 3},
    {x: 15, z: 20, radius: 7, height: 5},
    {x: 24, z: 9, radius: 5, height: 3},
]
const HEIGHTS = Array.from({length: SIZE}, (_, x) => Array.from({length: SIZE}, (_, z) =>
    Math.max(0, ...HILLS.map(hill => Math.round(hill.height * (1 - Math.hypot(x - hill.x, z - hill.z) / hill.radius))))))

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
    const atlasRenderers: Array<ReturnType<typeof createTerrainAtlasPreview>> = []
    let render: (() => void) | undefined
    const update = () => {
        const first = Number(primary.value)
        const second = Number(secondary.value)
        const map = HEIGHTS.map((row, x) => row.map((height, z) => {
            const boundary = CENTER + 2 * Math.sin(z * 0.32)
            const surface = second && x > boundary ? second : first
            const block = new MapBlock(height, surface % 100)
            block.snowed = surface >= 100 && surface < 1000
            block.setMinable(surface >= 2000 ? 'C' : surface >= 1000 ? 'M' : null)
            block.computeData()
            return block
        }))
        const planes = map.map((row, x) => row.map((block, z) => {
            if (block.minableCoal || block.minableOreAvailable) return false
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const neighbor = map[x + dx]?.[z + dz]
                    if (!neighbor || neighbor.totalHeight < block.totalHeight) return false
                }
            }
            return block
        }))
        const firstRender = !render
        const profiles = createMuddyDirtFoliageProfiles(map, Lights.sunLight.direction)
        // Rows 0 and 5 of the shared preview foliage atlas contain green and dry grass.
        profiles.set(WINTER_GRASS, {rows: [0, 0, 0, 5], tuftsPerTile: 0.88, groundPerTile: 0})
        render = () => {
            TerrainManager.renderTerrainArea(map, planes, emptyMask)
            for (const renderAtlas of atlasRenderers) renderAtlas(map)
            FoliageManager.renderFoliageArea(map, emptyMask, emptyMask, supportsFoliage, {
                profiles,
                extraTuftPasses: 2,
            })
        }
        if (firstRender) {
            TerrainManager.initializeMeshes(scene, terrain, () => render?.())
            const plane = TerrainManager.terrainPlane!
            atlasRenderers.push(createTerrainAtlasPreview(plane, MUDDY_DIRT, 'adminUtilsMuddyDirt', {
                colorUrl: muddyDirtColorUrl, normal: {url: muddyDirtNormalUrl, strength: 3}, patterns: muddyDirtPatterns,
            }))
            atlasRenderers.push(createTerrainAtlasPreview(plane, WINTER_GRASS, 'adminUtilsWinterGrass', {
                colorUrl: winterGrassColorUrl,
                normal: {url: winterGrassNormalUrl, strength: 0.75},
                patterns: WINTER_GRASS_PATTERNS,
            }))
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
            FoliageManager.groundMesh!.receiveShadows = true
            // Give the crossed billboards some fill on faces turned away from the sun.
            const foliageMaterial = FoliageManager.foliageMaterial!
            foliageMaterial.emissiveTexture = foliageMaterial.albedoTexture
            foliageMaterial.emissiveColor.set(0.34, 0.34, 0.34)
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
