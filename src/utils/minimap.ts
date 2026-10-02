import { WorldDataManager } from '@/data/worldDataManager'
import { MyPlayer } from '@/data/myPlayer'
import { TooltipOverlayContent, TooltipOverlayManager } from '@/gui/tooltipOverlayManager'
import { t } from '@/i18n'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import { Lights } from '@/babylon/scene/lights'

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
    dirtColorMap: [] as string[],
    rockColorMap: [] as string[],
    snowColorMap: [] as string[],
    environmentType: 'outdoor' as 'outdoor' | 'indoor',
    dungeonEntranceColor: '#a484c1' as string,

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

        const accentPurple = getComputedStyle(document.documentElement).getPropertyValue('--ui-accent-purple').trim()
        if (accentPurple) {
            this.dungeonEntranceColor = `rgb(${accentPurple})`
        }

        this.initializeTooltip()

        for (let height = this.minHeight; height <= this.maxHeight; height++) {
            const brightness = (height - this.minHeight) / (this.maxHeight - this.minHeight)
            const greenValue = Math.round(102 + brightness * (255 - 102))
            this.grassColorMap[height] = `#00${greenValue.toString(16).padStart(2, '0')}00`

            // Keep the original mid-range colors while making the terrain relief visible.
            const dirtRed = Math.round(84 + brightness * (196 - 84))
            const dirtGreen = Math.round(40 + brightness * (98 - 40))
            const dirtBlue = Math.round(13 + brightness * (25 - 13))
            this.dirtColorMap[height] = `#${dirtRed.toString(16).padStart(2, '0')}${dirtGreen.toString(16).padStart(2, '0')}${dirtBlue.toString(16).padStart(2, '0')}`

            const rockValue = Math.round(51 + brightness * (153 - 51))
            this.rockColorMap[height] = `#${rockValue.toString(16).padStart(2, '0')}${rockValue.toString(16).padStart(2, '0')}${rockValue.toString(16).padStart(2, '0')}`

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
        const gameTime = Lights.getGameTimeInfo()
        return {
            title: MyPlayer.worldName || t('settings.miniMapSize'),
            topRightText: gameTime.time,
            topRightMeta: t(`dayNight.${gameTime.phaseName}`),
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

    getMapColor(height: number, type: number, snowed: boolean): string {
        const waterColor = "#2222BB"
        const colorHeight = Math.max(this.minHeight, Math.min(this.maxHeight, height))
        if (this.environmentType === 'indoor' && type === 0) {
            return "#000000"
        }
        // The server sends deep water as effective type 51, while shallow
        // water remains type 50. Both use the same minimap color.
        if (height < 5 || type === 50 || type === 51) {
            return waterColor
        }
        if (snowed) {
            return this.snowColorMap[colorHeight]
        }
        if (type === 2) {
            return this.grassColorMap[colorHeight]
        }
        if (type === 3) {
            return this.rockColorMap[colorHeight]
        }
        return this.dirtColorMap[colorHeight]
    },

    redrawMiniMap(mapChunk) {
        const blockMap = mapChunk.blockMap
        const offScreenContext = this.offScreenCanvas!.getContext("2d")
        if (!offScreenContext) return

        //console.log("Add chunk to minimap...")

        // Draw the entire map once on the off-screen canvas
        for (let x = 0; x < WorldDataManager.MAP_CHUNK_SIZE; x++) {
            for (let z = 0; z < WorldDataManager.MAP_CHUNK_SIZE; z++) {

                const data = (blockMap[z][x] as string).split(":")
                const height = parseInt(data[0])
                const type = parseInt(data[1])
                const snowed  = data[3] === "S"
                offScreenContext.fillStyle = this.getMapColor(height, type, snowed)
                offScreenContext.fillRect(mapChunk.z + x, mapChunk.x + z, 1, 1)
            }
        }
    },

    redrawMapChanges(worldId: number, changes: Array<{x: number, z: number, data: string}>) {
        if (worldId !== MyPlayer.worldId || !this.offScreenCanvas) {
            return
        }
        const offScreenContext = this.offScreenCanvas.getContext("2d")
        if (!offScreenContext) {
            return
        }
        for (const change of changes) {
            const data = change.data.split(":")
            offScreenContext.fillStyle = this.getMapColor(parseInt(data[0]), parseInt(data[1]), data[3] === "S")
            offScreenContext.fillRect(change.z, change.x, 1, 1)
        }
        this.updateMiniMap()
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
        const mapRotation = -(Math.PI * 3 / 4)
        context.rotate(mapRotation)  // Rotate by 135 degrees

        // Calculate topleft position of viewport based on player position
        const startX = Math.max(playerX - Math.floor(extendedViewSize / 2))
        const startY = Math.max(playerY - Math.floor(extendedViewSize / 2))

        // Draw the larger image on the canvas
        context.drawImage(
            this.offScreenCanvas,
            startX, startY, extendedViewSize, extendedViewSize,  // Source x, y, width, height
            -extendedCanvasSize / 2, -extendedCanvasSize / 2, extendedCanvasSize, extendedCanvasSize  // Destination x, y, width, height
        )

        context.restore()
        this.drawDungeonEntrances(context, playerX, playerY, mapRotation)

        // Player position
        context.fillStyle = "red"
        context.beginPath()
        context.arc(this.canvasSize / 2, this.canvasSize / 2, 2 * this.canvasSize / this.viewSize, 0, Math.PI * 2)
        context.fill()
    },

    drawDungeonEntrances(context: CanvasRenderingContext2D, playerX: number, playerY: number, mapRotation: number) {
        const mapScale = this.canvasSize / this.viewSize
        const markerSize = Math.max(6, Math.round(9 * mapScale))
        const borderSize = 2
        const halfMarkerSize = markerSize / 2
        const rotationCos = Math.cos(mapRotation)
        const rotationSin = Math.sin(mapRotation)

        for (const obj of StaticsManager.dungeonEntrances) {
            const mapX = (obj.renderPosition.z - playerX) * mapScale
            const mapY = (obj.renderPosition.x - playerY) * mapScale
            const screenX = this.canvasSize / 2 + mapX * rotationCos - mapY * rotationSin
            const screenY = this.canvasSize / 2 + mapX * rotationSin + mapY * rotationCos

            if (screenX < -halfMarkerSize || screenX > this.canvasSize + halfMarkerSize
                || screenY < -halfMarkerSize || screenY > this.canvasSize + halfMarkerSize) {
                continue
            }

            const left = Math.round(screenX - halfMarkerSize)
            const top = Math.round(screenY - halfMarkerSize)

            context.fillStyle = this.dungeonEntranceColor
            context.fillRect(left, top, markerSize, markerSize)

            context.fillStyle = '#000000'
            context.fillRect(left, top, markerSize, borderSize)
            context.fillRect(left, top, borderSize, markerSize)
            context.fillRect(left + markerSize - borderSize, top, borderSize, markerSize)
        }
    },

    updateCanvasSize(size, viewSize = size) {
        this.canvasSize = size
        this.viewSize = viewSize
        document.getElementById("miniMapCanvas").style.width = size + "px"
        document.getElementById("miniMapCanvas").style.height = size + "px"

        this.updateMiniMap()
    }
}
