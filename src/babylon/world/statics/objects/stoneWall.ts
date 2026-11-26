import { Matrix, Vector2, Vector3 } from '@babylonjs/core'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'
import { MasonryBatch } from '@/babylon/world/masonryBatch'
import type { ContactShadowFootprint } from '@/babylon/world/terrainContactShadow'
import { createSineStaticVariation, createStaticVariation } from '@/babylon/world/statics/staticVariation'
import { OrientedWall } from '@/babylon/world/statics/objects/orientedWall'
import type { WallDirection, WallMetadata } from '@/babylon/world/statics/objects/orientedWall'
import { WorldDataManager } from '@/data/worldDataManager'
import { Settings } from '@/settings/settings'

export interface StoneWallMetadata extends WallMetadata {
    precision?: number
    damage?: number
    height?: number
}

const ALONG_X = [{x: -1, z: 0}, {x: 1, z: 0}] as const
const ALONG_Z = [{x: 0, z: -1}, {x: 0, z: 1}] as const

function fitSpan(direction: WallDirection, x: number, z: number, length: number) {
    const yaw = Math.atan2(x * direction.z - z * direction.x, x * direction.x + z * direction.z)
    return {yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), scale: Math.hypot(x, z) / length}
}

type WallSpan = ReturnType<typeof fitSpan>
type WallStone = {
    matrix: Matrix
    part: number
    layer: number
    seed: number
    priority: number
    width: number
    height: number
    depth: number
    alongX: boolean
    wallYaw: number
}

export class StoneWall extends OrientedWall {
    readonly precision: number
    readonly damage: number
    readonly height: number
    private readonly roughness: number
    private segmentX = 0
    private segmentZ = 0
    private straightSpan?: WallSpan
    private cornerSpans?: [WallSpan, WallSpan]

    constructor(type: number, position: Vector3, metadata?: StoneWallMetadata) {
        super(type, position, Vector2.Zero(), MasonryBatch.prefab, metadata)
        const precision = metadata?.precision
        this.precision = typeof precision === 'number' && Number.isFinite(precision)
            ? Math.max(1, Math.min(10, Math.round(precision))) : 10
        const damage = metadata?.damage
        this.damage = typeof damage === 'number' && Number.isFinite(damage)
            ? Math.max(0, Math.min(10, Math.round(damage))) : 1
        const height = metadata?.height
        this.height = typeof height === 'number' && Number.isFinite(height)
            ? Math.max(1, Math.min(8, Math.round(height * 4))) / 4 : 1
        this.roughness = (10 - this.precision) / 9
        this.status = {orientation: this.orientation, precision: this.precision, damage: this.damage, height: this.height}
    }

    private get segmentDirections() {
        return this.cornerDirections ?? (this.orientation === 'X' ? ALONG_X : ALONG_Z)
    }

    updateSegmentLayout(wallsByTile: ReadonlyMap<string, StoneWall>) {
        if (this.roughness === 0) return
        const [first, second] = this.segmentDirections
        const a = this.seamPosition(first, wallsByTile)
        const b = this.seamPosition(second, wallsByTile)
        if (this.cornerDirections) {
            const variation = createStaticVariation(0, this.position, this.type)
            this.segmentX = variation.signed(0) * this.roughness * 0.075
            this.segmentZ = variation.signed(0, 1) * this.roughness * 0.075
            this.cornerSpans = [
                fitSpan(first, a.x - this.segmentX, a.z - this.segmentZ, 0.5),
                fitSpan(second, b.x - this.segmentX, b.z - this.segmentZ, 0.5),
            ]
            this.straightSpan = undefined
        } else {
            this.segmentX = (a.x + b.x) * 0.5
            this.segmentZ = (a.z + b.z) * 0.5
            this.straightSpan = fitSpan(second, b.x - a.x, b.z - a.z, 1)
            this.cornerSpans = undefined
        }
    }

    private seamPosition(direction: WallDirection, wallsByTile: ReadonlyMap<string, StoneWall>) {
        const {x, z} = this.position
        const neighbor = wallsByTile.get(`${x + direction.x};${z + direction.z}`)
        const connected = neighbor?.segmentDirections.some(side => side.x === -direction.x && side.z === -direction.z)
        // A shared seam has one offset even when its two segments have different precision.
        const roughness = connected && neighbor ? Math.min(this.roughness, neighbor.roughness) : this.roughness
        const seam = {x: 2 * x + direction.x, z: 2 * z + direction.z}
        const offset = createStaticVariation(0, seam, this.type).signed(0) * roughness * 0.15
        return {x: direction.x * 0.5 + Math.abs(direction.z) * offset,
            z: direction.z * 0.5 + Math.abs(direction.x) * offset}
    }

    appendContactShadowFootprints(footprints: ContactShadowFootprint[], height: number) {
        const x = this.renderPosition.x + this.segmentX
        const z = this.renderPosition.z + this.segmentZ
        const addHalf = ({x: dx, z: dz}: WallDirection, span?: WallSpan) => {
            const cos = span?.cos ?? 1, sin = span?.sin ?? 0
            const axisX = dx * cos + dz * sin, axisZ = dz * cos - dx * sin
            const length = 0.49 * (span?.scale ?? 1)
            const centerX = x + axisX * length * 0.5, centerZ = z + axisZ * length * 0.5
            // Two short footprints follow bends closely without filling in the inside of a corner.
            const halfX = Math.abs(axisX) * length * 0.5 + Math.abs(axisZ) * 0.22
            const halfZ = Math.abs(axisZ) * length * 0.5 + Math.abs(axisX) * 0.22
            footprints.push({minX: centerX - halfX, maxX: centerX + halfX,
                minZ: centerZ - halfZ, maxZ: centerZ + halfZ, height, reach: 0.23})
        }
        const [first, second] = this.segmentDirections
        addHalf(first, this.cornerSpans?.[0] ?? this.straightSpan)
        addHalf(second, this.cornerSpans?.[1] ?? this.straightSpan)
    }

    render() {
        const origin = this.renderPosition
        const variation = createSineStaticVariation(this.position.x * 91.7 + this.position.z * 37.3 + 240, 17.1, 47.7)
        const roughness = this.roughness
        const heightScale = this.height / 1.4 * (1 + variation.signed(0, 11) * roughness * 0.17)
        const shortWallScale = Math.min(1, this.height)
        const lowDetail = Settings.isDetalLevelLow()
        const courseCount = Math.max(1, Math.round(shortWallScale * (lowDetail ? 2 : 4)))
        const courseStep = 1.28 / courseCount
        const courseHeight = courseStep - 0.007
        const candidates = this.damage > 1 ? [] as WallStone[] : null
        const layers = MasonryBatch.topWeathering ? Array.from({length: courseCount + 1}, () => [] as number[]) : null
        const addStone = (matrix: Matrix, seed: number, layer: number) => {
            const instance = MasonryBatch.add(matrix, this.position, seed, false, roughness)
            layers?.[layer].push(instance)
        }
        let index = 0
        let damageTier = -1
        let layer = 0
        const stone = (length: number, height: number, thickness: number, x: number, y: number, z: number,
            alongX: boolean, span?: WallSpan) => {
            const part = index++
            const sample = (channel: number) => roughness === 0 ? 0 : variation.signed(part, channel) * roughness
            const spanScale = span?.scale ?? 1
            const width = length * (1 + sample(1) * 0.07) * spanScale
            const blockHeight = height * (1 + sample(2) * 0.19) * heightScale
            const depth = thickness * (1 + sample(3) * 0.22)
            const wallYaw = (alongX ? 0 : Math.PI / 2) + (span?.yaw ?? 0)
            const yaw = wallYaw + sample(4) * 0.24
            const matrix = Matrix.Scaling(width, blockHeight, depth)
                .multiply(Matrix.RotationYawPitchRoll(yaw, sample(5) * 0.21 * shortWallScale, sample(6) * 0.24 * shortWallScale))
            const across = sample(7) * 0.075
            const localX = alongX ? x * spanScale : x + across
            const localZ = alongX ? z + across : z * spanScale
            const worldX = span ? localX * span.cos + localZ * span.sin : localX
            const worldZ = span ? localZ * span.cos - localX * span.sin : localZ
            matrix.setTranslationFromFloats(origin.x + this.segmentX + worldX,
                origin.y + y * heightScale + 0.5 + sample(8) * 0.047 * shortWallScale, origin.z + this.segmentZ + worldZ)
            const seed = variation.unit(part)
            if (candidates && damageTier >= 0) {
                candidates.push({matrix, part, layer, seed, priority: damageTier + variation.unit(part, 12),
                    width, height: blockHeight, depth, alongX, wallYaw})
            } else {
                addStone(matrix, seed, layer)
            }
        }
        const alongX = this.orientation === 'X'
        const alongWall = (length: number, height: number, depth: number, offset: number, y: number) =>
            stone(length, height, depth, alongX ? offset : 0, y, alongX ? 0 : offset, alongX, this.straightSpan)
        for (let course = 0; course < courseCount; course++) {
            layer = course
            const coursesAbove = courseCount - course - 1
            damageTier = course > 0 && coursesAbove < (lowDetail ? 1 : 2) ? coursesAbove + 1 : -1
            const y = courseStep * 0.5 + course * courseStep
            const thickness = 0.46 + variation.unit(course + 23) * 0.02
            if (this.cornerDirections) {
                const center = (course % 2 === 0 ? 0.52 : 0.46) + roughness * variation.signed(course, 9) * 0.09
                stone(center, courseHeight, center, 0, y, 0, true)
                const armLength = 0.49 - center / 2
                const offset = center / 2 + armLength / 2
                for (const [arm, direction] of this.cornerDirections.entries()) {
                    stone(armLength - 0.008, courseHeight, thickness,
                        direction.x * offset, y, direction.z * offset, direction.x !== 0, this.cornerSpans?.[arm])
                }
                continue
            }
            const joint = (course % 2 === 0 ? -0.12 : 0.12) + variation.signed(course + 16) * (0.05 + roughness * 0.1)
            for (const [left, right] of [[-0.49, joint], [joint, 0.49]]) {
                alongWall(right - left - 0.008, courseHeight, thickness, (left + right) / 2, y)
            }
        }
        layer = courseCount
        damageTier = 0
        if (this.cornerDirections) {
            stone(0.54, 0.12, 0.54, 0, 1.34, 0, true)
            for (const [arm, direction] of this.cornerDirections.entries()) {
                stone(0.214, 0.12, 0.51, direction.x * 0.38, 1.34, direction.z * 0.38, direction.x !== 0, this.cornerSpans?.[arm])
            }
        } else if (!lowDetail && this.precision <= 5) {
            const joint = variation.signed(0, 10) * 0.16
            for (const [left, right] of [[-0.49, joint], [joint, 0.49]]) {
                alongWall(right - left - 0.012, 0.12, 0.51, (left + right) / 2, 1.34)
            }
        } else {
            alongWall(0.984, 0.12, 0.51, 0, 1.34)
        }

        if (candidates) {
            const limit = lowDetail ? 2 : 4
            const severity = (this.damage - 1) / 9
            candidates.sort((a, b) => a.priority - b.priority)
            for (const [rank, candidate] of candidates.entries()) {
                // Higher levels keep the stones that have already fallen and may dislodge more.
                if (rank < limit && severity >= (rank + variation.unit(rank, 13)) / limit) {
                    this.addFallenStone(candidate, rank, variation)
                } else {
                    addStone(candidate.matrix, candidate.seed, candidate.layer)
                }
            }
        }
        if (layers) MasonryBatch.markExposedTops(layers, this.position)
    }

    private addFallenStone(stone: WallStone, rank: number, variation: ReturnType<typeof createSineStaticVariation>) {
        const sample = (channel: number) => variation.unit(stone.part, channel)
        const sin = Math.sin(stone.wallYaw), cos = Math.cos(stone.wallYaw)
        const inner = this.cornerDirections?.find(direction => stone.alongX ? direction.z !== 0 : direction.x !== 0)
        let side = inner ? -Math.sign(inner.x * sin + inner.z * cos)
            : ((rank + Math.floor(variation.unit(0, 14) * 2)) % 2 ? 1 : -1)
        const leaning = sample(15) < 0.42
        const reach = leaning ? 0.32 + sample(16) * 0.12 : 0.53 + sample(16) * 0.27
        const stagger = (sample(17) - 0.5) * 0.32
        const sourceX = stone.matrix.m[12] + cos * stagger
        const sourceZ = stone.matrix.m[14] - sin * stagger
        const map = WorldDataManager.getBlockMap()
        let x = sourceX + sin * side * reach
        let z = sourceZ + cos * side * reach
        let tileX = Math.round(x), tileZ = Math.round(z)
        if (!map[tileX]?.[tileZ]?.type) {
            side = -side
            x = sourceX + sin * side * reach
            z = sourceZ + cos * side * reach
            tileX = Math.round(x)
            tileZ = Math.round(z)
        }
        const tile = map[tileX]?.[tileZ]
        const ground = tile?.type ? tile.totalHeight + BuildingManager.getFloorHeightAtTile(tileX, tileZ)
            : this.renderPosition.y
        const yaw = stone.wallYaw + (sample(18) - 0.5) * (leaning ? 0.8 : 2.6)
        const pitch = leaning ? -side * (0.24 + sample(19) * 0.62) : (sample(19) - 0.5) * 0.35
        const roll = leaning ? (sample(20) - 0.5) * 0.48 : (sample(20) - 0.5) * 0.28
        const matrix = Matrix.Scaling(stone.width, stone.height, stone.depth)
            .multiply(Matrix.RotationYawPitchRoll(yaw, pitch, roll))
        const halfHeight = (Math.abs(matrix.m[1]) + Math.abs(matrix.m[5]) + Math.abs(matrix.m[9])) * 0.5
        matrix.setTranslationFromFloats(x, ground + halfHeight + 0.48, z)
        MasonryBatch.add(matrix, new Vector3(x, ground, z), stone.seed, false, this.roughness, true)
    }
}
