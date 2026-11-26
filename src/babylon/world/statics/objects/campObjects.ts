import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { MasonryBatch } from '@/babylon/world/masonryBatch'
import { TaperedBlockBatch } from '@/babylon/world/taperedBlockBatch'
import type { StaticBaseContact } from '@/babylon/world/worldRenderer'
import type { ContactShadowFootprint } from '@/babylon/world/terrainContactShadow'
import { StaticEquipPartsRenderer } from '@/babylon/world/statics/staticEquipPartsRenderer'
import { createOrientedStaticVariation, createStaticVariation, placeStaticPart } from '@/babylon/world/statics/staticVariation'
import { getWoodBearingFaces, getWoodSupportHeight } from '@/babylon/world/statics/woodPileSupport'
import { createHorizontalWoodMatrix, createWoodShape, type WoodPiece } from '@/babylon/world/statics/staticWoodShape'
import { MyPlayer } from '@/data/myPlayer'
import { WorldDataManager } from '@/data/worldDataManager'
import { TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import type { WoodMoisture } from '@/babylon/world/statics/staticTerrainContact'
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

const MAX_WOOD_TWIST = Math.PI / 14
const MAX_WOOD_YAW = Math.PI / 82
const MAX_WOOD_LEAN = Math.PI / 72

function getWoodMoisture(position: Vector3): WoodMoisture | undefined {
    if (!Settings.isDetalLevelHigh()) return
    if (Lights.indoor) return 0
    const tile = WorldDataManager.getBlockMap()[position.x]?.[position.z]
    if (!tile || tile.stonePath || tile.beigeStonePath) return 0
    if (tile.snowed || tile.type === TerrainEnum1.TERRAIN_GRASS.index) return 1
    if (tile.type === TerrainEnum1.TERRAIN_MUDDY_DIRT.index) return 3
    return tile.type === TerrainEnum1.TERRAIN_GRASS_WINTER.index ? 2 : 0
}

type PartContact = boolean | Vector3 | StaticBaseContact | 'snowAndDampHay'
    | 'stumpCut' | 'woodTopWithMoss'

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
        if (contact === 'stumpCut') {
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
    private readonly planks: WoodPiece[]
    private readonly legs: WoodPiece[]

    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, metadata?: CampObjectMetadata) {
        super(type, position, material, accentMaterial, metadata)
        this.prefab = TaperedBlockBatch.prefab
        const variation = createStaticVariation(MyPlayer.worldId, position, type)
        const frame = Matrix.RotationY(this.yaw + variation.signed(0, 70) * 0.055)
        const seatHeight = 0.44
        const wideSide = variation.unit(0, 71) < 0.5 ? -1 : 1
        const widthDifference = 0.025 + variation.unit(0, 72) * 0.013
        const skewDirection = variation.unit(0, 73) < 0.5 ? -1 : 1
        const seatSkew = skewDirection * (0.022 + variation.unit(0, 74) * 0.028)
        this.planks = [-1, 1].map((side, index) => {
            const thickness = 0.10 + variation.signed(index, 3) * 0.011
            const width = 0.195 + side * wideSide * widthDifference + variation.signed(index, 4) * 0.005
            const length = 1.79 + variation.signed(index, 5) * 0.095
            const skew = Matrix.FromValues(
                1, 0, seatSkew + variation.signed(index, 12) * 0.006, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1,
            )
            const shape = createWoodShape(variation, index, 1 + variation.signed(index, 8) * 0.075,
                1 + variation.signed(index, 9) * 0.045, 0.040)
            if (shape) {
                const taper = (variation.unit(index, 13) < 0.5 ? -1 : 1) * (0.065 + variation.unit(index, 14) * 0.045)
                // Shape the outer edges while keeping the edges along the seat gap aligned.
                for (const corner of shape.foot) if (side * corner.y > 0) corner.y -= side * taper
                for (const corner of shape.top) if (side * corner.y > 0) corner.y += side * taper
            }
            return {
                matrix: createHorizontalWoodMatrix(length, width, thickness, true, variation.signed(index, 6) * 0.04)
                    .multiply(Matrix.RotationYawPitchRoll(variation.signed(index, 0) * 0.008,
                        variation.signed(index, 1) * 0.028, variation.signed(index, 2) * 0.010))
                    .multiply(skew)
                    .setTranslationFromFloats(variation.signed(index, 7) * 0.045,
                        0.5 + seatHeight - thickness / 2 + variation.signed(index, 10) * 0.004,
                        side * (width / 2 + 0.022) + variation.signed(index, 11) * 0.004)
                    .multiply(frame),
                shape,
            }
        })
        this.legs = [-1, 1].map((side, index) => {
            const part = index + this.planks.length
            const matrix = Matrix.Scaling(0.20 + variation.signed(part, 3) * 0.028,
                seatHeight - 0.048 + variation.signed(part, 4) * 0.012, 0.35 + variation.signed(part, 5) * 0.031)
                .multiply(Matrix.RotationYawPitchRoll(variation.signed(part, 0) * 0.095,
                    variation.signed(part, 1) * 0.055, variation.signed(part, 2) * 0.082))
            const {m} = matrix
            const footX = side * (0.68 + variation.signed(part, 6) * 0.034)
            const footZ = variation.signed(part, 7) * 0.021
            return {
                matrix: matrix.setTranslationFromFloats(footX + m[4] / 2, 0.49 + m[5] / 2, footZ + m[6] / 2).multiply(frame),
                shape: createWoodShape(variation, part),
            }
        })
    }

    render() {
        for (const {matrix, shape} of this.planks) {
            TaperedBlockBatch.add(placeStaticPart(matrix, this.renderPosition), this.material, shape,
                {patina: true, suppressDamage: true})
        }
        const legWeather = {anchor: this.position, moisture: getWoodMoisture(this.position), upright: true}
        for (const {matrix, shape} of this.legs) {
            TaperedBlockBatch.add(placeStaticPart(matrix, this.renderPosition), this.accentMaterial, shape, legWeather)
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
    private readonly stones: {matrix: Matrix, seed: number, rim: boolean}[] = []
    private readonly fittings: {matrix: Matrix, material: Vector2, moss: boolean}[] = []

    constructor(type: number, position: Vector3, woodMaterial: Vector2, roofMaterial: Vector2, steelMaterial: Vector2) {
        super(type, position, 0, woodMaterial, MasonryBatch.prefab)
        const variation = createStaticVariation(MyPlayer.worldId, position, type)
        this.buildStonework(variation)
        this.buildRoof(variation, roofMaterial, steelMaterial)
    }

    getContactShadowSize() {
        return {width: StoneWell.BASE_WIDTH, depth: StoneWell.BASE_WIDTH}
    }

    private buildStonework(variation: ReturnType<typeof createStaticVariation>) {
        const courses = [0.18, 0.36, 0.54, 0.71, 0.80]
        for (const [course, top] of courses.entries()) {
            const rim = course === courses.length - 1
            const bottom = courses[course - 1] ?? -0.025
            const halfWidth = StoneWell.BASE_WIDTH * 0.5 + (rim ? 0.035 : 0)
            const thickness = rim ? 0.21 : 0.19
            for (let side = 0; side < 4; side++) {
                const alongX = side < 2
                const throughCorner = alongX === (course % 2 === 0)
                const halfRun = halfWidth - (throughCorner ? 0 : thickness - 0.016)
                const across = (side % 2 === 0 ? -1 : 1) * (halfWidth - thickness * 0.5)
                const run = course * 4 + side
                const count = throughCorner ? 3 : 2
                let start = -halfRun
                for (let index = 0; index < count; index++) {
                    const part = run * 3 + index
                    const end = index === count - 1 ? halfRun
                        : -halfRun + 2 * halfRun * (index + 1) / count + variation.signed(part, 1) * 0.042
                    const center = (start + end) * 0.5
                    const offset = across + variation.signed(part, 2) * 0.012
                    const matrix = Matrix.Scaling(end - start + 0.004,
                        top - bottom + 0.018 + variation.signed(part, 3) * 0.02,
                        thickness + variation.signed(part, 4) * 0.027)
                        .multiply(Matrix.RotationYawPitchRoll((alongX ? 0 : Math.PI / 2) + variation.signed(part, 5) * 0.085,
                            variation.signed(part, 6) * 0.075, variation.signed(part, 7) * 0.075))
                        .setTranslationFromFloats(alongX ? center : offset,
                            0.5 + (top + bottom) * 0.5 + variation.signed(part, 8) * 0.01, alongX ? offset : center)
                    this.stones.push({matrix, seed: variation.unit(part), rim})
                    start = end
                }
            }
        }
    }

    private buildRoof(variation: ReturnType<typeof createStaticVariation>, roofMaterial: Vector2, steelMaterial: Vector2) {
        const frame = 60
        const frameYaw = variation.signed(frame, 1) * 0.075
        const frameTransform = Matrix.RotationY(frameYaw)
        const ridgeY = 2.04 + variation.signed(frame, 2) * 0.035
        const addFitting = (matrix: Matrix, material: Vector2, moss = false) => {
            this.fittings.push({matrix: matrix.multiply(frameTransform), material, moss})
        }
        const roof = Matrix.RotationYawPitchRoll(variation.signed(frame, 3) * 0.045,
            variation.signed(frame, 4) * 0.06, variation.signed(frame, 5) * 0.06)
            .setTranslationFromFloats(variation.signed(frame, 6) * 0.035, ridgeY + 0.5, 0)
        const postSupports: {brace: Vector3, axle: Vector3}[] = []
        for (const side of [-1, 1]) {
            for (let index = 0; index < 3; index++) {
                const part = frame + (side < 0 ? 3 : 6) + index
                const span = 0.58 + variation.signed(part, 1) * 0.05
                const depth = 0.35 + variation.signed(part, 2) * 0.018
                const thickness = 0.075 + variation.signed(part, 3) * 0.012
                const skew = variation.signed(part, 4) * 0.045
                const board = Matrix.FromValues(
                    span, 0, skew, 0,
                    0, thickness, 0, 0,
                    0, 0, depth, 0,
                    side * (span * 0.5 - 0.035), 0, 0, 1,
                ).multiply(Matrix.RotationYawPitchRoll(variation.signed(part, 5) * 0.035,
                    variation.signed(part, 6) * 0.04, -side * (0.42 + variation.signed(part, 7) * 0.05)))
                board.setTranslationFromFloats(board.m[12], board.m[13] + variation.signed(part, 8) * 0.014,
                    board.m[14] + (index - 1) * 0.325 + variation.signed(part, 9) * 0.01)
                const panel = board.multiply(roof)
                addFitting(panel, roofMaterial, side < 0)
                if (index === 1) {
                    const post = this.createPost(variation, frame + (side < 0 ? 1 : 2), side, panel)
                    addFitting(post.matrix, this.material)
                    postSupports.push(post)
                }
            }
        }

        const [left, right] = postSupports
        const brace = right.brace.subtract(left.brace)
        const braceCenter = Vector3.Center(left.brace, right.brace)
        addFitting(Matrix.Scaling(brace.length() + 0.12, 0.09, 0.095)
            .multiply(Matrix.RotationYawPitchRoll(-Math.atan2(brace.z, brace.x), 0, Math.asin(brace.y / brace.length())))
            .setTranslationFromFloats(braceCenter.x, braceCenter.y, braceCenter.z), this.material)

        const axle = right.axle.subtract(left.axle)
        const crank = left.axle.subtract(axle.normalizeToNew().scale(0.29))
        const axleCenter = Vector3.Center(crank, right.axle)
        addFitting(Matrix.Scaling(axle.length() + 0.34, 0.06, 0.06)
            .multiply(Matrix.RotationY(-Math.atan2(axle.z, axle.x)))
            .setTranslationFromFloats(axleCenter.x, axleCenter.y, axleCenter.z), steelMaterial)
        addFitting(Matrix.Scaling(0.06, 0.24, 0.06).setTranslationFromFloats(crank.x, crank.y - 0.09, crank.z), steelMaterial)
    }

    private createPost(variation: ReturnType<typeof createStaticVariation>, part: number, side: number, panel: Matrix) {
        const foot = new Vector3(side * 0.35 + variation.signed(part, 1) * 0.018, 1.23, variation.signed(part, 2) * 0.018)
        const rotation = Matrix.RotationYawPitchRoll(variation.signed(part, 3) * 0.22,
            variation.signed(part, 4) * 0.075, side * 0.04 + variation.signed(part, 5) * 0.06)
        const axis = Vector3.TransformNormal(Vector3.Up(), rotation)
        // End the tilted post just inside the board's underside, following the actual roof slope.
        const toPanel = panel.clone().invert()
        const height = (-0.22 - Vector3.TransformCoordinates(foot, toPanel).y) / Vector3.TransformNormal(axis, toPanel).y
        const center = foot.add(axis.scale(height * 0.5))
        const matrix = Matrix.Scaling(0.1 + variation.signed(part, 6) * 0.018, height, 0.1 + variation.signed(part, 7) * 0.013)
            .multiply(rotation).setTranslationFromFloats(center.x, center.y, center.z)
        return {
            matrix,
            brace: foot.add(axis.scale((2.22 - foot.y) / axis.y)),
            axle: foot.add(axis.scale((1.82 - foot.y) / axis.y)),
        }
    }

    render() {
        for (const {matrix, seed, rim} of this.stones) {
            MasonryBatch.add(placeStaticPart(matrix, this.renderPosition), this.renderPosition, seed,
                false, rim ? 0.24 : 0.31, false, false, rim ? 'wellRim' : 'wellBase')
        }
        for (const {matrix, material, moss} of this.fittings) {
            const placed = placeStaticPart(matrix, this.renderPosition)
            if (moss) {
                WorldRenderer.addTerrainContactBlock(placed, material, false, 0, 'wellRoofMoss')
            } else {
                WorldRenderer.block1!.matrices.push(placed)
                WorldRenderer.block1!.uvData.push(material)
            }
        }
    }
}

type WoodPilePlacement = readonly [x: number, layer: number, z: number, lean?: number]

abstract class WoodPile extends CampObject {
    private readonly variation = createStaticVariation(MyPlayer.worldId, this.position, this.type)
    private pieces: WoodPiece[] | null = null

    constructor(type: number, position: Vector3, material: Vector2, accentMaterial: Vector2, metadata?: CampObjectMetadata) {
        super(type, position, material, accentMaterial, metadata)
        this.prefab = TaperedBlockBatch.prefab
    }

    protected abstract buildPieces(): WoodPiece[]

    render() {
        const options = {anchor: this.position, moisture: getWoodMoisture(this.position)}
        for (const {matrix, shape} of this.getPieces()) {
            TaperedBlockBatch.add(placeStaticPart(matrix, this.renderPosition), this.material, shape, options)
        }
    }

    appendContactShadowFootprints(footprints: ContactShadowFootprint[], height: number) {
        for (const {matrix: {m}} of this.getPieces()) {
            if (m[13] - 0.5 > 0.2) continue
            const x = this.renderPosition.x + m[12]
            const z = this.renderPosition.z + m[14]
            const halfX = (Math.abs(m[0]) + Math.abs(m[4]) + Math.abs(m[8])) * 0.5
            const halfZ = (Math.abs(m[2]) + Math.abs(m[6]) + Math.abs(m[10])) * 0.5
            footprints.push({minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ, height, reach: 0.15})
        }
    }

    private getPieces() {
        return this.pieces ??= this.buildPieces()
    }

    protected buildStack(length: number, width: number, height: number, alongX: boolean, placements: readonly WoodPilePlacement[]) {
        const variation = this.variation
        const supports: {layer: number, top: ReturnType<typeof getWoodBearingFaces>['top']}[] = []
        return placements.map(([x, layer, z, baseLean = 0], index) => {
            const pieceLength = length * (0.70 + variation.unit(index, 5) * 0.34)
            const pieceWidth = width * (1 + variation.signed(index, 6) * 0.34)
            const pieceHeight = height * (1 + variation.signed(index, 7) * 0.29)
            const twist = variation.signed(index, 0) * MAX_WOOD_TWIST
            // Give long logs the same visible tilt at their ends without sinking them deep into the ground.
            const lean = baseLean + variation.signed(index, 1) * Math.min(MAX_WOOD_LEAN, 0.075 / pieceLength)
            const yaw = variation.signed(index, 2) * Math.min(Math.PI / 15, 0.26 / pieceLength)
            const matrix = createHorizontalWoodMatrix(pieceLength, pieceWidth, pieceHeight, alongX, twist)
                .multiply(Matrix.RotationYawPitchRoll(yaw, alongX ? 0 : lean, alongX ? lean : 0))
                .multiply(Matrix.RotationY(this.yaw))
            const shape = createWoodShape(variation, index,
                1 + variation.signed(index, 3) * 0.27, 1 + variation.signed(index, 4) * 0.27, 0.16)
            const offset = this.rotateOffset(x, z)
            matrix.setTranslationFromFloats(offset.x, 0, offset.z)
            const faces = getWoodBearingFaces(matrix, shape, alongX)
            let centerY = -faces.lowestY
            for (const support of supports) {
                if (support.layer < layer) {
                    centerY = Math.max(centerY, getWoodSupportHeight(faces.bottom, support.top) - 0.004)
                }
            }
            for (const corner of new Set(faces.top.flat())) corner.y += centerY
            supports.push({layer, top: faces.top})
            matrix.setTranslationFromFloats(offset.x, 0.5 + centerY, offset.z)
            return {matrix, shape}
        })
    }
}

export class PlankPile extends WoodPile {
    protected buildPieces() {
        return this.buildStack(0.82, 0.16, 0.1, true, [
            [-0.2, 0, -0.16, -0.035],
            [0.2, 0, 0.15, 0.025],
            [-0.08, 1, 0.1, 0.02],
            [0.13, 2, -0.08, -0.045],
        ])
    }
}

export class LogPile extends WoodPile {
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

    protected buildPieces() {
        const logLength = this.length - 0.18
        return this.buildStack(logLength, 0.18, 0.18, false, [
            [-0.24, 0, -0.14], [0.24, 0, -0.14], [0, 0, 0.18],
            [-0.14, 1, 0], [0.2, 1, 0.04], [0.02, 2, 0.01],
        ])
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

export class CampFence extends BaseStaticObject {
    private static readonly railCenters = [0.185, 0.42, 0.655]
    private static readonly railThickness = 0.045
    private static readonly railHeight = 0.1 * 4 / 3
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
    private posts: WoodPiece[] | null = null
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
                variation.signed(index, 0) * MAX_WOOD_YAW,
                (sectionPitch + variation.signed(index, 1)) * MAX_WOOD_LEAN,
                (sectionRoll + variation.signed(index, 2)) * MAX_WOOD_LEAN,
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
                twist: variation.signed(index, 50) * MAX_WOOD_TWIST,
                turnTwist: variation.signed(index, 51) * MAX_WOOD_TWIST,
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
        const moisture = getWoodMoisture(this.position)
        const postWeather = {damp: 'moss', moisture, upright: true} as const
        for (const {matrix, shape} of posts) {
            TaperedBlockBatch.add(placeStaticPart(matrix, this.renderPosition), this.material, shape, postWeather)
        }
        const batch = WorldRenderer.block1!
        this.railMatrices ??= this.buildRails(posts)
        for (const matrix of this.railMatrices) {
            if (moisture !== undefined) {
                WorldRenderer.staticTerrainContact?.addWoodWeathering(batch.matrices.length, moisture)
            }
            batch.matrices.push(placeStaticPart(matrix, this.renderPosition))
            batch.uvData.push(this.railMaterial)
        }
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

    private buildRails(posts: readonly WoodPiece[]) {
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
        return createHorizontalWoodMatrix(length, thickness, height, alongX, twist)
            .setTranslationFromFloats(offsetX, 0, offsetZ)
            .multiply(frame)
    }

    private addDamagedRail(matrices: Matrix[], rail: Matrix, thickness: number, height: number, twist: number,
        damage: CampFenceDamage, posts: readonly WoodPiece[], armSide?: number) {
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

    private createPost(dx: number, dz: number, corner: boolean): WoodPiece {
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
        const shape = createWoodShape(variation, part,
            (0.082 + variation.unit(part, 9) * 0.036) * thickness / width,
            (0.082 + variation.unit(part, 10) * 0.036) * thickness / depth)
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
