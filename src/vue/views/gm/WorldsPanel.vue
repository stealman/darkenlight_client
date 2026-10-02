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
                                        <input v-if="heightEditMode === 'exact' || (heightEditMode === 'area' && areaAction === 'exact')" v-model.number="targetHeight" class="world-map-target-height-input" type="number" min="1" max="31" step="1">
                                    </label>
                                    <label><input v-model="heightEditMode" type="radio" value="up"> Up</label>
                                    <label><input v-model="heightEditMode" type="radio" value="down"> Down</label>
                                    <label><input v-model="heightEditMode" type="radio" value="area"> Area</label>
                                </div>
                                <label class="world-map-highlight-control"><input v-model="highlightImpassable" type="checkbox"> Highlight impassable</label>
                            </div>
                            <div v-if="selectedMapType === 'height' && heightEditMode === 'area' && !selectedAreaPixels.size" class="world-map-area-history">
                                <span>Previous area</span>
                                <select :value="selectedAreaHistoryIndex" @change="loadSavedArea($event.target.value)">
                                    <option value="">Select saved area...</option>
                                    <option v-for="(area, index) in savedAreas" :key="area.savedAt" :value="index">Area {{ index + 1 }} ({{ area.pixelCount }} px)</option>
                                </select>
                            </div>
                            <div v-else-if="selectedMapType === 'height' && (!selectedAreaPixels.size || heightEditMode !== 'area')" class="world-map-brush-controls">
                                <span>Brush</span>
                                <button v-for="size in squareBrushSizes" :key="`square-${size}`" :disabled="brushShape === 'square' && brushSize === size" @click="selectBrush('square', size)">{{ size }}</button>
                                <button v-for="size in circleBrushSizes" :key="`circle-${size}`" class="world-map-circle-brush-button" :disabled="brushShape === 'circle' && brushSize === size" @click="selectBrush('circle', size)">◯ {{ size }}</button>
                            </div>
                            <div v-else-if="selectedMapType === 'height' && heightEditMode === 'area'" class="world-map-area-actions">
                                <button @click="cancelAreaSelection">Cancel</button>
                                <select v-model="areaAction">
                                    <option value="">Choose action...</option>
                                    <option value="exact">Exact</option>
                                    <option value="up">Up</option>
                                    <option value="down">Down</option>
                                    <option value="randomize">Randomize</option>
                                </select>
                                <template v-if="areaAction === 'randomize'">
                                    <label class="world-map-area-field">Elevation
                                        <select v-model="randomizeElevationMode">
                                            <option value="exact">Exact</option>
                                            <option value="overlay">Overlay</option>
                                        </select>
                                    </label>
                                    <label class="world-map-area-field">{{ randomizeElevationMode === 'overlay' ? 'Min ΔY' : 'Min Y' }}<input v-model.number="randomizeMinY" type="number" :min="randomizeElevationMode === 'overlay' ? -31 : 1" max="31"></label>
                                    <label class="world-map-area-field">{{ randomizeElevationMode === 'overlay' ? 'Max ΔY' : 'Max Y' }}<input v-model.number="randomizeMaxY" type="number" :min="randomizeElevationMode === 'overlay' ? -31 : 1" max="31"></label>
                                    <label class="world-map-area-field">Large feature size<input v-model.number="randomizeLargeFeatureSize" type="number" min="1" max="1024"></label>
                                    <label class="world-map-area-field">Detail size<input v-model.number="randomizeDetailSize" type="number" min="1" max="1024"></label>
                                    <label class="world-map-area-field">Detail strength<input v-model.number="randomizeDetailStrength" type="number" min="0" max="31"></label>
                                    <label class="world-map-area-field">Roughness<input v-model.number="randomizeRoughness" type="number" min="0" max="6"></label>
                                    <label class="world-map-area-field">MaxSlope<input v-model.number="randomizeMaxSlope" type="number" min="0" max="31"></label>
                                    <label class="world-map-area-field">Seed<input v-model.number="randomizeSeed" type="number" min="0" max="2147483647"></label>
                                    <button @click="rerollRandomizeSeed">Re-roll</button>
                                </template>
                                <button v-if="overlayRandomizeActive" @click="previewRandomizeOverlay">PREVIEW</button>
                                <button :disabled="!areaAction || (overlayRandomizeActive && !hasRandomizePreview)" @click="applyAreaAction">OK</button>
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
                            @pointerup="handleMapPointerUp"
                            @pointercancel="handleMapPointerUp"
                            @click="editMapPixel"
                            @wheel.prevent="cycleBrush"
                        >
                            <canvas ref="mapCanvasRef" class="world-map-canvas"></canvas>
                        </div>
                        <div class="world-map-save-actions">
                            <span v-if="pendingHeightChangeCount">{{ pendingHeightChangeCount }} pending height {{ pendingHeightChangeCount === 1 ? 'change' : 'changes' }}</span>
                            <span v-else>No pending map changes</span>
                            <div class="world-map-save-buttons">
                                <button class="dialog-button" :disabled="selectedMapType !== 'height' || pendingHeightChangeCount === 0 || savingMapData" @click="saveMapData">
                                    <span class="ui-text-gradient--button-state">{{ savingMapData ? 'SAVING...' : 'SAVE MAP DATA' }}</span>
                                </button>
                                <button class="dialog-button" :disabled="selectedMapType !== 'height' || pendingHeightChangeCount === 0 || savingMapData" @click="discardMapChanges">
                                    <span class="ui-text-gradient--button-state">STORNO</span>
                                </button>
                            </div>
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
    appendAreaPathSegment,
    createAreaOverlay as createHeightAreaOverlay,
    createRandomizedAreaHeights,
    createWaterOverlay as createHeightWaterOverlay,
    drawAreaOverlay as drawHeightAreaOverlay,
    drawBrushPreview as drawHeightBrushPreview,
    drawImpassableBoundaries as drawHeightImpassableBoundaries,
    deserializeAreaPixels,
    getBrushBounds as getHeightBrushBounds,
    getBrushPixelCoordinates as getHeightBrushPixelCoordinates,
    getBrushTargetHeight as getHeightBrushTargetHeight,
    getAreaSelection,
    getAreaClosingTolerance,
    getConnectedAreaByHeight,
    getHeightMapPixelValue,
    getStoredHeightTool,
    getTargetBrushHeight,
    HEIGHT_EDIT_MODES,
    limitAreaSlope,
    serializeAreaPixels,
    SQUARE_BRUSH_SIZES,
    updateWaterOverlayPixel as updateHeightWaterOverlayPixel,
} from './worldMaps/heightMapEditor'
import { getTerrainMapPixelValue } from './worldMaps/terrainMapEditor'
import { getSnowMapPixelValue } from './worldMaps/snowMapEditor'
import { getGatheringMapPixelValue } from './worldMaps/gatheringMapEditor'

const WORLD_MAP_ZOOM_LS_KEY = 'worlds-map-zoom'
const WORLD_MAP_VIEW_LS_KEY = 'worlds-map-view'
const WORLD_MAP_RANDOMIZE_LS_KEY = 'worlds-map-randomize'
const WORLD_MAP_AREA_HISTORY_LS_KEY = 'worlds-map-area-history'

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

const getStoredRandomizeSettings = () => {
    try {
        const settings = JSON.parse(localStorage.getItem(WORLD_MAP_RANDOMIZE_LS_KEY) || 'null')
        const numericKeys = ['minY', 'maxY', 'largeFeatureSize', 'detailSize', 'detailStrength', 'roughness', 'maxSlope', 'seed']
        if (!settings || numericKeys.some((key) => !Number.isFinite(settings[key]))) {
            return null
        }
        return {...settings, elevationMode: settings.elevationMode === 'overlay' ? 'overlay' : 'exact'}
    } catch {
        return null
    }
}

const getStoredAreaHistory = () => {
    try {
        const history = JSON.parse(localStorage.getItem(WORLD_MAP_AREA_HISTORY_LS_KEY) || '{}')
        return history && typeof history === 'object' && !Array.isArray(history) ? history : {}
    } catch {
        return {}
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
const initialRandomizeSettings = getStoredRandomizeSettings()
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
const selectedAreaPixels = ref(new Set())
const areaAction = ref('')
const areaHistoryByWorld = ref(getStoredAreaHistory())
const selectedAreaHistoryIndex = ref('')
const randomizeElevationMode = ref(initialRandomizeSettings?.elevationMode ?? 'exact')
const randomizeMinY = ref(initialRandomizeSettings?.minY ?? 1)
const randomizeMaxY = ref(initialRandomizeSettings?.maxY ?? 31)
const randomizeLargeFeatureSize = ref(initialRandomizeSettings?.largeFeatureSize ?? 48)
const randomizeDetailSize = ref(initialRandomizeSettings?.detailSize ?? 12)
const randomizeDetailStrength = ref(initialRandomizeSettings?.detailStrength ?? 2)
const randomizeRoughness = ref(initialRandomizeSettings?.roughness ?? 3)
const randomizeMaxSlope = ref(initialRandomizeSettings?.maxSlope ?? 1)
const randomizeSeed = ref(initialRandomizeSettings?.seed ?? Math.floor(Math.random() * 2147483648))
const hasRandomizePreview = ref(false)
const areaDraw = {active: false, path: []}
const heightPaint = {active: false, lastCoords: null}
const mapDrag = {active: false, x: 0, y: 0}
let mapPixelContext = null
let mapPixelCanvas = null
let waterOverlayCanvas = null
let waterOverlayContext = null
let areaOverlayCanvas = null
let randomizePreviewCanvas = null
let randomizePreviewHeights = null
const pendingHeightChangesByWorld = new Map()
const pendingHeightChangeCount = ref(0)
const savingMapData = ref(false)
const savingMapWorldId = ref(null)

const selectedMapTypeLabel = computed(() => mapTypes.find((mapType) => mapType.id === selectedMapType.value)?.label ?? '')
const savedAreas = computed(() => Number.isInteger(selectedWorldId.value) ? areaHistoryByWorld.value[selectedWorldId.value] ?? [] : [])
const overlayRandomizeActive = computed(() => areaAction.value === 'randomize' && randomizeElevationMode.value === 'overlay')

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
    if (heightEditMode.value === 'exact' && event.key === 'Shift') {
        event.preventDefault()
        targetHeight.value = Math.min(31, targetHeight.value + 1)
        return
    }
    if (heightEditMode.value === 'exact' && event.key === 'Control') {
        event.preventDefault()
        targetHeight.value = Math.max(1, targetHeight.value - 1)
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
    areaOverlayCanvas = null
    randomizePreviewCanvas = null
    randomizePreviewHeights = null
    hasRandomizePreview.value = false
    cancelAreaSelection()
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
    drawSelectedArea(ctx)
    drawRandomizePreview(ctx)
    drawBrushPreview(ctx)
    drawImpassableBoundaries(ctx, width, height)
}

const drawRandomizePreview = (ctx) => {
    if (!randomizePreviewCanvas || !overlayRandomizeActive.value || heightEditMode.value !== 'area') {
        return
    }
    ctx.drawImage(
        randomizePreviewCanvas,
        mapPanX.value,
        mapPanY.value,
        randomizePreviewCanvas.width * mapZoom.value,
        randomizePreviewCanvas.height * mapZoom.value,
    )
}

const drawSelectedArea = (ctx) => {
    if (selectedMapType.value !== 'height' || heightEditMode.value !== 'area') {
        return
    }
    if (areaOverlayCanvas) {
        ctx.drawImage(areaOverlayCanvas, mapPanX.value, mapPanY.value, areaOverlayCanvas.width * mapZoom.value, areaOverlayCanvas.height * mapZoom.value)
        return
    }
    const mapWidth = mapPixelCanvas?.width ?? mapImage.value?.naturalWidth
    if (!mapWidth) {
        return
    }
    drawHeightAreaOverlay(ctx, new Set(areaDraw.path.map((pixel) => pixel.z * mapWidth + pixel.x)), mapWidth, mapPanX.value, mapPanY.value, mapZoom.value)
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
    if (selectedMapType.value !== 'height' || heightEditMode.value === 'area' || !mapHoverCoordinates.value || !mapImage.value) {
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
    if (event.button === 0 && selectedMapType.value === 'height' && heightEditMode.value === 'area' && !selectedAreaPixels.value.size) {
        const coords = getMapPixelCoordinates(event)
        if (!coords) {
            return
        }
        areaDraw.active = true
        areaDraw.path = [coords]
        event.currentTarget.setPointerCapture(event.pointerId)
        drawMap()
        return
    }
    if (event.button === 0 && selectedMapType.value === 'height' && heightEditMode.value === 'exact') {
        const coords = getMapPixelCoordinates(event)
        if (!coords) {
            return
        }
        heightPaint.active = true
        heightPaint.lastCoords = coords
        event.currentTarget.setPointerCapture(event.pointerId)
        editMapPixelAt(coords)
        return
    }
    if (event.button === 2 && selectedMapType.value === 'height') {
        event.preventDefault()
        const coords = getMapPixelCoordinates(event)
        if (!coords || !mapPixelContext) {
            return
        }
        if (heightEditMode.value === 'area' && mapPixelCanvas) {
            selectArea(getConnectedAreaByHeight(mapPixelContext, mapPixelCanvas.width, mapPixelCanvas.height, coords))
            drawMap()
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
    drawAreaSelection(event)
    paintHeightAlongPath(event)
    dragMap(event)
}

const paintHeightAlongPath = (event) => {
    if (!heightPaint.active) {
        return
    }
    const coords = getMapPixelCoordinates(event)
    if (!coords) {
        heightPaint.lastCoords = null
        return
    }
    if (!heightPaint.lastCoords) {
        heightPaint.lastCoords = coords
        editMapPixelAt(coords)
        return
    }
    const path = appendAreaPathSegment([heightPaint.lastCoords], heightPaint.lastCoords, coords)
    for (let index = 1; index < path.length; index++) {
        editMapPixelAt(path[index])
    }
    heightPaint.lastCoords = coords
}

const drawAreaSelection = (event) => {
    if (!areaDraw.active || !mapImage.value) {
        return
    }
    const coords = getMapPixelCoordinates(event)
    if (!coords) {
        return
    }
    const previous = areaDraw.path[areaDraw.path.length - 1]
    if (previous.x === coords.x && previous.z === coords.z) {
        return
    }
    const path = appendAreaPathSegment(areaDraw.path, previous, coords)
    const start = path[0]
    const closeTolerance = getAreaClosingTolerance(path)
    const closesArea = (coords.x === start.x && coords.z === start.z)
        || (closeTolerance > 0 && Math.hypot(coords.x - start.x, coords.z - start.z) <= closeTolerance)
    if (closesArea && path.length >= 4) {
        const mapSize = mapPixelCanvas?.width ?? mapImage.value.naturalWidth
        selectArea(getAreaSelection(appendAreaPathSegment(path, coords, start), mapSize))
        areaDraw.active = false
        areaDraw.path = []
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
    } else {
        areaDraw.path = path
    }
    drawMap()
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
    if (event.button !== 0 || selectedMapType.value !== 'height' || heightEditMode.value === 'area' || savingMapData.value || !Number.isInteger(selectedWorldId.value)) {
        return
    }
    const coords = getMapPixelCoordinates(event)
    if (!coords) {
        return
    }
    editMapPixelAt(coords)
}

const editMapPixelAt = (coords) => {
    if (selectedMapType.value !== 'height' || heightEditMode.value === 'area' || savingMapData.value || !Number.isInteger(selectedWorldId.value) || !mapPixelContext) {
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

const discardMapChanges = () => {
    if (!Number.isInteger(selectedWorldId.value) || savingMapData.value) {
        return
    }
    pendingHeightChangesByWorld.delete(selectedWorldId.value)
    pendingHeightChangeCount.value = 0
    cancelAreaSelection()
    loadMapImage()
}

const getRandomizeSettings = (mapSize) => {
    const clampInteger = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback
    const elevationMode = randomizeElevationMode.value === 'overlay' ? 'overlay' : 'exact'
    const randomizeMinimum = elevationMode === 'overlay' ? -31 : 1
    const minY = clampInteger(randomizeMinY.value, randomizeMinimum, 31, randomizeMinimum)
    const maxY = Math.max(minY, clampInteger(randomizeMaxY.value, randomizeMinimum, 31, 31))
    return {
        elevationMode,
        minY,
        maxY,
        largeFeatureSize: clampInteger(randomizeLargeFeatureSize.value, 1, mapSize, 48),
        detailSize: clampInteger(randomizeDetailSize.value, 1, mapSize, 12),
        detailStrength: clampInteger(randomizeDetailStrength.value, 0, 31, 2),
        roughness: clampInteger(randomizeRoughness.value, 0, 6, 3),
        maxSlope: clampInteger(randomizeMaxSlope.value, 0, 31, 1),
        seed: clampInteger(randomizeSeed.value, 0, 2147483647, 1),
    }
}

const normalizeRandomizeSettings = (settings) => {
    randomizeElevationMode.value = settings.elevationMode
    randomizeMinY.value = settings.minY
    randomizeMaxY.value = settings.maxY
    randomizeLargeFeatureSize.value = settings.largeFeatureSize
    randomizeDetailSize.value = settings.detailSize
    randomizeDetailStrength.value = settings.detailStrength
    randomizeRoughness.value = settings.roughness
    randomizeMaxSlope.value = settings.maxSlope
    randomizeSeed.value = settings.seed
}

const createRandomizedAreaResult = (settings) => {
    if (!mapPixelCanvas || !mapPixelContext) {
        return null
    }
    const mapSize = mapPixelCanvas.width
    const mapHeight = mapPixelCanvas.height
    const mapPixels = mapPixelContext.getImageData(0, 0, mapSize, mapHeight)
    const sourceHeights = new Uint8Array(mapSize * mapHeight)
    for (let index = 0; index < sourceHeights.length; index++) {
        sourceHeights[index] = Math.floor(mapPixels.data[index * 4] / 8)
    }
    const randomHeights = createRandomizedAreaHeights(
        selectedAreaPixels.value,
        mapSize,
        settings.elevationMode === 'overlay' ? new Int16Array(sourceHeights.length) : sourceHeights,
        {...settings, maxSlope: settings.elevationMode === 'overlay' ? 31 : settings.maxSlope},
    )
    if (settings.elevationMode !== 'overlay') {
        return {heights: randomHeights, mapSize, mapHeight}
    }
    const overlayHeights = new Int16Array(sourceHeights)
    for (const index of selectedAreaPixels.value) {
        overlayHeights[index] = Math.max(1, Math.min(31, sourceHeights[index] + randomHeights[index]))
    }
    limitAreaSlope(selectedAreaPixels.value, mapSize, overlayHeights, sourceHeights, 1, 31, settings.maxSlope)
    return {heights: overlayHeights, mapSize, mapHeight}
}

const clearRandomizePreview = (redraw = true) => {
    randomizePreviewCanvas = null
    randomizePreviewHeights = null
    hasRandomizePreview.value = false
    if (redraw) {
        drawMap()
    }
}

const previewRandomizeOverlay = () => {
    if (!overlayRandomizeActive.value || !selectedAreaPixels.value.size || !mapPixelCanvas || !mapPixelContext) {
        return
    }
    const settings = getRandomizeSettings(mapPixelCanvas.width)
    const result = createRandomizedAreaResult(settings)
    if (!result) {
        return
    }
    const canvas = document.createElement('canvas')
    canvas.width = result.mapSize
    canvas.height = result.mapHeight
    const context = canvas.getContext('2d')
    const pixels = context.createImageData(result.mapSize, result.mapHeight)
    for (const index of selectedAreaPixels.value) {
        const gray = result.heights[index] * 8
        pixels.data[index * 4] = gray
        pixels.data[index * 4 + 1] = gray
        pixels.data[index * 4 + 2] = gray
        pixels.data[index * 4 + 3] = 255
    }
    context.putImageData(pixels, 0, 0)
    randomizePreviewCanvas = canvas
    randomizePreviewHeights = result.heights
    hasRandomizePreview.value = true
    drawMap()
}

const applyAreaAction = () => {
    if (!['exact', 'up', 'down', 'randomize'].includes(areaAction.value) || !selectedAreaPixels.value.size || !mapPixelContext || !mapPixelCanvas || !Number.isInteger(selectedWorldId.value)) {
        return
    }
    if (overlayRandomizeActive.value && (!hasRandomizePreview.value || !randomizePreviewHeights)) {
        return
    }
    const exactHeight = Math.max(1, Math.min(31, Math.round(targetHeight.value)))
    targetHeight.value = exactHeight
    const mapSize = mapPixelCanvas.width
    const mapHeight = mapPixelCanvas.height
    let randomizedHeights = null
    if (areaAction.value === 'randomize') {
        const settings = getRandomizeSettings(mapSize)
        randomizedHeights = settings.elevationMode === 'overlay'
            ? randomizePreviewHeights
            : createRandomizedAreaResult(settings)?.heights
        normalizeRandomizeSettings(settings)
        if (!randomizedHeights) {
            return
        }
    }
    let changes = pendingHeightChangesByWorld.get(selectedWorldId.value)
    if (!changes) {
        changes = new Map()
        pendingHeightChangesByWorld.set(selectedWorldId.value, changes)
    }
    const mapPixels = mapPixelContext.getImageData(0, 0, mapSize, mapHeight)
    for (const index of selectedAreaPixels.value) {
        const x = index % mapSize
        const z = Math.floor(index / mapSize)
        if (x < 0 || z < 0 || x >= mapSize || z >= mapHeight) {
            continue
        }
        const currentHeight = Math.floor(mapPixels.data[index * 4] / 8)
        const height = areaAction.value === 'randomize'
            ? randomizedHeights[index]
            : areaAction.value === 'up'
            ? Math.min(31, currentHeight + 1)
            : areaAction.value === 'down'
                ? Math.max(1, currentHeight - 1)
                : exactHeight
        const gray = height * 8
        mapPixels.data[index * 4] = gray
        mapPixels.data[index * 4 + 1] = gray
        mapPixels.data[index * 4 + 2] = gray
        changes.set(`${x};${z}`, {x, z, height})
    }
    mapPixelContext.putImageData(mapPixels, 0, 0)
    clearRandomizePreview(false)
    createWaterOverlay()
    pendingHeightChangeCount.value = changes.size
    saveSelectedAreaHistory()
    drawMap()
}

const rerollRandomizeSeed = () => {
    randomizeSeed.value = Math.floor(Math.random() * 2147483648)
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

const handleMapPointerUp = (event) => {
    if (heightPaint.active) {
        heightPaint.active = false
        heightPaint.lastCoords = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
        return
    }
    if (areaDraw.active) {
        areaDraw.active = false
        areaDraw.path = []
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
        drawMap()
        return
    }
    stopMapDrag(event)
}

const cancelAreaSelection = () => {
    clearRandomizePreview(false)
    selectedAreaPixels.value = new Set()
    areaDraw.active = false
    areaDraw.path = []
    areaAction.value = ''
    selectedAreaHistoryIndex.value = ''
    areaOverlayCanvas = null
    drawMap()
}

const selectArea = (areaPixels) => {
    clearRandomizePreview(false)
    selectedAreaPixels.value = areaPixels
    areaAction.value = ''
    selectedAreaHistoryIndex.value = ''
    areaOverlayCanvas = mapPixelCanvas ? createHeightAreaOverlay(areaPixels, mapPixelCanvas.width, mapPixelCanvas.height) : null
}

const saveSelectedAreaHistory = () => {
    if (!Number.isInteger(selectedWorldId.value) || !mapPixelCanvas || !selectedAreaPixels.value.size) {
        return
    }
    const width = mapPixelCanvas.width
    const rows = serializeAreaPixels(selectedAreaPixels.value, width)
    const currentAreas = areaHistoryByWorld.value[selectedWorldId.value] ?? []
    const serializedRows = JSON.stringify(rows)
    const areas = [{savedAt: Date.now(), width, rows, pixelCount: selectedAreaPixels.value.size}, ...currentAreas.filter((area) => JSON.stringify(area.rows) !== serializedRows)].slice(0, 10)
    areaHistoryByWorld.value = {...areaHistoryByWorld.value, [selectedWorldId.value]: areas}
    try {
        localStorage.setItem(WORLD_MAP_AREA_HISTORY_LS_KEY, JSON.stringify(areaHistoryByWorld.value))
    } catch {
        // A very large or fragmented area can exceed the browser localStorage quota.
    }
}

const loadSavedArea = (historyIndex) => {
    const index = Number(historyIndex)
    const area = Number.isInteger(index) ? savedAreas.value[index] : null
    if (!area || !mapPixelCanvas || area.width !== mapPixelCanvas.width) {
        return
    }
    const areaPixels = deserializeAreaPixels(area.rows, area.width)
    if (areaPixels.size === 0) {
        return
    }
    selectArea(areaPixels)
    selectedAreaHistoryIndex.value = String(index)
    drawMap()
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
    drawMap()
})

watch([randomizeElevationMode, randomizeMinY, randomizeMaxY, randomizeLargeFeatureSize, randomizeDetailSize, randomizeDetailStrength, randomizeRoughness, randomizeMaxSlope, randomizeSeed], ([elevationMode, minY, maxY, largeFeatureSize, detailSize, detailStrength, roughness, maxSlope, seed]) => {
    clearRandomizePreview()
    localStorage.setItem(WORLD_MAP_RANDOMIZE_LS_KEY, JSON.stringify({elevationMode, minY, maxY, largeFeatureSize, detailSize, detailStrength, roughness, maxSlope, seed}))
})

watch([areaAction, heightEditMode], () => clearRandomizePreview())

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

.world-map-area-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
}

.world-map-area-history {
    display: flex;
    align-items: center;
    gap: 6px;
}

.world-map-area-field {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    white-space: nowrap;
}

.world-map-area-field input {
    width: 3.25rem;
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

.world-map-save-buttons {
    display: flex;
    gap: 6px;
}
</style>
