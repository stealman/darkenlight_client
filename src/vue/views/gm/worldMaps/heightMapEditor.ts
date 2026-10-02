export const HEIGHT_EDIT_MODES = ['exact', 'up', 'down', 'area']
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
    const minX = Math.max(0, startX)
    const minZ = Math.max(0, startZ)
    const maxX = Math.min(mapSize - 1, startX + brushSize - 1)
    const maxZ = Math.min(mapSize - 1, startZ + brushSize - 1)
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

export const appendAreaPathSegment = (path, from, to) => {
    const nextPath = [...path]
    let x = from.x
    let z = from.z
    const stepX = Math.sign(to.x - from.x)
    const stepZ = Math.sign(to.z - from.z)
    const deltaX = Math.abs(to.x - from.x)
    const deltaZ = Math.abs(to.z - from.z)
    let error = deltaX - deltaZ
    while (x !== to.x || z !== to.z) {
        const twiceError = error * 2
        if (twiceError > -deltaZ) { error -= deltaZ; x += stepX }
        if (twiceError < deltaX) { error += deltaX; z += stepZ }
        const previous = nextPath[nextPath.length - 1]
        if (!previous || previous.x !== x || previous.z !== z) {
            nextPath.push({x, z})
        }
    }
    return nextPath
}

export const getAreaClosingTolerance = (path) => {
    let length = 0
    for (let index = 1; index < path.length; index++) {
        length += Math.hypot(path[index].x - path[index - 1].x, path[index].z - path[index - 1].z)
    }
    if (length > 100) return 4
    if (length > 50) return 3
    if (length > 20) return 2
    return 0
}

const isInsideAreaPath = (x, z, path) => {
    let inside = false
    for (let index = 0, previousIndex = path.length - 1; index < path.length; previousIndex = index++) {
        const current = path[index]
        const previous = path[previousIndex]
        const intersects = (current.z > z) !== (previous.z > z)
            && x < (previous.x - current.x) * (z - current.z) / (previous.z - current.z) + current.x
        if (intersects) {
            inside = !inside
        }
    }
    return inside
}

export const getAreaSelection = (path, mapSize) => {
    if (path.length < 4) {
        return new Set()
    }
    const boundary = new Set(path.map((pixel) => pixel.z * mapSize + pixel.x))
    const minX = Math.max(0, Math.min(...path.map((pixel) => pixel.x)))
    const maxX = Math.min(mapSize - 1, Math.max(...path.map((pixel) => pixel.x)))
    const minZ = Math.max(0, Math.min(...path.map((pixel) => pixel.z)))
    const maxZ = Math.min(mapSize - 1, Math.max(...path.map((pixel) => pixel.z)))
    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            if (isInsideAreaPath(x, z, path)) {
                boundary.add(z * mapSize + x)
            }
        }
    }
    return boundary
}

export const getConnectedAreaByHeight = (pixelContext, width, height, start) => {
    const pixels = pixelContext.getImageData(0, 0, width, height).data
    const targetHeight = Math.floor(pixels[(start.z * width + start.x) * 4] / 8)
    const visited = new Uint8Array(width * height)
    const queue = new Int32Array(width * height)
    const connected = new Set()
    let readIndex = 0
    let writeIndex = 1
    queue[0] = start.z * width + start.x
    visited[queue[0]] = 1
    while (readIndex < writeIndex) {
        const index = queue[readIndex++]
        connected.add(index)
        const x = index % width
        const z = Math.floor(index / width)
        const tryAdd = (neighborIndex) => {
            if (!visited[neighborIndex] && Math.floor(pixels[neighborIndex * 4] / 8) === targetHeight) {
                visited[neighborIndex] = 1
                queue[writeIndex++] = neighborIndex
            }
        }
        if (x > 0) tryAdd(index - 1)
        if (x < width - 1) tryAdd(index + 1)
        if (z > 0) tryAdd(index - width)
        if (z < height - 1) tryAdd(index + width)
    }
    return connected
}

const randomAt = (x, z, seed) => {
    let value = Math.imul(x ^ seed, 0x45d9f3b) ^ Math.imul(z ^ (seed >>> 16), 0x45d9f3b)
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
    return ((value ^ (value >>> 16)) >>> 0) / 0x100000000
}

const smoothStep = (value) => value * value * (3 - 2 * value)

const valueNoise = (x, z, featureSize, seed) => {
    const gridX = Math.floor(x / featureSize)
    const gridZ = Math.floor(z / featureSize)
    const localX = smoothStep((x - gridX * featureSize) / featureSize)
    const localZ = smoothStep((z - gridZ * featureSize) / featureSize)
    const top = randomAt(gridX, gridZ, seed) * (1 - localX) + randomAt(gridX + 1, gridZ, seed) * localX
    const bottom = randomAt(gridX, gridZ + 1, seed) * (1 - localX) + randomAt(gridX + 1, gridZ + 1, seed) * localX
    return top * (1 - localZ) + bottom * localZ
}

const getCardinalNeighbors = (index, width) => {
    const x = index % width
    const z = Math.floor(index / width)
    return [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        z > 0 ? index - width : -1,
        z < width - 1 ? index + width : -1,
    ]
}

const blendAreaEdges = (areaPixels, width, heights, outsideHeights, minY, maxY, maxSlope, largeFeatureSize) => {
    const distances = new Int32Array(width * width)
    distances.fill(-1)
    const edgeHeights = new Int16Array(width * width)
    const queue = []
    const edgeSlope = Math.min(maxSlope, 1)
    for (const index of areaPixels) {
        const outsideValues = getCardinalNeighbors(index, width)
            .filter((neighbor) => neighbor >= 0 && !areaPixels.has(neighbor))
            .map((neighbor) => outsideHeights[neighbor])
        if (outsideValues.length === 0) {
            continue
        }
        const average = Math.round(outsideValues.reduce((sum, value) => sum + value, 0) / outsideValues.length)
        const allowedMin = Math.max(...outsideValues.map((value) => value - edgeSlope))
        const allowedMax = Math.min(...outsideValues.map((value) => value + edgeSlope))
        const edgeHeight = allowedMin <= allowedMax
            ? Math.max(allowedMin, Math.min(allowedMax, average))
            : average
        edgeHeights[index] = Math.max(minY, Math.min(maxY, edgeHeight))
        distances[index] = 0
        queue.push(index)
    }
    if (queue.length === 0) {
        return
    }
    for (let readIndex = 0; readIndex < queue.length; readIndex++) {
        const index = queue[readIndex]
        for (const neighbor of getCardinalNeighbors(index, width)) {
            if (neighbor < 0 || !areaPixels.has(neighbor) || distances[neighbor] >= 0) {
                continue
            }
            distances[neighbor] = distances[index] + 1
            edgeHeights[neighbor] = edgeHeights[index]
            queue.push(neighbor)
        }
    }
    const blendWidth = Math.max(8, Math.round(largeFeatureSize / 2))
    for (const index of areaPixels) {
        const blend = smoothStep(Math.min(1, distances[index] / blendWidth))
        heights[index] = Math.round(edgeHeights[index] * (1 - blend) + heights[index] * blend)
    }
}

export const limitAreaSlope = (areaPixels, width, heights, outsideHeights, minY, maxY, maxSlope) => {
    if (maxSlope >= 31) {
        return
    }
    const areaIndexes = Array.from(areaPixels)
    const fixedEdges = new Uint8Array(heights.length)
    const clampHeight = (height) => Math.max(minY, Math.min(maxY, height))

    // The outer map is immutable. Anchor each border pixel once before
    // smoothing the interior, otherwise contradictory outer neighbours can
    // make a queue-based relaxation toggle an edge pixel forever.
    for (const index of areaIndexes) {
        const outsideValues = getCardinalNeighbors(index, width)
            .filter((neighbor) => neighbor >= 0 && !areaPixels.has(neighbor))
            .map((neighbor) => outsideHeights[neighbor])
        if (outsideValues.length === 0) {
            continue
        }
        const allowedMin = Math.max(...outsideValues.map((height) => height - maxSlope))
        const allowedMax = Math.min(...outsideValues.map((height) => height + maxSlope))
        const average = Math.round(outsideValues.reduce((sum, height) => sum + height, 0) / outsideValues.length)
        heights[index] = allowedMin <= allowedMax
            ? clampHeight(Math.max(allowedMin, Math.min(allowedMax, heights[index])))
            : clampHeight(average)
        fixedEdges[index] = 1
    }

    // A few bounded forward/reverse relaxations smooth the generated detail
    // toward the fixed border. The bound keeps a malformed/impossible slope
    // configuration from ever blocking the browser UI.
    const reverseAreaIndexes = [...areaIndexes].reverse()
    for (let pass = 0; pass < 4; pass++) {
        let changed = false
        for (const indexes of [areaIndexes, reverseAreaIndexes]) {
            for (const index of indexes) {
                if (fixedEdges[index]) {
                    continue
                }
                let allowedMin = minY
                let allowedMax = maxY
                for (const neighbor of getCardinalNeighbors(index, width)) {
                    if (neighbor < 0) {
                        continue
                    }
                    const neighborHeight = areaPixels.has(neighbor) ? heights[neighbor] : outsideHeights[neighbor]
                    allowedMin = Math.max(allowedMin, neighborHeight - maxSlope)
                    allowedMax = Math.min(allowedMax, neighborHeight + maxSlope)
                }
                const nextHeight = allowedMin <= allowedMax
                    ? clampHeight(Math.max(allowedMin, Math.min(allowedMax, heights[index])))
                    : clampHeight(Math.round((allowedMin + allowedMax) / 2))
                if (nextHeight !== heights[index]) {
                    heights[index] = nextHeight
                    changed = true
                }
            }
        }
        if (!changed) {
            break
        }
    }
}

export const createRandomizedAreaHeights = (areaPixels, width, outsideHeights, {minY, maxY, largeFeatureSize, detailSize, detailStrength, roughness, maxSlope, seed}) => {
    const heights = new Int16Array(width * width)
    const areaIndexes = Array.from(areaPixels)
    const heightRange = maxY - minY
    for (const index of areaIndexes) {
        const x = index % width
        const z = Math.floor(index / width)
        let detail = 0
        let amplitude = detailStrength
        let featureSize = detailSize
        for (let octave = 0; octave < roughness; octave++) {
            detail += (valueNoise(x, z, featureSize, seed + octave * 1013) * 2 - 1) * amplitude
            amplitude *= 0.5
            featureSize = Math.max(1, featureSize / 2)
        }
        const broadHeight = minY + valueNoise(x, z, largeFeatureSize, seed) * heightRange
        heights[index] = Math.max(minY, Math.min(maxY, Math.round(broadHeight + detail)))
    }
    blendAreaEdges(areaPixels, width, heights, outsideHeights, minY, maxY, maxSlope, largeFeatureSize)
    limitAreaSlope(areaPixels, width, heights, outsideHeights, minY, maxY, maxSlope)
    return heights
}

export const createAreaOverlay = (areaPixels, width, height) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.fillStyle = 'rgba(255, 48, 48, 0.32)'
    for (const index of areaPixels) {
        context.fillRect(index % width, Math.floor(index / width), 1, 1)
    }
    return canvas
}

export const drawAreaOverlay = (ctx, areaPixels, mapWidth, panX, panY, zoom) => {
    if (!areaPixels?.size) {
        return
    }
    ctx.fillStyle = 'rgba(255, 48, 48, 0.32)'
    for (const index of areaPixels) {
        const x = index % mapWidth
        const z = Math.floor(index / mapWidth)
        ctx.fillRect(panX + x * zoom, panY + z * zoom, zoom, zoom)
    }
}

export const serializeAreaPixels = (areaPixels, width) => {
    const rows = []
    for (let z = 0; z < width; z++) {
        const row = [z]
        let x = 0
        while (x < width) {
            const index = z * width + x
            if (!areaPixels.has(index)) {
                x++
                continue
            }
            const startX = x
            while (x + 1 < width && areaPixels.has(z * width + x + 1)) {
                x++
            }
            row.push(startX, x)
            x++
        }
        if (row.length > 1) {
            rows.push(row)
        }
    }
    return rows
}

export const deserializeAreaPixels = (rows, width) => {
    const areaPixels = new Set()
    if (!Array.isArray(rows) || !Number.isInteger(width) || width < 1) {
        return areaPixels
    }
    for (const row of rows) {
        if (!Array.isArray(row) || !Number.isInteger(row[0]) || row[0] < 0 || row[0] >= width) {
            continue
        }
        for (let index = 1; index < row.length; index += 2) {
            const startX = row[index]
            const endX = row[index + 1]
            if (!Number.isInteger(startX) || !Number.isInteger(endX)) {
                continue
            }
            for (let x = Math.max(0, startX); x <= Math.min(width - 1, endX); x++) {
                areaPixels.add(row[0] * width + x)
            }
        }
    }
    return areaPixels
}
