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

const WORLD_MAP_ZOOM_LS_KEY = 'worlds-map-zoom'
const WORLD_MAP_VIEW_LS_KEY = 'worlds-map-view'
const WORLD_MAP_HEIGHT_TOOL_LS_KEY = 'worlds-map-height-tool'
const HEIGHT_EDIT_MODES = ['exact', 'up', 'down']

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

const getStoredHeightTool = () => {
    try {
        const tool = JSON.parse(localStorage.getItem(WORLD_MAP_HEIGHT_TOOL_LS_KEY) || 'null')
        if (!tool || !Number.isInteger(tool.height) || ![1, 2, 4, 8, 12, 16].includes(tool.brushSize)) {
            return null
        }
        const mode = ['exact', 'up', 'down'].includes(tool.mode) ? tool.mode : 'exact'
        const brushShape = tool.brushShape === 'circle' ? 'circle' : 'square'
        return {height: Math.max(1, Math.min(31, tool.height)), brushSize: tool.brushSize, brushShape, mode}
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
const squareBrushSizes = [1, 2, 4, 8, 16]
const circleBrushSizes = [4, 8, 12, 16]
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
    const zoom = mapZoom.value
    const minX = Math.max(0, Math.floor(-mapPanX.value / zoom) - 1)
    const minZ = Math.max(0, Math.floor(-mapPanY.value / zoom) - 1)
    const maxX = Math.min(mapPixelCanvas.width - 1, Math.ceil((viewportWidth - mapPanX.value) / zoom) + 1)
    const maxZ = Math.min(mapPixelCanvas.height - 1, Math.ceil((viewportHeight - mapPanY.value) / zoom) + 1)
    if (minX > maxX || minZ > maxZ) {
        return
    }

    const regionWidth = maxX - minX + 1
    const regionHeight = maxZ - minZ + 1
    const heights = mapPixelContext.getImageData(minX, minZ, regionWidth, regionHeight).data
    const getHeight = (x, z) => Math.floor(heights[((z - minZ) * regionWidth + x - minX) * 4] / 8)
    ctx.strokeStyle = '#ff3030'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
            const currentHeight = getHeight(x, z)
            const screenX = mapPanX.value + x * zoom
            const screenZ = mapPanY.value + z * zoom
            if (x < maxX && Math.abs(currentHeight - getHeight(x + 1, z)) > 1) {
                ctx.moveTo(screenX + zoom + 0.5, screenZ)
                ctx.lineTo(screenX + zoom + 0.5, screenZ + zoom)
            }
            if (z < maxZ && Math.abs(currentHeight - getHeight(x, z + 1)) > 1) {
                ctx.moveTo(screenX, screenZ + zoom + 0.5)
                ctx.lineTo(screenX + zoom, screenZ + zoom + 0.5)
            }
        }
    }
    ctx.stroke()
}

const createWaterOverlay = () => {
    waterOverlayCanvas = null
    waterOverlayContext = null
    const seaWaterLevel = worldSettings.value?.seaWaterLevel
    const waterLevel = Number(seaWaterLevel)
    if (selectedMapType.value !== 'height' || !mapPixelCanvas || !mapPixelContext || seaWaterLevel === null || seaWaterLevel === undefined || !Number.isFinite(waterLevel)) {
        return
    }
    const width = mapPixelCanvas.width
    const height = mapPixelCanvas.height
    const sourcePixels = mapPixelContext.getImageData(0, 0, width, height).data
    waterOverlayCanvas = document.createElement('canvas')
    waterOverlayCanvas.width = width
    waterOverlayCanvas.height = height
    waterOverlayContext = waterOverlayCanvas.getContext('2d')
    const overlayPixels = waterOverlayContext.createImageData(width, height)
    for (let index = 0; index < sourcePixels.length; index += 4) {
        if (Math.floor(sourcePixels[index] / 8) < waterLevel) {
            overlayPixels.data[index] = 12
            overlayPixels.data[index + 1] = 43
            overlayPixels.data[index + 2] = 100
            overlayPixels.data[index + 3] = 150
        }
    }
    waterOverlayContext.putImageData(overlayPixels, 0, 0)
}

const updateWaterOverlayPixel = (x, z, height) => {
    const seaWaterLevel = worldSettings.value?.seaWaterLevel
    if (!waterOverlayContext || seaWaterLevel === null || seaWaterLevel === undefined || !Number.isFinite(Number(seaWaterLevel))) {
        return
    }
    if (height < Number(worldSettings.value.seaWaterLevel)) {
        waterOverlayContext.fillStyle = 'rgba(12, 43, 100, 0.59)'
        waterOverlayContext.fillRect(x, z, 1, 1)
        return
    }
    waterOverlayContext.clearRect(x, z, 1, 1)
}

const drawBrushPreview = (ctx) => {
    if (selectedMapType.value !== 'height' || !mapHoverCoordinates.value || !mapImage.value) {
        return
    }
    const bounds = getBrushBounds(mapHoverCoordinates.value)
    if (!bounds) {
        return
    }
    const brushPixels = getBrushPixelCoordinates(mapHoverCoordinates.value)
    const previewHeight = getBrushTargetHeight(brushPixels)
    if (previewHeight !== null) {
        const gray = previewHeight * 8
        ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`
        for (const pixel of brushPixels) {
            ctx.fillRect(
                mapPanX.value + pixel.x * mapZoom.value,
                mapPanY.value + pixel.z * mapZoom.value,
                mapZoom.value,
                mapZoom.value,
            )
        }
    }
    ctx.strokeStyle = '#ff3030'
    ctx.lineWidth = 1
    if (brushShape.value === 'square') {
        ctx.strokeRect(
            mapPanX.value + bounds.minX * mapZoom.value + 0.5,
            mapPanY.value + bounds.minZ * mapZoom.value + 0.5,
            (bounds.maxX - bounds.minX + 1) * mapZoom.value,
            (bounds.maxZ - bounds.minZ + 1) * mapZoom.value,
        )
        return
    }
    const pixelKeys = new Set(brushPixels.map((pixel) => `${pixel.x};${pixel.z}`))
    ctx.beginPath()
    for (const pixel of brushPixels) {
        const x = mapPanX.value + pixel.x * mapZoom.value
        const z = mapPanY.value + pixel.z * mapZoom.value
        const size = mapZoom.value
        if (!pixelKeys.has(`${pixel.x - 1};${pixel.z}`)) {
            ctx.moveTo(x + 0.5, z)
            ctx.lineTo(x + 0.5, z + size)
        }
        if (!pixelKeys.has(`${pixel.x + 1};${pixel.z}`)) {
            ctx.moveTo(x + size + 0.5, z)
            ctx.lineTo(x + size + 0.5, z + size)
        }
        if (!pixelKeys.has(`${pixel.x};${pixel.z - 1}`)) {
            ctx.moveTo(x, z + 0.5)
            ctx.lineTo(x + size, z + 0.5)
        }
        if (!pixelKeys.has(`${pixel.x};${pixel.z + 1}`)) {
            ctx.moveTo(x, z + size + 0.5)
            ctx.lineTo(x + size, z + size + 0.5)
        }
    }
    ctx.stroke()
}

const getBrushTargetHeight = (brushPixels) => {
    const exactHeight = Math.max(1, Math.min(31, Math.round(targetHeight.value)))
    if (heightEditMode.value === 'exact' || !mapPixelContext || brushPixels.length === 0) {
        return exactHeight
    }
    let minHeight = 31
    let maxHeight = 1
    for (const pixel of brushPixels) {
        const [red] = mapPixelContext.getImageData(pixel.x, pixel.z, 1, 1).data
        const height = Math.floor(red / 8)
        minHeight = Math.min(minHeight, height)
        maxHeight = Math.max(maxHeight, height)
    }
    if (heightEditMode.value === 'up') {
        return minHeight === maxHeight ? Math.min(31, maxHeight + 1) : maxHeight
    }
    return minHeight === maxHeight ? Math.max(1, minHeight - 1) : minHeight
}

const getBrushBounds = (center) => {
    if (!mapImage.value) {
        return null
    }
    const mapSize = worldSettings.value?.size ?? mapImage.value.naturalWidth
    const startX = center.x - Math.floor(brushSize.value / 2)
    const startZ = center.z - Math.floor(brushSize.value / 2)
    const minX = Math.max(1, startX)
    const minZ = Math.max(1, startZ)
    const maxX = Math.min(mapSize - 2, startX + brushSize.value - 1)
    const maxZ = Math.min(mapSize - 2, startZ + brushSize.value - 1)
    if (minX > maxX || minZ > maxZ) {
        return null
    }
    return {startX, startZ, minX, minZ, maxX, maxZ}
}

const getBrushPixelCoordinates = (center) => {
    const bounds = getBrushBounds(center)
    if (!bounds) {
        return []
    }
    const pixels = []
    const circleCenterX = bounds.startX + brushSize.value / 2
    const circleCenterZ = bounds.startZ + brushSize.value / 2
    const radius = brushSize.value / 2
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
            if (brushShape.value === 'circle' && Math.hypot(x + 0.5 - circleCenterX, z + 0.5 - circleCenterZ) > radius) {
                continue
            }
            pixels.push({x, z})
        }
    }
    return pixels
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
    const minBrushHeight = Math.min(...brushPixels.map((pixel) => pixel.height))
    const maxBrushHeight = Math.max(...brushPixels.map((pixel) => pixel.height))
    const targetBrushHeight = heightEditMode.value === 'up'
        ? (minBrushHeight === maxBrushHeight ? Math.min(31, maxBrushHeight + 1) : maxBrushHeight)
        : heightEditMode.value === 'down'
            ? (minBrushHeight === maxBrushHeight ? Math.max(1, minBrushHeight - 1) : minBrushHeight)
            : exactHeight
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
        return `Y ${Math.floor(r / 8)}`
    }
    if (selectedMapType.value === 'terrain') {
        if (r === 0 && g === 255 && b === 0) return 'Grass'
        if (r === 128 && g === 128 && b === 128) return 'Mountain'
        if (r === 110 && g === 90 && b === 60) return 'Muddy Dirt'
        if (r === 0 && g === 0 && b === 255) return 'Water'
        if (r === 0 && g === 0 && b === 0 && worldSettings.value?.environment.category === 'dungeon') return 'Empty'
        return 'Dirt'
    }
    if (selectedMapType.value === 'snow') {
        return r === 255 && g === 255 && b === 255 ? 'Snow' : 'Empty'
    }
    return `Value ${r}`
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
    localStorage.setItem(WORLD_MAP_HEIGHT_TOOL_LS_KEY, JSON.stringify({height: safeHeight, brushSize: size, brushShape: shape, mode}))
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
