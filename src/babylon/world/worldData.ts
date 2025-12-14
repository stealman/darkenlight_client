export const WorldData = {
    blockMap: [] as MapBlock[][],
    planeBlockMap: [] as MapBlock[][],

    setWorldMap(data: number[][]) {
        this.blockMap = Array.from({ length: data.length }, () => Array(data[0].length).fill(new MapBlock(0, 0)))

        for (let i = 0; i < data.length; i++) {
            for (let j = 0; j < data[i].length; j++) {
                const height = Math.floor(data[i][j] / 8)
                let blockType = 1

                if (height >= 5) {
                    blockType = 2
                }

                this.blockMap[i][j] = new MapBlock(height, blockType)
            }
        }

        this.planeBlockMap = Array.from({ length: this.blockMap.length }, () => Array(this.blockMap[0].length).fill(false))
        this.identifyPlaneBlocks()
    },

    identifyPlaneBlocks() {
        const rows = this.blockMap.length
        const cols = this.blockMap[0].length

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const block = this.blockMap[i][j]
                let isCandidate = true

                // Check all 8 neighbors
                const neighbors = [
                    [i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1],  // Up, down, left, right
                    [i - 1, j - 1], [i - 1, j + 1], [i + 1, j - 1], [i + 1, j + 1]  // Diagonals
                ]

                for (const [ni, nj] of neighbors) {
                    if (ni >= 0 && ni < rows && nj >= 0 && nj < cols) {
                        if (!this.blockMap[ni][nj].equals(block)) {
                            isCandidate = false
                            break
                        }
                    }
                }

                if (isCandidate) {
                    this.planeBlockMap[i][j] = block
                }
            }
        }
    },

    getPlaneBlockMap() {
        return this.planeBlockMap;
    },

    getBlockMap() {
        return this.blockMap;
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
