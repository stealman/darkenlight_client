import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from './baseStaticObject'
import { MaterialEnum1, TerrainEnum1 } from '@/babylon/materials'
import { MapBlock, WorldDataManager } from '@/data/worldDataManager'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { MyPlayer } from '@/data/myPlayer'

// Pile variation is seeded by world, tile and variant; piece sizes stay fixed.
const PIECES = [
    [-0.21, -0.16, 0.30, 0.18, 0.22],
    [0.23, -0.13, 0.22, 0.12, 0.18],
    [-0.04, 0.24, 0.18, 0.10, 0.15],
    [0.18, 0.19, 0.25, 0.16, 0.20],
    [-0.25, 0.17, 0.14, 0.09, 0.12],
    [0.03, -0.04, 0.38, 0.25, 0.27],
    [-0.03, -0.29, 0.12, 0.08, 0.10],
    [0.30, 0.05, 0.10, 0.07, 0.09],
    [-0.30, -0.02, 0.16, 0.11, 0.13],
    [0.12, 0.31, 0.13, 0.09, 0.11],
]

export class TerrainDebris extends BaseStaticObject {
    private readonly pieces: Matrix[]

    constructor(type: number, position: Vector3) {
        super(type, position, 0, MaterialEnum1.ROCK1.uv, null)
        const variant = type - 151
        // Persisted type 153 retains the original large pile (now UI variant 4).
        const scale = [0.55, 0.8, 1.1, 0.95, 1.35][variant]
        let seed = Math.imul(MyPlayer.worldId, 73856093) ^ Math.imul(position.x, 19349663)
            ^ Math.imul(position.z, 83492791) ^ Math.imul(type, 2654435761)
        const random = () => {
            seed = (seed + 0x6D2B79F5) | 0
            let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
            value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
            return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
        }
        const count = variant === 0 ? 2 + Math.floor(random() * 3) : [3, 5, 8, 6, 10][variant]
        const angle = random() * Math.PI * 2
        const cos = Math.cos(angle), sin = Math.sin(angle)
        this.pieces = PIECES.slice(0, count).map(([x, z, width, height, depth]) => {
            const yaw = random() * Math.PI * 2
            // Keep the rotated fragment inside its tile even after position jitter.
            const halfX = (Math.abs(Math.cos(yaw)) * width + Math.abs(Math.sin(yaw)) * depth) * scale / 2
            const halfZ = (Math.abs(Math.sin(yaw)) * width + Math.abs(Math.cos(yaw)) * depth) * scale / 2
            const offsetX = x * cos - z * sin + (random() - 0.5) * 0.14
            const offsetZ = x * sin + z * cos + (random() - 0.5) * 0.14
            return Matrix.Scaling(width * scale, height * scale, depth * scale)
                .multiply(Matrix.RotationY(yaw))
                // Both shared block meshes have a fixed -0.5 Y offset.
                .multiply(Matrix.Translation(
                    Math.max(-0.48 + halfX, Math.min(0.48 - halfX, offsetX)),
                    height * scale / 2 + 0.5,
                    Math.max(-0.48 + halfZ, Math.min(0.48 - halfZ, offsetZ)),
                ))
        })
    }

    private getTerrain(): MapBlock | undefined {
        return WorldDataManager.getBlockMap()[this.position.x]?.[this.position.z]
    }

    private isSnowSuppressed(block: MapBlock): boolean {
        const mapSize = WorldDataManager.getBlockMap().length
        return block.snowed && WorldRenderer.snowCoverMask.has(this.position.x * mapSize + this.position.z)
    }

    private usesBlockMaterial(block: MapBlock): boolean {
        return (block.snowed && !this.isSnowSuppressed(block)) || block.type === TerrainEnum1.TERRAIN_ROCK.index
    }

    private appendPieces(matrices: Matrix[], uvData: Vector2[], material: Vector2) {
        const block = this.getTerrain()!
        const y = this.renderPosition.y - (this.isSnowSuppressed(block) ? block.heightOffset : 0)
        const world = Matrix.Translation(this.renderPosition.x, y, this.renderPosition.z)
        for (const piece of this.pieces) {
            matrices.push(piece.multiply(world))
            uvData.push(material)
        }
    }

    render() {
        const block = this.getTerrain()
        if (!block || block.type <= 0 || !this.usesBlockMaterial(block)) return
        const material = block.snowed && !this.isSnowSuppressed(block) ? MaterialEnum1.SNOW : MaterialEnum1.ROCK1
        this.appendPieces(WorldRenderer.block1!.matrices, WorldRenderer.block1!.uvData, material.uv)
    }

    renderTerrain(matrices: Matrix[], uvData: Vector2[]) {
        const block = this.getTerrain()
        if (!block || block.type <= 0 || this.usesBlockMaterial(block)) return
        const hideSnow = this.isSnowSuppressed(block)
        const renderType = hideSnow && (block.type === 2 || block.type === 5) ? TerrainEnum1.TERRAIN_DIRT.index : undefined
        this.appendPieces(matrices, uvData, TerrainEnum1.getTerrainForBlock(block, hideSnow, renderType))
    }
}
