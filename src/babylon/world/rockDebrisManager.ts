import { Matrix, Mesh, Scene, TransformNode, Vector2, VertexBuffer } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { BabylonUtils } from '@/babylon/utils'
import { MaterialEnum1, Materials, TerrainEnum1 } from '@/babylon/materials'
import { MapBlock, WorldDataManager } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { MyPlayer } from '@/data/myPlayer'

export const RockDebrisManager = {
    BASE_DENSITY: 1 / 8,
    OUTDOOR_DENSITY_MULTIPLIER: 0.75,
    INDOOR_DENSITY_MULTIPLIER: 1.25,
    MATERIAL: MaterialEnum1.ROCK1_SMALL,
    mesh: null as Mesh | null,

    initialize(scene: Scene, parent: TransformNode | null) {
        this.mesh = Builder.createWrappedBlock(scene, parent)
        this.mesh.name = 'rockDebrisBlock'
        this.mesh.position.y = 0
        this.scaleMeshUvs(this.mesh, this.MATERIAL.uvScale)
        this.mesh.material = Materials.blockMat1
        this.mesh.isPickable = false
        this.mesh.receiveShadows = true
        this.mesh.doNotSyncBoundingInfo = true
    },

    renderRockDebris(indoor: boolean) {
        const mesh = this.mesh
        if (!mesh) {
            return
        }

        const matrices: Matrix[] = []
        const uvData: Vector2[] = []
        const blockMap = WorldDataManager.getBlockMap()
        const myPos = MyPlayer.myChar.getPositionRounded()

        for (let x = Math.max(0, myPos.x + ViewportManager.minX); x <= Math.min(blockMap.length - 1, myPos.x + ViewportManager.maxX); x++) {
            for (let z = Math.max(0, myPos.z + ViewportManager.minZ); z <= Math.min(blockMap.length - 1, myPos.z + ViewportManager.maxZ); z++) {
                if (!ViewportManager.isPointInVisibleMatrix(x, z, 2)) {
                    continue
                }

                const block = blockMap[x][z]
                if (block.type !== TerrainEnum1.TERRAIN_ROCK.index || block.snowed || block.minableOre || block.minableCoal || (indoor && this.isDungeonWall(blockMap, x, z, block)) || !this.shouldSpawnPile(x, z, indoor)) {
                    continue
                }

                const stoneCount = 1 + this.hashTile(x, z, 1) % 5
                for (let index = 0; index < stoneCount; index++) {
                    matrices.push(this.getStoneMatrix(x, z, block.totalHeight, index))
                    uvData.push(this.MATERIAL.uv)
                }
            }
        }

        mesh.thinInstanceSetBuffer('matrix', BabylonUtils.createPositionBuffer(matrices), 16)
        mesh.thinInstanceSetBuffer('uvc', BabylonUtils.createUvBuffer(uvData), 2)
        mesh.setEnabled(matrices.length > 0)
        if (matrices.length > 0) {
            mesh.thinInstanceRefreshBoundingInfo(false)
        }
    },

    shouldSpawnPile(x: number, z: number, indoor: boolean): boolean {
        const multiplier = indoor ? this.INDOOR_DENSITY_MULTIPLIER : this.OUTDOOR_DENSITY_MULTIPLIER
        return this.hashTile(x, z, 0) / 0x100000000 < this.BASE_DENSITY * multiplier
    },

    isDungeonWall(blockMap: MapBlock[][], x: number, z: number, block: MapBlock): boolean {
        return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([offsetX, offsetZ]) => {
            const neighbor = blockMap[x + offsetX]?.[z + offsetZ]
            return !neighbor || neighbor.type <= 0 || neighbor.totalHeight < block.totalHeight
        })
    },

    scaleMeshUvs(mesh: Mesh, scale: Vector2) {
        const uvs = mesh.getVerticesData(VertexBuffer.UVKind)
        if (!uvs) {
            return
        }

        for (let i = 0; i < uvs.length; i += 2) {
            uvs[i] = 0.5 + (uvs[i] - 0.5) * scale.x
            uvs[i + 1] = 0.5 + (uvs[i + 1] - 0.5) * scale.y
        }
        mesh.setVerticesData(VertexBuffer.UVKind, uvs)
    },

    getStoneMatrix(x: number, z: number, groundHeight: number, index: number): Matrix {
        const scaleX = 0.12 + (this.hashTile(x, z, 10 + index) % 18) / 100
        const scaleY = 0.07 + (this.hashTile(x, z, 20 + index) % 12) / 100
        const scaleZ = 0.12 + (this.hashTile(x, z, 30 + index) % 18) / 100
        const offsetX = ((this.hashTile(x, z, 40 + index) % 70) / 100) - 0.35
        const offsetZ = ((this.hashTile(x, z, 50 + index) % 70) / 100) - 0.35
        const yaw = (this.hashTile(x, z, 60 + index) % 360) * Math.PI / 180
        const pitch = ((this.hashTile(x, z, 70 + index) % 25) - 12) * Math.PI / 180
        const roll = ((this.hashTile(x, z, 80 + index) % 25) - 12) * Math.PI / 180

        return Matrix.Scaling(scaleX, scaleY, scaleZ)
            .multiply(Matrix.RotationYawPitchRoll(yaw, pitch, roll))
            .multiply(Matrix.Translation(x + offsetX, groundHeight + scaleY / 2, z + offsetZ))
    },

    hashTile(x: number, z: number, salt: number): number {
        let hash = (MyPlayer.worldId * 73856093) ^ (x * 19349663) ^ (z * 83492791) ^ (salt * 2654435761)
        hash = Math.imul(hash ^ (hash >>> 16), 2246822519)
        hash = Math.imul(hash ^ (hash >>> 13), 3266489917)
        hash ^= hash >>> 16
        return hash >>> 0
    },
}
