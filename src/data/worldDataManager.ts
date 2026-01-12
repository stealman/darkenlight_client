import { Data } from '@/data/globalData'
import { Connector } from '@/network/connector'
import { FetchWorldDataMsg } from '@/network/messages'
import { Vector3 } from '@babylonjs/core'
import { TerrainManager } from '@/babylon/world/terrainManager'
import { TreeManager } from '@/babylon/world/treeManager'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { StaticsManager } from '@/babylon/world/staticsManager'

export const WorldDataManager = {
    MAP_CHUNK_SIZE: 128 as number,
    worldDataMap: new Map<number, WorldData>(),

    fetchWorldDataIfNeeded() {
        if (!this.worldDataMap.has(Data.worldId)) {
            this.worldDataMap.set(Data.worldId, new WorldData(1024))
        }

        const worldData = this.worldDataMap.get(Data.worldId)!

        const actualPos = Data.myChar.getPositionRounded()
        const actualChunkX = Math.floor(actualPos.x / this.MAP_CHUNK_SIZE) * this.MAP_CHUNK_SIZE
        const actualChunkZ = Math.floor(actualPos.z / this.MAP_CHUNK_SIZE) * this.MAP_CHUNK_SIZE

        // Fetch only if we don't have the chunk yet
        if (!worldData.hasChunkAt(actualChunkX, actualChunkZ)) {
            Connector.sendMessage(new FetchWorldDataMsg(Data.worldId, actualChunkX, actualChunkZ))
        }

        // Check surrounding chunks as well
        const surroundingOffsets = [
            [-this.MAP_CHUNK_SIZE, 0], [this.MAP_CHUNK_SIZE, 0], [0, -this.MAP_CHUNK_SIZE], [0, this.MAP_CHUNK_SIZE],
            [-this.MAP_CHUNK_SIZE, -this.MAP_CHUNK_SIZE], [-this.MAP_CHUNK_SIZE, this.MAP_CHUNK_SIZE], [this.MAP_CHUNK_SIZE, -this.MAP_CHUNK_SIZE], [this.MAP_CHUNK_SIZE, this.MAP_CHUNK_SIZE]
        ]

        for (const offset of surroundingOffsets) {
            const chunkX = actualChunkX + offset[0]
            const chunkZ = actualChunkZ + offset[1]

            if (chunkX < 0 || chunkZ < 0 || chunkX >= worldData.worldSize || chunkZ >= worldData.worldSize) {
                continue
            }

            if (!worldData.hasChunkAt(chunkX, chunkZ)) {
                Connector.sendMessage(new FetchWorldDataMsg(Data.worldId, chunkX, chunkZ))
            }
        }
    },

    consumeMapChunk(mapChunk) {
        if (!this.worldDataMap.has(Data.worldId)) {
            this.worldDataMap.set(Data.worldId, new WorldData(1024))
        }
        this.worldDataMap.get(Data.worldId)!.consumeMapChunk(mapChunk)
    },

    consumeMapUpdate(worldId, data) {
        this.worldDataMap.get(worldId)!.consumeMapUpdate(data)
        TreeManager.recountYPositions()
        TreeManager.renderTrees()
        StaticsManager.recountYPositions()
        StaticsManager.renderObjects()
        WorldRenderer.renderWorld()
    },

    getPlaneBlockMap() {
        return this.worldDataMap.get(Data.worldId)!.planeBlockMap;
    },

    getBlockMap() {
        return this.worldDataMap.get(Data.worldId)!.blockMap;
    },

    getBlockOnPosition(pos: Vector3): MapBlock | null {
        const map = WorldDataManager.getBlockMap()
        return map[Math.floor(pos.x)][Math.floor(pos.z)]
    }
}

export class WorldData {
    worldSize: number = 1024
    blockMap: MapBlock[][] = [] as MapBlock[][]
    planeBlockMap: MapBlock[][] = [] as MapBlock[][]
    loadedChunkCoords: Vector3[] = []

    constructor(size: number) {
        this.worldSize = size
        this.blockMap = Array.from({ length: size }, () => Array(size).fill(new MapBlock(0, 0)))
        this.planeBlockMap = Array.from({ length: size }, () => Array(size).fill(false))
    }

    consumeMapChunk(mapChunk) {
        for (let i = 0; i < mapChunk.blockMap.length; i++) {
            for (let j = 0; j < mapChunk.blockMap[i].length; j++) {
                const data = (mapChunk.blockMap[i][j] as string).split(":")

                const mapBlock: MapBlock = new MapBlock(parseInt(data[0]), parseInt(data[1]))
                this.blockMap[mapChunk.x + i][mapChunk.z + j] = mapBlock

                // Planes are marked with "P" at the end
                if (data[2] === "P") {
                    this.planeBlockMap[mapChunk.x + i][mapChunk.z + j] = mapBlock
                }

                // Snowed blocks are marked with "S" at the end
                if (data[3] === "S") {
                    mapBlock.snowed = true
                }

                mapBlock.presetHeightOffset()
            }
        }
        this.loadedChunkCoords.push(new Vector3(mapChunk.x, 0, mapChunk.z))
    }

    consumeMapUpdate(changes) {
        for (const change of changes) {
            const data = change.data.split(":")
            const block = this.blockMap[change.x][change.z]
            block.height = parseInt(data[0])
            block.type = parseInt(data[1])

            // Planes are marked with "P" at the end
            if (data[2] === "P") {
                this.planeBlockMap[change.x][change.z] = block
            } else {
                this.planeBlockMap[change.x][change.z] = false
            }

            // Snowed blocks are marked with "S" at the end
            if (data[3] === "S") {
                block.snowed = true
            } else {
                block.snowed = false
            }
            block.presetHeightOffset()
        }

        TerrainManager.renderTerrain()
    }

    hasChunkAt(x: number, z: number): boolean {
        return this.loadedChunkCoords.some(coord => coord.x === x && coord.z === z)
    }
}

export class MapBlock {
    height: number
    type: number
    heightOffset: number
    totalHeight: number
    snowed: boolean = false

    constructor(height: number, type: number) {
        this.height = height
        this.type = type

    }

    presetHeightOffset() {
        this.heightOffset = this.getRenderedHeightOffset()
        this.totalHeight = this.height + this.heightOffset
    }

    getRenderedHeightOffset() {
        if (this.type === 2 || this.snowed) {
            return  0.1
        }
        return 0
    }

    equals(other: MapBlock) {
        return this.height === other.height && this.type === other.type && this.snowed === other.snowed
    }
}
