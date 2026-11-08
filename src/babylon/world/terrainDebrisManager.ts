import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { WorldDataManager } from '@/data/worldDataManager'
import { MyPlayer } from '@/data/myPlayer'
import { ViewportManager } from '@/utils/viewport'
import { BuildingManager } from './buildings/buildingManager'
import { StaticsManager } from './statics/staticsManager'
import { TerrainDebris } from './statics/objects/terrainDebris'

const NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export const TerrainDebrisManager = {
    worldId: -1,
    piles: new Map<number, TerrainDebris>(),

    roll(x: number, z: number, salt: number): number {
        let value = Math.imul(MyPlayer.worldId, 73856093) ^ Math.imul(x, 19349663)
            ^ Math.imul(z, 83492791) ^ Math.imul(salt, 2654435761)
        value = Math.imul(value ^ (value >>> 16), 2246822519)
        value = Math.imul(value ^ (value >>> 13), 3266489917)
        return ((value ^ (value >>> 16)) >>> 0) / 0x100000000
    },

    render(terrainMatrices: Matrix[], terrainUvData: Vector2[]) {
        if (this.worldId !== MyPlayer.worldId) {
            this.piles.clear()
            this.worldId = MyPlayer.worldId
        }
        const map = WorldDataManager.getBlockMap()
        const size = map.length
        const pos = MyPlayer.myChar.getPositionRounded()
        const occupied = new Set<number>()
        for (const object of StaticsManager.allStatics) {
            if (!object.isBlocking() && !(object instanceof TerrainDebris)) continue
            for (let dx = 0; dx < object.getSizeX(); dx++) {
                for (let dz = 0; dz < object.getSizeZ(); dz++) {
                    occupied.add((object.position.x + dx) * size + object.position.z + dz)
                }
            }
        }
        const next = new Map<number, TerrainDebris>()
        for (let x = Math.max(0, pos.x + ViewportManager.minX); x <= Math.min(size - 1, pos.x + ViewportManager.maxX); x++) {
            for (let z = Math.max(0, pos.z + ViewportManager.minZ); z <= Math.min(size - 1, pos.z + ViewportManager.maxZ); z++) {
                const block = map[x][z]
                const key = x * size + z
                if (block.type <= 0 || block.type >= 50 || block.minableOreAvailable || block.minableCoal
                    || occupied.has(key) || BuildingManager.hasFloorAtTile(x, z)
                    || !ViewportManager.isPointInVisibleMatrix(x, z, 2, block.totalHeight)
                    || this.roll(x, z, 401) >= 0.1) continue
                // Compare base terrain heights: snow and surface layers do not form hills.
                if (!NEIGHBORS.some(([dx, dz]) => {
                    const neighbor = map[x + dx]?.[z + dz]
                    return neighbor && neighbor.type > 0 && neighbor.height > block.height
                })) continue
                const type = this.roll(x, z, 402) < 2 / 3 ? 151 : 152
                const pile = this.piles.get(key) ?? new TerrainDebris(type, new Vector3(x, block.totalHeight, z))
                pile.position.y = pile.renderPosition.y = block.totalHeight
                next.set(key, pile)
                pile.render()
                pile.renderTerrain(terrainMatrices, terrainUvData)
            }
        }
        this.piles = next
    },

    hasPileAt(x: number, z: number): boolean {
        return this.piles.has(x * WorldDataManager.getBlockMap().length + z)
    },
}
