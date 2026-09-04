import { Matrix, Scene, Vector2, Vector3 } from '@babylonjs/core'
import { Prefab, WorldRenderer } from '@/babylon/world/worldRenderer'
import { MaterialAlphaEnum1, MaterialEnum1 } from '@/babylon/materials'
import { WorldDataManager } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { PrefabOak } from '@/babylon/world/prefabs/treeOak'
import { PrefabFir } from '@/babylon/world/prefabs/treeFir'
import { Lights } from '@/babylon/scene/lights'

export const TreeManager = {
    prefabs: {
        tree1: null as Prefab | null,
        tree2: null as Prefab | null,
    },
    allTrees : [] as Tree[],
    visibleTrees : [] as Tree[],

    initialize(scene: Scene) {
        this.prefabs.tree1 = PrefabOak.getPrefab(scene)
        this.prefabs.tree2 = PrefabFir.getPrefab(scene)
    },

    addAllShadowCasters() {
        Object.values(this.prefabs).forEach(prefab => {
            Lights.addShadowCaster(prefab!.mesh)
        })
    },

    consumeTrees(data: [ { type: number, x: number, z: number, size: number } ]) {
        data.forEach(tree => {
            this.addTree(tree)
        })
    },

    addTree(tree: { type: number, x: number, z: number, size: number }) {
        const y = WorldDataManager.getBlockMap()[tree.x][tree.z].height + 0.5
        const size = tree.size
        const rotation = Math.floor(Math.random() * 4) * Math.PI / 2
        const pos = new Vector3(tree.x, y, tree.z)

        switch (tree.type) {
            case 1:
                this.allTrees.push(new TreeOak(pos, rotation, size, MaterialAlphaEnum1.getMaterialByIndex(1)))
                break
            case 2:
                this.allTrees.push(new TreeOak(pos, rotation, size, MaterialAlphaEnum1.getMaterialByIndex(2)))
                break
            case 3:
                this.allTrees.push(new TreeOak(pos, rotation, size, MaterialAlphaEnum1.getMaterialByIndex(3)))
                break
            case 4:
                this.allTrees.push(new TreeOak(pos, rotation, size, MaterialAlphaEnum1.getMaterialByIndex(4)))
                break
            case 5:
                this.allTrees.push(new TreeFir(pos, rotation, size, MaterialAlphaEnum1.getMaterialByIndex(1)))
                break
            case 6:
                this.allTrees.push(new TreeFir(pos, rotation, size, MaterialAlphaEnum1.getMaterialByIndex(2)))
                break
            case 7:
                this.allTrees.push(new TreeFir(pos, rotation, size, MaterialAlphaEnum1.getMaterialByIndex(3)))
                break
            case 8:
                this.allTrees.push(new TreeFir(pos, rotation, size, MaterialAlphaEnum1.getMaterialByIndex(4)))
                break
            default:
                break
        }
    },

    recountYPositions() {
        this.allTrees.forEach(tree => {
            const y = WorldDataManager.getBlockMap()[Math.floor(tree.position.x)][Math.floor(tree.position.z)].height + 0.5
            tree.position.y = y
        })
    },

    removeTrees(data: [ { x: number, z: number } ]) {
        data.forEach(tree => {
            this.removeTreeAt(tree.x, tree.z)
        })
    },

    removeTreeAt(x: number, z: number) {
        for (let i = 0; i < this.allTrees.length; i++) {
            if (this.allTrees[i].position.x === x && this.allTrees[i].position.z === z) {
                this.allTrees.splice(i, 1)
                break
            }
        }
    },

    clearWorld() {
        this.allTrees = []
        this.visibleTrees = []
        this.renderTrees()
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

            // Enable/disable mesh based on thin instance count
            if (prefab!.mesh.thinInstanceCount && prefab!.mesh.thinInstanceCount > 0) {
                prefab!.mesh.setEnabled(true)
            } else {
                prefab!.mesh.setEnabled(false)
            }
        })
    },

    updateVisibleTrees() {
        this.visibleTrees = []

        for (const element of this.allTrees) {
            const tree = element
            if (ViewportManager.isPointInVisibleMatrix(Math.floor(tree.position.x), Math.floor(tree.position.z), 2)) {
                this.visibleTrees.push(tree)
            }
        }
        return this.visibleTrees
    },

    getPointInTree(x: number, z: number, size: number): { x: number, z: number } | null {
        for (const element of this.allTrees) {
            const tree = element
            const combinedSize = ((tree.scale * 0.75) + size) / 2
            if (Math.abs(tree.position.x - x) < combinedSize && Math.abs(tree.position.z - z) < combinedSize) {
                return { x: tree.position.x, z: tree.position.z }
            }
        }
        return null
    },

    isAnyTreeInDistance(pos: Vector3, maxDistance: number): boolean {
        for (const tree of this.visibleTrees) {
            if (Vector3.Distance(tree.position, pos) <= maxDistance) {
                return true
            }
        }
        return false
    }
}

class TreeOak implements Tree {
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
        const matrix = Matrix.Translation( this.position.x, this.position.y + (2 * this.scale), this.position.z);
        const rotationMatrix = Matrix.RotationY(this.rotation);
        const scaleMatrix = Matrix.Scaling(this.scale, this.scale, this.scale);

        this.leavesPrefab.matrices.push(scaleMatrix.multiply(rotationMatrix).multiply(matrix))
        this.leavesPrefab.uvData.push(this.leafMaterial)
    }

    renderTrunk() {
        const scaleMatrix = Matrix.Scaling(this.scale / 2, this.scale / 2, this.scale / 2);

        // Blocks for trunk
        for (let i = 0; i <= 2.5 * this.scale; i += this.scale / 2) {
            const positionMatrix = Matrix.Translation( this.position.x, this.position.y + i, this.position.z)

            WorldRenderer.block1!.matrices.push(scaleMatrix.multiply(positionMatrix))
            WorldRenderer.block1!.uvData.push(this.woodMaterial)
        }
    }
}

class TreeFir implements Tree {
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
        this.leavesPrefab = TreeManager.prefabs.tree2!
    }

    renderLeaves() {
        const matrix = Matrix.Translation( this.position.x, this.position.y - 1 + (2 * this.scale), this.position.z);
        const rotationMatrix = Matrix.RotationY(this.rotation);
        const scaleMatrix = Matrix.Scaling(this.scale, this.scale, this.scale);

        this.leavesPrefab.matrices.push(scaleMatrix.multiply(rotationMatrix).multiply(matrix))
        this.leavesPrefab.uvData.push(this.leafMaterial)
    }

    renderTrunk() {
        const scaleMatrix = Matrix.Scaling(this.scale / 2, this.scale / 2, this.scale / 2);

        // Blocks for trunk
        for (let i = 0; i <= 2 * this.scale; i += this.scale / 2) {
            const positionMatrix = Matrix.Translation( this.position.x, this.position.y + i, this.position.z)

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
