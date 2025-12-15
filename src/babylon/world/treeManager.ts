import { Matrix, Scene, Vector2, Vector3 } from '@babylonjs/core'
import { Prefab, WorldRenderer } from '@/babylon/world/worldRenderer'
import { MaterialEnum1 } from '@/babylon/materials'
import { PrefabTree1 } from '@/babylon/world/prefabs/tree1'
import { WorldData } from '@/babylon/world/worldData'
import { ViewportManager } from '@/utils/viewport'
import { Data } from '@/data/globalData'

export const TreeManager = {
    prefabs: {
        tree1: null as Prefab | null,
    },
    allTrees : [] as Tree[],
    visibleTrees : [] as Tree[],

    initialize(scene: Scene) {
        this.prefabs.tree1 = PrefabTree1.getPrefab(scene)
        this.addTrees()
    },

    addTrees() {
    },

    consumeTrees(data: [ { x: number, z: number, size: number } ]) {
        data.forEach(tree => {
            const y = WorldData.getBlockMap()[tree.x][tree.z].height + 0.5
            this.allTrees.push(new Tree1(new Vector3(tree.x, y, tree.z), Math.floor(Math.random() * 4) * Math.PI / 2, tree.size, MaterialEnum1.getMaterialByIndex(1 + Math.floor(Math.random() * 2))))
        })

    },

    removeTrees(data: [ { x: number, z: number } ]) {
        data.forEach(tree => {
            for (let i = 0; i < this.allTrees.length; i++) {
                if (this.allTrees[i].position.x === tree.x && this.allTrees[i].position.z === tree.z) {
                    this.allTrees.splice(i, 1)
                    break
                }
            }
        })
    },

    renderTrees() {
        // Prefabs clear the matrices
        Object.values(this.prefabs).forEach(prefab => {
            prefab?.clearMatrices()
        })


        this.updateVisibleTrees()
        for (const element of this.visibleTrees) {
            element.renderLeaves()
            element.renderTrunk()
        }

        // Prefabs update thin instance buffers
        Object.values(this.prefabs).forEach(prefab => {
            prefab?.setThinInstanceBuffers()
        })
    },

    updateVisibleTrees() {
        const myPos = Data.myChar.getPositionRounded()
        this.visibleTrees = []

        for (const element of this.allTrees) {
            const tree = element
            if (ViewportManager.isPointInVisibleMatrix(Math.floor(tree.position.x) - myPos.x, Math.floor(tree.position.z) - myPos.z, 2)) {
                this.visibleTrees.push(tree)
            }
        }
        return this.visibleTrees
    },

    getPointInTree(x: number, z: number, size: number): { x: number, z: number } | null {
        for (const element of this.allTrees) {
            const tree = element
            const combinedSize = (tree.scale + size) / 2
            if (Math.abs(tree.position.x - x) < combinedSize && Math.abs(tree.position.z - z) < combinedSize) {
                return { x: tree.position.x, z: tree.position.z }
            }
        }
        return null
    }
}

class Tree1 implements Tree {
    position: Vector3
    rotation: number
    scale: number
    leafMaterial: Vector2
    woodMaterial: Vector2
    leavesPrefab: Prefab

    constructor(position: Vector3, rotation: number, scale: number, leafMaterial: Vector2) {
        this.position = position
        this.rotation = rotation
        this.scale = scale
        this.leafMaterial = leafMaterial
        this.woodMaterial = Math.random() < 0.5 ? MaterialEnum1.WOOD_1.uv : MaterialEnum1.WOOD_2.uv
        this.leavesPrefab = TreeManager.prefabs.tree1!
    }

    renderLeaves() {
        const myPos = Data.myChar.getPositionRounded()
        const matrix = Matrix.Translation( this.position.x - myPos.x, this.position.y + (2 * this.scale), this.position.z - myPos.z);
        const rotationMatrix = Matrix.RotationY(this.rotation);
        const scaleMatrix = Matrix.Scaling(this.scale, this.scale, this.scale);

        this.leavesPrefab.matrices.push(scaleMatrix.multiply(rotationMatrix).multiply(matrix))
        this.leavesPrefab.uvData.push(this.leafMaterial)
    }

    renderTrunk() {
        const myPos = Data.myChar.getPositionRounded()
        const scaleMatrix = Matrix.Scaling(this.scale / 2, this.scale / 2, this.scale / 2);

        // Blocks for trunk
        for (let i = 0; i <= 2.5 * this.scale; i += this.scale / 2) {
            const positionMatrix = Matrix.Translation( this.position.x - myPos.x, this.position.y + i, this.position.z - myPos.z)

            WorldRenderer.block1!.matrices.push(scaleMatrix.multiply(positionMatrix))
            WorldRenderer.block1!.uvData.push(this.woodMaterial)
        }
    }
}

interface Tree {
    position: Vector3
    rotation: number
    scale: number

    renderLeaves(): void
    renderTrunk(): void
}
