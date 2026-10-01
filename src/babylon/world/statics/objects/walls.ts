import { Color3, Matrix, Mesh, MeshBuilder, Vector2, Vector3 } from '@babylonjs/core'
import { Materials, TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { WorldDataManager } from '@/data/worldDataManager'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'

export class Wall2 extends BaseStaticObject {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, null)
    }

    render() {
        for (let i = 1; i <= 2; i++) {
            WorldRenderer.block1!.matrices.push(Matrix.Translation(this.renderPosition.x, this.renderPosition.y + i, this.renderPosition.z))
            WorldRenderer.block1!.uvData.push(this.material)
        }
    }
}

export class Wall3 extends BaseStaticObject {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, null)
    }

    render() {
        for (let i = 1; i <= 3; i++) {
            WorldRenderer.block1!.matrices.push(Matrix.Translation(this.renderPosition.x, this.renderPosition.y + i, this.renderPosition.z))
            WorldRenderer.block1!.uvData.push(this.material)
        }
    }
}

export type StoneEntranceFacing = '-X' | '+X' | '-Z' | '+Z'

export interface StoneEntranceMetadata {
    facing?: StoneEntranceFacing
}

const PORTAL_LIGHT_COLOR = new Color3(0.65, 0.16, 1)
const PORTAL_LIGHT_HEIGHT = 1
const PORTAL_LIGHT_OUTWARD_OFFSET = 1.05

export class StoneEntrance extends BaseStaticObject {
    private readonly facing: StoneEntranceFacing
    private readonly portalLightPosition = new Vector3()
    private readonly portalLightDirection = new Vector3()
    private portalPlane: Mesh | null = null

    constructor(type: number, position: Vector3, material: Vector2, metadata?: StoneEntranceMetadata) {
        super(type, position, 0, material, null)
        this.facing = metadata?.facing === '-X' || metadata?.facing === '+X' || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : '+Z'
        this.status = {facing: this.facing}
        this.renderPosition.set(position.x - 0.5 + this.getSizeX() / 2, position.y, position.z - 0.5 + this.getSizeZ() / 2)
    }

    render() {
        this.updatePortalPlanePosition()
        this.registerLight()
    }

    onVisible() {
        if (!WorldRenderer.worldParentNode) {
            return
        }

        if (!this.portalPlane) {
            this.portalPlane = MeshBuilder.CreatePlane(
                `stoneEntrancePortal_${this.position.x}_${this.position.z}`,
                { width: 2, height: 2, sideOrientation: Mesh.DOUBLESIDE },
                WorldRenderer.worldParentNode.getScene(),
            )
            this.portalPlane.parent = WorldRenderer.worldParentNode
            this.portalPlane.material = Materials.entrancePortalMaterial
            this.portalPlane.isPickable = false
            this.portalPlane.alwaysSelectAsActiveMesh = true
        }
        this.updatePortalPlanePosition()
        this.registerLight()
    }

    onHidden() {
        this.dispose()
    }

    dispose() {
        Lights.unregisterStaticLight(this.getLightId())
        this.portalPlane?.dispose()
        this.portalPlane = null
    }

    private getLightId(): string {
        return `stone_entrance_${this.position.x}_${this.position.z}`
    }

    private registerLight() {
        this.updatePortalLightTransform()
        Lights.registerStaticLight(this.getLightId(), this.portalLightPosition, {
            color: PORTAL_LIGHT_COLOR,
            height: 0,
            intensity: 3.6,
            range: 8,
            direction: this.portalLightDirection,
            angle: Math.PI * 0.72,
            priority: 1,
            outdoorRangeFactor: 1,
            castsShadows: false,
        })
    }

    private updatePortalLightTransform() {
        const facingX = this.facing === '+X' ? 1 : this.facing === '-X' ? -1 : 0
        const facingZ = this.facing === '+Z' ? 1 : this.facing === '-Z' ? -1 : 0
        const approachDirection = Lights.indoor ? 1 : -1
        this.portalLightPosition.set(
            this.renderPosition.x + (facingX * PORTAL_LIGHT_OUTWARD_OFFSET),
            this.renderPosition.y + PORTAL_LIGHT_HEIGHT,
            this.renderPosition.z + (facingZ * PORTAL_LIGHT_OUTWARD_OFFSET),
        )
        this.portalLightDirection.set(
            facingX * approachDirection,
            -0.35,
            facingZ * approachDirection,
        ).normalize()
    }

    private updatePortalPlanePosition() {
        if (!this.portalPlane) {
            return
        }

        const facingX = this.facing === '+X' ? 1 : this.facing === '-X' ? -1 : 0
        const facingZ = this.facing === '+Z' ? 1 : this.facing === '-Z' ? -1 : 0
        this.portalPlane.position.set(
            this.renderPosition.x + facingX * 0.91,
            this.renderPosition.y + 1,
            this.renderPosition.z + facingZ * 0.91,
        )
        this.portalPlane.rotation.y = facingX === 0 ? 0 : Math.PI / 2
    }

    renderTerrain(terrainMatrices: Matrix[], terrainUvData: Vector2[]) {
        const terrainBlock = WorldDataManager.getBlockMap()[Math.floor(this.position.x)]?.[Math.floor(this.position.z)]
        if (!terrainBlock || terrainBlock.type <= 0) {
            return
        }

        const runsAlongX = this.getSizeX() > this.getSizeZ()
        const addBlock = (widthOffset: number, depthOffset: number, height: number) => {
            const x = this.position.x + (runsAlongX ? widthOffset : depthOffset)
            const z = this.position.z + (runsAlongX ? depthOffset : widthOffset)
            terrainMatrices.push(Matrix.Translation(x, this.position.y + height, z))
            terrainUvData.push(TerrainEnum1.getTerrainForBlock(terrainBlock))
        }

        for (let depth = 0; depth < 2; depth++) {
            for (const width of [0, 3]) {
                for (let height = 1; height <= 3; height++) {
                    addBlock(width, depth, height)
                }
            }
            addBlock(1, depth, 3)
            addBlock(2, depth, 3)
        }
    }

    isObjectInCollision(tgtX: number, tgtZ: number, size: number): boolean {
        const moverHalf = size / 2
        const runsAlongX = this.getSizeX() > this.getSizeZ()
        return [0, 3].some((width) => {
            return [0, 1].some((depth) => {
                const blockX = this.position.x + (runsAlongX ? width : depth)
                const blockZ = this.position.z + (runsAlongX ? depth : width)
                return tgtX - moverHalf < blockX + 0.5
                    && tgtX + moverHalf > blockX - 0.5
                    && tgtZ - moverHalf < blockZ + 0.5
                    && tgtZ + moverHalf > blockZ - 0.5
            })
        })
    }
}
