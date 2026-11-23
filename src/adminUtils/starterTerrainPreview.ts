import { MapBlock } from '@/data/worldDataManager'
import { loadCompiledWorldMap } from '@/local/worldBundle'

// The initial character position in world 1 (CharactersManager.createCharacter).
const STARTER_POSITION = {world: 1, x: 952, z: 996}
export const STARTER_TERRAIN_RADIUS = 20

export async function loadStarterTerrain() {
    const {world, x, z} = STARTER_POSITION
    const {palette, indices, depth} = await loadCompiledWorldMap(document.baseURI, world)
    const originX = x - STARTER_TERRAIN_RADIUS
    const originZ = z - STARTER_TERRAIN_RADIUS
    const size = STARTER_TERRAIN_RADIUS * 2 + 1
    return Array.from({length: size}, (_, dx) => Array.from({length: size}, (_, dz) => {
        const tile = palette[indices[(originX + dx) * depth + originZ + dz]]
        const block = MapBlock.fromCompiledTile(tile)
        // The preview blends horizontal surfaces at the same base elevation.
        block.heightOffset = 0
        block.totalHeight = block.height
        return block
    }))
}

