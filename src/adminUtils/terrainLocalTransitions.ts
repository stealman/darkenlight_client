import { TerrainEnum1 } from '@/babylon/materials'
import { MapBlock } from '@/data/worldDataManager'

export function terrainWithoutSnow(block: MapBlock): MapBlock {
    const type = block.type === TerrainEnum1.TERRAIN_GRASS.index || block.type === TerrainEnum1.TERRAIN_GRASS_WINTER.index
        ? TerrainEnum1.TERRAIN_DIRT.index : block.type
    return Object.assign(new MapBlock(block.height, type), block, {type, snowed: false, heightOffset: 0, totalHeight: block.height})
}
