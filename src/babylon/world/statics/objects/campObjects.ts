import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { TaperedBlockBatch } from '@/babylon/world/taperedBlockBatch'
import type { BlockSection, TaperedBlockShape } from '@/babylon/world/taperedBlockBatch'
import type { StaticBaseContact } from '@/babylon/world/worldRenderer'
import type { ContactShadowFootprint } from '@/babylon/world/terrainContactShadow'
import { StaticEquipPartsRenderer } from '@/babylon/world/statics/staticEquipPartsRenderer'
import { createOrientedStaticVariation, createStaticVariation, placeStaticPart } from '@/babylon/world/statics/staticVariation'
import { MyPlayer } from '@/data/myPlayer'
import { WorldDataManager } from '@/data/worldDataManager'
import { TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import type { FenceWoodMoisture } from '@/babylon/world/statics/staticTerrainContact'
import { Settings } from '@/settings/settings'
import { WeaponModelsCb } from '@/babylon/item/codebook/weaponModelsCb'

export type CampObjectFacing = '-X' | '+X' | '-Z' | '+Z'
export type CampFenceOrientation = 'X' | 'Z'

export interface CampObjectMetadata {
    facing?: CampObjectFacing
    length?: number
    containerId?: string
}

export interface CampFenceMetadata {
    orientation?: CampFenceOrientation
    damaged?: boolean
}

interface Direction {
    x: number
    z: number
}

type PartContact = boolean | Vector3 | StaticBaseContact | 'snowAndDampHay'
    | 'wellBase' | 'wellRim' | 'wellRoofMoss' | 'stumpCut' | 'woodTopWithMoss'

function addPart(width: number, height: number, depth: number, x: number, y: number, z: number, material: Vector2, yaw = 0, roll = 0, contact: PartContact = false) {
    const matrix = Matrix.Scaling(width, height, depth)
        .multiply(Matrix.RotationYawPitchRoll(yaw, 0, roll))
        .multiply(Matrix.Translation(x, y, z))
    if (contact) {
        if (contact instanceof Vector3) {
            WorldRenderer.addWeatheredBlock(matrix, material, contact, 0.64)
            return
        }
        if (typeof contact === 'object') {
            WorldRenderer.addTerrainContactBlock(matrix, material, false, undefined, 'mossyWood', contact)
            return
        }
        if (contact === 'wellBase' || contact === 'wellRim' || contact === 'wellRoofMoss' || contact === 'stumpCut') {
            WorldRenderer.addTerrainContactBlock(matrix, material, false, 0, contact)
            return
        }
        const damp = contact === 'snowAndDampHay' ? 'hay'
            : contact === 'woodTopWithMoss' ? contact : undefined
        WorldRenderer.addTerrainContactBlock(matrix, material, false, undefined, damp)
        return
    }
    WorldRenderer.block1!.matrices.push(matrix)
    WorldRenderer.block1!.uvData.push(material)
}

abstract class CampObject extends BaseStaticObject {
    protected readonly facing: CampObjectFacing
    protected readonly accentMaterial: Vector2

    protected constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, metadata?: CampObjectMetadata) {
        super(type, position, 0, material, null)
        this.facing = metadata?.facing === '-X' || metadata?.facing === '+X'
            || metadata?.facing === '-Z' || metadata?.facing === '+Z'
            ? metadata.facing
            : '+Z'
        this.accentMaterial = accentMaterial
        this.status = {facing: this.facing, containerId: metadata?.containerId}
        this.renderPosition.set(
            position.x - 0.5 + this.getSizeX() / 2,
            position.y,
            position.z - 0.5 + this.getSizeZ() / 2,
        )
    }

    protected get yaw(): number {
        return this.facing === '-X' || this.facing === '+X' ? Math.PI / 2 : 0
    }

    protected getBaseContact(): StaticBaseContact {
        const height = this.renderPosition.y
        let snowHeight: number | undefined
        const endX = this.position.x + this.getSizeX()
        const endZ = this.position.z + this.getSizeZ()
        for (let x = this.position.x; x < endX; x++) {
            for (let z = this.position.z; z < endZ; z++) {
                const snow = WorldRenderer.getSnowContactHeight(x, z)
                if (snow !== undefined && Math.abs(snow - height) <= 0.15 && (snowHeight === undefined || snow > snowHeight)) {
                    snowHeight = snow
                }
            }
        }
        return {height, snowHeight}
    }

    protected rotateOffset(x: number, z: number): {x: number, z: number} {
        if (this.facing === '-X' || this.facing === '+X') {
            return {x: -z, z: x}
        }
        return {x, z}
    }

    protected part(width: number, height: number, depth: number, x: number, y: number, z: number, material = this.material, roll = 0, contact: PartContact = false) {
        const offset = this.rotateOffset(x, z)
        addPart(
            width,
            height,
            depth,
            this.renderPosition.x + offset.x,
            this.renderPosition.y + y + 0.5,
            this.renderPosition.z + offset.z,
            material,
            this.yaw,
            roll,
            contact,
        )
    }
}

export class CampBench extends CampObject {
    render() {
        for (const x of [-0.675, -0.225, 0.225, 0.675]) {
            for (const z of [-0.115, 0.115]) {
                this.part(0.43, 0.12, 0.21, x, 0.38, z)
            }
        }
        for (const x of [-0.68, 0.68]) {
            this.part(0.2, 0.32, 0.34, x, 0.16, 0, this.accentMaterial, 0, this.position)
        }
    }
}

export class WaterTrough extends CampObject {
    private readonly waterMaterial: Vector2

    constructor(type: number, position: Vector3, material: Vector2, waterMaterial: Vector2, metadata?: CampObjectMetadata) {
        super(type, position, material, material, metadata)
        this.waterMaterial = waterMaterial
    }

    private get length() { return this.getSizeX() > 1 || this.getSizeZ() > 1 ? 1.82 : 0.82 }
    private static readonly WIDTH = 0.64

    getContactShadowSize() {
        return this.yaw ? {width: WaterTrough.WIDTH, depth: this.length} : {width: this.length, depth: WaterTrough.WIDTH}
    }

    render() {
        const length = this.length
        const wallCenter = (WaterTrough.WIDTH - 0.1) / 2
        const endOffset = length / 2 - 0.07
        const contact = this.getBaseContact()
        this.part(length, 0.1, 0.54, 0, 0.08, 0, this.material, 0, contact)
        this.part(length, 0.38, 0.1, 0, 0.24, -wallCenter, this.material, 0, contact)
        this.part(length, 0.38, 0.1, 0, 0.24, wallCenter, this.material, 0, contact)
        this.part(0.14, 0.38, 0.44, -endOffset, 0.24, 0, this.material, 0, contact)
        this.part(0.14, 0.38, 0.44, endOffset, 0.24, 0, this.material, 0, contact)

        WorldRenderer.translucentPlane!.matrices.push(
            Matrix.Scaling(length - 0.24, 1, 0.36)
                .multiply(Matrix.RotationY(this.yaw))
                .multiply(Matrix.Translation(
                    this.renderPosition.x,
                    this.renderPosition.y + 0.39,
                    this.renderPosition.z,
                )),
        )
        WorldRenderer.translucentPlane!.uvData.push(this.waterMaterial)
    }

    getWalkableHeight(): number {
        return 0.43
    }
}

export class StoneWell extends BaseStaticObject {
    private static readonly BASE_WIDTH = 0.9
    private readonly rimMaterial: Vector2
    private readonly woodMaterial: Vector2
    private readonly roofMaterial: Vector2
    private readonly steelMaterial: Vector2

    constructor(type: number, position: Vector3, stoneMaterial: Vector2, rimMaterial: Vector2, woodMaterial: Vector2, roofMaterial: Vector2, steelMaterial: Vector2) {
        super(type, position, 0, stoneMaterial, null)
        this.rimMaterial = rimMaterial
        this.woodMaterial = woodMaterial
        this.roofMaterial = roofMaterial
        this.steelMaterial = steelMaterial
    }

    getContactShadowSize() {
        return {width: StoneWell.BASE_WIDTH, depth: StoneWell.BASE_WIDTH}
    }

    render() {
        const x = this.renderPosition.x
        const groundY = this.renderPosition.y + 0.5
        const z = this.renderPosition.z

        addPart(StoneWell.BASE_WIDTH, 0.75, 0.18, x, groundY + 0.375, z - 0.36, this.material, 0, 0, 'wellBase')
        addPart(StoneWell.BASE_WIDTH, 0.75, 0.18, x, groundY + 0.375, z + 0.36, this.material, 0, 0, 'wellBase')
        addPart(0.18, 0.75, 0.54, x - 0.36, groundY + 0.375, z, this.material, 0, 0, 'wellBase')
        addPart(0.18, 0.75, 0.54, x + 0.36, groundY + 0.375, z, this.material, 0, 0, 'wellBase')

        addPart(0.96, 0.1, 0.2, x, groundY + 0.75, z - 0.38, this.rimMaterial, 0, 0, 'wellRim')
        addPart(0.96, 0.1, 0.2, x, groundY + 0.75, z + 0.38, this.rimMaterial, 0, 0, 'wellRim')
        addPart(0.2, 0.1, 0.56, x - 0.38, groundY + 0.75, z, this.rimMaterial, 0, 0, 'wellRim')
        addPart(0.2, 0.1, 0.56, x + 0.38, groundY + 0.75, z, this.rimMaterial, 0, 0, 'wellRim')

        for (const postX of [-0.36, 0.36]) {
            addPart(0.1, 1.15, 0.1, x + postX, groundY + 1.325, z, this.woodMaterial)
        }
        addPart(0.84, 0.1, 0.1, x, groundY + 1.72, z, this.woodMaterial)

        const axleY = groundY + 1.32
        addPart(1.02, 0.06, 0.06, x - 0.15, axleY, z, this.steelMaterial)
        addPart(0.06, 0.24, 0.06, x - 0.66, axleY - 0.09, z, this.steelMaterial)

        addPart(0.62, 0.08, 1.02, x - 0.22, groundY + 1.93, z, this.roofMaterial, 0, 0.42, 'wellRoofMoss')
        addPart(0.62, 0.08, 1.02, x + 0.22, groundY + 1.93, z, this.roofMaterial, 0, -0.42)
    }
}

export class PlankPile extends CampObject {
    render() {
        const bottomRowHeight = 0.12
        const rows = [
            [-0.2, bottomRowHeight, -0.16, -0.035],
            [0.2, bottomRowHeight, 0.15, 0.025],
            [-0.08, 0.24, 0.1, 0.02],
            [0.13, 0.36, -0.08, -0.045],
        ]
        for (const [x, y, z, roll] of rows) {
            this.part(0.82, 0.1, 0.16, x, y, z, this.material, roll, this.position)
        }
    }
}

export class LogPile extends CampObject {
    private readonly length: number

    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, metadata?: CampObjectMetadata) {
        super(type, position, material, accentMaterial, metadata)
        this.length = metadata?.length === 2 || metadata?.length === 3 ? metadata.length : 1
        this.status = {facing: this.facing, length: this.length}
        this.renderPosition.set(
            position.x - 0.5 + this.getSizeX() / 2,
            position.y,
            position.z - 0.5 + this.getSizeZ() / 2,
        )
    }

    render() {
        const logLength = this.length - 0.18
        const bottomRowHeight = 0.13
        for (const [x, y, z] of [
            [-0.24, bottomRowHeight, -0.14], [0.24, bottomRowHeight, -0.14], [0, bottomRowHeight, 0.18],
            [-0.14, 0.36, 0], [0.2, 0.36, 0.04], [0.02, 0.59, 0.01],
        ]) {
            this.part(0.18, 0.18, logLength, x, y, z, this.material, 0, this.position)
        }
    }

    getSizeX(): number {
        return this.status?.facing === '-X' || this.status?.facing === '+X' ? this.length ?? 1 : 1
    }

    getSizeZ(): number {
        return this.status?.facing === '-X' || this.status?.facing === '+X' ? 1 : this.length ?? 1
    }
}

export class SupplyCrate extends CampObject {
    render() {
        this.part(0.78, 0.7, 0.78, 0, 0.35, 0, this.material, 0, this.position)
        for (const y of [0.08, 0.62]) {
            this.part(0.86, 0.09, 0.86, 0, y, 0, this.accentMaterial, 0, this.position)
        }
        this.part(0.1, 0.76, 0.86, 0, 0.37, 0, this.accentMaterial, Math.PI / 4, this.position)
    }
}

export class HayStack extends BaseStaticObject {
    private static readonly WIDTH = 0.6

    constructor(type: number, position: Vector3, material: Vector2) {
        super(type, position, 0, material, null)
    }

    getContactShadowSize() {
        return {width: HayStack.WIDTH, depth: HayStack.WIDTH}
    }

    render() {
        addPart(HayStack.WIDTH, 0.8, HayStack.WIDTH,
            this.renderPosition.x, this.renderPosition.y + 0.9,
            this.renderPosition.z, this.material, 0, 0, 'snowAndDampHay')
    }
}

export class Stump extends CampObject {
    private readonly cutMaterial: Vector2
    private static readonly DIAMETER = 0.66

    constructor(type: number, position: Vector3, woodMaterial: Vector2, cutMaterial: Vector2, metadata?: CampObjectMetadata) {
        super(type, position, woodMaterial, cutMaterial, metadata)
        this.cutMaterial = cutMaterial
    }

    getContactShadowSize() {
        return {width: Stump.DIAMETER, depth: Stump.DIAMETER}
    }

    render() {
        this.renderStump(false)
    }

    protected renderStump(weathered: boolean) {
        this.part(Stump.DIAMETER, 0.54, Stump.DIAMETER, 0, 0.27, 0, this.material, 0, weathered ? 'woodTopWithMoss' : true)
        this.part(0.62, 0.04, 0.62, 0, 0.56, 0, this.cutMaterial, 0, weathered ? 'stumpCut' : false)
    }
}

export class StumpWithAxe extends Stump {
    prepareAxe() {
        this.prefab ??= StaticEquipPartsRenderer.getPrefab(WeaponModelsCb.HAND_AXE.id) ?? null
    }

    render() {
        this.renderStump(true)
        if (!this.prefab) return
        const facingYaw = this.facing === '+X' ? Math.PI / 2
            : this.facing === '-Z' ? Math.PI
                : this.facing === '-X' ? -Math.PI / 2 : 0
        const localX = -0.4
        const localY = 1.1
        const localZ = 0
        const cos = Math.cos(facingYaw)
        const sin = Math.sin(facingYaw)
        const x = this.renderPosition.x + localX * cos + localZ * sin
        const z = this.renderPosition.z - localX * sin + localZ * cos
        const axeMatrix = Matrix.Scaling(0.95, 0.95, 0.95)
            .multiply(Matrix.RotationZ(-0.72))
            .multiply(Matrix.RotationZ(-Math.PI / 2))
            .multiply(Matrix.RotationY(facingYaw))
            .multiply(Matrix.Translation(x, this.renderPosition.y + localY, z))
        StaticEquipPartsRenderer.addPart(
            this.prefab,
            WeaponModelsCb.HAND_AXE.resolveMaterialAtlasIndex(0),
            axeMatrix,
        )
    }
}

export class CampBarrel extends CampObject {
    static readonly BOUNCE_HEIGHT = 0.0875
    static readonly BOUNCE_SPEED = 0.008
    static readonly RETURN_TO_GROUND_SPEED = 0.8
    private static readonly BASE_WIDTH = 0.62

    private readonly lidMaterial: Vector2
    private renderMatrixIndices: number[] = []
    private renderMatrixBaseY: number[] = []
    private bounce = false
    private wasBouncing = false
    private bounceStartTime = 0
    private yOffset = 0

    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, lidMaterial: Vector2, metadata?: CampObjectMetadata) {
        super(type, position, material, accentMaterial, metadata)
        this.lidMaterial = lidMaterial
    }

    getContactShadowSize() {
        return {width: CampBarrel.BASE_WIDTH, depth: CampBarrel.BASE_WIDTH}
    }

    render() {
        const firstMatrixIndex = WorldRenderer.block1!.matrices.length
        const contact = this.getBaseContact()
        this.part(CampBarrel.BASE_WIDTH, 0.82, CampBarrel.BASE_WIDTH, 0, 0.41, 0, this.material, 0, contact)
        this.part(0.7, 0.09, 0.7, 0, 0.14, 0, this.accentMaterial, 0, contact)
        this.part(0.7, 0.09, 0.7, 0, 0.68, 0, this.accentMaterial)
        this.part(0.56, 0.08, 0.56, 0, 0.86, 0, this.lidMaterial)
        this.renderMatrixIndices = [firstMatrixIndex, firstMatrixIndex + 1, firstMatrixIndex + 2, firstMatrixIndex + 3]
        this.renderMatrixBaseY = this.renderMatrixIndices.map((index) => WorldRenderer.block1!.matrices[index].m[13])
        if (this.yOffset > 0) {
            WorldRenderer.block1!.matrices[this.renderMatrixIndices[3]].m[13] = this.renderMatrixBaseY[3] + this.yOffset
        }
    }

    clearRenderMatrices() {
        this.renderMatrixIndices = []
        this.renderMatrixBaseY = []
    }

    setBounce(bounce: boolean, time: number) {
        if (this.bounce === bounce) return
        this.bounce = bounce
        if (bounce) {
            this.wasBouncing = false
            this.bounceStartTime = time
        }
    }

    onFrame(timeRate: number, time: number): boolean {
        const previousYOffset = this.yOffset
        if (this.bounce) {
            if (!this.wasBouncing) {
                this.wasBouncing = true
                this.bounceStartTime = time
                this.yOffset = 0
            }
            const elapsed = time - this.bounceStartTime
            this.yOffset = ((Math.sin((elapsed * CampBarrel.BOUNCE_SPEED) - (Math.PI / 2)) + 1) * 0.5) * CampBarrel.BOUNCE_HEIGHT
        } else {
            this.wasBouncing = false
            this.yOffset = Math.max(0, this.yOffset - (CampBarrel.RETURN_TO_GROUND_SPEED * timeRate))
        }

        const matrixBuffer = WorldRenderer.block1!.matrixBuffer
        const lidMatrixIndex = this.renderMatrixIndices[3]
        if (lidMatrixIndex !== undefined) matrixBuffer[(lidMatrixIndex * 16) + 13] = this.renderMatrixBaseY[3] + this.yOffset
        return previousYOffset !== this.yOffset && this.renderMatrixIndices.length > 0
    }

    isAnimating() {
        return this.bounce || this.yOffset > 0
    }
}

interface CampFenceDamage {
    level: number
    side: -1 | 1
    fallen: boolean
    splitOffset: number
    bends: readonly [number, number]
    drops: readonly [number, number]
}

interface CampFencePost {
    matrix: Matrix
    shape: TaperedBlockShape | null
}

function varyPostSection(width: number, depth: number, sample: (channel: number) => number): BlockSection {
    const corners = [
        new Vector2(-0.5, -0.5), new Vector2(0.5, -0.5),
        new Vector2(-0.5, 0.5), new Vector2(0.5, 0.5),
    ] as const
    let centerX = 0, centerZ = 0
    for (const [index, corner] of corners.entries()) {
        corner.x += sample(index * 2) * 0.08
        corner.y += sample(index * 2 + 1) * 0.08
        centerX += corner.x / 4
        centerZ += corner.y / 4
    }
    for (const corner of corners) {
        corner.x = (corner.x - centerX) * width
        corner.y = (corner.y - centerZ) * depth
    }
    return corners
}

export class CampFence extends BaseStaticObject {
    private static readonly railCenters = [0.185, 0.42, 0.655]
    private static readonly railThickness = 0.045
    private static readonly railHeight = 0.1 * 4 / 3
    private static readonly railTurnX = Matrix.RotationZ(-Math.PI / 2)
    private static readonly railTurnZ = Matrix.RotationX(Math.PI / 2)
    private static readonly maxRailYaw = Math.PI / 82
    private static readonly maxRailLean = Math.PI / 72
    private static readonly maxRailTwist = Math.PI / 14
    private static readonly maxSectionYaw = Math.PI / 42
    private static readonly maxSectionShift = 0.036
    private static readonly sectionHeightVariation = 0.13
    private static readonly postHeight = 0.8
    private static readonly postOffset = 0.32
    private static readonly maxPostLean = Math.PI / 53
    private static readonly maxPostTwist = Math.PI / 6
    private static readonly maxPostShortening = 0.064
    private static readonly maxPostAlongShift = 0.024
    private static readonly maxPostCrossShift = 0.014
    private readonly orientation: CampFenceOrientation
    private readonly railMaterial: Vector2
    private readonly worldId: number
    private readonly section: Matrix
    private readonly heightScale: number
    private readonly rails: readonly {
        frame: Matrix, thickness: number, turnThickness: number, height: number, firstEnd: number, secondEnd: number,
        twist: number, turnTwist: number
    }[]
    private readonly damage: CampFenceDamage | null
    private cornerDirections: [Direction, Direction] | null = null
    private posts: CampFencePost[] | null = null
    private railMatrices: Matrix[] | null = null

    constructor(type: number, position: Vector3, postMaterial: Vector2, railMaterial: Vector2, metadata?: CampFenceMetadata) {
        super(type, position, 0, postMaterial, TaperedBlockBatch.prefab)
        this.orientation = metadata?.orientation === 'X' ? 'X' : 'Z'
        this.railMaterial = railMaterial
        this.worldId = MyPlayer.worldId
        const variation = createOrientedStaticVariation(this.worldId, position, this.orientation)
        const heightScale = 1 + variation.signed(0, 70) * CampFence.sectionHeightVariation
        const section = Matrix.RotationY(variation.signed(0, 71) * CampFence.maxSectionYaw)
            .setTranslationFromFloats(variation.signed(0, 72) * CampFence.maxSectionShift, 0,
                variation.signed(0, 73) * CampFence.maxSectionShift)
        this.section = section
        this.heightScale = heightScale
        const railBase = variation.signed(0, 7) * 0.029
        // Share part of the lean between levels so larger tilts keep the rails apart.
        const sectionPitch = variation.signed(0, 8)
        const sectionRoll = variation.signed(0, 9)
        this.rails = CampFence.railCenters.map((center, index) => {
            const heightVariation = variation.signed(index, 5)
            const height = (CampFence.railHeight + heightVariation * (heightVariation < 0 ? 0.047 : 0.017)) * heightScale
            const topRailDrop = index === CampFence.railCenters.length - 1 ? height * 0.25 : 0
            const frame = Matrix.RotationYawPitchRoll(
                variation.signed(index, 0) * CampFence.maxRailYaw,
                (sectionPitch + variation.signed(index, 1)) * CampFence.maxRailLean,
                (sectionRoll + variation.signed(index, 2)) * CampFence.maxRailLean,
            ).setTranslationFromFloats(0,
                0.5 + (railBase + center + variation.signed(index, 6) * 0.021) * heightScale - topRailDrop, 0)
                .multiply(section)
            return {
                frame,
                thickness: CampFence.railThickness * (1 + variation.signed(index, 3) * 0.28),
                turnThickness: CampFence.railThickness * (1 + variation.signed(index, 4) * 0.28),
                height,
                firstEnd: 0.48 + variation.signed(index, 30) * 0.01,
                secondEnd: 0.48 + variation.signed(index, 31) * 0.01,
                twist: variation.signed(index, 50) * CampFence.maxRailTwist,
                turnTwist: variation.signed(index, 51) * CampFence.maxRailTwist,
            }
        })
        const damaged = metadata?.damaged === true
        this.damage = null
        if (damaged) {
            const details = createStaticVariation(this.worldId, position, type)
            this.damage = {
                level: Math.floor(details.unit(0, 0) * this.rails.length),
                side: details.unit(0, 2) < 0.5 ? -1 : 1,
                fallen: details.unit(0, 4) < 0.5,
                splitOffset: details.unit(0, 3) / 6,
                bends: [details.signed(1, 0), details.signed(2, 0)],
                drops: [details.unit(1, 1), details.unit(2, 1)],
            }
        }
        this.status = {orientation: this.orientation, damaged}
    }

    getOrientation(): CampFenceOrientation {
        return this.orientation
    }

    setCornerDirections(directions: [Direction, Direction] | null) {
        if (this.cornerDirections || directions) {
            this.posts = null
            this.railMatrices = null
        }
        this.cornerDirections = directions
    }

    render() {
        const posts = this.getPosts()
        const moisture = Settings.isDetalLevelHigh() ? this.getWoodMoisture() : null
        for (const {matrix, shape} of posts) {
            TaperedBlockBatch.add(placeStaticPart(matrix, this.renderPosition), this.material, shape, 'moss')
            if (moisture !== null && shape) {
                TaperedBlockBatch.contact?.addFenceWoodWeathering(this.prefab!.matrices.length - 1, 'post', moisture)
            }
        }
        const batch = WorldRenderer.block1!
        this.railMatrices ??= this.buildRails(posts)
        for (const matrix of this.railMatrices) {
            if (moisture !== null) {
                WorldRenderer.staticTerrainContact?.addFenceWoodWeathering(batch.matrices.length, 'rail', moisture)
            }
            batch.matrices.push(placeStaticPart(matrix, this.renderPosition))
            batch.uvData.push(this.railMaterial)
        }
    }

    private getWoodMoisture(): FenceWoodMoisture {
        if (Lights.indoor) return 0
        const tile = WorldDataManager.getBlockMap()[this.position.x]?.[this.position.z]
        if (!tile || tile.stonePath || tile.beigeStonePath) return 0
        if (tile.snowed || tile.type === TerrainEnum1.TERRAIN_GRASS.index) return 1
        if (tile.type === TerrainEnum1.TERRAIN_MUDDY_DIRT.index) return 3
        return tile.type === TerrainEnum1.TERRAIN_GRASS_WINTER.index ? 2 : 0
    }

    appendContactShadowFootprints(footprints: ContactShadowFootprint[], height: number) {
        for (const {matrix: {m}, shape} of this.getPosts()) {
            const x = this.renderPosition.x + m[12] - m[4] / 2
            const z = this.renderPosition.z + m[14] - m[6] / 2
            let minX = x, maxX = x, minZ = z, maxZ = z
            if (shape) {
                for (const corner of shape.foot) {
                    const wx = x + corner.x * m[0] + corner.y * m[8]
                    const wz = z + corner.x * m[2] + corner.y * m[10]
                    minX = Math.min(minX, wx)
                    maxX = Math.max(maxX, wx)
                    minZ = Math.min(minZ, wz)
                    maxZ = Math.max(maxZ, wz)
                }
            } else {
                const halfX = (Math.abs(m[0]) + Math.abs(m[8])) / 2
                const halfZ = (Math.abs(m[2]) + Math.abs(m[10])) / 2
                minX -= halfX
                maxX += halfX
                minZ -= halfZ
                maxZ += halfZ
            }
            footprints.push({minX, maxX, minZ, maxZ, height, reach: 0.15})
        }
    }

    private getPosts() {
        return this.posts ??= this.buildPosts()
    }

    private buildPosts() {
        if (this.cornerDirections) {
            const [first, second] = this.cornerDirections
            return [this.createPost(first.x, first.z, true), this.createPost(second.x, second.z, true),
                this.createPost(0, 0, true)]
        }
        return this.orientation === 'X'
            ? [this.createPost(-1, 0, false), this.createPost(1, 0, false)]
            : [this.createPost(0, -1, false), this.createPost(0, 1, false)]
    }

    private buildRails(posts: readonly CampFencePost[]) {
        const directions = this.cornerDirections
        const matrices: Matrix[] = []
        const damage = this.damage
        // A dropped corner arm is short, so only the bottom rail can reach the ground from its post.
        const damagedLevel = directions && damage?.fallen ? 0 : damage?.level
        for (const [level, {frame, thickness, turnThickness, height, firstEnd, secondEnd, twist, turnTwist}] of this.rails.entries()) {
            if (!directions) {
                const alongX = this.orientation === 'X'
                // Keep the ends near their tile edges when the whole fence shifts along its length.
                const railCenter = (secondEnd - firstEnd) / 2 - frame.m[alongX ? 12 : 14]
                const rail = this.createRail(alongX, firstEnd + secondEnd, thickness, height,
                    alongX ? railCenter : 0, alongX ? 0 : railCenter, frame, twist)
                if (damage && level === damagedLevel) {
                    this.addDamagedRail(matrices, rail, thickness, height, twist, damage, posts)
                } else matrices.push(rail)
                continue
            }

            // Rotate both arms about their shared joint, with only one rail crossing the turn.
            for (const [arm, direction] of directions.entries()) {
                const innerEnd = arm === 0 ? -turnThickness / 2 : thickness / 2
                const outerEnd = (arm === 0 ? firstEnd : secondEnd) - direction.x * frame.m[12] - direction.z * frame.m[14]
                const railCenter = (outerEnd + innerEnd) / 2
                const armThickness = arm === 0 ? thickness : turnThickness
                const armTwist = arm === 0 ? twist : turnTwist
                const rail = this.createRail(direction.x !== 0, outerEnd - innerEnd, armThickness, height,
                    direction.x * railCenter, direction.z * railCenter, frame, armTwist)
                if (damage && level === damagedLevel && arm === (damage.side > 0 ? 1 : 0)) {
                    const outerSide = direction.x || direction.z
                    const armPosts = outerSide < 0 ? [posts[arm], posts[2]] : [posts[2], posts[arm]]
                    this.addDamagedRail(matrices, rail, armThickness, height, armTwist, damage, armPosts, outerSide)
                } else matrices.push(rail)
            }
        }
        return matrices
    }

    private createRail(alongX: boolean, length: number, thickness: number, height: number,
        offsetX: number, offsetZ: number, frame: Matrix, twist: number) {
        const {railTurnX, railTurnZ} = CampFence
        // The atlas grain follows the box's local Y axis. Rotate it along the rail.
        return Matrix.Scaling(alongX ? height : thickness, length, alongX ? thickness : height)
            .multiply(Matrix.RotationY(twist))
            .multiply(alongX ? railTurnX : railTurnZ)
            .setTranslationFromFloats(offsetX, 0, offsetZ)
            .multiply(frame)
    }

    private addDamagedRail(matrices: Matrix[], rail: Matrix, thickness: number, height: number, twist: number,
        damage: CampFenceDamage, posts: readonly CampFencePost[], armSide?: number) {
        const m = rail.m
        const center = new Vector3(m[12], m[13], m[14])
        const axis = new Vector3(m[4], m[5], m[6])
        const halfLength = axis.length() / 2
        axis.scaleInPlace(1 / (2 * halfLength))
        const outerSide = armSide ?? damage.side
        // On a corner the outer piece has the post, so give it the longer share of the board.
        const split = (armSide === undefined ? outerSide : -outerSide) * damage.splitOffset * (2 * halfLength)
        for (const [part, side] of [-1, 1].entries()) {
            if (damage.fallen && side !== outerSide) continue
            const outerEnd = side * halfLength
            const innerEnd = damage.fallen ? -outerEnd : split + (outerEnd - split) * 0.04
            const post = posts[part].matrix.m
            const advance = (center.y - post[13]) / post[5]
            const postX = post[12] + post[4] * advance
            const postZ = post[14] + post[6] * advance
            const postOnRail = ((postX - center.x) * axis.x + (postZ - center.z) * axis.z)
                / (axis.x * axis.x + axis.z * axis.z)
            const pivot = side * Math.min(side * outerEnd, Math.max(side * innerEnd, side * postOnRail))
            const attach = center.add(axis.scale(pivot))
            // Swing from the side of the post the plank falls towards, clearing the rails underneath.
            const shift = side * Math.sign(damage.bends[part]) * (armSide === undefined ? 0.03 : 0.02)
            attach.x = postX + axis.x * (pivot - postOnRail) - axis.z * shift
            attach.z = postZ + axis.z * (pivot - postOnRail) + axis.x * shift
            matrices.push(this.createDroopingPart(attach, axis, side,
                Math.abs(outerEnd - pivot), Math.abs(innerEnd - pivot), thickness, height,
                damage.bends[part], damage.drops[part], damage.fallen, -side * twist))
        }
    }

    private createDroopingPart(attach: Vector3, axis: Vector3, side: number, overhang: number, reach: number,
        thickness: number, height: number, bend: number, drop: number, fallen: boolean, twist: number) {
        const groundClearance = attach.y - 0.5
        const halfHeight = (height * Math.cos(twist) + thickness * Math.abs(Math.sin(twist))) / 2
        if (fallen) {
            // Allow very steep drops to touch without rotating the plank back past vertical.
            const steepest = Math.PI * 0.44
            reach = Math.max(reach, (groundClearance - halfHeight * Math.cos(steepest)) / Math.sin(steepest))
        }
        // Lowest corner at the loose end: reach * sin(pitch) + halfHeight * cos(pitch).
        const groundPitch = Math.asin(Math.min(1, groundClearance / Math.hypot(reach, halfHeight)))
            - Math.atan2(halfHeight, reach)
        const pitch = Math.max(0, Math.min(groundPitch, fallen ? Infinity : 0.32 + drop * 0.46))
        const sideways = Math.sign(bend) * (fallen ? 0.27 + Math.abs(bend) * 0.40 : 0.13 + Math.abs(bend) * 0.21)
        const yaw = Math.atan2(-side * axis.x, -side * axis.z) + sideways
        const frame = Matrix.RotationYawPitchRoll(yaw, pitch, 0).setTranslationFromFloats(attach.x, attach.y, attach.z)
        return this.createRail(false, overhang + reach, thickness, height, 0, (reach - overhang) / 2, frame, twist)
    }

    private createPost(dx: number, dz: number, corner: boolean): CampFencePost {
        const central = dx === 0 && dz === 0
        const direction = dx < 0 ? '-X' : dx > 0 ? '+X' : dz < 0 ? '-Z' : dz > 0 ? '+Z' : this.orientation
        const variation = createOrientedStaticVariation(this.worldId, this.position, direction)
        const part = central ? 10 : 0
        const thickness = corner ? 2 / 3 : 1
        const height = (CampFence.postHeight - variation.unit(part, 1) * CampFence.maxPostShortening) * this.heightScale
        // Narrow posts can lean more along the rail than across it and still hold the boards.
        const lean = CampFence.maxPostLean * (central ? 0.25 : 1)
        const pitch = variation.signed(part, 2) * lean * (corner && !central && dz === 0 ? 0.5 : 1)
        const roll = variation.signed(part, 3) * lean * (corner && !central && dx === 0 ? 0.5 : 1)
        const width = (0.082 + variation.unit(part, 4) * 0.036) * thickness
        const depth = (0.082 + variation.unit(part, 5) * 0.036) * thickness
        const shape = TaperedBlockBatch.contact ? {
            foot: varyPostSection(1, 1, channel => variation.signed(part, channel + 20)),
            top: varyPostSection(
                (0.082 + variation.unit(part, 9) * 0.036) * thickness / width,
                (0.082 + variation.unit(part, 10) * 0.036) * thickness / depth,
                channel => variation.signed(part, channel + 40)),
        } : null
        const twist = variation.signed(part, 6) * CampFence.maxPostTwist
        const along = CampFence.postOffset + variation.signed(part, 7) * CampFence.maxPostAlongShift
        const cross = variation.signed(part, 8) * CampFence.maxPostCrossShift * (corner ? 0.5 : 1)
        const matrix = Matrix.Scaling(width, height, depth).multiply(Matrix.RotationY(twist))
            .multiply(Matrix.RotationYawPitchRoll(0, pitch, roll))
        // The second arm starts just past the tile centre where it butts against the first.
        const jointOffset = central ? this.cornerDirections?.[1] : undefined
        const footX = dx * along - dz * cross + (jointOffset?.x ?? 0) * 0.02
        const footZ = dz * along + dx * cross + (jointOffset?.z ?? 0) * 0.02
        // Pivot the lean around the sampled foot position on the ground.
        const m = matrix.m
        const placed = matrix.setTranslationFromFloats(footX + m[4] / 2, 0.5 + m[5] / 2, footZ + m[6] / 2)
            .multiply(this.section)
        return {matrix: placed, shape}
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
