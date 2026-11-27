import { Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { WorldDataManager } from '@/data/worldDataManager'
import { MyPlayer } from '@/data/myPlayer'
import { ViewportManager } from '@/utils/viewport'
import { TargetingManager } from '@/gui/targettingManager'
import { Lights } from '@/babylon/scene/lights'
import { Settings } from '@/settings/settings'
import { TerrainEnum1 } from '@/babylon/materials'
import { CollisionGrid } from './collisionGrid'
import { outdoorSurfaceHeight } from './terrainRoofShape'
import { createStaticVariation } from './statics/staticVariation'
import { TreeVariants } from './trees/treeGenerator'
import type { TreePlacement, TreeRenderer } from './trees/treeRenderer'
import { TREE_SPECIES_BY_TYPE, TREE_VARIANT_COUNT, WORLD_TREE_TYPES } from './trees/treeSpecies'
import type { TreeShape, TreeSurfaceDetail } from './trees/treeSpecies'

export interface TreeData {
    x: number
    z: number
    type: number
    size: number
    level?: number
}

interface WorldTree {
    type: number
    level: number
    scale: number
    position: Vector3
    visualHeight: number
    placement: TreePlacement
}

const trees = new Map<string, WorldTree>()
const placements: TreePlacement[] = []
const playerCenter = Vector3.Zero()
const targetCenter = Vector3.Zero()
const tileKey = (x: number, z: number) => x + ';' + z
const castsNearbyShadow = (shape: TreeShape, shadowOnly: boolean) => !shadowOnly && (shape === 'wood6' || shape === 'wood12')
let renderer: TreeRenderer | undefined
let variants: TreeVariants | undefined
let nextId = 0
let deletePreviewTree: WorldTree | null = null
let deletePreviewStartTime = 0
let deletePreviewYOffset = 0

export const TreeManager = {
    collisionGrid: new CollisionGrid<WorldTree>(),
    visibleTrees: [] as WorldTree[],

    async initialize(scene: Scene, parent: TransformNode) {
        const {TreeRenderer} = await import('./trees/treeRenderer')
        variants = new TreeVariants()
        variants.warmUp()
        const treeRenderer = new TreeRenderer(scene, parent,
            (mesh, shape, shadowOnly) => {
                const near = castsNearbyShadow(shape, shadowOnly)
                Lights.addShadowCaster(mesh, near, near)
                if (!shadowOnly) Lights.registerSharedLightMesh(mesh)
            },
            (mesh, shape, shadowOnly) => {
                const near = castsNearbyShadow(shape, shadowOnly)
                Lights.removeShadowCaster(mesh, near, near)
                if (!shadowOnly) Lights.unregisterSharedLightMesh(mesh)
            },
        )
        renderer = treeRenderer
        scene.onDisposeObservable.addOnce(() => {
            treeRenderer.dispose()
            if (renderer !== treeRenderer) return
            renderer = undefined
            variants = undefined
            this.clearWorld()
        })
    },

    warmUpShaders() {
        return renderer?.warmUp()
    },

    onFrame() {
        if (!Settings.treesEnabled) return
        const node = MyPlayer.myModel?.node
        if (!node || !MyPlayer.myChar) {
            renderer?.setRevealTargets(null)
            return
        }

        playerCenter.copyFrom(node.getAbsolutePosition()).addInPlaceFromFloats(0, MyPlayer.myChar.getModelHeight() * .55, 0)
        const target = TargetingManager.selectedTarget
        if (target && target !== MyPlayer.myChar) {
            const height = target.getModelHeight()
            targetCenter.copyFrom(target.pos).addInPlaceFromFloats(0, height * .55, 0)
            renderer?.setRevealTargets(playerCenter, targetCenter, undefined, 1.3, Math.max(1.3, height * .60))
        } else {
            renderer?.setRevealTargets(playerCenter)
        }
    },

    getTreeAt(x: number, z: number) {
        return trees.get(tileKey(x, z))
    },

    consumeTrees(data: readonly TreeData[]) {
        for (const tree of data) this.addTree(tree)
    },

    addTree(data: TreeData) {
        const {x, z, type, size} = data
        const species = TREE_SPECIES_BY_TYPE.get(type)
        if (!variants || !species || !Number.isFinite(size) || size <= 0) return false
        const level = data.level ?? 1
        const previous = this.getTreeAt(x, z)
        if (previous?.type === type && previous.scale === size) {
            previous.level = level
            return false
        }
        if (previous) this.removeTreeAt(x, z)
        const tile = WorldDataManager.getBlockMap()[x]?.[z]
        const position = new Vector3(x, (tile?.height ?? 0) + .5, z)
        const variation = createStaticVariation(MyPlayer.worldId, data, type)
        const variant = variants.get(species, Math.floor(variation.unit(0) * TREE_VARIANT_COUNT))
        const visualSize = size * WORLD_TREE_TYPES[species].scale
        const tree: WorldTree = {type, level, scale: size, position, visualHeight: variant.height * visualSize,
            placement: {id: nextId++, variant, position: position.clone(), size: visualSize, snow: 0, detail: 'LOW'}}
        trees.set(tileKey(x, z), tree)
        const half = size * .75 / 2
        this.collisionGrid.add(tree, x - half, z - half, x + half, z + half)
        return true
    },

    recountYPositions() {
        const map = WorldDataManager.getBlockMap()
        for (const {position} of trees.values()) {
            const tile = map[position.x]?.[position.z]
            if (tile) position.y = tile.height + .5
        }
    },

    removeTrees(data: readonly {x: number, z: number}[]) {
        for (const {x, z} of data) this.removeTreeAt(x, z)
    },

    removeTreeAt(x: number, z: number) {
        const key = tileKey(x, z)
        const tree = trees.get(key)
        if (!tree) return
        if (deletePreviewTree === tree) {
            deletePreviewTree = null
            deletePreviewYOffset = 0
        }
        this.collisionGrid.remove(tree)
        trees.delete(key)
    },

    clearWorld() {
        trees.clear()
        this.collisionGrid.clear()
        this.visibleTrees.length = 0
        placements.length = 0
        nextId = 0
        deletePreviewTree = null
        deletePreviewYOffset = 0
        renderer?.setRevealTargets(null)
        renderer?.rebuild(placements)
    },

    renderTrees(outdoor: boolean) {
        this.visibleTrees.length = 0
        if (!renderer) return
        if (!Settings.treesEnabled || !ViewportManager.viewPortInitialized) {
            renderer.setRevealTargets(null)
            deletePreviewTree = null
            deletePreviewYOffset = 0
            if (placements.length) {
                placements.length = 0
                renderer.rebuild(placements)
            }
            return
        }

        placements.length = 0
        const map = WorldDataManager.getBlockMap()
        const detail = Settings.detailLevel.name as TreeSurfaceDetail
        const sunShadows = !Lights.indoor && Settings.isShadowsEnabled()
        for (const tree of trees.values()) {
            const {position: {x, y, z}, placement} = tree
            const visible = ViewportManager.isPointInVisibleMatrix(x, z, 2, y)
            // The lowest sun angle is 28 degrees. Keep a margin for the crown and lower ground.
            if (!visible && (!sunShadows || !ViewportManager.isPointNearVisibleBounds(x, z, tree.visualHeight * 2 + 4))) continue
            const tile = map[x]?.[z]
            if (!tile) continue
            placement.position.y = (outdoor ? outdoorSurfaceHeight(tile) : tile.totalHeight) ?? tile.height
            placement.snow = WorldRenderer.getSnowSurfaceHeight(x, z) !== undefined ? 1
                : !Lights.indoor && tile.type === TerrainEnum1.TERRAIN_GRASS_WINTER.index && !tile.snowed ? .38 : 0
            placement.detail = visible ? detail : 'SHADOW'
            placement.shadowOnly = !visible
            placements.push(placement)
            if (visible) this.visibleTrees.push(tree)
        }
        renderer.setSurfaceDetail(detail)
        renderer.rebuild(placements)
        if (deletePreviewTree) renderer.setYOffset(deletePreviewTree.placement.id, deletePreviewYOffset)
    },

    updateDeletePreview(active: boolean, x: number, z: number, time: number) {
        if (!Settings.treesEnabled) return
        const target = active ? this.getTreeAt(x, z) ?? null : null
        if (target !== deletePreviewTree) {
            if (deletePreviewTree) renderer?.setYOffset(deletePreviewTree.placement.id, 0)
            deletePreviewTree = target
            deletePreviewStartTime = time
        }
        if (target) {
            deletePreviewYOffset = (Math.sin((time - deletePreviewStartTime) * .008 - Math.PI / 2) + 1) * .175
            renderer?.setYOffset(target.placement.id, deletePreviewYOffset)
        }
    },

    getPointInTree(x: number, z: number, size: number): {x: number, z: number} | null {
        const tree = this.collisionGrid.findFirst(x, z, size, tree => {
            const half = (tree.scale * .75 + size) / 2
            return Math.abs(tree.position.x - x) < half && Math.abs(tree.position.z - z) < half
        })
        return tree ? {x: tree.position.x, z: tree.position.z} : null
    },

    isAnyTreeInDistance(pos: Vector3, maxDistance: number) {
        const maxDistanceSquared = maxDistance * maxDistance
        return this.collisionGrid.findFirst(pos.x, pos.z, 2 * maxDistance,
            tree => Vector3.DistanceSquared(tree.position, pos) <= maxDistanceSquared) !== null
    },
}
