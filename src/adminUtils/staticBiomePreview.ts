import { ArcRotateCamera, Mesh, Scene, TransformNode, Vector3, Viewport } from '@babylonjs/core'
import { TerrainEnum1 } from '@/babylon/materials'
import { Renderer } from '@/babylon/scene/renderer'
import { Lights } from '@/babylon/scene/lights'
import { dayNightPreviewPhases as TIMES } from '@/babylon/scene/lighting/dayNightLighting'
import { OUTDOOR_PERSONAL_LIGHT_HEIGHT, PERSONAL_LIGHT_X_OFFSET, PERSONAL_LIGHT_Z_OFFSET } from '@/babylon/scene/lighting/lightConfig'
import { MapBlock, WorldDataManager } from '@/data/worldDataManager'
import { terrainWithoutSnow } from './terrainLocalTransitions'
import { DetailLevels, Settings } from '@/settings/settings'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { createTerrainSurfaceRenderer } from './terrainSurfaceRenderer'

const STORAGE_KEY = 'darkenlight.adminUtils.staticBiomes'
const TYPES = [
    ['Grass', TerrainEnum1.TERRAIN_GRASS.index],
    ['Muddy Dirt', TerrainEnum1.TERRAIN_MUDDY_DIRT.index],
    ['Winter Grass', TerrainEnum1.TERRAIN_GRASS_WINTER.index],
    ['Snow', TerrainEnum1.TERRAIN_SNOW_MUDDY_DIRT.index],
    ['Rock', TerrainEnum1.TERRAIN_ROCK.index],
    ['Dry Dirt', TerrainEnum1.TERRAIN_DIRT.index],
] as const
const CENTERS = [[14, 14], [49, 14], [14, 49], [49, 49]] as const

export function createStaticBiomePreview(
    scene: Scene, camera: ArcRotateCamera, ground: Mesh, setLighting: (phase?: number) => void,
    refresh: () => void,
) {
    const controls = document.createElement('fieldset')
    controls.className = 'admin-utils__static-controls'
    controls.innerHTML = '<legend>Biomy</legend>'
    const labels = document.createElement('div')
    labels.className = 'admin-utils__static-biomes'
    labels.hidden = true
    ground.getScene().getEngine().getRenderingCanvas()!.after(labels)
    const select = (id: string, name: string, options: readonly (readonly [string, string | number])[]) => {
        const field = document.createElement('div')
        field.className = 'admin-utils__field'
        const label = document.createElement('label')
        label.textContent = name
        label.htmlFor = id
        const input = document.createElement('select')
        input.id = id
        input.replaceChildren(...options.map(([label, value]) => new Option(label, String(value))))
        field.append(label, input)
        controls.append(field)
        return input
    }
    const slots = CENTERS.map(([x, z], i) => {
        const input = select(`staticBiome${i + 1}`, `Biom ${i + 1}`, TYPES)
        const label = document.createElement('span')
        labels.append(label)
        const view = i === 0 ? camera : new ArcRotateCamera(`staticBiome${i + 1}`, 0, 1, 10, Vector3.Zero(), scene)
        return {x, z, input, label, view, viewport: new Viewport(i % 2 / 2, i < 2 ? 0.5 : 0, 0.5, 0.5)}
    })
    const views = slots.map(({view}) => view)
    const detail = select('staticDetail', 'Detail', Object.keys(DetailLevels).map(value => [value, value] as const))
    const time = select('staticTime', 'Denní doba', Object.keys(TIMES).map(value => [value, value] as const))
    const reset = document.createElement('button')
    reset.type = 'button'
    reset.textContent = 'Herní úhel kamery'
    controls.append(reset)
    let saved: {types?: number[], detail?: string, time?: string} = {}
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') ?? {} } catch { /* Use defaults. */ }
    const restore = (input: HTMLSelectElement, value: unknown, fallback: string) => {
        input.value = Array.from(input.options).some(option => option.value === String(value)) ? String(value) : fallback
    }
    slots.forEach(({input}, i) => restore(input, saved.types?.[i], String(TYPES[i][1])))
    restore(detail, saved.detail, 'MEDIUM')
    restore(time, saved.time, 'DAY')

    const terrainNode = new TransformNode('staticBiomeTerrain', scene)
    terrainNode.setEnabled(false)
    let surfaces: ReturnType<typeof createTerrainSurfaceRenderer> | undefined
    let previous: typeof Settings.detailLevel
    let previousFar: number
    let previousAlpha: number
    let previousBeta: number
    let previousMaxRadius: ArcRotateCamera['upperRadiusLimit']
    let previousShadows: boolean
    let active = false
    let renderedTerrain = ''
    let terrainKey = ''
    const updateLight = () => setLighting(TIMES[time.value as keyof typeof TIMES])
    const applyDetail = () => {
        Settings.detailLevel = DetailLevels[detail.value as keyof typeof DetailLevels]
        scene.shadowsEnabled = previousShadows && Settings.isShadowsEnabled()
    }
    const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({
        types: slots.map(({input}) => Number(input.value)), detail: detail.value, time: time.value,
    }))
    controls.onchange = (event) => {
        save()
        if (event.target === time) updateLight()
        else {
            applyDetail()
            updateLight()
            refresh()
        }
    }
    reset.onclick = () => {
        const {cameraPosition, cameraViewY} = Renderer.getCameraSetup()
        cameraPosition.y -= cameraViewY
        camera.alpha = Math.atan2(cameraPosition.z, cameraPosition.x)
        camera.beta = Math.acos(cameraPosition.y / cameraPosition.length())
        camera.inertialAlphaOffset = camera.inertialBetaOffset = 0
    }
    scene.onBeforeRenderObservable.add(() => {
        if (!active) return
        for (let i = 1; i < views.length; i++) {
            const view = views[i]
            view.alpha = camera.alpha
            view.beta = camera.beta
            view.radius = camera.radius
        }
    })

    scene.onBeforeCameraRenderObservable.add(view => {
        if (!active) return
        const slot = slots[views.indexOf(view as ArcRotateCamera)]
        if (slot) Lights.personalLight.position.set(slot.x + PERSONAL_LIGHT_X_OFFSET, OUTDOOR_PERSONAL_LIGHT_HEIGHT,
            slot.z + PERSONAL_LIGHT_Z_OFFSET)
    })

    return {
        controls, slots,
        setActive(value: boolean) {
            controls.hidden = !value
            if (value === active) return
            active = value
            labels.hidden = !value
            terrainNode.setEnabled(value)
            ground.setEnabled(!value)
            if (value) {
                previous = Settings.detailLevel
                previousFar = camera.maxZ
                previousAlpha = camera.alpha
                previousBeta = camera.beta
                previousMaxRadius = camera.upperRadiusLimit
                camera.upperRadiusLimit = 18
                previousShadows = scene.shadowsEnabled
                applyDetail()
                for (const {view, viewport} of slots) {
                    view.viewport = viewport
                    view.maxZ = 26
                }
                scene.activeCameras = views
                reset.click()
                updateLight()
            } else {
                Settings.detailLevel = previous
                scene.shadowsEnabled = previousShadows
                scene.activeCameras = []
                camera.viewport = new Viewport(0, 0, 1, 1)
                camera.maxZ = previousFar
                camera.upperRadiusLimit = previousMaxRadius
                camera.alpha = previousAlpha
                camera.beta = previousBeta
                scene.activeCamera = camera
                setLighting()
                Lights.personalLight.position.set(PERSONAL_LIGHT_X_OFFSET, OUTDOOR_PERSONAL_LIGHT_HEIGHT, PERSONAL_LIGHT_Z_OFFSET)
            }
        },
        prepareTerrain() {
            const next = slots.map(({input}) => input.value).join(',')
            if (next === terrainKey) return
            terrainKey = next
            const map = WorldDataManager.getBlockMap()
            for (const {x, z, input, label} of slots) {
                const type = Number(input.value)
                const block = new MapBlock(0, type > 100 ? type - 100 : type)
                block.snowed = type > 100
                block.computeData()
                label.textContent = input.selectedOptions[0].textContent
                for (let i = x - 13; i <= x + 13; i++) {
                    for (let j = z - 13; j <= z + 13; j++) map[i][j] = block
                }
            }
        },
        renderTerrain() {
            const map = WorldDataManager.getBlockMap()
            const exposed = [...WorldRenderer.snowCoverMask].filter(tile => map[Math.floor(tile / map.length)][tile % map.length].snowed)
            const key = terrainKey + ':' + exposed.join(',')
            if (renderedTerrain === key) return

            const surface = exposed.length ? map.map(row => row.slice()) : map
            for (const tile of exposed) {
                const x = Math.floor(tile / map.length), z = tile % map.length
                surface[x][z] = terrainWithoutSnow(map[x][z])
            }
            if (!surfaces) {
                surfaces = createTerrainSurfaceRenderer(scene, terrainNode, Vector3.Zero())
                for (const mesh of surfaces.meshes) mesh.receiveShadows = true
            }
            surfaces.render(surface, {localBoundaries: false, includeTile: (x, z) => surface[x][z].type > 0})
            renderedTerrain = key
        },
        frame(height: number, radius: number, recenter: boolean, offsetX = 0, offsetZ = 0) {
            for (const {view, x, z} of slots) view.target.set(x + offsetX, height, z + offsetZ)
            if (recenter) camera.radius = radius
        },
    }
}
