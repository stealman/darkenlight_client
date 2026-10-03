import { Color3, Matrix, Mesh, MeshBuilder, Vector2, Vector3 } from '@babylonjs/core'
import { Materials, TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { WorldDataManager } from '@/data/worldDataManager'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { getPalisadeRandom } from '@/babylon/world/statics/palisadeRandom'

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

export type PalisadeOrientation = 'X' | 'Z'

export interface PalisadeMetadata {
    orientation?: PalisadeOrientation
}

export interface PalisadeDirection {
    x: number
    z: number
}

interface PalisadeRenderProfile {
    beamCount: number
    beamGap: number
    edgeGap: number
    maxBeamHeight: number
    beamHeightVariation: number
    beamDepth: number
    maxDepthOffset: number
    maxWidthVariation: number
    maxDepthVariation: number
    braceHeight: number
    braceDepth: number
    braceFaceOffset: number
    braceCenterHeight: number
    cornerBeamOffsets: number[]
    cornerBraceLength: number
}

const PALISADE_LARGE_PROFILE: PalisadeRenderProfile = {
    beamCount: 3,
    beamGap: 0.0625,
    edgeGap: 0.03125,
    maxBeamHeight: 2,
    beamHeightVariation: 0.25,
    beamDepth: 0.25,
    maxDepthOffset: 0.025,
    maxWidthVariation: 0.015,
    maxDepthVariation: 0.02,
    braceHeight: 0.1,
    braceDepth: 0.08,
    braceFaceOffset: 0.18,
    braceCenterHeight: 1,
    cornerBeamOffsets: [1 / 3],
    cornerBraceLength: 0.6,
}

const PALISADE_SMALL_PROFILE: PalisadeRenderProfile = {
    beamCount: 5,
    beamGap: 0.0625,
    edgeGap: 0.03125,
    maxBeamHeight: 1.25,
    beamHeightVariation: 0.1,
    beamDepth: 0.18,
    maxDepthOffset: 0.018,
    maxWidthVariation: 0.008,
    maxDepthVariation: 0.012,
    braceHeight: 0.07,
    braceDepth: 0.055,
    braceFaceOffset: 0.12,
    braceCenterHeight: 0.62,
    cornerBeamOffsets: [0.2, 0.4],
    cornerBraceLength: 0.54,
}

export class PalisadeWall2 extends BaseStaticObject {
    private readonly orientation: PalisadeOrientation
    private readonly braceMaterial: Vector2
    private readonly profile: PalisadeRenderProfile
    private readonly beamWidth: number
    private cornerDirections: [PalisadeDirection, PalisadeDirection] | null = null

    private static readonly MAX_YAW = Math.PI / 60
    private static readonly MAX_LEAN = Math.PI / 90
    private static readonly BRACE_LENGTH = 0.95
    private static readonly MAX_BRACE_HEIGHT_OFFSET = 0.06
    private static readonly MAX_BRACE_ANGLE = Math.PI / 36

    constructor(type: number, position: Vector3, material: Vector2, braceMaterial: Vector2, metadata?: PalisadeMetadata) {
        super(type, position, 0, material, null)
        this.braceMaterial = braceMaterial
        this.profile = type === 204 ? PALISADE_SMALL_PROFILE : PALISADE_LARGE_PROFILE
        this.beamWidth = (
            1
            - 2 * this.profile.edgeGap
            - (this.profile.beamCount - 1) * this.profile.beamGap
        ) / this.profile.beamCount
        this.orientation = metadata?.orientation === 'X' ? 'X' : 'Z'
        this.status = {orientation: this.orientation}
    }

    render() {
        const beamOffsets = this.getBeamOffsets()
        for (let i = 0; i < beamOffsets.length; i++) {
            const depthOffset = (this.getBeamRandom(i, 1) * 2 - 1) * this.profile.maxDepthOffset
            const height = this.profile.maxBeamHeight
                - this.getBeamRandom(i, 2) * this.profile.beamHeightVariation
            const yaw = (this.orientation === 'Z' ? Math.PI / 2 : 0)
                + (this.getBeamRandom(i, 3) * 2 - 1) * PalisadeWall2.MAX_YAW
            const pitch = (this.getBeamRandom(i, 4) * 2 - 1) * PalisadeWall2.MAX_LEAN
            const roll = (this.getBeamRandom(i, 5) * 2 - 1) * PalisadeWall2.MAX_LEAN
            const width = this.beamWidth
                + (this.getBeamRandom(i, 6) * 2 - 1) * this.profile.maxWidthVariation
            const depth = this.profile.beamDepth
                + (this.getBeamRandom(i, 7) * 2 - 1) * this.profile.maxDepthVariation
            const x = this.renderPosition.x + beamOffsets[i].x
                + (this.cornerDirections || this.orientation === 'Z' ? depthOffset : 0)
            const z = this.renderPosition.z + beamOffsets[i].z
                + (this.cornerDirections || this.orientation === 'X' ? depthOffset : 0)
            WorldRenderer.block1!.matrices.push(
                Matrix.Scaling(width, height, depth)
                    .multiply(Matrix.RotationYawPitchRoll(yaw, pitch, roll))
                    .multiply(Matrix.Translation(x, this.renderPosition.y + height / 2 + 0.5, z)),
            )
            WorldRenderer.block1!.uvData.push(this.material)
        }
        if (this.cornerDirections) {
            this.renderCornerBraces()
        } else {
            this.renderStraightBraces()
        }
    }

    getOrientation(): PalisadeOrientation {
        return this.orientation
    }

    setCornerDirections(directions: [PalisadeDirection, PalisadeDirection] | null) {
        this.cornerDirections = directions
    }

    private getBeamOffsets(): PalisadeDirection[] {
        if (this.cornerDirections) {
            return [
                ...this.profile.cornerBeamOffsets.slice().reverse().map((offset) => ({
                    x: this.cornerDirections![0].x * offset,
                    z: this.cornerDirections![0].z * offset,
                })),
                {x: 0, z: 0},
                ...this.profile.cornerBeamOffsets.map((offset) => ({
                    x: this.cornerDirections![1].x * offset,
                    z: this.cornerDirections![1].z * offset,
                })),
            ]
        }

        const firstBeamCenter = -0.5 + this.profile.edgeGap + this.beamWidth / 2
        return Array.from({length: this.profile.beamCount}, (_, i) => {
            const offset = firstBeamCenter + i * (this.beamWidth + this.profile.beamGap)
            return {
                x: this.orientation === 'X' ? offset : 0,
                z: this.orientation === 'Z' ? offset : 0,
            }
        })
    }

    private renderStraightBraces() {
        const baseYaw = this.orientation === 'Z' ? Math.PI / 2 : 0
        for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
            const side = sideIndex === 0 ? -1 : 1
            const heightOffset = (this.getBeamRandom(sideIndex, 100) * 2 - 1)
                * PalisadeWall2.MAX_BRACE_HEIGHT_OFFSET
            const angle = (this.getBeamRandom(sideIndex, 101) * 2 - 1) * PalisadeWall2.MAX_BRACE_ANGLE
            const x = this.renderPosition.x
                + (this.orientation === 'Z' ? side * this.profile.braceFaceOffset : 0)
            const z = this.renderPosition.z
                + (this.orientation === 'X' ? side * this.profile.braceFaceOffset : 0)
            const y = this.renderPosition.y
                + this.profile.braceCenterHeight
                + heightOffset
                + 0.5

            WorldRenderer.block1!.matrices.push(
                Matrix.Scaling(
                    PalisadeWall2.BRACE_LENGTH,
                    this.profile.braceHeight,
                    this.profile.braceDepth,
                )
                    .multiply(Matrix.RotationYawPitchRoll(baseYaw, 0, angle))
                    .multiply(Matrix.Translation(x, y, z)),
            )
            WorldRenderer.block1!.uvData.push(this.braceMaterial)
        }
    }

    private renderCornerBraces() {
        for (let armIndex = 0; armIndex < this.cornerDirections!.length; armIndex++) {
            const direction = this.cornerDirections![armIndex]
            const cornerBeamOffset = this.profile.cornerBeamOffsets[this.profile.cornerBeamOffsets.length - 1]
            const baseYaw = Math.atan2(direction.z, direction.x)
            const normalX = -direction.z
            const normalZ = direction.x
            for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
                const randomIndex = armIndex * 2 + sideIndex
                const side = sideIndex === 0 ? -1 : 1
                const heightOffset = (this.getBeamRandom(randomIndex, 120) * 2 - 1)
                    * PalisadeWall2.MAX_BRACE_HEIGHT_OFFSET
                const angle = (this.getBeamRandom(randomIndex, 121) * 2 - 1)
                    * PalisadeWall2.MAX_BRACE_ANGLE
                const x = this.renderPosition.x
                    + direction.x * cornerBeamOffset / 2
                    + normalX * side * this.profile.braceFaceOffset
                const z = this.renderPosition.z
                    + direction.z * cornerBeamOffset / 2
                    + normalZ * side * this.profile.braceFaceOffset
                const y = this.renderPosition.y
                    + this.profile.braceCenterHeight
                    + heightOffset
                    + 0.5

                WorldRenderer.block1!.matrices.push(
                    Matrix.Scaling(
                        this.profile.cornerBraceLength,
                        this.profile.braceHeight,
                        this.profile.braceDepth,
                    )
                        .multiply(Matrix.RotationYawPitchRoll(baseYaw, 0, angle))
                        .multiply(Matrix.Translation(x, y, z)),
                )
                WorldRenderer.block1!.uvData.push(this.braceMaterial)
            }
        }
    }

    private getBeamRandom(beamIndex: number, salt: number): number {
        return getPalisadeRandom(this.position.x, this.position.z, this.orientation, beamIndex, salt)
    }

    isObjectInCollision(tgtX: number, tgtZ: number, size: number): boolean {
        const moverHalf = size / 2
        const toleranceX = !this.cornerDirections && this.orientation === 'X' ? 0 : this.getCollisionTolerance()
        const toleranceZ = !this.cornerDirections && this.orientation === 'Z' ? 0 : this.getCollisionTolerance()
        return tgtX - moverHalf < this.position.x + 0.5 - toleranceX
            && tgtX + moverHalf > this.position.x - 0.5 + toleranceX
            && tgtZ - moverHalf < this.position.z + 0.5 - toleranceZ
            && tgtZ + moverHalf > this.position.z - 0.5 + toleranceZ
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
            pulse: true,
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
