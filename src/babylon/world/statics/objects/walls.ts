import { Color3, Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { MaterialEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { WorldDataManager } from '@/data/worldDataManager'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { isSnowRoof } from '@/babylon/world/terrainRoofShape'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { createOrientedStaticVariation } from '@/babylon/world/statics/staticVariation'
import { MyPlayer } from '@/data/myPlayer'
import { getStaticLightIntensityLevelFactor, getStaticLightLevel, getStaticLightRangeLevelFactor, type StaticLightMetadata } from '@/babylon/scene/lighting/lightConfig'

import { StaticSurfaceAtlas, StaticSurfacePlanes } from '../staticSurfacePlanes'

export class Wall2 extends BaseStaticObject {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, null)
    }

    render() {
        const {x, y, z} = this.renderPosition
        WorldRenderer.addWeatheredBlock(Matrix.Translation(x, y + 1, z), this.material, this.position, 0.83)
        WorldRenderer.block1!.matrices.push(Matrix.Translation(x, y + 2, z))
        WorldRenderer.block1!.uvData.push(this.material)
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

type PalisadeBrace = {shape: Matrix, heightOffset: number}

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
    private readonly straightBeamOffsets: readonly PalisadeDirection[]
    private readonly beams: readonly {shape: Matrix, height: number, depthOffset: number}[]
    private readonly straightBraces: readonly PalisadeBrace[]
    private readonly cornerBraces: readonly PalisadeBrace[]
    private cornerDirections: [PalisadeDirection, PalisadeDirection] | null = null

    private static readonly MAX_BEAM_TWIST = Math.PI / 24
    private static readonly MAX_LEAN = Math.PI / 90
    private static readonly BRACE_LENGTH = 0.95
    private static readonly MAX_BRACE_HEIGHT_OFFSET = 0.06
    private static readonly MAX_BRACE_ANGLE = Math.PI / 22
    private static readonly MAX_BRACE_SKEW = Math.PI / 70
    private static readonly MAX_BRACE_TWIST = Math.PI / 22

    constructor(type: number, position: Vector3, material: Vector2, braceMaterial: Vector2, metadata?: PalisadeMetadata) {
        super(type, position, 0, material, null)
        this.braceMaterial = braceMaterial
        this.profile = type === 204 ? PALISADE_SMALL_PROFILE : PALISADE_LARGE_PROFILE
        const beamWidth = (
            1
            - 2 * this.profile.edgeGap
            - (this.profile.beamCount - 1) * this.profile.beamGap
        ) / this.profile.beamCount
        this.orientation = metadata?.orientation === 'X' ? 'X' : 'Z'
        this.status = {orientation: this.orientation}
        const variation = createOrientedStaticVariation(MyPlayer.worldId, position, this.orientation)
        const alongX = this.orientation === 'X'
        this.straightBeamOffsets = Array.from({length: this.profile.beamCount}, (_, index) => {
            const offset = -0.5 + this.profile.edgeGap + beamWidth / 2 + index * (beamWidth + this.profile.beamGap)
            return {x: alongX ? offset : 0, z: alongX ? 0 : offset}
        })
        const beamCount = Math.max(this.straightBeamOffsets.length, this.profile.cornerBeamOffsets.length * 2 + 1)
        this.beams = Array.from({length: beamCount}, (_, index) => {
            const height = this.profile.maxBeamHeight - variation.unit(index, 2) * this.profile.beamHeightVariation
            const shape = Matrix.Scaling(
                beamWidth + variation.signed(index, 6) * this.profile.maxWidthVariation,
                height,
                this.profile.beamDepth + variation.signed(index, 7) * this.profile.maxDepthVariation,
            ).multiply(Matrix.RotationY(variation.signed(index, 3) * PalisadeWall2.MAX_BEAM_TWIST))
                .multiply(Matrix.RotationYawPitchRoll(
                    alongX ? 0 : Math.PI / 2,
                    variation.signed(index, 4) * PalisadeWall2.MAX_LEAN,
                    variation.signed(index, 5) * PalisadeWall2.MAX_LEAN,
                ))
            return {shape, height, depthOffset: variation.signed(index, 1) * this.profile.maxDepthOffset}
        })
        const makeBraces = (count: number, length: number, channel: number) =>
            Array.from({length: count}, (_, index): PalisadeBrace => ({
                heightOffset: variation.signed(index, channel) * PalisadeWall2.MAX_BRACE_HEIGHT_OFFSET,
                // Twist around the brace's local X axis before tilting or turning the brace.
                shape: Matrix.Scaling(length, this.profile.braceHeight, this.profile.braceDepth)
                    .multiply(Matrix.RotationX(variation.signed(index, channel + 2) * PalisadeWall2.MAX_BRACE_TWIST))
                    .multiply(Matrix.RotationYawPitchRoll(
                        variation.signed(index, channel + 3) * PalisadeWall2.MAX_BRACE_SKEW,
                        0,
                        variation.signed(index, channel + 1) * PalisadeWall2.MAX_BRACE_ANGLE,
                    )),
            }))
        this.straightBraces = makeBraces(2, PalisadeWall2.BRACE_LENGTH, 100)
        this.cornerBraces = makeBraces(4, this.profile.cornerBraceLength, 120)
    }

    render() {
        const beamOffsets = this.getBeamOffsets()
        for (let i = 0; i < beamOffsets.length; i++) {
            const {depthOffset, height, shape} = this.beams[i]
            const x = this.renderPosition.x + beamOffsets[i].x
                + (this.cornerDirections || this.orientation === 'Z' ? depthOffset : 0)
            const z = this.renderPosition.z + beamOffsets[i].z
                + (this.cornerDirections || this.orientation === 'X' ? depthOffset : 0)
            WorldRenderer.addTerrainContactBlock(
                shape.clone().setTranslationFromFloats(x, this.renderPosition.y + height / 2 + 0.5, z),
                this.material,
                true,
                undefined,
                'woodTopAndGroundMoss',
            )
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

    private getBeamOffsets(): readonly PalisadeDirection[] {
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

        return this.straightBeamOffsets
    }

    private renderStraightBraces() {
        const turn = Matrix.RotationY(this.orientation === 'Z' ? Math.PI / 2 : 0)
        for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
            const side = sideIndex === 0 ? -1 : 1
            const {heightOffset, shape} = this.straightBraces[sideIndex]
            const x = this.renderPosition.x
                + (this.orientation === 'Z' ? side * this.profile.braceFaceOffset : 0)
            const z = this.renderPosition.z
                + (this.orientation === 'X' ? side * this.profile.braceFaceOffset : 0)
            const y = this.renderPosition.y
                + this.profile.braceCenterHeight
                + heightOffset
                + 0.5

            WorldRenderer.block1!.matrices.push(shape.multiply(turn).setTranslationFromFloats(x, y, z))
            WorldRenderer.block1!.uvData.push(this.braceMaterial)
        }
    }

    private renderCornerBraces() {
        for (let armIndex = 0; armIndex < this.cornerDirections!.length; armIndex++) {
            const direction = this.cornerDirections![armIndex]
            const cornerBeamOffset = this.profile.cornerBeamOffsets[this.profile.cornerBeamOffsets.length - 1]
            const turn = Matrix.RotationY(Math.atan2(direction.z, direction.x))
            const normalX = -direction.z
            const normalZ = direction.x
            for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
                const side = sideIndex === 0 ? -1 : 1
                const {heightOffset, shape} = this.cornerBraces[armIndex * 2 + sideIndex]
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

                WorldRenderer.block1!.matrices.push(shape.multiply(turn).setTranslationFromFloats(x, y, z))
                WorldRenderer.block1!.uvData.push(this.braceMaterial)
            }
        }
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
        const {x, y, z} = this.renderPosition
        WorldRenderer.addWeatheredBlock(Matrix.Translation(x, y + 1, z), this.material, this.position, 0.83)
        for (let i = 2; i <= 3; i++) {
            WorldRenderer.block1!.matrices.push(Matrix.Translation(x, y + i, z))
            WorldRenderer.block1!.uvData.push(this.material)
        }
    }
}

const STONE_ENTRANCE_SNOW_CONTACT = {snowReach: 1.65, includeMaskedSnow: true}
const STONE_ENTRANCE_ROOF_HEIGHT = 3
const STONE_ENTRANCE_SNOW_LIP = 0.28

export type StoneEntranceFacing = '-X' | '+X' | '-Z' | '+Z'

export interface StoneEntranceMetadata extends StaticLightMetadata {
    facing?: StoneEntranceFacing
    destinationWorldId?: number
    destinationX?: number
    destinationZ?: number
}

const PORTAL_LIGHT_COLOR = new Color3(0.65, 0.16, 1)
const PORTAL_LIGHT_HEIGHT = 1
const PORTAL_LIGHT_OUTWARD_OFFSET = 1.05

export class StoneEntrance extends BaseStaticObject {
    private readonly facing: StoneEntranceFacing
    private readonly portalLightPosition = new Vector3()
    private readonly portalLightDirection = new Vector3()
    private readonly lightIntensity: number
    private readonly lightRange: number
    private deleteBounceOffset = 0

    constructor(type: number, position: Vector3, material: Vector2, metadata?: StoneEntranceMetadata) {
        super(type, position, 0, material, StaticSurfacePlanes.getPrefab(true))
        this.facing = metadata?.facing === '-X' || metadata?.facing === '+X' || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : '+Z'
        this.lightIntensity = getStaticLightLevel(metadata?.lightIntensity)
        this.lightRange = getStaticLightLevel(metadata?.lightRange)
        this.status = {
            facing: this.facing,
            destinationWorldId: metadata?.destinationWorldId,
            destinationX: metadata?.destinationX,
            destinationZ: metadata?.destinationZ,
            lightIntensity: this.lightIntensity,
            lightRange: this.lightRange,
        }
        this.renderPosition.set(position.x - 0.5 + this.getSizeX() / 2, position.y, position.z - 0.5 + this.getSizeZ() / 2)
    }

    render() {
        this.renderArch()
        const facingX = this.facing === '+X' ? 1 : this.facing === '-X' ? -1 : 0
        const facingZ = this.facing === '+Z' ? 1 : this.facing === '-Z' ? -1 : 0
        this.prefab!.matrices.push(Matrix.Scaling(2, 2, 1)
            .multiply(Matrix.RotationY(facingX === 0 ? 0 : Math.PI / 2))
            .multiply(Matrix.Translation(this.renderPosition.x + facingX * 0.91,
                this.renderPosition.y + 1, this.renderPosition.z + facingZ * 0.91)))
        this.prefab!.uvData.push(StaticSurfaceAtlas.portal)
        this.registerLight()
    }

    onVisible() {
        this.registerLight()
    }

    onHidden() {
        this.dispose()
    }

    dispose() {
        Lights.unregisterStaticLight(this.getLightId())
    }

    private getLightId(): string {
        return `stone_entrance_${this.position.x}_${this.position.z}`
    }

    private registerLight() {
        this.updatePortalLightTransform()
        Lights.registerStaticLight(this.getLightId(), this.portalLightPosition, {
            color: PORTAL_LIGHT_COLOR,
            height: 0,
            intensity: 3.6 * getStaticLightIntensityLevelFactor(this.lightIntensity),
            range: 8 * getStaticLightRangeLevelFactor(this.lightRange),
            pulse: true,
            direction: this.portalLightDirection,
            angle: Math.PI * 0.72,
            priority: 1,
            outdoorRangeFactor: 1,
            castsShadows: false,
        })
    }

    setLightVisible(visible: boolean) {
        if (visible) this.registerLight()
        else Lights.unregisterStaticLight(this.getLightId())
    }

    getLightVisibilityRadius(): number {
        return 8 * getStaticLightRangeLevelFactor(this.lightRange)
    }

    private updatePortalLightTransform() {
        const facingX = this.facing === '+X' ? 1 : this.facing === '-X' ? -1 : 0
        const facingZ = this.facing === '+Z' ? 1 : this.facing === '-Z' ? -1 : 0
        const approachDirection = Lights.indoor ? 1 : -1
        this.portalLightPosition.set(
            this.renderPosition.x + (facingX * PORTAL_LIGHT_OUTWARD_OFFSET),
            this.renderPosition.y + PORTAL_LIGHT_HEIGHT + this.deleteBounceOffset,
            this.renderPosition.z + (facingZ * PORTAL_LIGHT_OUTWARD_OFFSET),
        )
        this.portalLightDirection.set(
            facingX * approachDirection,
            -0.35,
            facingZ * approachDirection,
        ).normalize()
    }

    protected onDeleteBounceOffset(offset: number) {
        this.deleteBounceOffset = offset
        this.updatePortalLightTransform()
    }

    private renderArch() {
        const map = WorldDataManager.getBlockMap()
        const terrainBlock = map[Math.floor(this.position.x)]?.[Math.floor(this.position.z)]
        if (!terrainBlock || terrainBlock.type <= 0) {
            return
        }

        const runsAlongX = this.getSizeX() > this.getSizeZ()
        const snowy = !Lights.indoor && this.hasSnowInFootprint(map)
        const batch = WorldRenderer.block1!
        const contact = WorldRenderer.staticTerrainContact
        const useRoofShader = snowy && contact
        const roofY = this.position.y + STONE_ENTRANCE_ROOF_HEIGHT
        const addBlock = (widthOffset: number, depthOffset: number, height: number) => {
            const x = this.position.x + (runsAlongX ? widthOffset : depthOffset)
            const z = this.position.z + (runsAlongX ? depthOffset : widthOffset)
            const matrix = useRoofShader && height === STONE_ENTRANCE_ROOF_HEIGHT
                ? Matrix.Scaling(1, 1 - STONE_ENTRANCE_SNOW_LIP, 1)
                    .multiply(Matrix.Translation(x, roofY - STONE_ENTRANCE_SNOW_LIP / 2, z))
                : Matrix.Translation(x, this.position.y + height, z)
            // The pillars mask the terrain's snow under their footprint, while their exposed faces still meet snow.
            WorldRenderer.addWeatheredBlock(matrix, MaterialEnum1.TERRAIN_ROCK.uv, this.position, 0.75,
                STONE_ENTRANCE_SNOW_CONTACT)
        }

        for (let depth = 0; depth < 2; depth++) {
            for (const width of [0, 3]) {
                for (let height = 1; height <= STONE_ENTRANCE_ROOF_HEIGHT; height++) {
                    addBlock(width, depth, height)
                }
            }
            addBlock(1, depth, STONE_ENTRANCE_ROOF_HEIGHT)
            addBlock(2, depth, STONE_ENTRANCE_ROOF_HEIGHT)
        }
        if (useRoofShader) {
            // One continuous strip replaces the top ends of the stone cubes and their internal shadow seams.
            useRoofShader.addRoofSnow(batch.matrices.length, roofY)
            batch.matrices.push(Matrix.Scaling(this.getSizeX(), STONE_ENTRANCE_SNOW_LIP, this.getSizeZ())
                .multiply(Matrix.Translation(this.renderPosition.x, roofY + 0.5 - STONE_ENTRANCE_SNOW_LIP / 2,
                    this.renderPosition.z)))
            batch.uvData.push(MaterialEnum1.TERRAIN_ROCK.uv)
        } else if (snowy) {
            // LOW uses a single thin atlas surface on the roof.
            const thickness = 0.025
            batch.matrices.push(Matrix.Scaling(this.getSizeX(), thickness, this.getSizeZ())
                .multiply(Matrix.Translation(this.renderPosition.x, roofY + 0.5 + thickness / 2, this.renderPosition.z)))
            batch.uvData.push(MaterialEnum1.SNOW.uv)
        }
    }

    private hasSnowInFootprint(map: ReturnType<typeof WorldDataManager.getBlockMap>) {
        const tileX = Math.floor(this.position.x), tileZ = Math.floor(this.position.z)
        const sizeX = this.getSizeX(), sizeZ = this.getSizeZ()
        for (let dx = 0; dx < sizeX; dx++) {
            for (let dz = 0; dz < sizeZ; dz++) {
                const tile = map[tileX + dx]?.[tileZ + dz]
                if (tile && isSnowRoof(tile) && !tile.stonePath && !tile.beigeStonePath) return true
            }
        }
        return false
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
