import { Connector } from '@/network/connector'
import { FetchWorldDataMsg } from '@/network/messages'
import { Vector3 } from '@babylonjs/core'
import { TerrainManager } from '@/babylon/world/terrainManager'
import { TreeManager } from '@/babylon/world/treeManager'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { StaticsManager } from '@/babylon/world/staticsManager'
import { MyPlayer } from '@/data/myPlayer'

export const WorldDataManager = {
    MAP_CHUNK_SIZE: 128 as number,
    worldDataMap: new Map<number, WorldData>(),

    fetchWorldDataIfNeeded() {
        if (!this.worldDataMap.has(MyPlayer.worldId)) {
            this.worldDataMap.set(MyPlayer.worldId, new WorldData(1024))
        }

        const worldData = this.worldDataMap.get(MyPlayer.worldId)!

        const actualPos = MyPlayer.myChar.getPositionRounded()
        const actualChunkX = Math.floor(actualPos.x / this.MAP_CHUNK_SIZE) * this.MAP_CHUNK_SIZE
        const actualChunkZ = Math.floor(actualPos.z / this.MAP_CHUNK_SIZE) * this.MAP_CHUNK_SIZE

        // Fetch only if we don't have the chunk yet
        if (!worldData.hasChunkAt(actualChunkX, actualChunkZ)) {
            Connector.sendMessage(new FetchWorldDataMsg(MyPlayer.worldId, actualChunkX, actualChunkZ))
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
                Connector.sendMessage(new FetchWorldDataMsg(MyPlayer.worldId, chunkX, chunkZ))
            }
        }
    },

    consumeMapChunk(mapChunk) {
        console.log(mapChunk)
        if (!this.worldDataMap.has(MyPlayer.worldId)) {
            this.worldDataMap.set(MyPlayer.worldId, new WorldData(1024))
        }
        this.worldDataMap.get(MyPlayer.worldId)!.consumeMapChunk(mapChunk)
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
        return this.worldDataMap.get(MyPlayer.worldId)!.planeBlockMap;
    },

    getBlockMap() {
        return this.worldDataMap.get(MyPlayer.worldId)!.blockMap;
    },

    getBlockOnPosition(pos: Vector3): MapBlock | null {
        const map = WorldDataManager.getBlockMap()
        return map[Math.floor(pos.x)][Math.floor(pos.z)]
    },

    getCoveredBlocks(pos: Vector3, boxSize: number, blockSize = 1): MapBlock[] {
        const worldData = this.worldDataMap.get(MyPlayer.worldId)
        if (!worldData) {
            return []
        }

        const threshold = blockSize - (boxSize / 2)
        const coveredBlocks: MapBlock[] = []

        for (let x = Math.floor(pos.x) - 2; x <= Math.ceil(pos.x) + 2; x++) {
            if (x < 0 || x >= worldData.worldSize) {
                continue
            }

            for (let z = Math.floor(pos.z) - 2; z <= Math.ceil(pos.z) + 2; z++) {
                if (z < 0 || z >= worldData.worldSize) {
                    continue
                }

                if (Math.abs(x - pos.x) < threshold && Math.abs(z - pos.z) < threshold) {
                    coveredBlocks.push(worldData.blockMap[x][z])
                }
            }
        }

        return coveredBlocks
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
                mapBlock.setMinable(data[4])
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
            block.setMinable(data[4])
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
    minableCoal: boolean
    minableOre: number | null

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

    setMinable(minable: undefined | string | null) {
        if (minable) {
            console.log("Minable block with data: " + minable)
            this.minableCoal = minable === 'C'
            this.minableOre = minable.startsWith('M') ? parseInt(minable.substring(1)) : null
        } else {
            this.minableCoal = false
            this.minableOre = null
        }
    }

    equals(other: MapBlock) {
        return this.height === other.height && this.type === other.type && this.snowed === other.snowed
    }
}
