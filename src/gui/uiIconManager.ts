const UI_IMAGE_PATH_PREFIXES = [
    '/images/icons/',
    '/images/items/resources/',
    '/images/items/armor/',
    '/images/items/weapons/',
]
const ARMOR_IMAGE_PATH_PREFIX = '/images/items/armor/'
const IMAGE_URL_PATTERN = /url\(\s*(['"]?)(.*?)\1\s*\)/g

export const UiIconManager = {
    smoothUrls: new Map<string, string>(),
    sourcePathsByProcessedUrl: new Map<string, string>(),
    domObserver: null as MutationObserver | null,

    async initialize(
        saturation: number = 1,
        onProgress?: (completed: number, total: number) => void,
    ) {
        this.stopDomObserver()
        this.revokeProcessedUrls()

        if (import.meta.env.PROD) {
            for (const [imagePath, urls] of Object.entries(__UI_IMAGE_URLS__)) this.storeProcessedPngUrls(imagePath, urls)
            onProgress?.(__UI_IMAGE_PATHS__.length, __UI_IMAGE_PATHS__.length)
            this.applyToSubtree(document.documentElement)
            this.startDomObserver()
            return
        }

        if (!Number.isFinite(saturation) || saturation < 0) {
            throw new Error(`UI image saturation must be zero or greater, received ${saturation}`)
        }

        const totalWorkUnits = __UI_IMAGE_PATHS__.length
        let completedWorkUnits = 0
        onProgress?.(completedWorkUnits, totalWorkUnits)

        const results = await Promise.allSettled(
            __UI_IMAGE_PATHS__.map(async (imagePath) => {
                try {
                    const imageSaturation = imagePath.startsWith(ARMOR_IMAGE_PATH_PREFIX) ? 1 : saturation
                    this.storeProcessedPngUrls(imagePath, await this.createProcessedPngUrls(imagePath, imageSaturation))
                } finally {
                    completedWorkUnits++
                    onProgress?.(completedWorkUnits, totalWorkUnits)
                }
            }),
        )

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.warn(`Cannot prepare UI image ${__UI_IMAGE_PATHS__[index]}`, result.reason)
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
        return this.smoothUrls.get(imagePath) ?? iconUrl
    },

    storeProcessedPngUrls(imagePath: string, url: string) {
        this.smoothUrls.set(imagePath, url)
        this.sourcePathsByProcessedUrl.set(url, imagePath)
        this.sourcePathsByProcessedUrl.set(new URL(url, window.location.href).href, imagePath)
    },

    async createProcessedPngUrls(iconPath: string, saturation: number): Promise<string> {
        const response = await fetch(iconPath, { cache: 'no-cache' })
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const sourceBlob = await response.blob()
        const sourceObjectUrl = URL.createObjectURL(sourceBlob)

        try {
            const image = await this.loadImage(sourceObjectUrl)
            return URL.createObjectURL(await this.createProcessedPngBlobFromImage(image, saturation))
        } finally {
            URL.revokeObjectURL(sourceObjectUrl)
        }
    },

    async createProcessedPngBlobFromImage(
        image: HTMLImageElement,
        saturation: number,
    ): Promise<Blob> {
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
        return this.createPngBlob(canvas)
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
            const processedSource = source ? this.getUrl(source) : source
            if (source && processedSource && processedSource !== source) {
                element.src = processedSource
            }
        }

        const backgroundImage = element.style.backgroundImage
        if (!backgroundImage) {
            return
        }

        const processedBackground = backgroundImage.replace(IMAGE_URL_PATTERN, (match, quote, source) => {
            const processedSource = this.getUrl(source)
            return processedSource === source ? match : `url("${processedSource}")`
        })
        if (processedBackground !== backgroundImage) {
            element.style.backgroundImage = processedBackground
        }
    },

    getImagePath(iconUrl: string): string | null {
        if (iconUrl.startsWith('blob:') || iconUrl.startsWith('data:')) {
            return null
        }

        try {
            const pathName = new URL(iconUrl, window.location.href).pathname
            return UI_IMAGE_PATH_PREFIXES.some((prefix) => pathName.startsWith(prefix)) ? pathName : null
        } catch {
            return null
        }
    },

    revokeProcessedUrls() {
        this.smoothUrls.forEach((url) => url.startsWith('blob:') && URL.revokeObjectURL(url))
        this.smoothUrls.clear()
        this.sourcePathsByProcessedUrl.clear()
    },
}
