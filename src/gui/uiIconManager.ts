import { MetalArmorVertexColorPalette } from '@/babylon/item/codebook/vertexColorPalettes/armor'
import type { VertexRgb } from '@/babylon/item/codebook/vertexColorPalettes/types'

const PIXELATED_PATH_PREFIXES = [
    '/images/icons/',
    '/images/items/resources/',
    '/images/items/armor/',
]
const ARMOR_IMAGE_PATH_PREFIX = '/images/items/armor/'
const STEEL_ARMOR_IMAGE_PATH_PREFIX = `${ARMOR_IMAGE_PATH_PREFIX}steel-`
const IMAGE_URL_PATTERN = /url\(\s*(['"]?)(.*?)\1\s*\)/g
const PROCESSED_PNG_CACHE_VERSION = 1
const PROCESSED_PNG_DATABASE_NAME = 'darkenlight-ui-image-cache'
const PROCESSED_PNG_STORE_NAME = 'processedPngs'

type ProcessedPngUrls = {
    pixelatedUrl: string
    smoothUrl: string
}
type ProcessedPngBlobs = {
    pixelatedBlob: Blob
    smoothBlob: Blob
}
type CachedProcessedPng = ProcessedPngBlobs & {
    imagePath: string
    signature: string
}
type LinearRgb = readonly [number, number, number]

export const UiIconManager = {
    pixelatedUrls: new Map<string, string>(),
    smoothUrls: new Map<string, string>(),
    sourcePathsByProcessedUrl: new Map<string, string>(),
    styleChangeListeners: new Set<() => void>(),
    pixelatedEnabled: false,
    domObserver: null as MutationObserver | null,
    cacheDatabasePromise: null as Promise<IDBDatabase | null> | null,

    async initialize(
        pixelated: boolean,
        pixelSize: number = 2,
        saturation: number = 1,
        onProgress?: (completed: number, total: number) => void,
    ) {
        this.stopDomObserver()
        this.revokeProcessedUrls()
        this.pixelatedEnabled = pixelated

        if (!Number.isFinite(pixelSize) || pixelSize <= 1) {
            throw new Error(`UI image pixel size must be greater than one, received ${pixelSize}`)
        }
        if (!Number.isFinite(saturation) || saturation < 0) {
            throw new Error(`UI image saturation must be zero or greater, received ${saturation}`)
        }

        const armorMaterialCount = MetalArmorVertexColorPalette.materialNames
            .filter((materialName) => materialName !== 'Reserved').length
        const workUnits = __PIXELATED_IMAGE_PATHS__.map((imagePath) => {
            return imagePath.startsWith(STEEL_ARMOR_IMAGE_PATH_PREFIX) ? armorMaterialCount : 1
        })
        const totalWorkUnits = workUnits.reduce((total, count) => total + count, 0)
        let completedWorkUnits = 0
        onProgress?.(completedWorkUnits, totalWorkUnits)

        const results = await Promise.allSettled(
            __PIXELATED_IMAGE_PATHS__.map(async (imagePath, imageIndex) => {
                let completedImageWorkUnits = 0
                const reportImageProgress = () => {
                    completedImageWorkUnits++
                    completedWorkUnits++
                    onProgress?.(completedWorkUnits, totalWorkUnits)
                }

                try {
                    if (imagePath.startsWith(STEEL_ARMOR_IMAGE_PATH_PREFIX)) {
                        const materialUrls = await this.createArmorMaterialPngUrls(imagePath, pixelSize, reportImageProgress)
                        materialUrls.forEach(({ imagePath: materialImagePath, urls }) => {
                            this.storeProcessedPngUrls(materialImagePath, urls)
                        })
                        return
                    }

                    this.storeProcessedPngUrls(imagePath, await this.createProcessedPngUrls(imagePath, pixelSize, saturation))
                    reportImageProgress()
                } finally {
                    while (completedImageWorkUnits < workUnits[imageIndex]) {
                        reportImageProgress()
                    }
                }
            }),
        )

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.warn(`Cannot pixelate UI image ${__PIXELATED_IMAGE_PATHS__[index]}`, result.reason)
            }
        })

        this.applyToSubtree(document.documentElement)
        this.startDomObserver()
    },

    getUrl(iconUrl: string): string {
        const imagePath = this.getImagePath(iconUrl) ?? this.sourcePathsByProcessedUrl.get(iconUrl)
        if (!imagePath) {
            return iconUrl
        }
        const selectedUrls = this.pixelatedEnabled ? this.pixelatedUrls : this.smoothUrls
        return selectedUrls.get(imagePath) ?? iconUrl
    },

    setPixelated(pixelated: boolean) {
        if (this.pixelatedEnabled === pixelated) {
            return
        }

        this.pixelatedEnabled = pixelated
        this.applyToSubtree(document.documentElement)
        this.styleChangeListeners.forEach((listener) => listener())
    },

    storeProcessedPngUrls(imagePath: string, { pixelatedUrl, smoothUrl }: ProcessedPngUrls) {
        this.pixelatedUrls.set(imagePath, pixelatedUrl)
        this.smoothUrls.set(imagePath, smoothUrl)
        this.sourcePathsByProcessedUrl.set(pixelatedUrl, imagePath)
        this.sourcePathsByProcessedUrl.set(smoothUrl, imagePath)
    },

    onStyleChanged(listener: () => void): () => void {
        this.styleChangeListeners.add(listener)
        return () => this.styleChangeListeners.delete(listener)
    },

    async createProcessedPngUrls(iconPath: string, pixelSize: number, saturation: number): Promise<ProcessedPngUrls> {
        const signature = this.getProcessedPngSignature(iconPath, pixelSize, saturation)
        const cachedBlobs = await this.getCachedProcessedPng(iconPath, signature)
        if (cachedBlobs) {
            return this.createProcessedPngUrlsFromBlobs(cachedBlobs)
        }

        const response = await fetch(iconPath, { cache: 'force-cache' })
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const sourceBlob = await response.blob()
        const sourceObjectUrl = URL.createObjectURL(sourceBlob)

        try {
            const image = await this.loadImage(sourceObjectUrl)
            const blobs = await this.createProcessedPngBlobsFromImage(image, pixelSize, saturation)
            await this.cacheProcessedPng(iconPath, signature, blobs)
            return this.createProcessedPngUrlsFromBlobs(blobs)
        } finally {
            URL.revokeObjectURL(sourceObjectUrl)
        }
    },

    async createArmorMaterialPngUrls(steelImagePath: string, pixelSize: number, onMaterialProcessed?: () => void) {
        const armorImageSuffix = steelImagePath.slice(STEEL_ARMOR_IMAGE_PATH_PREFIX.length)
        const steelColors = MetalArmorVertexColorPalette.materialColors[0]
        const materialRequests = MetalArmorVertexColorPalette.materialNames.flatMap((materialName, materialIndex) => {
            if (materialName === 'Reserved') {
                return []
            }

            const materialFileName = materialName.toLowerCase().replaceAll(' ', '-')
            const imagePath = `${ARMOR_IMAGE_PATH_PREFIX}${materialFileName}-${armorImageSuffix}`
            const materialColors = MetalArmorVertexColorPalette.materialColors[materialIndex]
            const signature = this.getArmorProcessedPngSignature(steelImagePath, pixelSize, steelColors, materialColors)
            return [{ imagePath, materialIndex, materialColors, signature }]
        })
        const cachedMaterialBlobs = await Promise.all(materialRequests.map(({ imagePath, signature }) => {
            return this.getCachedProcessedPng(imagePath, signature)
        }))
        if (cachedMaterialBlobs.every((blobs) => blobs !== null)) {
            return materialRequests.map(({ imagePath }, index) => {
                const result = {
                    imagePath,
                    urls: this.createProcessedPngUrlsFromBlobs(cachedMaterialBlobs[index]!),
                }
                onMaterialProcessed?.()
                return result
            })
        }

        const response = await fetch(steelImagePath, { cache: 'force-cache' })
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const sourceBlob = await response.blob()
        const sourceObjectUrl = URL.createObjectURL(sourceBlob)

        try {
            const image = await this.loadImage(sourceObjectUrl)
            const materialUrls: Array<{ imagePath: string, urls: ProcessedPngUrls }> = []
            for (let index = 0; index < materialRequests.length; index++) {
                const request = materialRequests[index]
                let blobs = cachedMaterialBlobs[index]
                if (!blobs) {
                    blobs = await this.createProcessedPngBlobsFromImage(
                        image,
                        pixelSize,
                        1,
                        request.materialIndex === 0 ? undefined : { source: steelColors, target: request.materialColors },
                    )
                    await this.cacheProcessedPng(request.imagePath, request.signature, blobs)
                }
                materialUrls.push({
                    imagePath: request.imagePath,
                    urls: this.createProcessedPngUrlsFromBlobs(blobs),
                })
                onMaterialProcessed?.()
            }
            return materialUrls
        } finally {
            URL.revokeObjectURL(sourceObjectUrl)
        }
    },

    async createProcessedPngBlobsFromImage(
        image: HTMLImageElement,
        pixelSize: number,
        saturation: number,
        colorRemap?: { source: readonly VertexRgb[], target: readonly VertexRgb[] },
    ): Promise<ProcessedPngBlobs> {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight

        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) {
            throw new Error('2D canvas context is unavailable')
        }

        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0)

        if (colorRemap || saturation !== 1) {
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
            if (colorRemap) {
                this.remapArmorMaterialRgba(imageData.data, colorRemap.source, colorRemap.target)
            }
            if (saturation !== 1) {
                this.adjustSaturationRgba(imageData.data, saturation)
            }
            context.putImageData(imageData, 0, 0)
        }
        const smoothBlob = await this.createPngBlob(canvas)

        if (Number.isInteger(pixelSize)) {
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
            this.pixelateRgba(imageData.data, canvas.width, canvas.height, pixelSize)
            context.putImageData(imageData, 0, 0)
        } else {
            this.pixelateCanvasByScale(canvas, context, pixelSize)
        }

        return {
            pixelatedBlob: await this.createPngBlob(canvas),
            smoothBlob,
        }
    },

    createProcessedPngUrlsFromBlobs({ pixelatedBlob, smoothBlob }: ProcessedPngBlobs): ProcessedPngUrls {
        return {
            pixelatedUrl: URL.createObjectURL(pixelatedBlob),
            smoothUrl: URL.createObjectURL(smoothBlob),
        }
    },

    remapArmorMaterialRgba(data: Uint8ClampedArray, sourceColors: readonly VertexRgb[], targetColors: readonly VertexRgb[]) {
        const sourceReference = this.getLinearPaletteAverage(sourceColors)
        const targetReference = this.getLinearPaletteAverage(targetColors)
        const redScale = targetReference[0] / sourceReference[0]
        const greenScale = targetReference[1] / sourceReference[1]
        const blueScale = targetReference[2] / sourceReference[2]

        for (let index = 0; index < data.length; index += 4) {
            if (data[index + 3] === 0) {
                continue
            }

            data[index] = this.linearToSrgbByte(this.srgbByteToLinear(data[index]) * redScale)
            data[index + 1] = this.linearToSrgbByte(this.srgbByteToLinear(data[index + 1]) * greenScale)
            data[index + 2] = this.linearToSrgbByte(this.srgbByteToLinear(data[index + 2]) * blueScale)
        }
    },

    getLinearPaletteAverage(colors: readonly VertexRgb[]): LinearRgb {
        const total = colors.reduce((sum, color) => {
            sum[0] += this.srgbByteToLinear(color[0])
            sum[1] += this.srgbByteToLinear(color[1])
            sum[2] += this.srgbByteToLinear(color[2])
            return sum
        }, [0, 0, 0])
        return [
            total[0] / colors.length,
            total[1] / colors.length,
            total[2] / colors.length,
        ]
    },

    srgbByteToLinear(value: number): number {
        const normalized = value / 255
        return normalized <= 0.04045
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4)
    },

    linearToSrgbByte(value: number): number {
        const clamped = Math.min(1, Math.max(0, value))
        const srgb = clamped <= 0.0031308
            ? clamped * 12.92
            : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
        return Math.round(srgb * 255)
    },

    getProcessedPngSignature(imagePath: string, pixelSize: number, saturation: number): string {
        return [
            PROCESSED_PNG_CACHE_VERSION,
            __PIXELATED_IMAGE_VERSIONS__[imagePath] ?? 'unknown-source',
            pixelSize,
            saturation,
        ].join('|')
    },

    getArmorProcessedPngSignature(
        steelImagePath: string,
        pixelSize: number,
        steelColors: readonly VertexRgb[],
        materialColors: readonly VertexRgb[],
    ): string {
        return [
            PROCESSED_PNG_CACHE_VERSION,
            __PIXELATED_IMAGE_VERSIONS__[steelImagePath] ?? 'unknown-source',
            pixelSize,
            JSON.stringify(steelColors),
            JSON.stringify(materialColors),
        ].join('|')
    },

    getProcessedPngCacheDatabase(): Promise<IDBDatabase | null> {
        if (this.cacheDatabasePromise) {
            return this.cacheDatabasePromise
        }
        if (!('indexedDB' in window)) {
            this.cacheDatabasePromise = Promise.resolve(null)
            return this.cacheDatabasePromise
        }

        this.cacheDatabasePromise = new Promise((resolve) => {
            const request = indexedDB.open(PROCESSED_PNG_DATABASE_NAME, 1)
            request.onupgradeneeded = () => {
                const database = request.result
                if (!database.objectStoreNames.contains(PROCESSED_PNG_STORE_NAME)) {
                    database.createObjectStore(PROCESSED_PNG_STORE_NAME, { keyPath: 'imagePath' })
                }
            }
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => {
                console.warn('Persistent UI image cache is unavailable', request.error)
                resolve(null)
            }
        })
        return this.cacheDatabasePromise
    },

    async getCachedProcessedPng(imagePath: string, signature: string): Promise<ProcessedPngBlobs | null> {
        const database = await this.getProcessedPngCacheDatabase()
        if (!database) {
            return null
        }

        return new Promise((resolve) => {
            const request = database.transaction(PROCESSED_PNG_STORE_NAME, 'readonly')
                .objectStore(PROCESSED_PNG_STORE_NAME)
                .get(imagePath)
            request.onsuccess = () => {
                const cached = request.result as CachedProcessedPng | undefined
                if (!cached || cached.signature !== signature) {
                    resolve(null)
                    return
                }
                resolve({
                    pixelatedBlob: cached.pixelatedBlob,
                    smoothBlob: cached.smoothBlob,
                })
            }
            request.onerror = () => resolve(null)
        })
    },

    async cacheProcessedPng(imagePath: string, signature: string, blobs: ProcessedPngBlobs): Promise<void> {
        const database = await this.getProcessedPngCacheDatabase()
        if (!database) {
            return
        }

        await new Promise<void>((resolve) => {
            const transaction = database.transaction(PROCESSED_PNG_STORE_NAME, 'readwrite')
            transaction.objectStore(PROCESSED_PNG_STORE_NAME).put({ imagePath, signature, ...blobs })
            transaction.oncomplete = () => resolve()
            transaction.onerror = () => resolve()
            transaction.onabort = () => resolve()
        })
    },

    async createPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
        return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((result) => {
                if (result) {
                    resolve(result)
                } else {
                    reject(new Error('Canvas could not encode a PNG'))
                }
            }, 'image/png')
        })
    },

    pixelateRgba(data: Uint8ClampedArray, width: number, height: number, pixelSize: number) {
        for (let blockY = 0; blockY < height; blockY += pixelSize) {
            const blockHeight = Math.min(pixelSize, height - blockY)

            for (let blockX = 0; blockX < width; blockX += pixelSize) {
                const blockWidth = Math.min(pixelSize, width - blockX)
                const pixelCount = blockWidth * blockHeight
                let alphaSum = 0
                let premultipliedRed = 0
                let premultipliedGreen = 0
                let premultipliedBlue = 0

                for (let y = 0; y < blockHeight; y++) {
                    for (let x = 0; x < blockWidth; x++) {
                        const sourceIndex = ((blockY + y) * width + blockX + x) * 4
                        const alpha = data[sourceIndex + 3]
                        alphaSum += alpha
                        premultipliedRed += data[sourceIndex] * alpha
                        premultipliedGreen += data[sourceIndex + 1] * alpha
                        premultipliedBlue += data[sourceIndex + 2] * alpha
                    }
                }

                const red = alphaSum > 0 ? Math.round(premultipliedRed / alphaSum) : 0
                const green = alphaSum > 0 ? Math.round(premultipliedGreen / alphaSum) : 0
                const blue = alphaSum > 0 ? Math.round(premultipliedBlue / alphaSum) : 0
                const alpha = Math.round(alphaSum / pixelCount)

                for (let y = 0; y < blockHeight; y++) {
                    for (let x = 0; x < blockWidth; x++) {
                        const targetIndex = ((blockY + y) * width + blockX + x) * 4
                        data[targetIndex] = red
                        data[targetIndex + 1] = green
                        data[targetIndex + 2] = blue
                        data[targetIndex + 3] = alpha
                    }
                }
            }
        }
    },

    pixelateCanvasByScale(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, pixelSize: number) {
        const scaledWidth = Math.max(1, Math.round(canvas.width / pixelSize))
        const scaledHeight = Math.max(1, Math.round(canvas.height / pixelSize))
        const scaledCanvas = document.createElement('canvas')
        scaledCanvas.width = scaledWidth
        scaledCanvas.height = scaledHeight

        const scaledContext = scaledCanvas.getContext('2d')
        if (!scaledContext) {
            throw new Error('Scaled 2D canvas context is unavailable')
        }

        scaledContext.clearRect(0, 0, scaledWidth, scaledHeight)
        scaledContext.imageSmoothingEnabled = true
        scaledContext.imageSmoothingQuality = 'high'
        scaledContext.drawImage(canvas, 0, 0, scaledWidth, scaledHeight)

        context.clearRect(0, 0, canvas.width, canvas.height)
        context.imageSmoothingEnabled = false
        context.drawImage(scaledCanvas, 0, 0, scaledWidth, scaledHeight, 0, 0, canvas.width, canvas.height)
    },

    adjustSaturationRgba(data: Uint8ClampedArray, saturation: number) {
        for (let index = 0; index < data.length; index += 4) {
            const red = data[index]
            const green = data[index + 1]
            const blue = data[index + 2]
            const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722

            data[index] = luminance + (red - luminance) * saturation
            data[index + 1] = luminance + (green - luminance) * saturation
            data[index + 2] = luminance + (blue - luminance) * saturation
        }
    },

    loadImage(source: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const image = new Image()
            image.onload = () => resolve(image)
            image.onerror = () => reject(new Error('Browser could not decode the PNG'))
            image.src = source
        })
    },

    startDomObserver() {
        this.domObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes') {
                    this.applyToElement(mutation.target as HTMLElement)
                    return
                }

                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        this.applyToSubtree(node)
                    }
                })
            })
        })
        this.domObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['src', 'style'],
            childList: true,
            subtree: true,
        })
    },

    stopDomObserver() {
        this.domObserver?.disconnect()
        this.domObserver = null
    },

    applyToSubtree(root: HTMLElement) {
        this.applyToElement(root)
        root.querySelectorAll<HTMLElement>('img, [style]').forEach((element) => this.applyToElement(element))
    },

    applyToElement(element: HTMLElement) {
        if (element instanceof HTMLImageElement) {
            const source = element.getAttribute('src')
            const pixelatedSource = source ? this.getUrl(source) : source
            if (source && pixelatedSource !== source) {
                element.src = pixelatedSource
                element.style.imageRendering = this.pixelatedEnabled ? 'pixelated' : ''
            }
        }

        const backgroundImage = element.style.backgroundImage
        if (!backgroundImage) {
            return
        }

        const pixelatedBackground = backgroundImage.replace(IMAGE_URL_PATTERN, (match, quote, source) => {
            const pixelatedSource = this.getUrl(source)
            return pixelatedSource === source ? match : `url("${pixelatedSource}")`
        })
        if (pixelatedBackground !== backgroundImage) {
            element.style.backgroundImage = pixelatedBackground
            element.style.imageRendering = this.pixelatedEnabled ? 'pixelated' : ''
        }
    },

    getImagePath(iconUrl: string): string | null {
        if (iconUrl.startsWith('blob:') || iconUrl.startsWith('data:')) {
            return null
        }

        try {
            const pathName = new URL(iconUrl, window.location.href).pathname
            return PIXELATED_PATH_PREFIXES.some((prefix) => pathName.startsWith(prefix)) ? pathName : null
        } catch {
            return null
        }
    },

    revokeProcessedUrls() {
        this.pixelatedUrls.forEach((url) => URL.revokeObjectURL(url))
        this.smoothUrls.forEach((url) => URL.revokeObjectURL(url))
        this.pixelatedUrls.clear()
        this.smoothUrls.clear()
        this.sourcePathsByProcessedUrl.clear()
    },
}
