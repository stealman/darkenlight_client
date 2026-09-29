const PIXELATED_PATH_PREFIXES = [
    '/images/icons/',
    '/images/items/resources/',
]
const IMAGE_URL_PATTERN = /url\(\s*(['"]?)(.*?)\1\s*\)/g

export const UiIconManager = {
    pixelatedUrls: new Map<string, string>(),
    smoothUrls: new Map<string, string>(),
    sourcePathsByProcessedUrl: new Map<string, string>(),
    styleChangeListeners: new Set<() => void>(),
    pixelatedEnabled: false,
    domObserver: null as MutationObserver | null,

    async initialize(pixelated: boolean, pixelSize: number = 2, saturation: number = 1) {
        this.stopDomObserver()
        this.revokeProcessedUrls()
        this.pixelatedEnabled = pixelated

        if (!Number.isFinite(pixelSize) || pixelSize <= 1) {
            throw new Error(`UI image pixel size must be greater than one, received ${pixelSize}`)
        }
        if (!Number.isFinite(saturation) || saturation < 0) {
            throw new Error(`UI image saturation must be zero or greater, received ${saturation}`)
        }

        const results = await Promise.allSettled(
            __PIXELATED_IMAGE_PATHS__.map(async (imagePath) => {
                const { pixelatedUrl, smoothUrl } = await this.createProcessedPngUrls(imagePath, pixelSize, saturation)
                this.pixelatedUrls.set(imagePath, pixelatedUrl)
                this.smoothUrls.set(imagePath, smoothUrl)
                this.sourcePathsByProcessedUrl.set(pixelatedUrl, imagePath)
                this.sourcePathsByProcessedUrl.set(smoothUrl, imagePath)
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

    onStyleChanged(listener: () => void): () => void {
        this.styleChangeListeners.add(listener)
        return () => this.styleChangeListeners.delete(listener)
    },

    async createProcessedPngUrls(iconPath: string, pixelSize: number, saturation: number): Promise<{ pixelatedUrl: string, smoothUrl: string }> {
        const response = await fetch(iconPath, { cache: 'force-cache' })
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const sourceBlob = await response.blob()
        const sourceObjectUrl = URL.createObjectURL(sourceBlob)

        try {
            const image = await this.loadImage(sourceObjectUrl)
            const canvas = document.createElement('canvas')
            canvas.width = image.naturalWidth
            canvas.height = image.naturalHeight

            const context = canvas.getContext('2d', { willReadFrequently: true })
            if (!context) {
                throw new Error('2D canvas context is unavailable')
            }

            context.clearRect(0, 0, canvas.width, canvas.height)
            context.drawImage(image, 0, 0)

            if (saturation !== 1) {
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
                this.adjustSaturationRgba(imageData.data, saturation)
                context.putImageData(imageData, 0, 0)
            }
            const smoothUrl = await this.createPngUrl(canvas)

            if (Number.isInteger(pixelSize)) {
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
                this.pixelateRgba(imageData.data, canvas.width, canvas.height, pixelSize)
                context.putImageData(imageData, 0, 0)
            } else {
                this.pixelateCanvasByScale(canvas, context, pixelSize)
            }

            return {
                pixelatedUrl: await this.createPngUrl(canvas),
                smoothUrl,
            }
        } finally {
            URL.revokeObjectURL(sourceObjectUrl)
        }
    },

    async createPngUrl(canvas: HTMLCanvasElement): Promise<string> {
        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((result) => {
                if (result) {
                    resolve(result)
                } else {
                    reject(new Error('Canvas could not encode a PNG'))
                }
            }, 'image/png')
        })
        return URL.createObjectURL(blob)
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
