export type ReplaceColorWithTransparencyOptions = {
    targetR?: number
    targetG?: number
    targetB?: number
    cropPaddingScale?: number
}

const loadPngImage = (source: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error(`Browser could not decode PNG ${source}`))
        image.src = source
    })
}

const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob)
            } else {
                reject(new Error('Canvas could not encode a PNG'))
            }
        }, 'image/png')
    })
}

const srgbByteToLinear = (value: number): number => {
    const normalized = value / 255
    return normalized <= 0.04045
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

const linearToSrgbByte = (value: number): number => {
    const clamped = Math.min(1, Math.max(0, value))
    const srgb = clamped <= 0.0031308
        ? clamped * 12.92
        : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
    return Math.round(srgb * 255)
}

export const createCombinedEmissivePngBlob = async (
    albedoSource: string,
    emissiveSource: string,
    albedoStrength: number,
): Promise<Blob> => {
    const [albedoImage, emissiveImage] = await Promise.all([
        loadPngImage(albedoSource),
        loadPngImage(emissiveSource),
    ])
    const canvas = document.createElement('canvas')
    canvas.width = albedoImage.naturalWidth
    canvas.height = albedoImage.naturalHeight
    const context = canvas.getContext('2d', {willReadFrequently: true})
    if (!context) {
        throw new Error('2D canvas context is unavailable')
    }

    context.drawImage(albedoImage, 0, 0)
    const albedo = context.getImageData(0, 0, canvas.width, canvas.height)
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(emissiveImage, 0, 0, canvas.width, canvas.height)
    const combined = context.getImageData(0, 0, canvas.width, canvas.height)

    for (let index = 0; index < combined.data.length; index += 4) {
        const albedoAlpha = albedo.data[index + 3] / 255
        combined.data[index] = linearToSrgbByte(
            srgbByteToLinear(combined.data[index])
            + srgbByteToLinear(albedo.data[index]) * albedoStrength * albedoAlpha,
        )
        combined.data[index + 1] = linearToSrgbByte(
            srgbByteToLinear(combined.data[index + 1])
            + srgbByteToLinear(albedo.data[index + 1]) * albedoStrength * albedoAlpha,
        )
        combined.data[index + 2] = linearToSrgbByte(
            srgbByteToLinear(combined.data[index + 2])
            + srgbByteToLinear(albedo.data[index + 2]) * albedoStrength * albedoAlpha,
        )
    }

    context.putImageData(combined, 0, 0)
    return canvasToPngBlob(canvas)
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
