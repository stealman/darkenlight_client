import { Matrix, Scene, Vector2, Vector3 } from '@babylonjs/core'
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
import { PalisadeMetadata, PalisadeWall2, StoneEntrance, StoneEntranceMetadata, Wall2, Wall3 } from '@/babylon/world/statics/objects/walls'
import { SpikedPalisade, SpikedPalisadeMetadata } from '@/babylon/world/statics/objects/spikedPalisade'
import { TorchStand, TorchStandMetadata } from '@/babylon/world/statics/objects/torchStand'
import { WallTorch, WallTorchMetadata } from '@/babylon/world/statics/objects/wallTorch'
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
    LogPile,
    PlankPile,
    SupplyCrate,
} from '@/babylon/world/statics/objects/campObjects'

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

    initialize(scene: Scene) {
        this.prefabs.shrub2x2 = PrefabShrub2x2.getPrefab(scene)
        this.prefabs.shrub1x1_tall = PrefabShrub1x1_tall.getPrefab(scene)
        this.prefabs.shrub1x1_small = PrefabShrub1x1_small.getPrefab(scene)
    },

    addAllShadowCasters() {
        Object.values(this.prefabs).forEach(prefab => {
            Lights.addShadowCaster(prefab!.mesh, true, true)
        })
    },

    consumeObjects(data: Array<{ tp: number, x: number, z: number, meta?: WallTorchMetadata | StoneEntranceMetadata | PalisadeMetadata | WalkableBlockMetadata | CampObjectMetadata | CampFenceMetadata, tmp?: boolean }>) {
        data.forEach(obj => {
            this.addObject(obj)
        })
    },

    addObject(obj: { tp: number, x: number, z: number, meta?: WallTorchMetadata | StoneEntranceMetadata | PalisadeMetadata | WalkableBlockMetadata | CampObjectMetadata | CampFenceMetadata, tmp?: boolean }) {
        const block = WorldDataManager.getBlockMap()[obj.x][obj.z]
        const y = block.totalHeight - (isShrubType(obj.tp) && block.snowed ? 0.1 : 0)
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

            case 221: this.allStatics.push(new Wall3(obj.tp, pos, rotation, MaterialEnum1.BRICK_GRAY.uv)); break
            case 222: this.allStatics.push(new Wall3(obj.tp, pos, rotation, MaterialEnum1.BRICK_RED.uv)); break

            case 241: this.allStatics.push(new FireplaceSmall(obj.tp, pos, rotation, MaterialEnum1.WOOD_1.uv, obj.tmp !== true)); break
            case 242: this.allStatics.push(new FireplaceLarge(obj.tp, pos, rotation, MaterialEnum1.WOOD_1.uv, obj.tmp !== true)); break
            case 261: this.allStatics.push(new WallTorch(obj.tp, pos, MaterialEnum1.WOOD_1.uv, obj.meta as WallTorchMetadata)); break
            case 262: this.allStatics.push(new TorchStand(
                obj.tp,
                pos,
                MaterialEnum1.ROCK1.uv,
                MaterialEnum1.STEEL_1.uv,
                MaterialEnum1.WOOD_1.uv,
                obj.meta as TorchStandMetadata,
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
            default:
                break
        }

        if (this.allStatics.length > previousCount) {
            const added = this.allStatics[this.allStatics.length - 1]
            if (added.getWalkableHeight() !== null) {
                this.walkableObjectsByTile.set(`${obj.x};${obj.z}`, added)
            }
        }
    },

    recountYPositions() {
        this.allStatics.forEach(obj => {
            const block = WorldDataManager.getBlockMap()[Math.floor(obj.position.x)][Math.floor(obj.position.z)]
            const y = block.totalHeight - (isShrubType(obj.type) && block.snowed ? 0.1 : 0)
            obj.position.y = y
            obj.renderPosition.y = y
        })
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
                this.dungeonEntrances.delete(obj)
                if (this.walkableObjectsByTile.get(`${x};${z}`) === obj) {
                    this.walkableObjectsByTile.delete(`${x};${z}`)
                }
                obj.dispose()
                this.allStatics.splice(i, 1)
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
        this.renderObjects()
    },

    renderObjects() {
        Object.values(this.prefabs).forEach(prefab => {
            prefab?.clearMatrices()
        })

        this.resolveConnectingCorners()
        this.updateVisibleObjects()
        for (const element of this.visibleStatics) {
            element.render()
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
    },

    resolveConnectingCorners() {
        const palisades = this.allStatics.filter((obj): obj is PalisadeWall2 => obj instanceof PalisadeWall2)
        const fences = this.allStatics.filter((obj): obj is CampFence => obj instanceof CampFence)

        this.resolveCorners(palisades)
        this.resolveCorners(fences)
    },

    resolveCorners<T extends PalisadeWall2 | CampFence>(objects: T[]) {
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
        this.updateVisibleObjects()
        for (const element of this.visibleStatics) {
            element.renderTerrain?.(terrainMatrices, terrainUvData)
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

            if (obj instanceof FireplaceLarge) {
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
