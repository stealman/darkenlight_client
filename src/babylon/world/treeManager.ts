import { Matrix, Mesh, PBRMaterial, Scene, Vector2, Vector3, VertexBuffer } from '@babylonjs/core'
import { Prefab, WorldRenderer } from '@/babylon/world/worldRenderer'
import { MaterialAlphaEnum1, MaterialEnum1, Materials } from '@/babylon/materials'
import { WorldDataManager } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { PrefabOak } from '@/babylon/world/prefabs/treeOak'
import { PrefabFir } from '@/babylon/world/prefabs/treeFir'
import { Lights } from '@/babylon/scene/lights'

export const TreeManager = {
    fadeDistance: 3,
    fadedAlpha: 0.35,
    fadeDuration: 0.3,
    prefabs: {
        tree1: null as Prefab | null,
        tree2: null as Prefab | null,
    },
    fadedLeafMaterial: null as PBRMaterial | null,
    fadedTrunkMaterial: null as PBRMaterial | null,
    fadedPersonalShadowCasters: new WeakSet<Mesh>(),
    allTrees : [] as Tree[],
    visibleTrees : [] as Tree[],

    initialize(scene: Scene) {
        this.fadedPersonalShadowCasters = new WeakSet<Mesh>()
        Lights.enableTransparentShadowCasters()
        this.prefabs.tree1 = PrefabOak.getPrefab(scene)
        this.prefabs.tree2 = PrefabFir.getPrefab(scene)
        this.fadedLeafMaterial = Materials.createBlockMatAlpha1(scene)
        this.configureFadedMaterial(this.fadedLeafMaterial, 'tree_leaves_faded_material', true)
        this.fadedTrunkMaterial = Materials.createBlockMat1(scene)
        this.configureFadedMaterial(this.fadedTrunkMaterial, 'tree_trunk_faded_material', false)
    },

    configureFadedMaterial(material: PBRMaterial, name: string, alphaCutout: boolean) {
        material.name = name
        material.alpha = 1
        material.transparencyMode = alphaCutout
            ? PBRMaterial.PBRMATERIAL_ALPHATESTANDBLEND
            : PBRMaterial.PBRMATERIAL_ALPHABLEND
        material.forceAlphaTest = alphaCutout
        if (alphaCutout) {
            // Babylon applies material.alpha before the alpha-test comparison.
            // Keep fully transparent texels cut out without rejecting the
            // visible leaf texels after they have been faded to 35%.
            material.alphaCutOff = 0.01
        }
    },

    createFadedMesh(
        sourceMesh: Mesh,
        name: string,
        material: PBRMaterial,
        uv: Vector2,
        castPersonalShadow: boolean,
    ): Mesh {
        const mesh = new Mesh(name, sourceMesh.getScene())
        const vertexKinds = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UVKind]
        vertexKinds.forEach(kind => {
            const data = sourceMesh.getVerticesData(kind, true, true, true)
            const sourceBuffer = sourceMesh.getVertexBuffer(kind)
            if (data != null && sourceBuffer != null) {
                mesh.setVerticesData(kind, data, false, sourceBuffer.getStrideSize())
            }
        })
        const indices = sourceMesh.getIndices(true, true)
        if (indices != null) {
            mesh.setIndices(indices)
        }
        const uvData = new Float32Array(mesh.getTotalVertices() * 2)
        for (let i = 0; i < uvData.length; i += 2) {
            uvData[i] = uv.x
            uvData[i + 1] = uv.y
        }
        mesh.setVerticesData('uvc', uvData, false, 2)
        mesh.material = material
        mesh.parent = sourceMesh.parent
        mesh.alwaysSelectAsActiveMesh = true
        Lights.addShadowCaster(mesh, castPersonalShadow, true)
        if (castPersonalShadow) {
            this.fadedPersonalShadowCasters.add(mesh)
        }
        return mesh
    },

    onFrame(timeRate: number) {
        let rebuildTrees = false
        this.allTrees.forEach(tree => {
            rebuildTrees = updateTreeFade(tree, timeRate, this.fadeDuration) || rebuildTrees
        })
        if (rebuildTrees) {
            WorldRenderer.renderWorld()
        }
    },

    addAllShadowCasters() {
        Object.values(this.prefabs).forEach(prefab => {
            // Alpha-cutout crowns produce severe projection artifacts when the
            // player's nearby spotlight sits inside or directly below them.
            // Trunks use the opaque shared block mesh and keep casting personal
            // shadows; crowns still cast sun/static-light shadows.
            Lights.addShadowCaster(prefab!.mesh, false, true)
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
                disposeFadedTreeMeshes(this.allTrees[i])
                this.allTrees.splice(i, 1)
                break
            }
        }
    },

    clearWorld() {
        this.allTrees.forEach(tree => disposeFadedTreeMeshes(tree))
        this.allTrees = []
        this.visibleTrees = []
        this.renderTrees()
    },

    renderTrees(playerPosition?: Vector3) {
        // Prefabs clear the matrices
        Object.values(this.prefabs).forEach(prefab => {
            prefab?.clearMatrices()
        })


        this.updateVisibleTrees()
        const visibleTrees = new Set(this.visibleTrees)
        this.allTrees.forEach(tree => {
            if (!visibleTrees.has(tree)) {
                disposeFadedTreeMeshes(tree)
            }
        })
        for (const element of this.visibleTrees) {
            const dx = element.position.x - (playerPosition?.x ?? Number.POSITIVE_INFINITY)
            const dz = element.position.z - (playerPosition?.z ?? Number.POSITIVE_INFINITY)
            const faded = ((dx * dx) + (dz * dz)) <= this.fadeDistance * this.fadeDistance
            if (faded) {
                element.fadeTarget = this.fadedAlpha
            } else if (element.fadedMeshes.length > 0) {
                element.fadeTarget = 1
            }

            if (faded || element.fadedMeshes.length > 0) {
                if (element.fadedMeshes.length === 0) {
                    element.renderLeaves(true)
                    element.renderTrunk(true)
                }
            } else {
                element.renderLeaves(false)
                element.renderTrunk(false)
            }
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
    fadedMeshes: Mesh[] = []
    fadeVisibility = 1
    fadeTarget = 1

    constructor(position: Vector3, rotation: number, scale: number, leafMaterial: Vector2) {
        this.position = position
        this.rotation = rotation
        this.scale = scale
        this.leafMaterial = leafMaterial
        this.woodMaterial = Math.random() < 0.5 ? MaterialEnum1.WOOD_1.uv : MaterialEnum1.WOOD_2.uv
        this.leavesPrefab = TreeManager.prefabs.tree1!
    }

    renderLeaves(faded: boolean) {
        if (faded) {
            const mesh = TreeManager.createFadedMesh(
                this.leavesPrefab.mesh,
                'tree_oak_faded',
                TreeManager.fadedLeafMaterial!,
                this.leafMaterial,
                false,
            )
            mesh.position.set(this.position.x, this.position.y + (2 * this.scale), this.position.z)
            mesh.rotation.y = this.rotation
            mesh.scaling.setAll(this.scale)
            mesh.visibility = this.fadeVisibility
            this.fadedMeshes.push(mesh)
            return
        }

        const matrix = Matrix.Translation( this.position.x, this.position.y + (2 * this.scale), this.position.z);
        const rotationMatrix = Matrix.RotationY(this.rotation);
        const scaleMatrix = Matrix.Scaling(this.scale, this.scale, this.scale);

        this.leavesPrefab.matrices.push(scaleMatrix.multiply(rotationMatrix).multiply(matrix))
        this.leavesPrefab.uvData.push(this.leafMaterial)
    }

    renderTrunk(faded: boolean) {
        const scaleMatrix = Matrix.Scaling(this.scale / 2, this.scale / 2, this.scale / 2)

        // Blocks for trunk
        for (let i = 0; i <= 2.5 * this.scale; i += this.scale / 2) {
            if (faded) {
                const mesh = TreeManager.createFadedMesh(
                    WorldRenderer.block1!.mesh,
                    'tree_oak_trunk_faded',
                    TreeManager.fadedTrunkMaterial!,
                    this.woodMaterial,
                    true,
                )
                mesh.position.set(this.position.x, this.position.y + i - 0.5, this.position.z)
                mesh.scaling.setAll(this.scale / 2)
                mesh.visibility = this.fadeVisibility
                this.fadedMeshes.push(mesh)
                continue
            }
            const positionMatrix = Matrix.Translation(this.position.x, this.position.y + i, this.position.z)

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
    fadedMeshes: Mesh[] = []
    fadeVisibility = 1
    fadeTarget = 1

    constructor(position: Vector3, rotation: number, scale: number, leafMaterial: Vector2) {
        this.position = position
        this.rotation = rotation
        this.scale = scale
        this.leafMaterial = leafMaterial
        this.woodMaterial = Math.random() < 0.5 ? MaterialEnum1.WOOD_1.uv : MaterialEnum1.WOOD_2.uv
        this.leavesPrefab = TreeManager.prefabs.tree2!
    }

    renderLeaves(faded: boolean) {
        if (faded) {
            const mesh = TreeManager.createFadedMesh(
                this.leavesPrefab.mesh,
                'tree_fir_faded',
                TreeManager.fadedLeafMaterial!,
                this.leafMaterial,
                false,
            )
            mesh.position.set(this.position.x, this.position.y - 1 + (2 * this.scale), this.position.z)
            mesh.rotation.y = this.rotation
            mesh.scaling.setAll(this.scale)
            mesh.visibility = this.fadeVisibility
            this.fadedMeshes.push(mesh)
            return
        }

        const matrix = Matrix.Translation( this.position.x, this.position.y - 1 + (2 * this.scale), this.position.z);
        const rotationMatrix = Matrix.RotationY(this.rotation);
        const scaleMatrix = Matrix.Scaling(this.scale, this.scale, this.scale);

        this.leavesPrefab.matrices.push(scaleMatrix.multiply(rotationMatrix).multiply(matrix))
        this.leavesPrefab.uvData.push(this.leafMaterial)
    }

    renderTrunk(faded: boolean) {
        const scaleMatrix = Matrix.Scaling(this.scale / 2, this.scale / 2, this.scale / 2)

        // Blocks for trunk
        for (let i = 0; i <= 2 * this.scale; i += this.scale / 2) {
            if (faded) {
                const mesh = TreeManager.createFadedMesh(
                    WorldRenderer.block1!.mesh,
                    'tree_fir_trunk_faded',
                    TreeManager.fadedTrunkMaterial!,
                    this.woodMaterial,
                    true,
                )
                mesh.position.set(this.position.x, this.position.y + i - 0.5, this.position.z)
                mesh.scaling.setAll(this.scale / 2)
                mesh.visibility = this.fadeVisibility
                this.fadedMeshes.push(mesh)
                continue
            }
            const positionMatrix = Matrix.Translation(this.position.x, this.position.y + i, this.position.z)

            WorldRenderer.block1!.matrices.push(scaleMatrix.multiply(positionMatrix))
            WorldRenderer.block1!.uvData.push(this.woodMaterial)
        }
    }
}
interface Tree {
    position: Vector3
    rotation: number
    scale: number
    fadedMeshes: Mesh[]
    fadeVisibility: number
    fadeTarget: number

    renderLeaves(faded: boolean): void
    renderTrunk(faded: boolean): void
}

function updateTreeFade(tree: Tree, timeRate: number, duration: number): boolean {
    if (tree.fadedMeshes.length === 0 || tree.fadeVisibility === tree.fadeTarget) {
        return false
    }

    const step = ((1 - TreeManager.fadedAlpha) / duration) * timeRate
    if (tree.fadeVisibility < tree.fadeTarget) {
        tree.fadeVisibility = Math.min(tree.fadeVisibility + step, tree.fadeTarget)
    } else {
        tree.fadeVisibility = Math.max(tree.fadeVisibility - step, tree.fadeTarget)
    }
    tree.fadedMeshes.forEach(mesh => {
        mesh.visibility = tree.fadeVisibility
    })

    if (tree.fadeTarget === 1 && tree.fadeVisibility === 1) {
        disposeFadedTreeMeshes(tree)
        return true
    }
    return false
}

function disposeFadedTreeMeshes(tree: Tree) {
    tree.fadedMeshes.forEach(mesh => {
        const castPersonalShadow = TreeManager.fadedPersonalShadowCasters.has(mesh)
        Lights.removeShadowCaster(mesh, castPersonalShadow, true)
        mesh.dispose(false, false)
    })
    tree.fadedMeshes = []
    tree.fadeVisibility = 1
    tree.fadeTarget = 1
}
