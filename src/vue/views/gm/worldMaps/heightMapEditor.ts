export const HEIGHT_EDIT_MODES = ['exact', 'up', 'down']
export const SQUARE_BRUSH_SIZES = [1, 2, 4, 8, 16]
export const CIRCLE_BRUSH_SIZES = [4, 8, 12, 16]

export const getStoredHeightTool = () => {
    try {
        const tool = JSON.parse(localStorage.getItem('worlds-map-height-tool') || 'null')
        if (!tool || !Number.isInteger(tool.height) || ![1, 2, 4, 8, 12, 16].includes(tool.brushSize)) {
            return null
        }
        return {
            height: Math.max(1, Math.min(31, tool.height)),
            brushSize: tool.brushSize,
            brushShape: tool.brushShape === 'circle' ? 'circle' : 'square',
            mode: HEIGHT_EDIT_MODES.includes(tool.mode) ? tool.mode : 'exact',
        }
    } catch {
        return null
    }
}

export const getBrushBounds = (center, brushSize, mapSize) => {
    const startX = center.x - Math.floor(brushSize / 2)
    const startZ = center.z - Math.floor(brushSize / 2)
    const minX = Math.max(1, startX)
    const minZ = Math.max(1, startZ)
    const maxX = Math.min(mapSize - 2, startX + brushSize - 1)
    const maxZ = Math.min(mapSize - 2, startZ + brushSize - 1)
    return minX > maxX || minZ > maxZ ? null : {startX, startZ, minX, minZ, maxX, maxZ}
}

export const getBrushPixelCoordinates = (center, brushSize, brushShape, mapSize) => {
    const bounds = getBrushBounds(center, brushSize, mapSize)
    if (!bounds) {
        return []
    }
    const pixels = []
    const circleCenterX = bounds.startX + brushSize / 2
    const circleCenterZ = bounds.startZ + brushSize / 2
    const radius = brushSize / 2
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
            if (brushShape === 'circle' && Math.hypot(x + 0.5 - circleCenterX, z + 0.5 - circleCenterZ) > radius) {
                continue
            }
            pixels.push({x, z})
        }
    }
    return pixels
}

export const getTargetBrushHeight = (brushPixels, mode, exactHeight) => {
    const minHeight = Math.min(...brushPixels.map((pixel) => pixel.height))
    const maxHeight = Math.max(...brushPixels.map((pixel) => pixel.height))
    if (mode === 'up') {
        return minHeight === maxHeight ? Math.min(31, maxHeight + 1) : maxHeight
    }
    if (mode === 'down') {
        return minHeight === maxHeight ? Math.max(1, minHeight - 1) : minHeight
    }
    return exactHeight
}

export const getBrushTargetHeight = (brushPixels, mode, exactHeight, getPixelHeight) => {
    if (mode === 'exact' || brushPixels.length === 0) {
        return exactHeight
    }
    return getTargetBrushHeight(brushPixels.map((pixel) => ({...pixel, height: getPixelHeight(pixel.x, pixel.z)})), mode, exactHeight)
}

export const createWaterOverlay = (pixelCanvas, pixelContext, seaWaterLevel) => {
    const waterLevel = Number(seaWaterLevel)
    if (!pixelCanvas || !pixelContext || seaWaterLevel === null || seaWaterLevel === undefined || !Number.isFinite(waterLevel)) {
        return null
    }
    const {width, height} = pixelCanvas
    const sourcePixels = pixelContext.getImageData(0, 0, width, height).data
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    const overlayPixels = context.createImageData(width, height)
    for (let index = 0; index < sourcePixels.length; index += 4) {
        if (Math.floor(sourcePixels[index] / 8) < waterLevel) {
            overlayPixels.data[index] = 12
            overlayPixels.data[index + 1] = 43
            overlayPixels.data[index + 2] = 100
            overlayPixels.data[index + 3] = 150
        }
    }
    context.putImageData(overlayPixels, 0, 0)
    return {canvas, context}
}

export const updateWaterOverlayPixel = (overlayContext, seaWaterLevel, x, z, height) => {
    if (!overlayContext || seaWaterLevel === null || seaWaterLevel === undefined || !Number.isFinite(Number(seaWaterLevel))) {
        return
    }
    if (height < Number(seaWaterLevel)) {
        overlayContext.fillStyle = 'rgba(12, 43, 100, 0.59)'
        overlayContext.fillRect(x, z, 1, 1)
        return
    }
    overlayContext.clearRect(x, z, 1, 1)
}

export const drawBrushPreview = (ctx, {bounds, brushPixels, brushShape, previewHeight, panX, panY, zoom}) => {
    if (!bounds) {
        return
    }
    if (previewHeight !== null) {
        const gray = previewHeight * 8
        ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`
        for (const pixel of brushPixels) {
            ctx.fillRect(panX + pixel.x * zoom, panY + pixel.z * zoom, zoom, zoom)
        }
    }
    ctx.strokeStyle = '#ff3030'
    ctx.lineWidth = 1
    if (brushShape === 'square') {
        ctx.strokeRect(panX + bounds.minX * zoom + 0.5, panY + bounds.minZ * zoom + 0.5, (bounds.maxX - bounds.minX + 1) * zoom, (bounds.maxZ - bounds.minZ + 1) * zoom)
        return
    }
    const pixelKeys = new Set(brushPixels.map((pixel) => `${pixel.x};${pixel.z}`))
    ctx.beginPath()
    for (const pixel of brushPixels) {
        const x = panX + pixel.x * zoom
        const z = panY + pixel.z * zoom
        if (!pixelKeys.has(`${pixel.x - 1};${pixel.z}`)) { ctx.moveTo(x + 0.5, z); ctx.lineTo(x + 0.5, z + zoom) }
        if (!pixelKeys.has(`${pixel.x + 1};${pixel.z}`)) { ctx.moveTo(x + zoom + 0.5, z); ctx.lineTo(x + zoom + 0.5, z + zoom) }
        if (!pixelKeys.has(`${pixel.x};${pixel.z - 1}`)) { ctx.moveTo(x, z + 0.5); ctx.lineTo(x + zoom, z + 0.5) }
        if (!pixelKeys.has(`${pixel.x};${pixel.z + 1}`)) { ctx.moveTo(x, z + zoom + 0.5); ctx.lineTo(x + zoom, z + zoom + 0.5) }
    }
    ctx.stroke()
}

export const drawImpassableBoundaries = (ctx, {pixelCanvas, pixelContext, panX, panY, zoom, viewportWidth, viewportHeight}) => {
    const minX = Math.max(0, Math.floor(-panX / zoom) - 1)
    const minZ = Math.max(0, Math.floor(-panY / zoom) - 1)
    const maxX = Math.min(pixelCanvas.width - 1, Math.ceil((viewportWidth - panX) / zoom) + 1)
    const maxZ = Math.min(pixelCanvas.height - 1, Math.ceil((viewportHeight - panY) / zoom) + 1)
    if (minX > maxX || minZ > maxZ) {
        return
    }
    const regionWidth = maxX - minX + 1
    const regionHeight = maxZ - minZ + 1
    const heights = pixelContext.getImageData(minX, minZ, regionWidth, regionHeight).data
    const getHeight = (x, z) => Math.floor(heights[((z - minZ) * regionWidth + x - minX) * 4] / 8)
    ctx.strokeStyle = '#ff3030'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
            const currentHeight = getHeight(x, z)
            const screenX = panX + x * zoom
            const screenZ = panY + z * zoom
            if (x < maxX && Math.abs(currentHeight - getHeight(x + 1, z)) > 1) { ctx.moveTo(screenX + zoom + 0.5, screenZ); ctx.lineTo(screenX + zoom + 0.5, screenZ + zoom) }
            if (z < maxZ && Math.abs(currentHeight - getHeight(x, z + 1)) > 1) { ctx.moveTo(screenX, screenZ + zoom + 0.5); ctx.lineTo(screenX + zoom, screenZ + zoom + 0.5) }
        }
    }
    ctx.stroke()
}

export const getHeightMapPixelValue = (red) => `Y ${Math.floor(red / 8)}`
