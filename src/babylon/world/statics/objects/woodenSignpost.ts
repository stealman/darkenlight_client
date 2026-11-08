import { Matrix, Ray, Vector2, Vector3 } from '@babylonjs/core'
import { BaseStaticObject } from './baseStaticObject'
import { WorldRenderer } from '../../worldRenderer'
import { MaterialEnum1 } from '@/babylon/materials'

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
const defaults: Direction[] = ['+X', '-X', '+Z', '-Z']

export class WoodenSignpost extends BaseStaticObject {
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
        if (hitBox(0, POLE_HEIGHT / 2, 0, 0.12, POLE_HEIGHT / 2, 0.12)) return true
        for (let index = 0; index < this.status.signCount; index++) {
            const direction = this.status[`sign${index + 1}`] as Direction
            const yaw = SIGNPOST_DIRECTIONS[direction].yaw
            const localRay = Ray.Transform(ray, Matrix.Translation(-p.x, -p.y, -p.z).multiply(Matrix.RotationY(-yaw)))
            // Test the rotated board in its own coordinates, including its pointed end.
            const y = this.getSignHeight(index)
            if (localRay.intersectsBoxMinMax(new Vector3(-0.065, y - 0.12, -0.06),
                new Vector3(0.915, y + 0.12, 0.06))) return true
        }
        return false
    }

    private readonly inscriptionUVs: Vector2[]
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
    }

    render() {
        const p = this.renderPosition
        const add = (w: number, h: number, d: number, x: number, y: number, z: number, yaw = 0, roll = 0, material = MaterialEnum1.WOOD_PLANKS.uv) => {
            WorldRenderer.block1!.matrices.push(Matrix.Scaling(w, h, d)
                .multiply(Matrix.RotationYawPitchRoll(yaw, 0, roll))
                .multiply(Matrix.Translation(p.x + x, p.y + 0.5 + y, p.z + z)))
            WorldRenderer.block1!.uvData.push(material)
        }
        add(0.18, POLE_HEIGHT, 0.18, 0, POLE_HEIGHT / 2, 0, 0, 0, this.material)
        for (let i = 0; i < this.status.signCount; i++) {
            const direction = this.status[`sign${i + 1}`] as Direction
            const yaw = SIGNPOST_DIRECTIONS[direction].yaw
            const dx = Math.cos(yaw), dz = -Math.sin(yaw)
            const y = this.getSignHeight(i)
            add(0.85, 0.22, 0.07, dx * 0.37, y, dz * 0.37, yaw)
            // The shared block mesh has a -0.5 Y offset; the plane mesh is centred.
            for (const side of [-1, 1]) {
                const offset = side * 0.037
                this.prefab!.matrices.push(Matrix.Scaling(0.79, 0.205, 1)
                    .multiply(Matrix.RotationY(yaw + (side === 1 ? Math.PI : 0)))
                    .multiply(Matrix.Translation(p.x + dx * 0.37 + Math.sin(yaw) * offset,
                        p.y + y, p.z + dz * 0.37 + Math.cos(yaw) * offset)))
                this.prefab!.uvData.push(this.inscriptionUVs[i])
            }
            // The left half of the rotated square sits inside the plank.
            const tipSize = 0.22 / Math.SQRT2
            add(tipSize, tipSize, 0.07, dx * 0.795, y, dz * 0.795, yaw, Math.PI / 4)
        }
    }
}
