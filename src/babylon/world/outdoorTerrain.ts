import { BoundingInfo, Frustum, Matrix, TransformNode, Vector3, type Mesh } from '@babylonjs/core'
import type { Plane } from '@babylonjs/core'
import { MapBlock } from '@/data/worldDataManager'
import { Lights } from '@/babylon/scene/lights'
import { ViewportManager } from '@/utils/viewport'
import { Settings } from '@/settings/settings'
import { TERRAIN_ATLAS_REGION_SIZE } from './terrainAtlasPlacement'
import { TERRAIN_RENDER_BORDER, visitBakedPaving } from './terrainRenderData'
import type { TerrainRenderData } from './terrainRenderData'
import { createTerrainSurfaceRenderer } from '@/adminUtils/terrainSurfaceRenderer'
import { terrainWithoutSnow } from '@/adminUtils/terrainLocalTransitions'
import { createTerrainFoliageRenderer } from '@/adminUtils/terrainFoliageRenderer'
import { createGrassRenderer, GAME_GRASS_ENABLED, GRASS_CONTACT_LIMIT, GRASS_MAX_BEND } from './grassRenderer'
import type { GrassTuft } from './grassRenderer'
import { getGrassSources } from './grassPlacement'
import { BuildingManager } from './buildings/buildingManager'
import { StaticsManager } from './statics/staticsManager'
import { TreeManager } from './treeManager'
import { WATER_BLOCK_TYPE } from './terrainManager'
import { sameSnowMask } from './snowCoverMask'
import { OutdoorInstanceBatch } from './outdoorInstanceBatch'
import type { OutdoorInstance } from './outdoorInstanceBatch'
import { PBRCustomMaterial } from '@babylonjs/materials'
import type { TerrainContactShadow } from './terrainContactShadow'
import { createOutdoorPaving } from './outdoorPaving'
import { visitPavingStones } from './stonePathLayout'
import type { PavingStone } from './stonePathLayout'
import { outdoorSurfaceHeight } from './terrainRoofShape'
import type { TerrainStepField } from './terrainStepField'

export { createIndoorWaterFloor } from '@/adminUtils/terrainPreviewGeometry'
export { createDungeonRockMaterial, dungeonRockUv } from '@/adminUtils/terrainAtlasPreview'

const REGION_SIZE = TERRAIN_ATLAS_REGION_SIZE
const GRASS_TILE_RANGE = 20

type GrassTile = {x: number, z: number, tufts: GrassTuft[], minimum: Vector3, maximum: Vector3}
type VisibleTile = {seen: number, faces?: OutdoorInstance[], foliage?: OutdoorInstance[], grass?: GrassTile}
type TerrainPatch = {key: number, span: number, faces: OutdoorInstance[]}
type Region = {
    blocks: MapBlock[]
    hiddenSnow: number[]
    faces: (OutdoorInstance[] | undefined)[]
    patches: (TerrainPatch | undefined)[]
    used: number
    map: MapBlock[][]
    left: number
    top: number
    visible: number[]
    foliage?: (OutdoorInstance[] | undefined)[]
    grass?: (GrassTile | undefined)[]
    foliageKey?: string
    buildingRevision?: number
    treeRevision?: number
    staticRevision?: number
    revision?: number
    snowRevision: number
    hasPaving: boolean
}

function replaceInstances(previous?: OutdoorInstance[], next?: OutdoorInstance[]) {
    if (previous === next) return
    if (previous) for (const instance of previous) instance.batch.remove(instance)
    if (next) for (const instance of next) instance.batch.add(instance)
}

function grassTileInView({minimum, maximum}: GrassTile, planes: Plane[], padding: number) {
    for (const {normal, d} of planes) {
        // Test the corner farthest inside each plane instead of testing every root or corner.
        const x = normal.x >= 0 ? maximum.x + padding : minimum.x - padding
        const y = normal.y >= 0 ? maximum.y : minimum.y
        const z = normal.z >= 0 ? maximum.z + padding : minimum.z - padding
        if (x * normal.x + y * normal.y + z * normal.z + d < 0) return false
    }
    return true
}

type TerrainView = {minX: number, minZ: number, maxX: number, maxZ: number}

export function createOutdoorTerrain(parent: TransformNode, fixedView?: TerrainView, contactShadow?: TerrainContactShadow,
    terrainSteps?: TerrainStepField) {
    const terrain = new TransformNode('outdoorTerrain', parent.getScene())
    terrain.parent = parent
    const detailedPaving = Settings.detailLevel.paving === 'detailed'
    const renderer = createTerrainSurfaceRenderer(parent.getScene(), terrain, new Vector3(0, 0, 1), undefined, detailedPaving)
    for (const material of new Set(renderer.meshes.map(mesh => mesh.material))) {
        if (material instanceof PBRCustomMaterial) {
            terrainSteps?.configure(material, renderer.stepMaterials.get(material))
            terrainSteps?.configureGlow(material)
            contactShadow?.configure(material, false, !!terrainSteps)
        }
    }
    for (const mesh of renderer.meshes) {
        const {minimum, maximum} = mesh.getBoundingInfo()
        mesh.rawBoundingInfo = new BoundingInfo(minimum, maximum)
    }
    const batches = new Map(renderer.meshes.map(mesh => [mesh, new OutdoorInstanceBatch(mesh)]))
    const paving = createOutdoorPaving(terrain, detailedPaving, batch => batches.set(batch.mesh, batch), contactShadow, terrainSteps)
    const highDetail = Settings.isDetalLevelHigh()
    const lowDetail = Settings.isDetalLevelLow()
    const foliage = createTerrainFoliageRenderer(parent.getScene(), terrain, highDetail, highDetail ? 1 : 2 / 3, !lowDetail)
    const grass = GAME_GRASS_ENABLED ? createGrassRenderer(parent.getScene(), terrain, lowDetail ? 0 : GRASS_CONTACT_LIMIT,
        lowDetail ? 0 : highDetail ? 15 : 10, !lowDetail) : undefined
    for (const mesh of grass?.meshes ?? []) {
        mesh.receiveShadows = Settings.isShadowsEnabled()
        Lights.registerSharedLightMesh(mesh)
        mesh.onDisposeObservable.addOnce(() => Lights.unregisterSharedLightMesh(mesh))
    }
    const foliageBatches = new Map<Mesh, OutdoorInstanceBatch>()
    for (const mesh of foliage.meshes) {
        mesh.receiveShadows = Settings.isShadowsEnabled()
        Lights.registerSharedLightMesh(mesh)
        mesh.onDisposeObservable.addOnce(() => Lights.unregisterSharedLightMesh(mesh))
        foliageBatches.set(mesh, new OutdoorInstanceBatch(mesh))
    }
    const visibleTiles = new Map<number, VisibleTile>()
    const minimum = new Vector3()
    const maximum = new Vector3()
    const maximumFoliage = new Vector3()
    const foliageJobs: (() => void)[] = []
    const grassTufts: GrassTuft[] = []
    const grassFrustum = grass ? Frustum.GetPlanes(Matrix.Identity()) : []
    const grassDetail = lowDetail ? 'low' : highDetail ? 'high' : 'medium'
    let grassStats: ReturnType<ReturnType<typeof createGrassRenderer>['render']> | undefined
    let grassCenterX = 0, grassCenterZ = 0
    const refreshGrass = () => {
        if (!grass) return
        grassTufts.length = 0
        const camera = terrain.getScene().activeCamera
        const filterToCamera = camera && !fixedView
        if (filterToCamera) {
            camera.getViewMatrix()
            camera.getProjectionMatrix()
            Frustum.GetPlanesToRef(camera.getTransformationMatrix(), grassFrustum)
        }
        // Leave room for sub-tile camera motion between terrain refreshes.
        const travelPadding = Settings.isPhoneOrTablet() ? 0.75 : 0.35
        const reach = grass.interactionRadius
        for (const tile of visibleTiles.values()) {
            const placed = tile.grass
            if (!placed || Math.abs(placed.x - grassCenterX) > GRASS_TILE_RANGE
                || Math.abs(placed.z - grassCenterZ) > GRASS_TILE_RANGE) continue
            const couldBend = reach > 0 && placed.minimum.x <= grassCenterX + reach && placed.maximum.x >= grassCenterX - reach
                && placed.minimum.z <= grassCenterZ + reach && placed.maximum.z >= grassCenterZ - reach
            if (!filterToCamera || grassTileInView(placed, grassFrustum, travelPadding + (couldBend ? GRASS_MAX_BEND : 0))) {
                grassTufts.push(...placed.tufts)
            }
        }
        grass.setTufts(grassTufts)
        grassStats = grass.render(grassCenterX, grassCenterZ, grassDetail, 1, camera)
    }
    const flushBatches = (list: Iterable<OutdoorInstanceBatch>, upper: Vector3) => {
        for (const batch of list) {
            batch.flush()
            const mesh = batch.mesh
            if (mesh.thinInstanceCount) mesh.getBoundingInfo().reConstruct(minimum, upper, mesh.getWorldMatrix())
        }
    }
    const observer = terrain.getScene().onBeforeRenderObservable.add(() => {
        if (!terrain.isEnabled() || !foliageJobs.length) return
        foliageJobs.shift()!()
        flushBatches(foliageBatches.values(), maximumFoliage)
        refreshGrass()
    })
    terrain.onDisposeObservable.addOnce(() => {
        terrain.getScene().onBeforeRenderObservable.remove(observer)
        grass?.dispose()
    })
    const regions = new Map<number, Region>()
    let currentMap: MapBlock[][] | undefined
    let currentCompiled: TerrainRenderData | undefined
    let generation = 0
    let previousSnow = new Set<number>()
    let snowRevision = 0
    let previousBuildings = ''
    let buildingRevision = 0

    return {
        grass,
        getGrassStats() { return terrain.isEnabled() ? grassStats : undefined },
        setEnabled(enabled: boolean) { terrain.setEnabled(enabled) },
        render(blockMap: MapBlock[][], center: {x: number, y: number, z: number}, snowCoverMask: ReadonlySet<number>,
            revision?: number, compiled?: TerrainRenderData, originalBlocks?: WeakSet<MapBlock>) {
            if (currentMap !== blockMap || currentCompiled !== compiled) {
                currentMap = blockMap
                currentCompiled = compiled
                regions.clear()
                paving.resetSurface()
            }
            if (!sameSnowMask(previousSnow, snowCoverMask)) {
                previousSnow = new Set(snowCoverMask)
                snowRevision++
            }
            terrain.setEnabled(true)
            grassCenterX = center.x
            grassCenterZ = center.z
            foliageJobs.length = 0
            generation++
            const depth = blockMap[0]?.length ?? 0
            const minX = fixedView?.minX ?? Math.max(0, center.x + ViewportManager.minX)
            const minZ = fixedView?.minZ ?? Math.max(0, center.z + ViewportManager.minZ)
            const maxX = fixedView?.maxX ?? Math.min(blockMap.length - 1, center.x + ViewportManager.maxX)
            const maxZ = fixedView?.maxZ ?? Math.min(depth - 1, center.z + ViewportManager.maxZ)
            const firstX = Math.floor(minX / REGION_SIZE) * REGION_SIZE
            const firstZ = Math.floor(minZ / REGION_SIZE) * REGION_SIZE
            let maxHeight = 0
            let patchPadding = 1
            const isVisible = (x: number, z: number) =>
                !!fixedView || ViewportManager.isPointInVisibleMatrix(x, z, 2, blockMap[x][z].totalHeight, 0, center)
            const containsSnow = (x: number, z: number, block: MapBlock) =>
                block.snowed && snowCoverMask.has(x * blockMap.length + z)
            const buildings = Array.from(BuildingManager.buildings.values(), building => ({
                minX: building.data.x, minZ: building.data.z,
                maxX: building.data.x + building.getWidth(), maxZ: building.data.z + building.getDepth(),
            }))
            const buildingsKey = JSON.stringify(buildings)
            if (previousBuildings !== buildingsKey) {
                previousBuildings = buildingsKey
                buildingRevision++
            }
            const treeRevision = grass ? TreeManager.collisionGrid.revision : 0
            const staticRevision = grass ? StaticsManager.collisionGrid.revision : 0

            const prepareRegion = (x: number, z: number) => {
                const key = x * depth + z
                const previous = regions.get(key)
                if (previous && revision !== undefined && previous.revision === revision && previous.snowRevision === snowRevision) {
                    previous.used = generation
                    return previous
                }
                const left = Math.max(0, x - TERRAIN_RENDER_BORDER), top = Math.max(0, z - TERRAIN_RENDER_BORDER)
                const right = Math.min(blockMap.length, x + REGION_SIZE + TERRAIN_RENDER_BORDER)
                const bottom = Math.min(depth, z + REGION_SIZE + TERRAIN_RENDER_BORDER)
                if (previous) {
                    let dirty = false
                    let index = 0
                    let hiddenCount = 0
                    scan: for (let tx = left; tx < right; tx++) {
                        const row = blockMap[tx]
                        for (let tz = top; tz < bottom; tz++, index++) {
                            const block = row[tz]
                            if (previous.blocks[index] !== block
                                || (containsSnow(tx, tz, block) && previous.hiddenSnow[hiddenCount++] !== index)) {
                                dirty = true
                                break scan
                            }
                        }
                    }
                    if (!dirty && previous.hiddenSnow.length === hiddenCount) {
                        previous.used = generation
                        previous.revision = revision
                        previous.snowRevision = snowRevision
                        return previous
                    }
                }
                const region: Region = {blocks: [], hiddenSnow: [], faces: [], patches: [], used: generation, map: [], left, top, visible: [],
                    revision, snowRevision, hasPaving: false}
                const exposed = new Map<MapBlock, MapBlock>()
                let useBakedTerrain = !!compiled && compiled.width === blockMap.length && compiled.depth === depth
                const map = region.map = blockMap.slice(left, right).map((row, dx) => row.slice(top, bottom).map((block, dz) => {
                    const index = region.blocks.push(block) - 1
                    if (useBakedTerrain && !originalBlocks?.has(block)) useBakedTerrain = false
                    if ((block.stonePath || block.beigeStonePath) && left + dx >= x && left + dx < x + REGION_SIZE
                        && top + dz >= z && top + dz < z + REGION_SIZE) region.hasPaving = true
                    if (!containsSnow(left + dx, top + dz, block)) return block
                    region.hiddenSnow.push(index)
                    let bare = exposed.get(block)
                    if (!bare) {
                        bare = terrainWithoutSnow(block)
                        exposed.set(block, bare)
                    }
                    return bare
                }))
                const baked = useBakedTerrain && !region.hiddenSnow.length ? compiled : undefined
                renderer.render(map, {
                    includeTile: (tx, tz) => tx + left >= x && tx + left < x + REGION_SIZE
                        && tz + top >= z && tz + top < z + REGION_SIZE,
                    originX: left,
                    originZ: top,
                    compiled: baked,
                    compiledRegion: baked ? {x, z} : undefined,
                    submit(mesh, source, attributes) {
                        const batch = batches.get(mesh)!
                        for (const {kind, stride, values} of attributes) {
                            if (kind !== 'terrainSurface' && kind !== 'terrainWetTile') continue
                            for (let i = 0; i < values.length; i += stride) {
                                values[i] += left
                                values[i + 1] += top
                            }
                        }
                        source.forEachInstance((tile, matrix, uv, sourceIndex, span) => {
                            const localX = Math.floor(tile / (bottom - top))
                            const localZ = tile % (bottom - top)
                            const index = (localX + left - x) * REGION_SIZE + localZ + top - z
                            const translation = matrix.getTranslation()
                            matrix.setTranslationFromFloats(translation.x + left, translation.y, translation.z + top)
                            let faces: OutdoorInstance[]
                            if (span > 1) {
                                let patch = region.patches[index]
                                if (!patch) {
                                    // Use negative keys for patches in the shared visibility map.
                                    patch = {key: -1 - ((localX + left) * depth + localZ + top), span, faces: []}
                                    for (let dx = 0; dx < span; dx++) {
                                        for (let dz = 0; dz < span; dz++) region.patches[index + dx * REGION_SIZE + dz] = patch
                                    }
                                }
                                faces = patch.faces
                            } else {
                                faces = region.faces[index] ??= []
                            }
                            faces.push({batch, matrix, uv, attributes, index: sourceIndex, slot: -1})
                        })
                    },
                })
                if (region.hasPaving) {
                    const bounds = {minX: x, minZ: z, maxX: Math.min(x + REGION_SIZE, blockMap.length) - 1,
                        maxZ: Math.min(z + REGION_SIZE, depth) - 1}
                    const createInstance = paving.createRegionInstanceFactory()
                    const addStone = (stone: PavingStone, tx: number, tz: number) => {
                        if (tx < bounds.minX || tx > bounds.maxX || tz < bounds.minZ || tz > bounds.maxZ) return
                        const tile = (tx - x) * REGION_SIZE + tz - z
                        const faces = region.faces[tile] ??= []
                        faces.push(createInstance(stone))
                    }
                    if (useBakedTerrain && compiled) visitBakedPaving(compiled, bounds, addStone)
                    else {
                        const tileAt = (tx: number, tz: number) => blockMap[tx]?.[tz]
                        visitPavingStones(tileAt, (tx, tz) => outdoorSurfaceHeight(tileAt(tx, tz)), stone =>
                            addStone(stone, Math.round((stone.left + stone.right) / 2), Math.round((stone.front + stone.back) / 2)), bounds)
                    }
                }
                regions.set(key, region)
                return region
            }

            const prepareFoliage = (region: Region, x: number, z: number) => {
                region.visible.length = 0
                if (!grass && !foliageBatches.size) return
                if (region.foliage && region.buildingRevision === buildingRevision
                    && region.treeRevision === treeRevision && region.staticRevision === staticRevision) return
                const {left, top, map} = region
                const nearby = buildings.filter(bounds => bounds.maxX >= left && bounds.maxZ >= top
                    && bounds.minX < left + map.length && bounds.minZ < top + map[0].length)
                const grassSources = grass ? getGrassSources(x - 0.5, z - 0.5, x + REGION_SIZE - 0.5, z + REGION_SIZE - 0.5) : []
                const foliageKey = JSON.stringify([nearby, grassSources])
                region.buildingRevision = buildingRevision
                region.treeRevision = treeRevision
                region.staticRevision = staticRevision
                if (region.foliage && region.foliageKey === foliageKey) return
                // Keep scattering out of the movement update. A new region is prepared in one frame.
                region.foliage = undefined
                region.grass = undefined
                foliageJobs.push(() => {
                    const placed: Region['foliage'] = []
                    const placedGrass: NonNullable<Region['grass']> = []
                    const foliageMap = map.map(row => row.map(block => {
                        if (!block.heightOffset || block.type === WATER_BLOCK_TYPE) return block
                        return Object.assign(new MapBlock(block.height, block.type), block,
                            {heightOffset: 0, totalHeight: block.height})
                    }))
                    foliage.render(foliageMap, {
                        originX: left, originZ: top,
                        grassSources,
                        placeGrass: grass ? tuft => {
                            const m = tuft.matrix.m
                            const tileX = Math.round(m[12]), tileZ = Math.round(m[14])
                            const index = (tileX - x) * REGION_SIZE + tileZ - z
                            const radius = grass.footprintRadius * Math.hypot(m[0], m[2])
                            const maxY = m[13] + grass.bladeHeight * m[5]
                            const tile = placedGrass[index] ??= {x: tileX, z: tileZ, tufts: [], minimum: new Vector3(Infinity, Infinity, Infinity),
                                maximum: new Vector3(-Infinity, -Infinity, -Infinity)}
                            tile.minimum.set(Math.min(tile.minimum.x, m[12] - radius), Math.min(tile.minimum.y, m[13]),
                                Math.min(tile.minimum.z, m[14] - radius))
                            tile.maximum.set(Math.max(tile.maximum.x, m[12] + radius), Math.max(tile.maximum.y, maxY),
                                Math.max(tile.maximum.z, m[14] + radius))
                            tile.tufts.push(tuft)
                        } : undefined,
                        transitionWeight(tx, tz) {
                            const tileX = Math.round(tx), tileZ = Math.round(tz)
                            const block = map[tileX][tileZ]
                            if (block.snowed) return 0
                            for (let radius = 1; radius <= 2; radius++) {
                                for (let dx = -radius; dx <= radius; dx++) {
                                    const dz = radius - Math.abs(dx)
                                    const first = map[tileX + dx]?.[tileZ + dz]
                                    const second = map[tileX + dx]?.[tileZ - dz]
                                    if ([first, second].some(neighbor => neighbor?.height === block.height
                                        && neighbor.type > 0 && (neighbor.type !== block.type || neighbor.snowed))) return 1 / radius
                                }
                            }
                            return 0
                        },
                        visible(tx, tz) {
                            return tx + left >= x && tx + left < x + REGION_SIZE && tz + top >= z && tz + top < z + REGION_SIZE
                        },
                        canDecorate(tx, tz) {
                            const worldX = tx + left, worldZ = tz + top
                            return !BuildingManager.hasFloorAtTile(worldX, worldZ) && !nearby.some(bounds =>
                                worldX >= bounds.minX && worldX < bounds.maxX && worldZ >= bounds.minZ && worldZ < bounds.maxZ)
                        },
                        submit(mesh, matrices, uv) {
                            const batch = foliageBatches.get(mesh)!
                            for (let i = 0; i < matrices.length; i++) {
                                const matrix = matrices[i]
                                const {x: tx, y, z: tz} = matrix.getTranslation()
                                const index = (Math.round(tx) + left - x) * REGION_SIZE + Math.round(tz) + top - z
                                matrix.setTranslationFromFloats(tx + left, y, tz + top)
                                const instances = placed[index] ??= []
                                instances.push({batch, matrix, uv: uv[i], slot: -1})
                            }
                        },
                    })
                    region.foliage = placed
                    region.grass = placedGrass
                    region.foliageKey = foliageKey
                    for (const index of region.visible) {
                        const key = (x + Math.floor(index / REGION_SIZE)) * depth + z + index % REGION_SIZE
                        const visible = visibleTiles.get(key)!
                        replaceInstances(visible.foliage, placed[index])
                        visible.foliage = placed[index]
                        visible.grass = placedGrass[index]
                    }
                })
            }

            for (let x = firstX; x <= maxX; x += REGION_SIZE) {
                for (let z = firstZ; z <= maxZ; z += REGION_SIZE) {
                    let region: Region | undefined
                    const endX = Math.min(maxX + 1, x + REGION_SIZE)
                    const endZ = Math.min(maxZ + 1, z + REGION_SIZE)
                    for (let tx = Math.max(minX, x); tx < endX; tx++) {
                        for (let tz = Math.max(minZ, z); tz < endZ; tz++) {
                            if (!isVisible(tx, tz)) continue
                            maxHeight = Math.max(maxHeight, blockMap[tx][tz].totalHeight)
                            if (!region) {
                                region = prepareRegion(x, z)
                                prepareFoliage(region, x, z)
                            }
                            const tile = (tx - x) * REGION_SIZE + tz - z
                            region.visible.push(tile)
                            const key = tx * depth + tz
                            let visible = visibleTiles.get(key)
                            if (!visible) {
                                visible = {seen: generation}
                                visibleTiles.set(key, visible)
                            }
                            const faces = region.faces[tile]
                            const foliage = region.foliage?.[tile]
                            replaceInstances(visible.faces, faces)
                            replaceInstances(visible.foliage, foliage)
                            visible.seen = generation
                            visible.faces = faces
                            visible.foliage = foliage
                            visible.grass = region.grass?.[tile]
                            const patch = region.patches[tile]
                            if (patch) {
                                patchPadding = Math.max(patchPadding, patch.span)
                                const visiblePatch = visibleTiles.get(patch.key)
                                if (visiblePatch?.seen !== generation) {
                                    replaceInstances(visiblePatch?.faces, patch.faces)
                                    if (visiblePatch) {
                                        visiblePatch.faces = patch.faces
                                        visiblePatch.seen = generation
                                    } else {
                                        visibleTiles.set(patch.key, {seen: generation, faces: patch.faces})
                                    }
                                }
                            }
                        }
                    }
                }
            }
            for (const [key, region] of regions) {
                if (region.used < generation - 12) regions.delete(key)
            }
            for (const [key, visible] of visibleTiles) {
                if (visible.seen === generation) continue
                replaceInstances(visible.faces)
                replaceInstances(visible.foliage)
                visibleTiles.delete(key)
            }
            // A visible tile can keep the rest of its flat patch in the batch.
            minimum.set(minX - patchPadding, -2, minZ - patchPadding)
            maximum.set(maxX + patchPadding, maxHeight + 1, maxZ + patchPadding)
            maximumFoliage.copyFrom(maximum).y += 1
            flushBatches(foliageBatches.values(), maximumFoliage)
            refreshGrass()
            flushBatches(batches.values(), maximum)
            paving.updateSurface(blockMap, minX, minZ, maxX, maxZ, snowCoverMask, snowRevision, revision)
        },
    }
}
