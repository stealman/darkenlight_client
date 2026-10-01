<template>
    <div v-if="dialogVisible" class="dialog-backdrop worlds-dialog-backdrop" @click.self="closeDialog">
        <div class="dialog-window adaptive worlds-dialog-window">
            <div class="dialog-surface">
                <div class="dialog-header">Worlds</div>
                <div class="dialog-content worlds-dialog-content">
                    <aside class="worlds-sidebar">
                        <label class="worlds-control">
                            <span>World</span>
                            <select v-model.number="selectedWorldId">
                                <option v-for="world in worlds" :key="world.id" :value="world.id">
                                    {{ world.name }} ({{ world.id }})
                                </option>
                            </select>
                        </label>
                        <section class="worlds-settings">
                            <template v-if="worldSettings">
                                <div class="worlds-control-row">
                                    <label class="worlds-control">
                                        <span>ID</span>
                                        <input :value="worldSettings.id" type="number" readonly>
                                    </label>
                                    <label class="worlds-control">
                                        <span>Size</span>
                                        <input :value="worldSettings.size" type="number" readonly>
                                    </label>
                                </div>
                                <label class="worlds-control">
                                    <span>Name</span>
                                    <input v-model="name" type="text">
                                </label>
                                <div class="worlds-control-row">
                                    <label class="worlds-control">
                                        <span>Map ID</span>
                                        <input v-model.number="mapId" type="number" min="0">
                                    </label>
                                    <label class="worlds-control">
                                        <span>Sea Water Level</span>
                                        <input v-model.number="seaWaterLevel" type="number" step="0.1">
                                    </label>
                                </div>
                                <label class="worlds-control">
                                    <span>Environment</span>
                                    <select v-model="environmentType">
                                        <option value="outdoor">Outdoor</option>
                                        <option value="indoor">Indoor</option>
                                    </select>
                                </label>
                                <label class="worlds-control">
                                    <span>Environment Category</span>
                                    <select v-model="environmentCategory" :disabled="environmentType === 'outdoor'">
                                        <option value="" :disabled="environmentType === 'indoor'"></option>
                                        <option v-if="environmentType === 'indoor'" value="dungeon">Dungeon</option>
                                    </select>
                                </label>
                                <label class="worlds-control worlds-attributes-control">
                                    <span>Attributes (JSON)</span>
                                    <textarea v-model="attributesJson" spellcheck="false"></textarea>
                                </label>
                                <div v-if="attributesError" class="worlds-settings-error">{{ attributesError }}</div>
                                <div class="worlds-settings-actions">
                                    <span>Map and environment changes apply after a world reload.</span>
                                    <button class="dialog-button" @click="saveSettings"><span class="ui-text-gradient--button-state">SAVE SETTINGS</span></button>
                                </div>
                            </template>
                        </section>
                    </aside>
                    <section class="worlds-workspace">
                        <div class="world-map-toolbar">
                            <div class="world-map-type-buttons">
                                <button
                                    v-for="mapType in mapTypes"
                                    :key="mapType.id"
                                    :disabled="selectedMapType === mapType.id"
                                    @click="selectedMapType = mapType.id"
                                >{{ mapType.label }}</button>
                            </div>
                            <div class="world-map-zoom-controls">
                                <span>Zoom {{ mapZoom }}×</span>
                                <button :disabled="mapZoom <= 1" @click="mapZoom--">−</button>
                                <button :disabled="mapZoom >= 8" @click="mapZoom++">+</button>
                            </div>
                        </div>
                        <div class="world-map-info-row">
                            <div v-if="selectedMapType === 'height'" class="world-map-height-tool-controls">
                                <div class="world-map-height-mode-controls">
                                    <label>
                                        <input v-model="heightEditMode" type="radio" value="exact"> Exact
                                        <input v-if="heightEditMode === 'exact'" v-model.number="targetHeight" class="world-map-target-height-input" type="number" min="1" max="31" step="1">
                                    </label>
                                    <label><input v-model="heightEditMode" type="radio" value="up"> Up</label>
                                    <label><input v-model="heightEditMode" type="radio" value="down"> Down</label>
                                </div>
                                <label class="world-map-highlight-control"><input v-model="highlightImpassable" type="checkbox"> Highlight impassable</label>
                            </div>
                            <div v-if="selectedMapType === 'height'" class="world-map-brush-controls">
                                <span>Brush</span>
                                <button v-for="size in squareBrushSizes" :key="`square-${size}`" :disabled="brushShape === 'square' && brushSize === size" @click="selectBrush('square', size)">{{ size }}</button>
                                <button v-for="size in circleBrushSizes" :key="`circle-${size}`" class="world-map-circle-brush-button" :disabled="brushShape === 'circle' && brushSize === size" @click="selectBrush('circle', size)">◯ {{ size }}</button>
                            </div>
                            <span v-else>{{ selectedMapTypeLabel }} map</span>
                            <span class="world-map-hover-value">{{ mapHoverValue }}</span>
                        </div>
                        <div
                            ref="mapViewportRef"
                            class="world-map-viewport"
                            @contextmenu.prevent
                            @pointerdown="handleMapPointerDown"
                            @pointermove="handleMapPointerMove"
                            @pointerup="stopMapDrag"
                            @pointercancel="stopMapDrag"
                            @click="editMapPixel"
                            @wheel.prevent="cycleBrush"
                        >
                            <canvas ref="mapCanvasRef" class="world-map-canvas"></canvas>
                        </div>
                        <div class="world-map-save-actions">
                            <span v-if="pendingHeightChangeCount">{{ pendingHeightChangeCount }} pending height {{ pendingHeightChangeCount === 1 ? 'change' : 'changes' }}</span>
                            <span v-else>No pending map changes</span>
                            <button class="dialog-button" :disabled="selectedMapType !== 'height' || pendingHeightChangeCount === 0 || savingMapData" @click="saveMapData">
                                <span class="ui-text-gradient--button-state">{{ savingMapData ? 'SAVING...' : 'SAVE MAP DATA' }}</span>
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { GMManager } from '@/gm/GM'
import {
    CIRCLE_BRUSH_SIZES,
    createWaterOverlay as createHeightWaterOverlay,
    drawBrushPreview as drawHeightBrushPreview,
    drawImpassableBoundaries as drawHeightImpassableBoundaries,
    getBrushBounds as getHeightBrushBounds,
    getBrushPixelCoordinates as getHeightBrushPixelCoordinates,
    getBrushTargetHeight as getHeightBrushTargetHeight,
    getHeightMapPixelValue,
    getStoredHeightTool,
    getTargetBrushHeight,
    HEIGHT_EDIT_MODES,
    SQUARE_BRUSH_SIZES,
    updateWaterOverlayPixel as updateHeightWaterOverlayPixel,
} from './worldMaps/heightMapEditor'
import { getTerrainMapPixelValue } from './worldMaps/terrainMapEditor'
import { getSnowMapPixelValue } from './worldMaps/snowMapEditor'
import { getGatheringMapPixelValue } from './worldMaps/gatheringMapEditor'

const WORLD_MAP_ZOOM_LS_KEY = 'worlds-map-zoom'
const WORLD_MAP_VIEW_LS_KEY = 'worlds-map-view'

const getStoredMapZoom = () => {
    const zoom = Number(localStorage.getItem(WORLD_MAP_ZOOM_LS_KEY))
    return Number.isInteger(zoom) ? Math.max(1, Math.min(8, zoom)) : 2
}

const getStoredMapView = () => {
    try {
        const view = JSON.parse(localStorage.getItem(WORLD_MAP_VIEW_LS_KEY) || 'null')
        if (!view || !Number.isInteger(view.worldId) || !['height', 'terrain', 'snow', 'gathering'].includes(view.mapType)
            || !Number.isFinite(view.panX) || !Number.isFinite(view.panY)) {
            return null
        }
        return view
    } catch {
        return null
    }
}

const emit = defineEmits(['close'])
const dialogVisible = ref(false)
const selectedWorldId = ref(null)
const worldSettings = computed(() => GMManager.worldSettings.value)
const worlds = computed(() => GMManager.teleportWorlds.value)
const name = ref('')
const mapId = ref(0)
const seaWaterLevel = ref(null)
const environmentType = ref('outdoor')
const environmentCategory = ref('')
const attributesJson = ref('{}')
const attributesError = ref('')
const initialMapView = getStoredMapView()
const initialHeightTool = getStoredHeightTool()
const mapTypes = [
    {id: 'height', label: 'Height'},
    {id: 'terrain', label: 'Terrain'},
    {id: 'snow', label: 'Snow'},
    {id: 'gathering', label: 'Gathering'},
]
const selectedMapType = ref(initialMapView?.mapType ?? 'terrain')
const mapZoom = ref(getStoredMapZoom())
const mapViewportRef = ref(null)
const mapCanvasRef = ref(null)
const mapImage = ref(null)
const mapPanX = ref(initialMapView?.panX ?? 0)
const mapPanY = ref(initialMapView?.panY ?? 0)
const mapHoverValue = ref('Move over the map')
const mapHoverCoordinates = ref(null)
const targetHeight = ref(initialHeightTool?.height ?? 1)
const squareBrushSizes = SQUARE_BRUSH_SIZES
const circleBrushSizes = CIRCLE_BRUSH_SIZES
const brushSize = ref(initialHeightTool?.brushSize ?? 1)
const brushShape = ref(initialHeightTool?.brushShape ?? 'square')
const heightEditMode = ref(initialHeightTool?.mode ?? 'exact')
const highlightImpassable = ref(false)
const mapDrag = {active: false, x: 0, y: 0}
let mapPixelContext = null
let mapPixelCanvas = null
let waterOverlayCanvas = null
let waterOverlayContext = null
const pendingHeightChangesByWorld = new Map()
const pendingHeightChangeCount = ref(0)
const savingMapData = ref(false)
const savingMapWorldId = ref(null)

const selectedMapTypeLabel = computed(() => mapTypes.find((mapType) => mapType.id === selectedMapType.value)?.label ?? '')

const openDialog = () => {
    dialogVisible.value = true
    const storedMapView = getStoredMapView()
    if (storedMapView) {
        selectedMapType.value = storedMapView.mapType
        if (selectedWorldId.value === storedMapView.worldId) {
            mapPanX.value = storedMapView.panX
            mapPanY.value = storedMapView.panY
        }
    }
    GMManager.loadTeleportWorlds()
    selectInitialWorld()
    if (Number.isInteger(selectedWorldId.value)) {
        GMManager.loadWorldSettings(selectedWorldId.value)
        loadMapImage()
    }
    nextTick(drawMap)
}

const closeDialog = () => {
    dialogVisible.value = false
    emit('close')
}

const onDialogKeyDown = (event) => {
    if (!dialogVisible.value) {
        return
    }
    if (event.key === 'Tab') {
        event.preventDefault()
        const index = HEIGHT_EDIT_MODES.indexOf(heightEditMode.value)
        heightEditMode.value = HEIGHT_EDIT_MODES[(index + 1) % HEIGHT_EDIT_MODES.length]
        drawMap()
        return
    }
    if (event.key === 'Escape') {
        closeDialog()
    }
}

const selectInitialWorld = () => {
    if (selectedWorldId.value || worlds.value.length === 0) {
        return
    }
    const storedMapView = getStoredMapView()
    const storedWorld = worlds.value.find((world) => world.id === storedMapView?.worldId)
    const currentWorld = worlds.value.find((world) => world.id === GMManager.selectedTeleportWorld.value)
    selectedWorldId.value = storedWorld?.id ?? currentWorld?.id ?? worlds.value[0].id
}

const saveSettings = () => {
    if (!worldSettings.value || !Number.isInteger(selectedWorldId.value)) {
        return
    }

    let attributes
    try {
        attributes = JSON.parse(attributesJson.value)
    } catch {
        attributesError.value = 'Attributes must be valid JSON.'
        return
    }
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
        attributesError.value = 'Attributes must be a JSON object.'
        return
    }

    attributesError.value = ''
    GMManager.saveWorldSettings(selectedWorldId.value, {
        name: name.value,
        mapId: mapId.value,
        seaWaterLevel: seaWaterLevel.value === '' ? null : seaWaterLevel.value,
        environment: {
            type: environmentType.value,
            ...(environmentCategory.value.trim() ? {category: environmentCategory.value.trim()} : {}),
        },
        attributes,
    })
}

const loadMapImage = () => {
    if (!Number.isInteger(selectedWorldId.value)) {
        return
    }
    mapImage.value = null
    mapPixelContext = null
    mapPixelCanvas = null
    waterOverlayCanvas = null
    waterOverlayContext = null
    mapHoverValue.value = 'Loading map...'
    GMManager.loadWorldMapImage(selectedWorldId.value, selectedMapType.value)
    drawMap()
}

const drawMap = () => {
    const viewport = mapViewportRef.value
    const canvas = mapCanvasRef.value
    if (!viewport || !canvas) {
        return
    }
    const dpr = window.devicePixelRatio || 1
    const width = viewport.clientWidth
    const height = viewport.clientHeight
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (!mapImage.value) {
        return
    }
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
        mapPixelCanvas || mapImage.value,
        mapPanX.value,
        mapPanY.value,
        mapImage.value.naturalWidth * mapZoom.value,
        mapImage.value.naturalHeight * mapZoom.value,
    )
    if (waterOverlayCanvas) {
        ctx.drawImage(
            waterOverlayCanvas,
            mapPanX.value,
            mapPanY.value,
            mapImage.value.naturalWidth * mapZoom.value,
            mapImage.value.naturalHeight * mapZoom.value,
        )
    }
    drawBrushPreview(ctx)
    drawImpassableBoundaries(ctx, width, height)
}

const drawImpassableBoundaries = (ctx, viewportWidth, viewportHeight) => {
    if (!highlightImpassable.value || selectedMapType.value !== 'height' || !mapPixelCanvas || !mapPixelContext) {
        return
    }
    drawHeightImpassableBoundaries(ctx, {
        pixelCanvas: mapPixelCanvas,
        pixelContext: mapPixelContext,
        panX: mapPanX.value,
        panY: mapPanY.value,
        zoom: mapZoom.value,
        viewportWidth,
        viewportHeight,
    })
}

const createWaterOverlay = () => {
    waterOverlayCanvas = null
    waterOverlayContext = null
    const seaWaterLevel = worldSettings.value?.seaWaterLevel
    const waterLevel = Number(seaWaterLevel)
    if (selectedMapType.value !== 'height' || !mapPixelCanvas || !mapPixelContext || seaWaterLevel === null || seaWaterLevel === undefined || !Number.isFinite(waterLevel)) {
        return
    }
    const overlay = createHeightWaterOverlay(mapPixelCanvas, mapPixelContext, waterLevel)
    waterOverlayCanvas = overlay?.canvas ?? null
    waterOverlayContext = overlay?.context ?? null
}

const updateWaterOverlayPixel = (x, z, height) => {
    const seaWaterLevel = worldSettings.value?.seaWaterLevel
    updateHeightWaterOverlayPixel(waterOverlayContext, seaWaterLevel, x, z, height)
}

const drawBrushPreview = (ctx) => {
    if (selectedMapType.value !== 'height' || !mapHoverCoordinates.value || !mapImage.value) {
        return
    }
    const bounds = getBrushBounds(mapHoverCoordinates.value)
    const brushPixels = getBrushPixelCoordinates(mapHoverCoordinates.value)
    const previewHeight = getBrushTargetHeight(brushPixels)
    drawHeightBrushPreview(ctx, {
        bounds,
        brushPixels,
        brushShape: brushShape.value,
        previewHeight,
        panX: mapPanX.value,
        panY: mapPanY.value,
        zoom: mapZoom.value,
    })
}

const getBrushTargetHeight = (brushPixels) => {
    const exactHeight = Math.max(1, Math.min(31, Math.round(targetHeight.value)))
    return getHeightBrushTargetHeight(
        brushPixels,
        heightEditMode.value,
        exactHeight,
        (x, z) => Math.floor(mapPixelContext.getImageData(x, z, 1, 1).data[0] / 8),
    )
}

const getBrushBounds = (center) => {
    if (!mapImage.value) {
        return null
    }
    const mapSize = worldSettings.value?.size ?? mapImage.value.naturalWidth
    return getHeightBrushBounds(center, brushSize.value, mapSize)
}

const getBrushPixelCoordinates = (center) => {
    if (!mapImage.value) {
        return []
    }
    return getHeightBrushPixelCoordinates(center, brushSize.value, brushShape.value, worldSettings.value?.size ?? mapImage.value.naturalWidth)
}

const selectBrush = (shape, size) => {
    brushShape.value = shape
    brushSize.value = size
}

const cycleBrush = (event) => {
    if (selectedMapType.value !== 'height') {
        return
    }
    const brushes = [
        ...squareBrushSizes.map((size) => ({shape: 'square', size})),
        ...circleBrushSizes.map((size) => ({shape: 'circle', size})),
    ]
    const currentIndex = brushes.findIndex((brush) => brush.shape === brushShape.value && brush.size === brushSize.value)
    const direction = event.deltaY > 0 ? -1 : 1
    const nextIndex = (currentIndex + direction + brushes.length) % brushes.length
    selectBrush(brushes[nextIndex].shape, brushes[nextIndex].size)
}

const startMapDrag = (event) => {
    if (event.button !== 1) {
        return
    }
    mapDrag.active = true
    mapDrag.x = event.clientX
    mapDrag.y = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
}

const handleMapPointerDown = (event) => {
    if (event.button === 2 && selectedMapType.value === 'height') {
        event.preventDefault()
        const coords = getMapPixelCoordinates(event)
        if (!coords || !mapPixelContext) {
            return
        }
        const [r] = mapPixelContext.getImageData(coords.x, coords.z, 1, 1).data
        targetHeight.value = Math.max(1, Math.min(31, Math.floor(r / 8)))
        return
    }
    startMapDrag(event)
}

const dragMap = (event) => {
    if (!mapDrag.active) {
        return
    }
    mapPanX.value += event.clientX - mapDrag.x
    mapPanY.value += event.clientY - mapDrag.y
    mapDrag.x = event.clientX
    mapDrag.y = event.clientY
    drawMap()
}

const handleMapPointerMove = (event) => {
    inspectMapPixel(event)
    dragMap(event)
}

const inspectMapPixel = (event) => {
    const coords = getMapPixelCoordinates(event)
    if (!coords || !mapPixelContext) {
        return
    }
    const [r, g, b] = mapPixelContext.getImageData(coords.x, coords.z, 1, 1).data
    mapHoverCoordinates.value = coords
    mapHoverValue.value = `X ${coords.x}, Z ${coords.z} — ${getMapPixelValue(r, g, b)}`
    drawMap()
}

const getMapPixelCoordinates = (event) => {
    const canvas = mapCanvasRef.value
    if (!canvas || !mapImage.value) {
        return null
    }
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((event.clientX - rect.left - mapPanX.value) / mapZoom.value)
    const z = Math.floor((event.clientY - rect.top - mapPanY.value) / mapZoom.value)
    if (x < 0 || z < 0 || x >= mapImage.value.naturalWidth || z >= mapImage.value.naturalHeight) {
        mapHoverValue.value = 'Outside map'
        mapHoverCoordinates.value = null
        drawMap()
        return null
    }
    return {x, z}
}

const editMapPixel = (event) => {
    if (event.button !== 0 || selectedMapType.value !== 'height' || savingMapData.value || !Number.isInteger(selectedWorldId.value)) {
        return
    }
    const coords = getMapPixelCoordinates(event)
    if (!coords) {
        return
    }
    let changes = pendingHeightChangesByWorld.get(selectedWorldId.value)
    if (!changes) {
        changes = new Map()
        pendingHeightChangesByWorld.set(selectedWorldId.value, changes)
    }
    const brushPixels = []
    for (const pixel of getBrushPixelCoordinates(coords)) {
        const [red] = mapPixelContext.getImageData(pixel.x, pixel.z, 1, 1).data
        brushPixels.push({...pixel, height: Math.floor(red / 8)})
    }
    if (brushPixels.length === 0) {
        return
    }

    const exactHeight = Math.max(1, Math.min(31, Math.round(targetHeight.value)))
    targetHeight.value = exactHeight
    const targetBrushHeight = getTargetBrushHeight(brushPixels, heightEditMode.value, exactHeight)
    const gray = targetBrushHeight * 8
    mapPixelContext.fillStyle = `rgb(${gray}, ${gray}, ${gray})`
    for (const pixel of brushPixels) {
        changes.set(`${pixel.x};${pixel.z}`, {x: pixel.x, z: pixel.z, height: targetBrushHeight})
        mapPixelContext.fillRect(pixel.x, pixel.z, 1, 1)
        updateWaterOverlayPixel(pixel.x, pixel.z, targetBrushHeight)
    }
    pendingHeightChangeCount.value = changes.size
    drawMap()
}

const saveMapData = () => {
    if (!Number.isInteger(selectedWorldId.value) || savingMapData.value) {
        return
    }
    const changes = pendingHeightChangesByWorld.get(selectedWorldId.value)
    if (!changes || changes.size === 0) {
        return
    }
    savingMapData.value = true
    savingMapWorldId.value = selectedWorldId.value
    GMManager.saveWorldMapHeightChanges(selectedWorldId.value, Array.from(changes.values()))
}

const getMapPixelValue = (r, g, b) => {
    if (selectedMapType.value === 'height') {
        return getHeightMapPixelValue(r)
    }
    if (selectedMapType.value === 'terrain') {
        return getTerrainMapPixelValue(r, g, b, worldSettings.value?.environment.category)
    }
    if (selectedMapType.value === 'snow') {
        return getSnowMapPixelValue(r, g, b)
    }
    return getGatheringMapPixelValue(r)
}

const stopMapDrag = (event) => {
    if (!mapDrag.active) {
        return
    }
    mapDrag.active = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
    }
}

watch(worlds, () => {
    if (dialogVisible.value) {
        selectInitialWorld()
    }
})

watch(selectedWorldId, (worldId) => {
    if (Number.isInteger(worldId)) {
        GMManager.worldSettings.value = null
        GMManager.loadWorldSettings(worldId)
        const storedMapView = getStoredMapView()
        mapPanX.value = worldId === storedMapView?.worldId ? storedMapView.panX : 0
        mapPanY.value = worldId === storedMapView?.worldId ? storedMapView.panY : 0
        pendingHeightChangeCount.value = pendingHeightChangesByWorld.get(worldId)?.size ?? 0
        loadMapImage()
    }
})

watch(selectedMapType, loadMapImage)

watch(mapZoom, (zoom) => {
    localStorage.setItem(WORLD_MAP_ZOOM_LS_KEY, String(zoom))
    drawMap()
})

watch([brushSize, brushShape], drawMap)
watch(highlightImpassable, drawMap)

watch([targetHeight, brushSize, brushShape, heightEditMode], ([height, size, shape, mode]) => {
    const safeHeight = Math.max(1, Math.min(31, Math.round(height)))
    if (safeHeight !== targetHeight.value) {
        targetHeight.value = safeHeight
        return
    }
    localStorage.setItem('worlds-map-height-tool', JSON.stringify({height: safeHeight, brushSize: size, brushShape: shape, mode}))
})

watch([selectedWorldId, selectedMapType, mapPanX, mapPanY], ([worldId, mapType, panX, panY]) => {
    if (!Number.isInteger(worldId)) {
        return
    }
    localStorage.setItem(WORLD_MAP_VIEW_LS_KEY, JSON.stringify({worldId, mapType, panX, panY}))
})

watch(() => GMManager.worldMapImage.value, (data) => {
    if (!data) {
        return
    }
    if (data.mapType === 'height' && savingMapData.value && data.worldId === savingMapWorldId.value) {
        pendingHeightChangesByWorld.delete(data.worldId)
        savingMapData.value = false
        savingMapWorldId.value = null
        if (data.worldId === selectedWorldId.value) {
            pendingHeightChangeCount.value = 0
        }
    }
    if (data.worldId !== selectedWorldId.value || data.mapType !== selectedMapType.value) {
        return
    }
    const image = new Image()
    image.onload = () => {
        const pixelCanvas = document.createElement('canvas')
        pixelCanvas.width = image.naturalWidth
        pixelCanvas.height = image.naturalHeight
        mapPixelContext = pixelCanvas.getContext('2d', {willReadFrequently: true})
        mapPixelContext.drawImage(image, 0, 0)
        mapPixelCanvas = pixelCanvas
        mapHoverCoordinates.value = null
        if (data.mapType === 'height') {
            const pendingChanges = pendingHeightChangesByWorld.get(data.worldId)
            pendingChanges?.forEach((change) => {
                const gray = change.height * 8
                mapPixelContext.fillStyle = `rgb(${gray}, ${gray}, ${gray})`
                mapPixelContext.fillRect(change.x, change.z, 1, 1)
            })
            createWaterOverlay()
        }
        mapImage.value = image
        mapHoverValue.value = 'Move over the map'
        drawMap()
    }
    image.src = `data:image/png;base64,${data.image}`
})

watch(environmentType, (type) => {
    environmentCategory.value = type === 'indoor' ? 'dungeon' : ''
})

watch(worldSettings, (settings) => {
    if (!settings || settings.id !== selectedWorldId.value) {
        return
    }
    name.value = settings.name
    mapId.value = settings.mapId
    seaWaterLevel.value = settings.seaWaterLevel
    environmentType.value = settings.environment.type
    environmentCategory.value = settings.environment.category ?? ''
    attributesJson.value = JSON.stringify(settings.attributes ?? {}, null, 2)
    attributesError.value = ''
    createWaterOverlay()
})

onMounted(() => {
    window.addEventListener('keydown', onDialogKeyDown)
    window.addEventListener('resize', drawMap)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onDialogKeyDown)
    window.removeEventListener('resize', drawMap)
})

defineExpose({
    openDialog,
    closeDialog,
})
</script>

<style scoped>
.dialog-backdrop.worlds-dialog-backdrop {
    left: 250px;
    width: calc(100vw - 250px);
}

.dialog-window.adaptive.worlds-dialog-window {
    width: 90%;
    max-width: none;
    height: 90vh;
    max-height: none;
    min-height: 0;
}

.worlds-dialog-window > .dialog-surface {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.worlds-dialog-content {
    flex: 1;
    padding: 8px;
    display: flex;
    gap: 8px;
    text-align: left;
}

.worlds-sidebar {
    flex: 0 0 20%;
    min-width: 180px;
    box-sizing: border-box;
    padding: 8px;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.03);
    overflow-y: auto;
}

.worlds-settings {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
}

.worlds-workspace {
    flex: 1;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.03);
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 8px;
}

.worlds-control {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
}

.worlds-control-row {
    display: flex;
    gap: 8px;
}

.worlds-control-row .worlds-control {
    flex: 1;
    min-width: 0;
}

.worlds-control input,
.worlds-control select,
.worlds-control textarea {
    width: 100%;
    box-sizing: border-box;
}

.worlds-control input[readonly] {
    opacity: 0.7;
}

.worlds-attributes-control textarea {
    min-height: 160px;
    resize: vertical;
    font-family: monospace;
}

.worlds-settings-actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    font-size: 11px;
}

.worlds-settings-error {
    color: #ff8b8b;
}

.world-map-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
}

.world-map-type-buttons,
.world-map-zoom-controls {
    display: flex;
    align-items: center;
    gap: 4px;
}

.world-map-info-row {
    min-height: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    padding: 0 4px;
    font-size: 12px;
}

.world-map-hover-value {
    text-align: right;
}

.world-map-height-control {
    display: flex;
    align-items: center;
    gap: 4px;
}

.world-map-height-mode-controls {
    display: flex;
    align-items: center;
    gap: 6px;
}

.world-map-height-tool-controls {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
}

.world-map-height-mode-controls label {
    display: flex;
    align-items: center;
    gap: 2px;
}

.world-map-highlight-control {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
}

.world-map-target-height-input {
    width: 3.5rem;
}

.world-map-brush-controls {
    display: flex;
    align-items: center;
    gap: 4px;
}

.world-map-circle-brush-button {
    white-space: nowrap;
}

.world-map-height-control input {
    width: 3.5rem;
}

.world-map-zoom-controls {
    font-size: 12px;
}

.world-map-viewport {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: #0d0d12;
    cursor: default;
}

.world-map-viewport:active {
    cursor: grabbing;
}

.world-map-canvas {
    display: block;
    width: 100%;
    height: 100%;
}

.world-map-save-actions {
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    font-size: 12px;
}
</style>
