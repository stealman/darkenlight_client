import { Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import { WorldDataManager } from '@/data/worldDataManager'
import { MyPlayer } from '@/data/myPlayer'
import { ViewportManager } from '@/utils/viewport'
import { TargetingManager } from '@/gui/targettingManager'
import { Lights } from '@/babylon/scene/lights'
import { Renderer } from '@/babylon/scene/renderer'
import { TREE_STATIC_LIGHT_LIMITS } from '@/babylon/scene/lighting/lightConfig'
import { Settings } from '@/settings/settings'
import { CollisionGrid } from './collisionGrid'
import { outdoorSurfaceHeight } from './terrainRoofShape'
import { createStaticVariation } from './statics/staticVariation'
import { TreeVariants } from './trees/treeGenerator'
import { getTreeInstanceTemplates } from './trees/treeInstanceTemplates'
import { TreeCameraFrustum } from './trees/treeRevealBounds'
import { createTreeSnowFootprint, hasSnowNearTree, treeGroundType, treeSnowFootprintInRegion, treeSnowRegion } from './trees/treeGroundSurface'
import type { TreeSnowFootprint, TreeSnowRegion } from './trees/treeGroundSurface'
import type { TreePlacement, TreeRenderer } from './trees/treeRenderer'
import { TREE_SHADER, TREE_SPECIES_BY_TYPE, TREE_VARIANT_COUNT, WORLD_TREE_TYPES } from './trees/treeSpecies'
import type { TreeSurfaceDetail } from './trees/treeSpecies'

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
    variantSlot: number
    placement: TreePlacement
    shadowPlacement: TreePlacement
    snowFootprint: TreeSnowFootprint
    cameraVisibility?: {revision: number, height: number, detail: TreeSurfaceDetail, visible: boolean}
}

const trees = new Map<string, WorldTree>()
const placements: TreePlacement[] = []
const snowFootprints: TreeSnowFootprint[] = []
const playerCenter = Vector3.Zero()
const targetCenter = Vector3.Zero()
const treeCameraFrustum = new TreeCameraFrustum()
const treeCameraTile = Vector3.Zero()
let treeCameraViewport: typeof ViewportManager.visibilityMatrix | undefined
let treeCameraRevision = 0
const nearbyVariantDistances = new Float64Array(TREE_VARIANT_COUNT)
const TREE_VARIANT_NEIGHBORHOOD = 18
const WORLD_TREE_SIZE_MULTIPLIER = .85
const tileKey = (x: number, z: number) => x + ';' + z
let renderer: TreeRenderer | undefined
let variants: TreeVariants | undefined
let nextId = 0
let deletePreviewTree: WorldTree | null = null
let deletePreviewStartTime = 0
let deletePreviewYOffset = 0
export type TreeLightingProfileMode = 'unlit' | 'pbr' | 'active-lights'
let lightingProfileMode: TreeLightingProfileMode | undefined

export const TreeManager = {
    collisionGrid: new CollisionGrid<WorldTree>(),
    visibleTrees: [] as WorldTree[],
    snowRegion: undefined as TreeSnowRegion | undefined,

    async initialize(scene: Scene, parent: TransformNode) {
        const {TreeRenderer} = await import('./trees/treeRenderer')
        variants = new TreeVariants(undefined, undefined, true)
        const detail = Settings.detailLevel.name as TreeSurfaceDetail
        variants.warmUp(variant => {
            getTreeInstanceTemplates(variant, detail)
            getTreeInstanceTemplates(variant, 'SHADOW')
        })
        const treeRenderer = new TreeRenderer(scene, parent,
            (mesh, shape, shadowOnly) => {
                if (!shadowOnly) return
                const near = shape === 'wood6'
                Lights.addShadowCaster(mesh, near, near)
            },
            (mesh, shape, shadowOnly) => {
                if (!shadowOnly) return
                const near = shape === 'wood6'
                Lights.removeShadowCaster(mesh, near, near)
            },
            (mesh, enabled) => {
                if (enabled) Lights.registerSharedLightMesh(mesh, TREE_STATIC_LIGHT_LIMITS[Settings.detailLevel.level - 1])
                else Lights.unregisterSharedLightMesh(mesh)
            },
        )
        renderer = treeRenderer
        scene.onDisposeObservable.addOnce(() => {
            treeRenderer.dispose()
            if (renderer !== treeRenderer) return
            renderer = undefined
            variants = undefined
            lightingProfileMode = undefined
            this.clearWorld()
        })
    },

    warmUpShaders() {
        return renderer?.warmUp()
    },

    setLightingProfile(mode?: TreeLightingProfileMode) {
        lightingProfileMode = mode
    },

    onFrame() {
        if (!Settings.treesEnabled || lightingProfileMode || !(Settings.treeShaderFeatures & TREE_SHADER.reveal)) return
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
        const scale = size * WORLD_TREE_SIZE_MULTIPLIER
        const level = data.level ?? 1
        const previous = this.getTreeAt(x, z)
        if (previous?.type === type && previous.scale === scale) {
            previous.level = level
            return false
        }
        if (previous) this.removeTreeAt(x, z)
        const tile = WorldDataManager.getBlockMap()[x]?.[z]
        const position = new Vector3(x, (tile?.height ?? 0) + .5, z)
        const variation = createStaticVariation(MyPlayer.worldId, data, type)
        const preferredSlot = Math.floor(variation.unit(0) * TREE_VARIANT_COUNT)
        let variantSlot = preferredSlot
        if (previous && TREE_SPECIES_BY_TYPE.get(previous.type) === species) variantSlot = previous.variantSlot
        else {
            nearbyVariantDistances.fill(Infinity)
            const reach = TREE_VARIANT_NEIGHBORHOOD
            this.collisionGrid.forEachInBounds(x - reach, z - reach, x + reach, z + reach, tree => {
                if (TREE_SPECIES_BY_TYPE.get(tree.type) !== species) return
                const distance = (tree.position.x - x) ** 2 + (tree.position.z - z) ** 2
                if (distance <= reach * reach) {
                    const slot = tree.variantSlot
                    nearbyVariantDistances[slot] = Math.min(nearbyVariantDistances[slot], distance)
                }
            })
            // Keep the choice for the lifetime of the tree. If all slots are used, repeat the farthest.
            for (let offset = 0; offset < TREE_VARIANT_COUNT; offset++) {
                const slot = (preferredSlot + offset) % TREE_VARIANT_COUNT
                if (nearbyVariantDistances[slot] > nearbyVariantDistances[variantSlot]) variantSlot = slot
                if (nearbyVariantDistances[variantSlot] === Infinity) break
            }
        }
        const variant = variants.get(species, variantSlot)
        const visualSize = scale * WORLD_TREE_TYPES[species].scale
        const placement: TreePlacement = {id: nextId++, variant, position: position.clone(), size: visualSize, snow: 0,
            detail: 'LOW', fullBarkDetail: species === 'twisted'}
        // Both placements use the same terrain-adjusted position.
        const shadowPlacement: TreePlacement = {...placement, detail: 'SHADOW', shadowOnly: true}
        const snowFootprint = createTreeSnowFootprint(species, x, z, tile?.height ?? 0, variant.rootRadius * visualSize,
            variation.unit(0, 1), variation.unit(0, 2), variation.unit(0, 3))
        const tree: WorldTree = {type, level, scale, position, visualHeight: variant.height * visualSize, variantSlot,
            placement, shadowPlacement, snowFootprint}
        trees.set(tileKey(x, z), tree)
        const half = scale * .75 / 2
        this.collisionGrid.add(tree, x - half, z - half, x + half, z + half)
        return true
    },

    recountYPositions() {
        const map = WorldDataManager.getBlockMap()
        for (const {position, snowFootprint} of trees.values()) {
            const tile = map[position.x]?.[position.z]
            if (tile) {
                position.y = tile.height + .5
                snowFootprint.height = tile.height
            }
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
        treeCameraViewport = undefined
        this.collisionGrid.clear()
        this.visibleTrees.length = 0
        placements.length = 0
        snowFootprints.length = 0
        this.snowRegion = undefined
        nextId = 0
        deletePreviewTree = null
        deletePreviewYOffset = 0
        renderer?.setRevealTargets(null)
        renderer?.rebuild(placements)
    },

    renderTrees(outdoor: boolean) {
        this.visibleTrees.length = 0
        snowFootprints.length = 0
        this.snowRegion = undefined
        if (!renderer) return snowFootprints
        if (!Settings.treesEnabled || !ViewportManager.viewPortInitialized) {
            renderer.setRevealTargets(null)
            deletePreviewTree = null
            deletePreviewYOffset = 0
            if (placements.length) {
                placements.length = 0
                renderer.rebuild(placements)
            }
            return snowFootprints
        }

        placements.length = 0
        const map = WorldDataManager.getBlockMap()
        const detail = Settings.detailLevel.name as TreeSurfaceDetail
        const shadows = Settings.treeShadowsEnabled && Settings.isShadowsEnabled()
        const treeSnowEnabled = outdoor && (Settings.treeShaderFeatures & TREE_SHADER.snow) !== 0
        const playerPosition = MyPlayer.myChar?.pos
        const camera = Renderer.camera
        const cullByCamera = camera != null && playerPosition != null
        if (cullByCamera) {
            const tileX = Math.round(playerPosition.x), tileY = Math.round(playerPosition.y), tileZ = Math.round(playerPosition.z)
            if (treeCameraViewport !== ViewportManager.visibilityMatrix || !treeCameraTile.equalsToFloats(tileX, tileY, tileZ)) {
                camera.getViewMatrix()
                camera.getProjectionMatrix()
                // Keep the same planes throughout a tile to avoid changing instance batches as the camera interpolates.
                treeCameraFrustum.update(camera.getTransformationMatrix(), Settings.isPhoneOrTablet() ? 3 : 2)
                treeCameraTile.set(tileX, tileY, tileZ)
                treeCameraViewport = ViewportManager.visibilityMatrix
                treeCameraRevision++
            }
        }
        const snowRegion = this.snowRegion = treeSnowEnabled && playerPosition
            ? treeSnowRegion(playerPosition.x, playerPosition.z, ViewportManager) : undefined
        for (const tree of trees.values()) {
            const {position: {x, y, z}, placement, shadowPlacement, snowFootprint} = tree
            const visibleTile = ViewportManager.isPointInVisibleMatrix(x, z, 2, y)
            // The lowest sun angle is 28 degrees. Keep a margin for the crown and lower ground.
            const castsShadow = shadows && (visibleTile || (!Lights.indoor
                && ViewportManager.isPointNearVisibleBounds(x, z, tree.visualHeight * 2 + 4)))
            const showsSnowFootprint = !!snowRegion && treeSnowFootprintInRegion(snowFootprint, snowRegion)
            if (!visibleTile && !castsShadow && !showsSnowFootprint) continue
            const tile = map[x]?.[z]
            if (!tile) continue
            const groundType = outdoor ? treeGroundType(tile) : 0
            const snowAtBase = showsSnowFootprint && groundType > 0 && WorldRenderer.getSnowSurfaceHeight(x, z) !== undefined
            if (showsSnowFootprint && groundType) {
                snowFootprint.height = tile.height
                if (hasSnowNearTree(map, snowFootprint, snowAtBase)) snowFootprints.push(snowFootprint)
            }
            if (visibleTile || castsShadow) placement.position.y = (outdoor ? outdoorSurfaceHeight(tile) : tile.totalHeight) ?? tile.height
            if (visibleTile) {
                this.visibleTrees.push(tree)
                const visibility = tree.cameraVisibility ??= {revision: 0, height: 0, detail, visible: true}
                if (cullByCamera && (visibility.revision !== treeCameraRevision
                    || visibility.height !== placement.position.y || visibility.detail !== detail)) {
                    visibility.revision = treeCameraRevision
                    visibility.height = placement.position.y
                    visibility.detail = detail
                    visibility.visible = treeCameraFrustum.intersects(placement.variant.models[detail], placement.position, placement.size)
                }
                if (!cullByCamera || visibility.visible) {
                    placement.groundType = groundType
                    placement.snow = snowAtBase ? snowFootprint.rootSnow : 0
                    placement.detail = detail
                    placements.push(placement)
                }
            }
            if (castsShadow) placements.push(shadowPlacement)
        }
        let features = Settings.treeShaderFeatures
        if (lightingProfileMode) {
            features &= ~TREE_SHADER.reveal
            features = lightingProfileMode === 'unlit' ? features & ~TREE_SHADER.lighting : features | TREE_SHADER.lighting
        }
        renderer.setSurfaceDetail(detail, features, lightingProfileMode !== 'pbr', 'textured')
        renderer.setShadowCasting(shadows)
        renderer.rebuild(placements)
        if (deletePreviewTree) renderer.setYOffset(deletePreviewTree.placement.id, deletePreviewYOffset)
        return snowFootprints
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
