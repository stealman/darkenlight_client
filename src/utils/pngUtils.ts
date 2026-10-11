export type ReplaceColorWithTransparencyOptions = {
    targetR?: number
    targetG?: number
    targetB?: number
    cropPaddingScale?: number
}

export const canvasToPngBlobWithTransparentColor = async (
    sourceCanvas: HTMLCanvasElement,
    options: ReplaceColorWithTransparencyOptions = {}
): Promise<Blob | null> => {
    const targetR = options.targetR ?? 0
    const targetG = options.targetG ?? 0
    const targetB = options.targetB ?? 0
    const cropPaddingScale = options.cropPaddingScale ?? 1.2

    const width = sourceCanvas.width
    const height = sourceCanvas.height
    if (width <= 0 || height <= 0) {
        return null
    }

    const probeCanvas = document.createElement('canvas')
    probeCanvas.width = width
    probeCanvas.height = height
    const probeCtx = probeCanvas.getContext('2d')
    if (!probeCtx) {
        return null
    }
    probeCtx.drawImage(sourceCanvas, 0, 0)
    const sourceImageData = probeCtx.getImageData(0, 0, width, height)
    const sourcePixels = sourceImageData.data

    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const r = sourcePixels[i]
            const g = sourcePixels[i + 1]
            const b = sourcePixels[i + 2]
            const isBackground = r === targetR && g === targetG && b === targetB
            if (isBackground) {
                continue
            }

            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
        }
    }

    const hasContent = maxX >= minX && maxY >= minY
    const outputCanvas = document.createElement('canvas')
    const outputCtx = outputCanvas.getContext('2d')
    if (!outputCtx) {
        return null
    }

    if (hasContent) {
        const contentWidth = maxX - minX + 1
        const contentHeight = maxY - minY + 1
        const side = Math.max(1, Math.ceil(Math.max(contentWidth, contentHeight) * cropPaddingScale))

        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2
        const cropLeft = Math.floor(centerX - side / 2)
        const cropTop = Math.floor(centerY - side / 2)

        outputCanvas.width = side
        outputCanvas.height = side

        const srcLeft = Math.max(cropLeft, 0)
        const srcTop = Math.max(cropTop, 0)
        const srcRight = Math.min(cropLeft + side, width)
        const srcBottom = Math.min(cropTop + side, height)
        const srcWidth = Math.max(0, srcRight - srcLeft)
        const srcHeight = Math.max(0, srcBottom - srcTop)

        const dstX = srcLeft - cropLeft
        const dstY = srcTop - cropTop
        if (srcWidth > 0 && srcHeight > 0) {
            outputCtx.drawImage(sourceCanvas, srcLeft, srcTop, srcWidth, srcHeight, dstX, dstY, srcWidth, srcHeight)
        }
    } else {
        outputCanvas.width = width
        outputCanvas.height = height
        outputCtx.drawImage(sourceCanvas, 0, 0)
    }

    const imageData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height)
    const pixels = imageData.data
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]
        const g = pixels[i + 1]
        const b = pixels[i + 2]
        if (r === targetR && g === targetG && b === targetB) {
            pixels[i + 3] = 0
        }
    }

    outputCtx.putImageData(imageData, 0, 0)

    return new Promise((resolve) => {
        outputCanvas.toBlob((blob) => resolve(blob), 'image/png')
    })
}
