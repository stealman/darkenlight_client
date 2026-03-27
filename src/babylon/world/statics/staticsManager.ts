import { Scene, Vector3 } from '@babylonjs/core'
import { Prefab } from '@/babylon/world/worldRenderer'
import { MaterialAlphaEnum1, MaterialEnum1 } from '@/babylon/materials'
import { WorldDataManager } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { PrefabShrub2x2 } from '@/babylon/world/prefabs/shrub2x2'
import { PrefabShrub1x1_tall } from '@/babylon/world/prefabs/shrub1x1-tall'
import { PrefabShrub1x1_small } from '@/babylon/world/prefabs/shrub1x1-small'
import { Lights } from '@/babylon/scene/lights'
import { StaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { FireplaceLarge, FireplaceSmall } from '@/babylon/world/statics/objects/fireplace'
import { Shrub1x1_small, Shrub1x1_tall, Shrub2x2 } from '@/babylon/world/statics/objects/shrubs'
import { Wall2, Wall3 } from '@/babylon/world/statics/objects/walls'

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
            case 101: this.allStatics.push(new Shrub2x2(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_LIGHT.uv, this.prefabs.shrub2x2!)); break
            case 102: this.allStatics.push(new Shrub2x2(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_DARK.uv, this.prefabs.shrub2x2!)); break
            case 103: this.allStatics.push(new Shrub2x2(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_AUTUMN.uv, this.prefabs.shrub2x2!)); break
            case 104: this.allStatics.push(new Shrub2x2(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_NORTH.uv, this.prefabs.shrub2x2!)); break

            case 121: this.allStatics.push(new Shrub1x1_tall(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_LIGHT.uv, this.prefabs.shrub1x1_tall!)); break
            case 122: this.allStatics.push(new Shrub1x1_tall(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_DARK.uv, this.prefabs.shrub1x1_tall!)); break
            case 123: this.allStatics.push(new Shrub1x1_tall(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_AUTUMN.uv, this.prefabs.shrub1x1_tall!)); break
            case 124: this.allStatics.push(new Shrub1x1_tall(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_NORTH.uv, this.prefabs.shrub1x1_tall!)); break

            case 141: this.allStatics.push(new Shrub1x1_small(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_LIGHT.uv, this.prefabs.shrub1x1_small!)); break
            case 142: this.allStatics.push(new Shrub1x1_small(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_DARK.uv, this.prefabs.shrub1x1_small!)); break
            case 143: this.allStatics.push(new Shrub1x1_small(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_AUTUMN.uv, this.prefabs.shrub1x1_small!)); break
            case 144: this.allStatics.push(new Shrub1x1_small(obj.tp, pos, rotation, MaterialAlphaEnum1.TREE_LEAF_NORTH.uv, this.prefabs.shrub1x1_small!)); break

            case 201: this.allStatics.push(new Wall2(obj.tp, pos, rotation, MaterialEnum1.BRICK_GRAY.uv)); break
            case 202: this.allStatics.push(new Wall2(obj.tp, pos, rotation, MaterialEnum1.BRICK_RED.uv)); break

            case 221: this.allStatics.push(new Wall3(obj.tp, pos, rotation, MaterialEnum1.BRICK_GRAY.uv)); break
            case 222: this.allStatics.push(new Wall3(obj.tp, pos, rotation, MaterialEnum1.BRICK_RED.uv)); break

            case 241: this.allStatics.push(new FireplaceSmall(obj.tp, pos, rotation, MaterialEnum1.WOOD_1.uv)); break
            case 242: this.allStatics.push(new FireplaceLarge(obj.tp, pos, rotation, MaterialEnum1.WOOD_1.uv)); break
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
        Object.values(this.prefabs).forEach(prefab => {
            prefab?.clearMatrices()
        })

        this.updateVisibleObjects()
        for (const element of this.visibleStatics) {
            element.render()
        }

        Object.values(this.prefabs).forEach(prefab => {
            prefab!.setThinInstanceBuffers()

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
