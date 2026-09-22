import { WorldDataManager } from '@/data/worldDataManager'
import { MyPlayer } from '@/data/myPlayer'
import { TooltipOverlayContent, TooltipOverlayManager } from '@/gui/tooltipOverlayManager'
import { t } from '@/i18n'

export const MiniMap = {
    tooltipOwnerKey: 'mini-map' as string,
    offScreenCanvas: null as HTMLCanvasElement | null,
    canvasSize: 100,
    viewSize: 100,
    mapWidth: 0,
    mapHeight: 0,
    fpsInfo: '-' as string,
    positionInfo: '-' as string,

    minHeight: 6,
    maxHeight: 32,
    grassColorMap: [] as string[],
    snowColorMap: [] as string[],
    environmentType: 'outdoor' as 'outdoor' | 'indoor',

    setEnvironmentType(environmentType?: string | null) {
        this.environmentType = environmentType === 'indoor' ? 'indoor' : 'outdoor'
    },

    initialize() {
        //const blockMap: MapBlock[][] = WorldDataManager.getBlockMap()
        this.mapWidth = 1024
        this.mapHeight = 1024

        // Create an off-screen canvas for the full map
        this.offScreenCanvas = document.createElement("canvas")
        this.offScreenCanvas.width = this.mapWidth
        this.offScreenCanvas.height = this.mapHeight

        this.initializeTooltip()

        for (let height = this.minHeight; height <= this.maxHeight; height++) {
            const brightness = (height - this.minHeight) / (this.maxHeight - this.minHeight)
            const greenValue = Math.round(102 + brightness * (255 - 102))
            this.grassColorMap[height] = `#00${greenValue.toString(16).padStart(2, '0')}00`

            // snow goes from light gray to white
            const snowValue = Math.round(128 + brightness * (255 - 128))
            this.snowColorMap[height] = `#${snowValue.toString(16).padStart(2, '0')}${snowValue.toString(16).padStart(2, '0')}${snowValue.toString(16).padStart(2, '0')}`
        }
    },

    initializeTooltip() {
        const canvas = document.getElementById('miniMapCanvas') as HTMLCanvasElement | null
        if (!canvas) {
            return
        }

        canvas.onmouseenter = (event) => this.onMouseEnter(event)
        canvas.onmousemove = (event) => this.onMouseMove(event)
        canvas.onmouseleave = () => this.onMouseLeave()
        TooltipOverlayManager.initialize()
    },

    buildTooltipContent(): TooltipOverlayContent {
        return {
            title: MyPlayer.worldName || t('settings.miniMapSize'),
            rows: [
                { label: 'FPS', value: this.fpsInfo },
                { label: t('common.position'), value: this.positionInfo },
            ],
        }
    },

    setDebugInfo(fpsInfo: string, positionInfo: string) {
        this.fpsInfo = fpsInfo
        this.positionInfo = positionInfo

        if (TooltipOverlayManager.isVisibleFor(this.tooltipOwnerKey)) {
            TooltipOverlayManager.refresh(this.buildTooltipContent())
        }
    },

    onMouseEnter(event: MouseEvent) {
        if (TooltipOverlayManager.pinned) {
            return
        }

        TooltipOverlayManager.showFromEvent({
            ownerKey: this.tooltipOwnerKey,
            event,
            content: this.buildTooltipContent(),
        })
    },

    onMouseMove(event: MouseEvent) {
        TooltipOverlayManager.moveFromEvent(this.tooltipOwnerKey, event)
    },

    onMouseLeave() {
        TooltipOverlayManager.hideOwnerIfNotPinned(this.tooltipOwnerKey)
    },

    redrawMiniMap(mapChunk) {
        const blockMap = mapChunk.blockMap
        const offScreenContext = this.offScreenCanvas!.getContext("2d")
        if (!offScreenContext) return

        const dirtColor = "#8B4513"
        const waterColor = "#2222BB"
        const rockColor = "#666666"

        //console.log("Add chunk to minimap...")

        // Draw the entire map once on the off-screen canvas
        for (let x = 0; x < WorldDataManager.MAP_CHUNK_SIZE; x++) {
            for (let z = 0; z < WorldDataManager.MAP_CHUNK_SIZE; z++) {

                const data = (blockMap[z][x] as string).split(":")
                const height = parseInt(data[0])
                const type = parseInt(data[1])
                const snowed  = data[3] === "S"

                if (this.environmentType === 'indoor' && type === 0) {
                    offScreenContext.fillStyle = "#000000"
                } else if (height < 5) {
                    offScreenContext.fillStyle = waterColor
                } else {
                    offScreenContext.fillStyle = dirtColor

                    if (snowed) {
                        offScreenContext.fillStyle = this.snowColorMap[height]
                    } else {
                        if (type === 2) {
                            offScreenContext.fillStyle = this.grassColorMap[height]
                        } else if (type === 3) {
                            offScreenContext.fillStyle = rockColor
                        } else if (type === 50) {
                            offScreenContext.fillStyle = waterColor
                        }
                    }
                }
                offScreenContext.fillRect(mapChunk.z + x, mapChunk.x + z, 1, 1)
            }
        }
    },

    updateMiniMap() {
        const playerY = MyPlayer.myChar.pos.x
        const playerX = MyPlayer.myChar.pos.z

        const canvas = document.getElementById("miniMapCanvas") as HTMLCanvasElement
        const context = canvas.getContext("2d")

        if (!context || !this.offScreenCanvas) return
        canvas.width = this.canvasSize
        canvas.height = this.canvasSize

        // Keep the viewed map area independent from the canvas size.
        const extendedViewSize = Math.ceil(Math.sqrt(2) * this.viewSize)
        const extendedCanvasSize = Math.ceil(Math.sqrt(2) * this.canvasSize)
        context.save()

        // Rotate canvas by 135 degrees
        context.translate(this.canvasSize / 2, this.canvasSize / 2)
        context.rotate(-(Math.PI * 3 / 4))  // Rotate by 135 degrees

        // Calculate topleft position of viewport based on player position
        const startX = Math.max(playerX - Math.floor(extendedViewSize / 2))
        const startY = Math.max(playerY - Math.floor(extendedViewSize / 2))

        // Draw the larger image on the canvas
        context.drawImage(
            this.offScreenCanvas,
            startX, startY, extendedViewSize, extendedViewSize,  // Source x, y, width, height
            -extendedCanvasSize / 2, -extendedCanvasSize / 2, extendedCanvasSize, extendedCanvasSize  // Destination x, y, width, height
        )

        // Player position
        context.fillStyle = "red"
        context.beginPath()
        context.arc(0, 0, 2 * this.canvasSize / this.viewSize, 0, Math.PI * 2)  // Centered on the canvas
        context.fill()

        // context.restore()
    },

    updateCanvasSize(size, viewSize = size) {
        this.canvasSize = size
        this.viewSize = viewSize
        document.getElementById("miniMapCanvas").style.width = size + "px"
        document.getElementById("miniMapCanvas").style.height = size + "px"

        this.updateMiniMap()
    }
}
