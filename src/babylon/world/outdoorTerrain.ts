import { BoundingInfo, TransformNode, Vector3 } from '@babylonjs/core'
import type { Matrix, Mesh, Vector2 } from '@babylonjs/core'
import { MapBlock } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { Settings } from '@/settings/settings'
import { TERRAIN_ATLAS_REGION_SIZE } from '@/adminUtils/terrainAtlasPreview'
import { createTerrainSurfaceRenderer } from '@/adminUtils/terrainSurfaceRenderer'
import { terrainWithoutSnow } from '@/adminUtils/terrainLocalTransitions'
import type { TerrainInstanceAttribute } from '@/adminUtils/terrainPreviewBatch'
import { createTerrainFoliageRenderer } from '@/adminUtils/terrainFoliageRenderer'
import { BuildingManager } from './buildings/buildingManager'
import { WATER_BLOCK_TYPE } from './terrainManager'
import { updateWorldInstanceBuffers } from './worldInstanceBuffers'

const REGION_SIZE = TERRAIN_ATLAS_REGION_SIZE
const BORDER = 5

type Batch = {
    mesh: Mesh
    matrices: Matrix[]
    uv: Vector2[]
    attributes: {kind: string, data: Float32Array}[]
    capacity: number
}
type Face = {batch: Batch, matrix: Matrix, uv: Vector2, attributes: TerrainInstanceAttribute[], index: number}
type FoliageBatch = Pick<Batch, 'mesh' | 'matrices' | 'uv'>
type FoliageInstance = {batch: FoliageBatch, matrix: Matrix, uv: Vector2}
type Region = {
    blocks: MapBlock[]
    hiddenSnow: number[]
    faces: (Face[] | undefined)[]
    used: number
    map: MapBlock[][]
    left: number
    top: number
    visible: number[]
    foliage?: (FoliageInstance[] | undefined)[]
    buildingKey?: string
}

function growAttributes(batch: Batch, attributes: TerrainInstanceAttribute[], required: number) {
    batch.capacity = Math.max(32, required, batch.capacity * 2)
    attributes.forEach(({kind, stride}, index) => {
        const previous = batch.attributes[index]
        const data = new Float32Array(batch.capacity * stride)
        if (previous) data.set(previous.data)
        batch.attributes[index] = {kind, data}
        batch.mesh.thinInstanceSetBuffer(kind, data, stride, false)
    })
}

export function createOutdoorTerrain(parent: TransformNode) {
    const terrain = new TransformNode('outdoorTerrain', parent.getScene())
    terrain.parent = parent
    const renderer = createTerrainSurfaceRenderer(parent.getScene(), terrain, new Vector3(0, 0, 1))
    for (const mesh of renderer.meshes) {
        const {minimum, maximum} = mesh.getBoundingInfo()
        mesh.rawBoundingInfo = new BoundingInfo(minimum, maximum)
    }
    const batches = new Map<Mesh, Batch>(renderer.meshes.map(mesh => [mesh, {
        mesh, matrices: [], uv: [], attributes: [], capacity: 0,
    } satisfies Batch]))
    const foliage = createTerrainFoliageRenderer(parent.getScene(), terrain, Settings.isDetalLevelHigh())
    const foliageBatches = new Map(foliage.meshes.map(mesh => [mesh, {mesh, matrices: [], uv: []} as FoliageBatch]))
    const minimumFoliage = new Vector3()
    const maximumFoliage = new Vector3()
    const visibleRegions: Region[] = []
    let foliageJobs: (() => void)[] = []
    const uploadFoliage = () => {
        for (const batch of foliageBatches.values()) {
            batch.matrices.length = 0
            batch.uv.length = 0
        }
        for (const region of visibleRegions) {
            const foliage = region.foliage
            if (!foliage) continue
            for (const index of region.visible) {
                const instances = foliage[index]
                if (!instances) continue
                for (const {batch, matrix, uv} of instances) {
                    batch.matrices.push(matrix)
                    batch.uv.push(uv)
                }
            }
        }
        for (const {mesh, matrices, uv} of foliageBatches.values()) {
            updateWorldInstanceBuffers(mesh, matrices, uv, false)
            if (matrices.length) mesh.getBoundingInfo().reConstruct(minimumFoliage, maximumFoliage, mesh.getWorldMatrix())
            mesh.setEnabled(matrices.length > 0)
        }
    }
    const observer = terrain.getScene().onBeforeRenderObservable.add(() => {
        if (!terrain.isEnabled() || !foliageJobs.length) return
        foliageJobs.shift()!()
        uploadFoliage()
    })
    terrain.onDisposeObservable.addOnce(() => terrain.getScene().onBeforeRenderObservable.remove(observer))
    const regions = new Map<number, Region>()
    let currentMap: MapBlock[][] | undefined
    let generation = 0

    return {
        setEnabled(enabled: boolean) { terrain.setEnabled(enabled) },
        render(blockMap: MapBlock[][], center: {x: number, z: number}, snowCoverMask: ReadonlySet<number>) {
            if (currentMap !== blockMap) {
                currentMap = blockMap
                regions.clear()
            }
            terrain.setEnabled(true)
            foliageJobs = []
            visibleRegions.length = 0
            generation++
            for (const batch of batches.values()) {
                batch.matrices.length = 0
                batch.uv.length = 0
            }
            const depth = blockMap[0]?.length ?? 0
            const minX = Math.max(0, center.x + ViewportManager.minX)
            const minZ = Math.max(0, center.z + ViewportManager.minZ)
            const maxX = Math.min(blockMap.length - 1, center.x + ViewportManager.maxX)
            const maxZ = Math.min(depth - 1, center.z + ViewportManager.maxZ)
            const firstX = Math.floor(minX / REGION_SIZE) * REGION_SIZE
            const firstZ = Math.floor(minZ / REGION_SIZE) * REGION_SIZE
            let maxHeight = 0
            const isVisible = (x: number, z: number) =>
                ViewportManager.isPointInVisibleMatrix(x, z, 2, blockMap[x][z].totalHeight)
            const containsSnow = (x: number, z: number, block: MapBlock) =>
                block.snowed && snowCoverMask.has(x * blockMap.length + z)
            const buildings = Array.from(BuildingManager.buildings.values(), building => ({
                minX: building.data.x, minZ: building.data.z,
                maxX: building.data.x + building.getWidth(), maxZ: building.data.z + building.getDepth(),
            }))

            const prepareRegion = (x: number, z: number) => {
                const key = x * depth + z
                const left = Math.max(0, x - BORDER), top = Math.max(0, z - BORDER)
                const right = Math.min(blockMap.length, x + REGION_SIZE + BORDER)
                const bottom = Math.min(depth, z + REGION_SIZE + BORDER)
                const previous = regions.get(key)
                let dirty = !previous
                let index = 0
                let hiddenCount = 0
                for (let tx = left; tx < right; tx++) {
                    const row = blockMap[tx]
                    for (let tz = top; tz < bottom; tz++, index++) {
                        const block = row[tz]
                        if (previous?.blocks[index] !== block) dirty = true
                        if (containsSnow(tx, tz, block) && previous?.hiddenSnow[hiddenCount++] !== index) dirty = true
                    }
                }
                if (previous && !dirty && previous.hiddenSnow.length === hiddenCount) {
                    previous.used = generation
                    return previous
                }
                const region: Region = {blocks: [], hiddenSnow: [], faces: [], used: generation, map: [], left, top, visible: []}
                const exposed = new Map<MapBlock, MapBlock>()
                const map = region.map = blockMap.slice(left, right).map((row, dx) => row.slice(top, bottom).map((block, dz) => {
                    const index = region.blocks.push(block) - 1
                    if (!containsSnow(left + dx, top + dz, block)) return block
                    region.hiddenSnow.push(index)
                    let bare = exposed.get(block)
                    if (!bare) {
                        bare = terrainWithoutSnow(block)
                        exposed.set(block, bare)
                    }
                    return bare
                }))
                renderer.render(map, {
                    includeTile: (tx, tz) => tx + left >= x && tx + left < x + REGION_SIZE
                        && tz + top >= z && tz + top < z + REGION_SIZE,
                    originX: left,
                    originZ: top,
                    submit(mesh, source, attributes) {
                        const batch = batches.get(mesh)!
                        for (const {kind, stride, values} of attributes) {
                            if (kind !== 'terrainSurface' && kind !== 'terrainWetTile') continue
                            for (let i = 0; i < values.length; i += stride) {
                                values[i] += left
                                values[i + 1] += top
                            }
                        }
                        source.forEachInstance((tile, matrix, uv, sourceIndex) => {
                            const localX = Math.floor(tile / (bottom - top))
                            const localZ = tile % (bottom - top)
                            const index = (localX + left - x) * REGION_SIZE + localZ + top - z
                            const translation = matrix.getTranslation()
                            matrix.setTranslationFromFloats(translation.x + left, translation.y, translation.z + top)
                            const faces = region.faces[index] ??= []
                            faces.push({batch, matrix, uv, attributes, index: sourceIndex})
                        })
                    },
                })
                regions.set(key, region)
                return region
            }

            const prepareFoliage = (region: Region, x: number, z: number) => {
                region.visible.length = 0
                visibleRegions.push(region)
                const {left, top, map} = region
                const nearby = buildings.filter(bounds => bounds.maxX >= left && bounds.maxZ >= top
                    && bounds.minX < left + map.length && bounds.minZ < top + map[0].length)
                const buildingKey = JSON.stringify(nearby)
                if (region.foliage && region.buildingKey === buildingKey) return
                // Keep scattering out of the movement update. A new region is prepared in one frame.
                region.foliage = undefined
                foliageJobs.push(() => {
                    const placed: Region['foliage'] = []
                    const foliageMap = map.map(row => row.map(block => {
                        if (!block.heightOffset || block.type === WATER_BLOCK_TYPE) return block
                        return Object.assign(new MapBlock(block.height, block.type), block,
                            {heightOffset: 0, totalHeight: block.height})
                    }))
                    foliage.render(foliageMap, {
                        originX: left, originZ: top,
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
                                instances.push({batch, matrix, uv: uv[i]})
                            }
                        },
                    })
                    region.foliage = placed
                    region.buildingKey = buildingKey
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
                            const faces = region.faces[tile]
                            if (!faces) continue
                            for (const {batch, matrix, uv, attributes, index} of faces) {
                                const dst = batch.matrices.length
                                if (dst >= batch.capacity) growAttributes(batch, attributes, dst + 1)
                                batch.matrices.push(matrix)
                                batch.uv.push(uv)
                                for (let i = 0; i < attributes.length; i++) {
                                    const {stride, values} = attributes[i]
                                    const {data} = batch.attributes[i]
                                    const from = index * stride, to = dst * stride
                                    for (let j = 0; j < stride; j++) data[to + j] = values[from + j]
                                }
                            }
                        }
                    }
                }
            }
            for (const [key, region] of regions) {
                if (region.used < generation - 12) regions.delete(key)
            }
            // Tile geometry fits inside its cell and its cliff only extends downward.
            // Reuse that envelope rather than transforming eight corners per thin instance.
            const minimum = new Vector3(minX - 1, -2, minZ - 1)
            const maximum = new Vector3(maxX + 1, maxHeight + 1, maxZ + 1)
            minimumFoliage.copyFrom(minimum)
            maximumFoliage.copyFrom(maximum).y += 1
            uploadFoliage()
            for (const batch of batches.values()) {
                const count = batch.matrices.length
                updateWorldInstanceBuffers(batch.mesh, batch.matrices, batch.uv, false)
                if (count) {
                    batch.mesh.getBoundingInfo().reConstruct(minimum, maximum, batch.mesh.getWorldMatrix())
                    for (const {kind} of batch.attributes) batch.mesh.thinInstanceBufferUpdated(kind)
                }
                batch.mesh.setEnabled(count > 0)
            }
        },
    }
}
