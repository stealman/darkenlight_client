import { Matrix, Scene, Vector2, Vector3 } from '@babylonjs/core'
import { Prefab, WorldRenderer } from '@/babylon/world/worldRenderer'
import { MaterialAlphaEnum1, MaterialEnum1 } from '@/babylon/materials'
import { WorldDataManager } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { StaticObjectInfo, StaticObjectsCodebook } from '@/babylon/world/staticsCodebook'
import { PrefabShrub2x2 } from '@/babylon/world/prefabs/shrub2x2'
import { PrefabShrub1x1_tall } from '@/babylon/world/prefabs/shrub1x1-tall'
import { PrefabShrub1x1_small } from '@/babylon/world/prefabs/shrub1x1-small'
import { Lights } from '@/babylon/scene/lights'

export const StaticsManager = {
    prefabs: {
        shrub2x2: null as Prefab | null,
        shrub1x1_tall: null as Prefab | null,
        shrub1x1_small: null as Prefab | null,
    },
    allStatics : [] as StaticObject[],
    visibleStatics : [] as StaticObject[],

    initialize(scene: Scene) {
        this.prefabs.shrub2x2 = PrefabShrub2x2.getPrefab(scene)
        this.prefabs.shrub1x1_tall = PrefabShrub1x1_tall.getPrefab(scene)
        this.prefabs.shrub1x1_small = PrefabShrub1x1_small.getPrefab(scene)
    },

    addAllShadowCasters() {
        Object.values(this.prefabs).forEach(prefab => {
            Lights.addShadowCaster(prefab!.mesh)
        })
    },

    consumeObjects(data: [ { tp: number, x: number, z: number } ]) {
        data.forEach(obj => {
            this.addObject(obj)
        })
    },

    addObject(obj: { tp: number, x: number, z: number }) {
        const y = WorldDataManager.getBlockMap()[obj.x][obj.z].totalHeight
        const pos = new Vector3(obj.x, y, obj.z)
        const rotation = Math.floor(Math.random() * 4) * Math.PI / 2

        switch (obj.tp) {
            case 101: this.allStatics.push(new Shrub2x2(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_LIGHT.uv)); break
            case 102: this.allStatics.push(new Shrub2x2(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_DARK.uv)); break
            case 103: this.allStatics.push(new Shrub2x2(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_AUTUMN.uv)); break
            case 104: this.allStatics.push(new Shrub2x2(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_NORTH.uv)); break

            case 121: this.allStatics.push(new Shrub1x1_tall(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_LIGHT.uv)); break
            case 122: this.allStatics.push(new Shrub1x1_tall(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_DARK.uv)); break
            case 123: this.allStatics.push(new Shrub1x1_tall(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_AUTUMN.uv)); break
            case 124: this.allStatics.push(new Shrub1x1_tall(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_NORTH.uv)); break

            case 141: this.allStatics.push(new Shrub1x1_small(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_LIGHT.uv)); break
            case 142: this.allStatics.push(new Shrub1x1_small(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_DARK.uv)); break
            case 143: this.allStatics.push(new Shrub1x1_small(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_AUTUMN.uv)); break
            case 144: this.allStatics.push(new Shrub1x1_small(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_NORTH.uv)); break

            case 201: this.allStatics.push(new Wall2(obj.tp, pos, rotation, MaterialEnum1.BRICK_GRAY.uv)); break
            case 202: this.allStatics.push(new Wall2(obj.tp, pos, rotation, MaterialEnum1.BRICK_RED.uv)); break

            case 221: this.allStatics.push(new Wall3(obj.tp, pos, rotation, MaterialEnum1.BRICK_GRAY.uv)); break
            case 222: this.allStatics.push(new Wall3(obj.tp, pos, rotation, MaterialEnum1.BRICK_RED.uv)); break
            default:
                break
        }
    },

    recountYPositions() {
        this.allStatics.forEach(obj => {
            const y = WorldDataManager.getBlockMap()[Math.floor(obj.position.x)][Math.floor(obj.position.z)].totalHeight
            obj.position.y = y
            obj.renderPosition.y = y
        })
    },

    removeObjects(data: [ { x: number, z: number } ]) {
        data.forEach(obj => {
            this.removeObjectAt(obj.x, obj.z)
        })
    },

    removeObjectAt(x: number, z: number) {
        for (let i = 0; i < this.allStatics.length; i++) {
            if (this.allStatics[i].position.x === x && this.allStatics[i].position.z === z) {
                this.allStatics.splice(i, 1)
                break
            }
        }
    },

    renderObjects() {
        // Prefabs clear the matrices
        Object.values(this.prefabs).forEach(prefab => {
            prefab?.clearMatrices()
        })


        this.updateVisibleObjects()
        for (const element of this.visibleStatics) {
            element.render()
        }

        // Prefabs update thin instance buffers
        Object.values(this.prefabs).forEach(prefab => {
            prefab!.setThinInstanceBuffers()

            // Enable/disable mesh based on thin instance count
            if (prefab!.mesh.thinInstanceCount && prefab!.mesh.thinInstanceCount > 0) {
                prefab!.mesh.setEnabled(true)
            } else {
                prefab!.mesh.setEnabled(false)
            }
        })
    },

    updateVisibleObjects() {
        this.visibleStatics = []

        for (const obj of this.allStatics) {
            if (ViewportManager.isPointInVisibleMatrix(Math.floor(obj.position.x), Math.floor(obj.position.z), 2)) {
                this.visibleStatics.push(obj)
            }
        }
        return this.visibleStatics
    },

    getPointInStatic(x: number, z: number, size: number): { x: number, z: number } | null {
        for (const obj of this.allStatics) {
            if (obj.isObjectInCollision(x, z, size)) {
                return { x: obj.renderPosition.x, z: obj.renderPosition.z }
            }
        }
        return null
    }
}

interface StaticObject {
    type: number
    position: Vector3
    renderPosition: Vector3

    render(): void
    getSize(): number
    isBlocking(): boolean
    isObjectInCollision(tgtX: number, tgtZ: number, size: number): boolean
    getCollisionTolerance(): number
}

export abstract class BaseStaticObject implements StaticObject {
    type: number
    position: Vector3
    renderPosition: Vector3
    rotation: number
    material: Vector2
    prefab: Prefab | null
    objectInfo: StaticObjectInfo
    status: any

    protected constructor(type: number, position: Vector3, rotation: number, material: Vector2, prefab: Prefab | null) {
        this.type = type
        this.position = position
        this.rotation = rotation
        this.material = material
        this.prefab = prefab
        this.objectInfo = StaticObjectsCodebook.get(type)!
        this.renderPosition = new Vector3(position.x - 0.5 + this.getSize() / 2, position.y, position.z - 0.5 + this.getSize() / 2)
    }

    getSize(): number {
        return this.objectInfo.size
    }

    isBlocking(): boolean {
        return this.objectInfo.blocking
    }

    getCollisionTolerance(): number {
        return this.objectInfo.collisionTolerance
    }

    isObjectInCollision(tgtX: number, tgtZ: number, size: number): boolean {
        if (!this.isBlocking()) {
            return false
        }

        const moverHalf = size / 2

        const moverMinX = tgtX - moverHalf
        const moverMaxX = tgtX + moverHalf
        const moverMinZ = tgtZ - moverHalf
        const moverMaxZ = tgtZ + moverHalf

        const tol = this.getCollisionTolerance()

        const objMinX = this.position.x + tol - 0.5
        const objMaxX = this.position.x + this.getSize() - (tol + 0.5)
        const objMinZ = this.position.z + tol - 0.5
        const objMaxZ = this.position.z + this.getSize() - (tol + 0.5)

        return (moverMinX < objMaxX && moverMaxX > objMinX && moverMinZ < objMaxZ && moverMaxZ > objMinZ)
    }

    abstract render(): void
}

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

export class Shrub2x2 extends BaseStaticObject {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, StaticsManager.prefabs.shrub2x2!)
    }

    render() {
        const matrix = Matrix.Translation(this.renderPosition.x, this.renderPosition.y + 0.3, this.renderPosition.z)
        this.prefab!.matrices.push(Matrix.RotationY(this.rotation).multiply(matrix))
        this.prefab!.uvData.push(this.material)
    }
}

export class Shrub1x1_tall extends BaseStaticObject {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, StaticsManager.prefabs.shrub1x1_tall!)
    }

    render() {
        const matrix = Matrix.Translation(this.renderPosition.x, this.renderPosition.y + 0.3, this.renderPosition.z)
        this.prefab!.matrices.push(Matrix.RotationY(this.rotation).multiply(matrix))
        this.prefab!.uvData.push(this.material)
    }
}

export class Shrub1x1_small extends BaseStaticObject {
    constructor(type: number, position: Vector3, rotation: number, material: Vector2) {
        super(type, position, rotation, material, StaticsManager.prefabs.shrub1x1_small!)
    }

    render() {
        const matrix = Matrix.Translation(this.renderPosition.x, this.renderPosition.y + 0.3, this.renderPosition.z)
        this.prefab!.matrices.push(Matrix.RotationY(this.rotation).multiply(matrix))
        this.prefab!.uvData.push(this.material)
    }
}

