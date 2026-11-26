import { Matrix, Ray, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from './baseStaticObject'
import { WorldRenderer } from '../../worldRenderer'
import { MaterialEnum1 } from '@/babylon/materials'
import { TaperedBlockBatch } from '../../taperedBlockBatch'
import { createStaticVariation, placeStaticPart } from '../staticVariation'
import { createWoodShape, type WoodPiece } from '../staticWoodShape'
import { WOOD_POST_TOP_MOISTURE } from '../palisadeWoodJoin'
import { MyPlayer } from '@/data/myPlayer'

import { StaticSurfaceAtlas, StaticSurfacePlanes } from '../staticSurfacePlanes'

import { t } from '@/i18n'

type Direction = '+X' | '-X' | '+Z' | '-Z' | '+X+Z' | '+X-Z' | '-X+Z' | '-X-Z'
export const SIGNPOST_DIRECTIONS: Record<Direction, {name: string, yaw: number}> = {
    '+X': {name: 'north', yaw: 0},
    '+X-Z': {name: 'northEast', yaw: Math.PI / 4},
    '-Z': {name: 'east', yaw: Math.PI / 2},
    '-X-Z': {name: 'southEast', yaw: Math.PI * 3 / 4},
    '-X': {name: 'south', yaw: Math.PI},
    '-X+Z': {name: 'southWest', yaw: -Math.PI * 3 / 4},
    '+Z': {name: 'west', yaw: -Math.PI / 2},
    '+X+Z': {name: 'northWest', yaw: -Math.PI / 4},
}
export interface SignpostMetadata {
    signCount?: number
    sign1Text?: string
    sign2Text?: string
    sign3Text?: string
    sign4Text?: string
    sign1?: Direction
    sign2?: Direction
    sign3?: Direction
    sign4?: Direction
}
const POLE_HEIGHT = 2.2
const TOP_SIGN_HEIGHT = 1.92
const SIGN_CENTER = 0.37
const POLE_WEATHERING = {patina: true, suppressDamage: true, join: WOOD_POST_TOP_MOISTURE} as const
const defaults: Direction[] = ['+X', '-X', '+Z', '-Z']

export class WoodenSignpost extends BaseStaticObject {
    private readonly pole: WoodPiece
    private readonly signFrames: readonly {frame: Matrix, inverse: Matrix}[]
    private readonly inscriptionUVs: Vector2[]
    private poleMatrixIndex = -1

    getReadingEntries() {
        return Array.from({length: this.status.signCount}, (_, index) => ({
            direction: t(`signpost.${SIGNPOST_DIRECTIONS[this.status[`sign${index + 1}`] as Direction].name}`),
            arrowRotation: SIGNPOST_DIRECTIONS[this.status[`sign${index + 1}`] as Direction].yaw * 180 / Math.PI,
            text: this.status[`sign${index + 1}Text`] || t('signpost.blank'),
        }))
    }

    private getSignHeight(index: number): number {
        const direction = this.status[`sign${index + 1}`]
        let row = 0
        for (let previous = 0; previous < index; previous++) {
            if (this.status[`sign${previous + 1}`] === direction) row++
        }
        return TOP_SIGN_HEIGHT - row * 0.31
    }

    intersectsRay(ray: Ray): boolean {
        const p = this.renderPosition
        const hitBox = (x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
            ray.intersectsBoxMinMax(new Vector3(p.x + x - hx, p.y + y - hy, p.z + z - hz),
                new Vector3(p.x + x + hx, p.y + y + hy, p.z + z + hz))
        if (hitBox(0, POLE_HEIGHT / 2, 0, 0.135, POLE_HEIGHT / 2, 0.135)) return true
        const toObject = Matrix.Translation(-p.x, -p.y, -p.z)
        for (const {inverse} of this.signFrames) {
            const localRay = Ray.Transform(ray, toObject.multiply(inverse))
            if (localRay.intersectsBoxMinMax(new Vector3(-0.065 - SIGN_CENTER, -0.12, -0.06),
                new Vector3(0.915 - SIGN_CENTER, 0.12, 0.06))) return true
        }
        return false
    }

    constructor(type: number, position: Vector3, metadata?: SignpostMetadata) {
        super(type, position, 0, MaterialEnum1.WOOD_3.uv, StaticSurfacePlanes.getPrefab())
        // Tile-based selection survives viewport rebuilds and reloads, without saved metadata.
        let seed = Math.imul(Math.floor(position.x), 73856093) ^ Math.imul(Math.floor(position.z), 19349663)
        seed = Math.imul(seed ^ (seed >>> 16), 2246822507)
        seed = (seed ^ (seed >>> 13)) >>> 0
        const variants = StaticSurfaceAtlas.inscriptions
        const step = (seed & 1) === 0 ? 1 : 2
        this.inscriptionUVs = defaults.map((_, index) => variants[((seed % variants.length) + index * step) % variants.length])
        this.status = {signCount: [1, 2, 3, 4].includes(metadata?.signCount ?? 0) ? metadata!.signCount : 4}
        defaults.forEach((fallback, index) => {
            const key = `sign${index + 1}` as keyof SignpostMetadata
            const direction = metadata?.[key]
            this.status[key] = Object.prototype.hasOwnProperty.call(SIGNPOST_DIRECTIONS, direction as string) ? direction : fallback
            const textKey = `sign${index + 1}Text` as keyof SignpostMetadata
            this.status[textKey] = typeof metadata?.[textKey] === 'string' ? metadata[textKey] : ''
        })
        const variation = createStaticVariation(MyPlayer.worldId, position, type)
        this.pole = {
            matrix: Matrix.Scaling(0.18, POLE_HEIGHT, 0.18)
                .multiply(Matrix.RotationY(variation.signed(0) * Math.PI / 18))
                .setTranslationFromFloats(0, 0.5 + POLE_HEIGHT / 2, 0),
            shape: createWoodShape(variation, 0),
        }
        this.signFrames = Array.from({length: this.status.signCount}, (_, index) => {
            const yaw = SIGNPOST_DIRECTIONS[this.status[`sign${index + 1}`] as Direction].yaw
            const part = index + 1
            const frame = Matrix.RotationYawPitchRoll(yaw + variation.signed(part, 0) * Math.PI / 56,
                variation.signed(part, 1) * Math.PI / 38, variation.signed(part, 2) * Math.PI / 42)
                .setTranslationFromFloats(Math.cos(yaw) * SIGN_CENTER, this.getSignHeight(index), -Math.sin(yaw) * SIGN_CENTER)
            return {frame, inverse: Matrix.Invert(frame)}
        })
    }

    render() {
        const p = this.renderPosition
        const blockOrigin = {x: p.x, y: p.y + 0.5, z: p.z}
        const batch = WorldRenderer.block1!
        const addBoardPart = (matrix: Matrix, frame: Matrix) => {
            batch.matrices.push(placeStaticPart(matrix.multiply(frame), blockOrigin))
            batch.uvData.push(MaterialEnum1.WOOD_PLANKS.uv)
        }
        this.poleMatrixIndex = this.pole.shape ? TaperedBlockBatch.prefab!.matrices.length : -1
        TaperedBlockBatch.add(placeStaticPart(this.pole.matrix, p), this.material, this.pole.shape, POLE_WEATHERING)
        for (const [i, {frame}] of this.signFrames.entries()) {
            addBoardPart(Matrix.Scaling(0.85, 0.22, 0.07), frame)
            for (const side of [-1, 1]) {
                const inscription = Matrix.Scaling(0.79, 0.205, 1)
                    .multiply(Matrix.RotationY(side === 1 ? Math.PI : 0))
                    .setTranslationFromFloats(0, 0, side * 0.037)
                    .multiply(frame)
                this.prefab!.matrices.push(placeStaticPart(inscription, p))
                this.prefab!.uvData.push(this.inscriptionUVs[i])
            }
            // The left half of the rotated square sits inside the plank.
            const tipSize = 0.22 / Math.SQRT2
            addBoardPart(Matrix.Scaling(tipSize, tipSize, 0.07).multiply(Matrix.RotationZ(Math.PI / 4))
                .setTranslationFromFloats(0.425, 0, 0), frame)
        }
    }

    clearRenderMatrixCapture() {
        super.clearRenderMatrixCapture()
        this.poleMatrixIndex = -1
    }

    applyDeleteBounceOffset(offset: number) {
        const changed = super.applyDeleteBounceOffset(offset)
        const batch = TaperedBlockBatch.prefab
        if (this.poleMatrixIndex >= 0 && batch?.matrixBuffer.length) {
            batch.matrixBuffer[this.poleMatrixIndex * 16 + 13] = this.renderPosition.y + this.pole.matrix.m[13] + offset
            changed.push(batch.mesh)
        }
        return changed
    }
}
