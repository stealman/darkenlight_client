import { Matrix, Scene, Vector2, Vector3 } from '@babylonjs/core'
import { Prefab, WorldRenderer } from '@/babylon/world/worldRenderer'
import { MaterialAlphaEnum1, MaterialEnum1 } from '@/babylon/materials'
import { WorldDataManager } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { PrefabShrub2x2 } from '@/babylon/world/prefabs/shrub2x2'
import { PrefabShrub1x1_tall } from '@/babylon/world/prefabs/shrub1x1-tall'
import { PrefabShrub1x1_small } from '@/babylon/world/prefabs/shrub1x1-small'
import { Lights } from '@/babylon/scene/lights'
import { StaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { FireplaceLarge, FireplaceMetadata, FireplaceSmall } from '@/babylon/world/statics/objects/fireplace'
import { Shrub1x1_small, Shrub1x1_tall, Shrub2x2 } from '@/babylon/world/statics/objects/shrubs'
import { PalisadeMetadata, PalisadeWall2, StoneEntrance, StoneEntranceMetadata, Wall2, Wall3 } from '@/babylon/world/statics/objects/walls'
import { SpikedPalisade, SpikedPalisadeMetadata } from '@/babylon/world/statics/objects/spikedPalisade'
import { TorchStand, TorchStandMetadata } from '@/babylon/world/statics/objects/torchStand'
import { WallTorch, WallTorchMetadata } from '@/babylon/world/statics/objects/wallTorch'
import { LanternStand, LanternStandMetadata } from '@/babylon/world/statics/objects/lanternStand'
import { CemeteryEmberBowl, CemeteryEmberBowlMetadata } from '@/babylon/world/statics/objects/cemeteryEmberBowl'
import { StaticObjectsCodebook } from '@/babylon/world/statics/staticsCodebook'
import { MyPlayer } from '@/data/myPlayer'
import { AudioManager } from '@/babylon/audio/audioManager'
import { StaticFireParticleManager } from '@/babylon/world/statics/staticFireParticleManager'
import { WalkableBlock, WalkableBlockMetadata } from '@/babylon/world/statics/objects/walkableBlock'
import { isShrubType } from '@/babylon/world/snowCoverMask'
import {
    CampBarrel,
    CampBench,
    CampFence,
    CampFenceMetadata,
    CampObjectMetadata,
    HayStack,
    LogPile,
    PlankPile,
    StumpWithAxe,
    SupplyCrate,
} from '@/babylon/world/statics/objects/campObjects'
import { StaticEquipPartsRenderer } from '@/babylon/world/statics/staticEquipPartsRenderer'
import { WeaponModelsCb } from '@/babylon/item/codebook/weaponModelsCb'
import {
    CemeteryCross,
    CemeteryCrossPedestal,
    CemeteryHeadstone,
    CemeteryHeadstone2,
    CemeteryHeadstone3,
    CemeteryIronFence,
    CemeteryObjectMetadata,
    CemeteryObelisk,
    CemeteryPedestal,
    CemeteryStoneWall,
    CemeteryWallMetadata,
    GargoyleOnPedestal,
    FallenCemeteryCross,
    FallenCemeteryHeadstone,
    RuinedCemeteryWall,
    StoneGargoyle,
    StoneFrameGrave,
    StoneTomb,
} from '@/babylon/world/statics/objects/cemeteryObjects'

const isEmbeddedInSnow = (type: number) => isShrubType(type) || type === 281

export const StaticsManager = {
    prefabs: {
        shrub2x2: null as Prefab | null,
        shrub1x1_tall: null as Prefab | null,
        shrub1x1_small: null as Prefab | null,
    },
    allStatics : [] as StaticObject[],
    visibleStatics : [] as StaticObject[],
    dungeonEntrances: new Set<StaticObject>(),
    walkableObjectsByTile: new Map<string, StaticObject>(),
    activeBarrel: null as CampBarrel | null,
    animatingBarrels: new Set<CampBarrel>(),
    deletePreviewObjects: new Set<StaticObject>(),
    deletePreviewKey: '',
    deletePreviewStartTime: 0,

    initialize(scene: Scene) {
        this.prefabs.shrub2x2 = PrefabShrub2x2.getPrefab(scene)
        this.prefabs.shrub1x1_tall = PrefabShrub1x1_tall.getPrefab(scene)
        this.prefabs.shrub1x1_small = PrefabShrub1x1_small.getPrefab(scene)
        StaticEquipPartsRenderer.initialize(WorldRenderer.worldParentNode!)
    },

    addAllShadowCasters() {
        Object.values(this.prefabs).forEach(prefab => {
            Lights.addShadowCaster(prefab!.mesh, true, true)
        })
    },

    consumeObjects(data: Array<{ tp: number, x: number, z: number, meta?: WallTorchMetadata | TorchStandMetadata | LanternStandMetadata | FireplaceMetadata | CemeteryEmberBowlMetadata | StoneEntranceMetadata | PalisadeMetadata | WalkableBlockMetadata | CampObjectMetadata | CampFenceMetadata | CemeteryObjectMetadata | CemeteryWallMetadata, tmp?: boolean }>) {
        data.forEach(obj => {
            this.addObject(obj, false)
        })
        this.resolveStackedStaticPositions()
    },

    addObject(obj: { tp: number, x: number, z: number, meta?: WallTorchMetadata | TorchStandMetadata | LanternStandMetadata | FireplaceMetadata | CemeteryEmberBowlMetadata | StoneEntranceMetadata | PalisadeMetadata | WalkableBlockMetadata | CampObjectMetadata | CampFenceMetadata | CemeteryObjectMetadata | CemeteryWallMetadata, tmp?: boolean }, resolveStacking = true) {
        const block = WorldDataManager.getBlockMap()[obj.x][obj.z]
        const y = block.totalHeight - (isEmbeddedInSnow(obj.tp) && block.snowed ? 0.1 : 0)
        const pos = new Vector3(obj.x, y, obj.z)
        const rotation = Math.floor(Math.random() * 4) * Math.PI / 2
        const previousCount = this.allStatics.length

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
            case 203:
            case 204: this.allStatics.push(new PalisadeWall2(
                obj.tp,
                pos,
                MaterialEnum1.WOOD_3.uv,
                MaterialEnum1.WOOD_1.uv,
                obj.meta as PalisadeMetadata,
            )); break
            case 205: this.allStatics.push(new SpikedPalisade(
                obj.tp,
                pos,
                MaterialEnum1.WOOD_1.uv,
                obj.meta as SpikedPalisadeMetadata,
            )); break
            case 206: {
                const metadata = obj.meta as WalkableBlockMetadata
                const material = metadata?.material === 'STONE_GRAY'
                    ? MaterialEnum1.BRICK_GRAY.uv
                    : metadata?.material === 'STONE_RED'
                        ? MaterialEnum1.BRICK_RED.uv
                        : MaterialEnum1.WOOD_1.uv
                this.allStatics.push(new WalkableBlock(obj.tp, pos, material, metadata))
                break
            }
            case 207: this.allStatics.push(new CampFence(
                obj.tp,
                pos,
                MaterialEnum1.WOOD_3.uv,
                MaterialEnum1.WOOD_1.uv,
                obj.meta as CampFenceMetadata,
            )); break
            case 208: this.allStatics.push(new CemeteryIronFence(obj.tp, pos, MaterialEnum1.BRICK_DARK_GRAY.uv, MaterialEnum1.STEEL_1.uv, obj.meta as CemeteryWallMetadata)); break
            case 209: this.allStatics.push(new RuinedCemeteryWall(obj.tp, pos, MaterialEnum1.BRICK_GRAY.uv, MaterialEnum1.BRICK_GRAY.uv, obj.meta as CemeteryWallMetadata)); break
            case 210: this.allStatics.push(new CemeteryStoneWall(obj.tp, pos, MaterialEnum1.BRICK_GRAY.uv, MaterialEnum1.BRICK_GRAY.uv, obj.meta as CemeteryWallMetadata)); break

            case 221: this.allStatics.push(new Wall3(obj.tp, pos, rotation, MaterialEnum1.BRICK_GRAY.uv)); break
            case 222: this.allStatics.push(new Wall3(obj.tp, pos, rotation, MaterialEnum1.BRICK_RED.uv)); break

            case 241: this.allStatics.push(new FireplaceSmall(obj.tp, pos, rotation, MaterialEnum1.WOOD_1.uv, obj.tmp !== true, obj.meta as FireplaceMetadata)); break
            case 242: this.allStatics.push(new FireplaceLarge(obj.tp, pos, rotation, MaterialEnum1.WOOD_1.uv, obj.tmp !== true, obj.meta as FireplaceMetadata)); break
            case 261: this.allStatics.push(new WallTorch(obj.tp, pos, MaterialEnum1.WOOD_1.uv, obj.meta as WallTorchMetadata)); break
            case 262: this.allStatics.push(new TorchStand(
                obj.tp,
                pos,
                MaterialEnum1.ROCK1.uv,
                MaterialEnum1.STEEL_1.uv,
                MaterialEnum1.WOOD_1.uv,
                obj.meta as TorchStandMetadata,
            )); break
            case 263: this.allStatics.push(new LanternStand(
                obj.tp,
                pos,
                MaterialEnum1.ROCK1.uv,
                MaterialEnum1.STEEL_1.uv,
                obj.meta as LanternStandMetadata,
            )); break
            case 281: {
                const entrance = new StoneEntrance(obj.tp, pos, MaterialEnum1.BRICK_GRAY.uv, obj.meta as StoneEntranceMetadata)
                this.allStatics.push(entrance)
                this.dungeonEntrances.add(entrance)
                break
            }
            case 301: this.allStatics.push(new CampBench(obj.tp, pos, MaterialEnum1.WOOD_1.uv, MaterialEnum1.WOOD_3.uv, obj.meta as CampObjectMetadata)); break
            case 302: this.allStatics.push(new PlankPile(obj.tp, pos, MaterialEnum1.WOOD_2.uv, MaterialEnum1.WOOD_3.uv, obj.meta as CampObjectMetadata)); break
            case 303: this.allStatics.push(new LogPile(obj.tp, pos, MaterialEnum1.WOOD_3.uv, MaterialEnum1.WOOD_1.uv, obj.meta as CampObjectMetadata)); break
            case 304: this.allStatics.push(new SupplyCrate(obj.tp, pos, MaterialEnum1.WOOD_2.uv, MaterialEnum1.WOOD_3.uv, obj.meta as CampObjectMetadata)); break
            case 305: this.allStatics.push(new CampBarrel(obj.tp, pos, MaterialEnum1.WOOD_1.uv, MaterialEnum1.STEEL_1.uv, MaterialEnum1.WOOD_2.uv, obj.meta as CampObjectMetadata)); break
            case 306: this.allStatics.push(new HayStack(obj.tp, pos, MaterialEnum1.HAY.uv)); break
            case 307: this.allStatics.push(new StumpWithAxe(
                obj.tp,
                pos,
                MaterialEnum1.WOOD_3.uv,
                MaterialEnum1.WOOD_CUT.uv,
                StaticEquipPartsRenderer.getPrefab(WeaponModelsCb.HAND_AXE.id),
                obj.meta as CampObjectMetadata,
            )); break
            case 321: this.allStatics.push(new CemeteryHeadstone(obj.tp, pos, MaterialEnum1.ROCK1.uv, MaterialEnum1.BRICK_DARK_GRAY.uv, obj.meta as CemeteryObjectMetadata)); break
            case 322: this.allStatics.push(new CemeteryCross(obj.tp, pos, MaterialEnum1.ROCK1.uv, MaterialEnum1.BRICK_DARK_GRAY.uv, obj.meta as CemeteryObjectMetadata)); break
            case 323: this.allStatics.push(new StoneTomb(obj.tp, pos, MaterialEnum1.BRICK_GRAY.uv, MaterialEnum1.ROCK1.uv, obj.meta as CemeteryObjectMetadata)); break
            case 324: this.allStatics.push(new CemeteryObelisk(obj.tp, pos, MaterialEnum1.BRICK_DARK_GRAY.uv, MaterialEnum1.ROCK1.uv, obj.meta as CemeteryObjectMetadata)); break
            case 325: this.allStatics.push(new StoneGargoyle(obj.tp, pos, MaterialEnum1.ROCK1.uv, MaterialEnum1.BRICK_DARK_GRAY.uv, obj.meta as CemeteryObjectMetadata)); break
            case 328: this.allStatics.push(new GargoyleOnPedestal(obj.tp, pos, MaterialEnum1.BRICK_DARK_GRAY.uv, MaterialEnum1.ROCK1.uv, obj.meta as CemeteryObjectMetadata)); break
            case 329:
            case 330: this.allStatics.push(new StoneFrameGrave(
                obj.tp,
                pos,
                MaterialEnum1.BRICK_GRAY.uv,
                MaterialEnum1.ROCK1.uv,
                MaterialEnum1.WOOD_1.uv,
                obj.meta as CemeteryObjectMetadata,
            )); break
            case 331: this.allStatics.push(new CemeteryHeadstone2(obj.tp, pos, MaterialEnum1.ROCK1.uv, MaterialEnum1.BRICK_DARK_GRAY.uv, obj.meta as CemeteryObjectMetadata)); break
            case 332: this.allStatics.push(new CemeteryHeadstone3(obj.tp, pos, MaterialEnum1.ROCK1.uv, MaterialEnum1.BRICK_DARK_GRAY.uv, obj.meta as CemeteryObjectMetadata)); break
            case 333: this.allStatics.push(new CemeteryPedestal(obj.tp, pos, MaterialEnum1.BRICK_DARK_GRAY.uv, MaterialEnum1.ROCK1.uv, obj.meta as CemeteryObjectMetadata)); break
            case 334: this.allStatics.push(new CemeteryCrossPedestal(obj.tp, pos, MaterialEnum1.ROCK1.uv, MaterialEnum1.BRICK_DARK_GRAY.uv, obj.meta as CemeteryObjectMetadata)); break
            case 335: this.allStatics.push(new FallenCemeteryCross(obj.tp, pos, MaterialEnum1.ROCK1.uv)); break
            case 336: this.allStatics.push(new FallenCemeteryHeadstone(obj.tp, pos, MaterialEnum1.ROCK1.uv, MaterialEnum1.BRICK_DARK_GRAY.uv)); break
            case 337: this.allStatics.push(new CemeteryEmberBowl(
                obj.tp,
                pos,
                MaterialEnum1.BRICK_DARK_GRAY.uv,
                MaterialEnum1.EMBERS.uv,
                obj.meta as CemeteryEmberBowlMetadata,
            )); break
            default:
                break
        }

        if (this.allStatics.length > previousCount) {
            const added = this.allStatics[this.allStatics.length - 1]
            if (added.getWalkableHeight() !== null) {
                for (let offsetX = 0; offsetX < added.getSizeX(); offsetX++) {
                    for (let offsetZ = 0; offsetZ < added.getSizeZ(); offsetZ++) {
                        this.walkableObjectsByTile.set(`${obj.x + offsetX};${obj.z + offsetZ}`, added)
                    }
                }
            }
            if (resolveStacking) this.resolveStackedStaticPositions()
        }
    },

    resolveStackedStaticPositions() {
        const surfaceHeights = new Map<string, number>()
        for (const obj of this.allStatics) {
            const surfaceHeight = obj.getPlacementSurfaceHeight()
            if (surfaceHeight == null || obj.shouldPlaceOnStatic()) continue
            const key = `${obj.position.x};${obj.position.z}`
            surfaceHeights.set(key, Math.max(surfaceHeights.get(key) ?? 0, surfaceHeight))
        }

        for (const obj of this.allStatics) {
            if (!obj.shouldPlaceOnStatic()) continue
            const surfaceHeight = surfaceHeights.get(`${obj.position.x};${obj.position.z}`) ?? 0
            obj.renderPosition.y = obj.position.y + surfaceHeight
        }
    },

    recountYPositions() {
        this.allStatics.forEach(obj => {
            const block = WorldDataManager.getBlockMap()[Math.floor(obj.position.x)][Math.floor(obj.position.z)]
            const y = block.totalHeight - (isEmbeddedInSnow(obj.type) && block.snowed ? 0.1 : 0)
            obj.position.y = y
            obj.renderPosition.y = y
        })
        this.resolveStackedStaticPositions()
    },

    removeObjects(data: Array<{ x: number, z: number, tp?: number }>) {
        data.forEach(obj => {
            this.removeObjectAt(obj.x, obj.z, obj.tp)
        })
    },

    removeObjectAt(x: number, z: number, type?: number) {
        for (let i = 0; i < this.allStatics.length; i++) {
            if (this.allStatics[i].position.x === x && this.allStatics[i].position.z === z
                && (type === undefined || this.allStatics[i].type === type)) {
                const obj = this.allStatics[i]
                this.deletePreviewObjects.delete(obj)
                if (obj instanceof CampBarrel) {
                    obj.clearRenderMatrices()
                    this.animatingBarrels.delete(obj)
                    if (this.activeBarrel === obj) this.activeBarrel = null
                }
                this.dungeonEntrances.delete(obj)
                for (const [tile, walkable] of this.walkableObjectsByTile) {
                    if (walkable === obj) this.walkableObjectsByTile.delete(tile)
                }
                obj.dispose()
                this.allStatics.splice(i, 1)
                this.resolveStackedStaticPositions()
                StaticFireParticleManager.flush()
                break
            }
        }
    },

    clearWorld() {
        Lights.clearStaticLights()
        this.allStatics.forEach((obj) => obj.dispose())
        this.allStatics = []
        this.visibleStatics = []
        this.dungeonEntrances.clear()
        this.walkableObjectsByTile.clear()
        this.activeBarrel = null
        this.animatingBarrels.clear()
        this.deletePreviewObjects.clear()
        this.deletePreviewKey = ''
        this.renderObjects()
    },

    onFrame(timeRate: number, time: number) {
        const closest = MyPlayer.myChar
            ? this.getClosestStaticInDistance(305, MyPlayer.myChar.pos, 2)
            : null
        const activeBarrel = closest instanceof CampBarrel && typeof closest.status?.containerId === 'string'
            ? closest
            : null
        if (activeBarrel !== this.activeBarrel) {
            if (this.activeBarrel) {
                this.activeBarrel.setBounce(false, time)
                this.animatingBarrels.add(this.activeBarrel)
            }
            this.activeBarrel = activeBarrel
            if (this.activeBarrel) {
                this.activeBarrel.setBounce(true, time)
                this.animatingBarrels.add(this.activeBarrel)
            }
        }

        let bufferChanged = false
        for (const barrel of this.animatingBarrels) {
            bufferChanged = barrel.onFrame(timeRate, time) || bufferChanged
            if (!barrel.isAnimating()) this.animatingBarrels.delete(barrel)
        }
        if (bufferChanged) WorldRenderer.block1!.mesh.thinInstanceBufferUpdated('matrix')
    },

    updateDeletePreview(active: boolean, x: number, z: number, time: number, allowedTypes?: Set<number>) {
        const targets = active
            ? this.getObjectsOnTile(x, z).filter((obj) => !allowedTypes || allowedTypes.has(obj.type))
            : []
        const targetKey = targets.map((obj) => `${obj.type}:${obj.position.x}:${obj.position.z}`).sort().join('|')
        if (targetKey !== this.deletePreviewKey) {
            const changedMeshes = new Set(Array.from(this.deletePreviewObjects)
                .flatMap((obj) => obj.applyDeleteBounceOffset(0)))
            changedMeshes.forEach((mesh) => mesh.thinInstanceBufferUpdated('matrix'))
            this.deletePreviewObjects = new Set(targets)
            this.deletePreviewKey = targetKey
            this.deletePreviewStartTime = time
        }
        if (this.deletePreviewObjects.size === 0) return

        const elapsed = time - this.deletePreviewStartTime
        const offset = ((Math.sin((elapsed * 0.008) - (Math.PI / 2)) + 1) * 0.5) * 0.175
        const changedMeshes = new Set(Array.from(this.deletePreviewObjects)
            .flatMap((obj) => obj.applyDeleteBounceOffset(offset)))
        changedMeshes.forEach((mesh) => mesh.thinInstanceBufferUpdated('matrix'))
    },

    getObjectsOnTile(x: number, z: number): StaticObject[] {
        let targets = this.allStatics.filter((obj) => x >= obj.position.x && x < obj.position.x + obj.getSizeX()
            && z >= obj.position.z && z < obj.position.z + obj.getSizeZ())
        if (targets.length === 0) {
            targets = this.allStatics.filter((obj) => obj.type === 261 && (
                (obj.status?.facing === '-X' && obj.position.x - 1 === x && obj.position.z === z)
                || (obj.status?.facing === '+X' && obj.position.x + 1 === x && obj.position.z === z)
                || (obj.status?.facing === '-Z' && obj.position.x === x && obj.position.z - 1 === z)
                || (obj.status?.facing === '+Z' && obj.position.x === x && obj.position.z + 1 === z)
            ))
        }
        return targets
    },

    renderObjects() {
        Object.values(this.prefabs).forEach(prefab => {
            prefab?.clearMatrices()
        })
        StaticEquipPartsRenderer.clear()

        this.allStatics.forEach((obj) => {
            if (obj instanceof CampBarrel) obj.clearRenderMatrices()
        })
        this.resolveConnectingCorners()
        this.updateVisibleObjects()
        for (const element of this.visibleStatics) {
            const blockStart = WorldRenderer.block1!.matrices.length
            const prefabStart = element.prefab?.matrices.length ?? 0
            element.render()
            element.captureRenderMatrices(blockStart, prefabStart)
        }
        StaticFireParticleManager.flush()

        Object.values(this.prefabs).forEach(prefab => {
            prefab!.setThinInstanceBuffers()

            if (prefab!.mesh.thinInstanceCount && prefab!.mesh.thinInstanceCount > 0) {
                prefab!.mesh.setEnabled(true)
            } else {
                prefab!.mesh.setEnabled(false)
            }
        })
        StaticEquipPartsRenderer.flush()
    },

    resolveConnectingCorners() {
        const palisades = this.allStatics.filter((obj): obj is PalisadeWall2 => obj instanceof PalisadeWall2)
        const fences = this.allStatics.filter((obj): obj is CampFence => obj instanceof CampFence)
        const cemeteryFences = this.allStatics.filter((obj): obj is CemeteryIronFence => obj instanceof CemeteryIronFence)
        const cemeteryWalls = this.allStatics.filter((obj): obj is RuinedCemeteryWall => obj instanceof RuinedCemeteryWall)
        const cemeteryStoneWalls = this.allStatics.filter((obj): obj is CemeteryStoneWall => obj instanceof CemeteryStoneWall)

        this.resolveCorners(palisades)
        this.resolveCorners(fences)
        this.resolveCorners(cemeteryFences)
        this.resolveCorners(cemeteryWalls)
        this.resolveCorners(cemeteryStoneWalls)
    },

    resolveCorners<T extends PalisadeWall2 | CampFence | CemeteryIronFence | RuinedCemeteryWall | CemeteryStoneWall>(objects: T[]) {
        const objectsByTile = new Map(objects.map((obj) => [`${obj.position.x};${obj.position.z}`, obj]))

        for (const object of objects) {
            object.setCornerDirections(null)
            const axisDirections = object.getOrientation() === 'X'
                ? [{x: -1, z: 0}, {x: 1, z: 0}]
                : [{x: 0, z: -1}, {x: 0, z: 1}]
            const perpendicularDirections = object.getOrientation() === 'X'
                ? [{x: 0, z: -1}, {x: 0, z: 1}]
                : [{x: -1, z: 0}, {x: 1, z: 0}]
            const continuations = axisDirections.filter((direction) => {
                const neighbor = objectsByTile.get(`${object.position.x + direction.x};${object.position.z + direction.z}`)
                return neighbor?.getOrientation() === object.getOrientation()
            })
            const turns = perpendicularDirections.filter((direction) => {
                const neighbor = objectsByTile.get(`${object.position.x + direction.x};${object.position.z + direction.z}`)
                return neighbor && neighbor.getOrientation() !== object.getOrientation()
            })

            if (continuations.length === 1 && turns.length === 1) {
                object.setCornerDirections([continuations[0], turns[0]])
            }
        }
    },

    renderTerrainBlocks(terrainMatrices: Matrix[], terrainUvData: Vector2[]) {
        this.allStatics.forEach((obj) => obj.clearRenderMatrixCapture())
        this.updateVisibleObjects()
        for (const element of this.visibleStatics) {
            const start = terrainMatrices.length
            element.renderTerrain?.(terrainMatrices, terrainUvData)
            element.captureTerrainMatrices(start, terrainMatrices)
        }
    },

    updateVisibleObjects() {
        const previousVisible = new Set(this.visibleStatics)
        const nextVisible: StaticObject[] = []

        for (const obj of this.allStatics) {
            const x = Math.floor(obj.position.x)
            const z = Math.floor(obj.position.z)
            if (ViewportManager.isPointInVisibleMatrix(x, z, 2)) {
                nextVisible.push(obj)
                if (!previousVisible.has(obj)) {
                    obj.onVisible()
                }
            } else if (previousVisible.has(obj)) {
                obj.onHidden()
            }

            if (obj instanceof FireplaceSmall || obj instanceof FireplaceLarge || obj instanceof WallTorch
                || obj instanceof TorchStand || obj instanceof LanternStand || obj instanceof CemeteryEmberBowl
                || obj instanceof StoneEntrance) {
                obj.setLightVisible(ViewportManager.isPointNearVisibleBounds(
                    obj.renderPosition.x,
                    obj.renderPosition.z,
                    obj.getLightVisibilityRadius(),
                ))
            }
        }

        this.visibleStatics = nextVisible
        StaticFireParticleManager.flush()
        return this.visibleStatics
    },

    resolveSounds() {
        if (!MyPlayer.myChar) {
            return
        }

        const soundVolumes = new Map<string, number>()

        for (const obj of this.allStatics) {
            const staticInfo = StaticObjectsCodebook.get(obj.type)
            if (!staticInfo || !staticInfo.soundKey || staticInfo.soundDistance <= 0) {
                continue
            }

            const distance = this.getDistanceToStaticFootprint(MyPlayer.myChar.pos, obj.position, staticInfo.size)
            if (distance >= staticInfo.soundDistance) {
                continue
            }

            const volumeRatio = 1 - ((distance - 1) / staticInfo.soundDistance)
            const currentVolume = soundVolumes.get(staticInfo.soundKey) || 0
            if (volumeRatio > currentVolume) {
                soundVolumes.set(staticInfo.soundKey, volumeRatio)
            }
        }

        for (const soundKey of AudioManager.staticObjectSounds.keys()) {
            const volumeRatio = soundVolumes.get(soundKey) || 0
            if (volumeRatio > 0) {
                AudioManager.playStaticObjectSound(soundKey, volumeRatio)
            } else {
                AudioManager.stopPlayingStaticObjectSound(soundKey)
            }
        }
    },

    getDistanceToStaticFootprint(playerPos: Vector3, objPos: Vector3, size: number): number {
        const minX = objPos.x
        const minZ = objPos.z
        const maxX = objPos.x + size - 1
        const maxZ = objPos.z + size - 1

        const nearestX = Math.max(minX, Math.min(playerPos.x, maxX))
        const nearestZ = Math.max(minZ, Math.min(playerPos.z, maxZ))
        const dx = playerPos.x - nearestX
        const dz = playerPos.z - nearestZ
        return Math.sqrt(dx * dx + dz * dz)
    },

    getClosestStaticInDistance(type: number, position: Vector3, maxDistance: number): StaticObject | null {
        let closest: StaticObject | null = null
        let closestDistance = maxDistance
        for (const obj of this.allStatics) {
            if (obj.type !== type) {
                continue
            }
            const distance = this.getDistanceToStaticFootprint(position, obj.position, obj.getSize())
            if (distance <= closestDistance) {
                closest = obj
                closestDistance = distance
            }
        }
        return closest
    },

    getPointInStatic(x: number, z: number, size: number): { x: number, z: number } | null {
        for (const obj of this.allStatics) {
            if (obj.isObjectInCollision(x, z, size)) {
                return { x: obj.renderPosition.x, z: obj.renderPosition.z }
            }
        }
        return null
    },

    getWalkableHeightAtTile(x: number, z: number): number {
        return this.walkableObjectsByTile.get(`${x};${z}`)?.getWalkableHeight() ?? 0
    }
}
