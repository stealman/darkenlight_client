import { Data } from '@/data/globalData'
import { Connector } from '@/network/connector'
import { FetchWorldDataMsg } from '@/network/messages'
import { Vector3 } from '@babylonjs/core'

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
                //console.log("Fetching surrounding world data chunk at:", chunkX, chunkZ)
                Connector.sendMessage(new FetchWorldDataMsg(Data.worldId, chunkX, chunkZ))
            }
        }
    },

    consumeMapChunk(mapChunk) {
        this.worldDataMap.get(Data.worldId)!.consumeMapChunk(mapChunk)
    },

    getPlaneBlockMap() {
        return this.worldDataMap.get(Data.worldId)!.planeBlockMap;
    },

    getBlockMap() {
        return this.worldDataMap.get(Data.worldId)!.blockMap;
    },
}

export class WorldData {
    worldSize: number = 1024
    blockMap: MapBlock[][] = [] as MapBlock[][]
    planeBlockMap: [][] = [] as [][]
    loadedChunkCoords: Vector3[] = []

    constructor(size: number) {
        this.worldSize = size
        this.blockMap = Array.from({ length: size }, () => Array(size).fill(new MapBlock(0, 0)))
        this.planeBlockMap = Array.from({ length: size }, () => Array(size).fill(false))
    }

    consumeMapChunk(mapChunk) {
        for (let i = 0; i < mapChunk.blockMap.length; i++) {
            for (let j = 0; j < mapChunk.blockMap[i].length; j++) {
                const data = mapChunk.blockMap[i][j] as { height: number, type: number }
                const mapBlock: MapBlock = new MapBlock(data.height, data.type)

                this.blockMap[mapChunk.x + i][mapChunk.z + j] = mapBlock
            }
        }

        for (let i = 0; i < mapChunk.planeMap.length; i++) {
            for (let j = 0; j < mapChunk.planeMap[i].length; j++) {
                const data = mapChunk.planeMap[i][j] as { height: number, type: number }
                if (data.height && data.type) {
                    const mapBlock: MapBlock = new MapBlock(data.height, data.type)
                    this.planeBlockMap[mapChunk.x + i][mapChunk.z + j] = mapBlock
                } else {
                    this.planeBlockMap[mapChunk.x + i][mapChunk.z + j] = false
                }
            }
        }

        this.loadedChunkCoords.push(new Vector3(mapChunk.x, 0, mapChunk.z))
    }

    hasChunkAt(x: number, z: number): boolean {
        return this.loadedChunkCoords.some(coord => coord.x === x && coord.z === z)
    }
}

export class MapBlock {
    height: number
    type: number

    constructor(height: number, type: number) {
        this.height = height
        this.type = type
    }

    equals(other: MapBlock) {
        return this.height === other.height && this.type === other.type
    }
}
