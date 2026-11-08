import { Mesh, Scene, TransformNode, Vector2, Vector3, VertexData } from '@babylonjs/core'
import type { MapBlock } from '@/data/worldDataManager'
import { Materials } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { Settings } from '@/settings/settings'
import { createBeveledTerrainVertexData, SNOW_BLOCK_HEIGHT, TERRAIN_BEVEL_DROP, TerrainCorner, TerrainEdge, TerrainVerticalCorner } from './beveledTerrainBlock'
import { ActiveMeshFreezer } from '@/babylon/scene/activeMeshFreezer'

// Beveled terrain is the default. terrain=blocks restores the original renderer;
// terrain=smooth selects the smooth experiment. Reload after switching modes.
export const BEVELED_TERRAIN_ENABLED = typeof window !== 'undefined'
    && (new URLSearchParams(window.location.search).get('terrain') ?? 'beveled') === 'beveled'

interface BevelSlot {
    id: number
    seen: number
    mask: number
    height: number
    heightOffset: number
    atlasX: number
    atlasY: number
    template: VertexData
}

interface BevelBatch {
    mesh: Mesh
    topOnly: boolean
    commands: number[]
    previous: number[] | null
    slots: Map<number | string, BevelSlot>
    free: number[]
    capacity: number
    stride: number
    positions: Float32Array
    normals: Float32Array
    uvs: Float32Array
    offsets: Float32Array
    indices: Uint16Array | Uint32Array
    drawCount: number
}

// Include height: a cliff can contain multiple stacked bevel blocks at one tile.
// Cantor pairing avoids temporary strings for ordinary integer map coordinates.
function tileKey(x: number, z: number, height: number): number | string {
    const sum = x + z
    const planar = sum * (sum + 1) / 2 + z
    const vertical = height >= 0 ? height * 2 : -height * 2 - 1
    const total = planar + vertical
    const key = total * (total + 1) / 2 + vertical
    return Number.isInteger(x) && Number.isInteger(z) && Number.isInteger(height) && Number.isSafeInteger(key)
        ? key : `${x};${z};${height}`
}

const EDGE_NEIGHBORS = [[-1, 0, TerrainEdge.West], [1, 0, TerrainEdge.East], [0, -1, TerrainEdge.North], [0, 1, TerrainEdge.South]] as const
const CORNER_NEIGHBORS = [
    [-1, -1, TerrainEdge.West | TerrainEdge.North, TerrainCorner.NorthWest],
    [1, -1, TerrainEdge.East | TerrainEdge.North, TerrainCorner.NorthEast],
    [1, 1, TerrainEdge.East | TerrainEdge.South, TerrainCorner.SouthEast],
    [-1, 1, TerrainEdge.West | TerrainEdge.South, TerrainCorner.SouthWest],
] as const
const VERTICAL_NEIGHBORS = [
    [-1, -1, TerrainVerticalCorner.NorthWest], [1, -1, TerrainVerticalCorner.NorthEast],
    [1, 1, TerrainVerticalCorner.SouthEast], [-1, 1, TerrainVerticalCorner.SouthWest],
] as const

export function terrainVerticalBevelMask(map: MapBlock[][], x: number, z: number, topHeight: number, snowMask: Set<number>): number {
    let mask = 0
    for (const [dx, dz, bit] of VERTICAL_NEIGHBORS) {
        const sideX = map[x + dx]?.[z], sideZ = map[x]?.[z + dz]
        if (!sideX || !sideZ || sideX.type <= 0 || sideZ.type <= 0) continue
        // Full height steps only. Small snow/grass offsets retain their top
        // chamfer without cutting a deep notch through an otherwise hidden wall.
        if (sideX.height < topHeight && sideZ.height < topHeight
            && renderedTop(sideX, x + dx, z, snowMask, map.length) < topHeight
            && renderedTop(sideZ, x, z + dz, snowMask, map.length) < topHeight) mask |= bit
    }
    return mask
}

function renderedTop(tile: MapBlock, x: number, z: number, snowMask: Set<number>, size: number): number {
    const hidden = tile.snowed && !tile.stonePath && !tile.beigeStonePath && snowMask.has(x * size + z)
    if (hidden) return tile.height + (tile.type === 50 ? -0.1 : 0)
    if (tile.snowed && tile.type < 50 && !tile.stonePath && !tile.beigeStonePath) return tile.height + SNOW_BLOCK_HEIGHT
    return tile.totalHeight
}

export function terrainBevelMask(map: MapBlock[][], x: number, z: number, snowMask: Set<number>): number {
    const block = map[x]?.[z]
    if (!block || block.type <= 0 || block.type >= 50 || block.stonePath || block.beigeStonePath) return 0
    const height = renderedTop(block, x, z, snowMask, map.length)
    let mask = 0
    for (const [dx, dz, bit] of EDGE_NEIGHBORS) {
        const nx = x + dx, nz = z + dz, neighbor = map[nx]?.[nz]
        if (!neighbor || neighbor.type <= 0) continue
        const neighborHeight = renderedTop(neighbor, nx, nz, snowMask, map.length)
        if (height > neighborHeight + 1e-6) mask |= bit
    }
    // In a concave 3-high/1-low tile corner, the diagonally opposite high tile
    // has no exposed cardinal edge. Give it a corner bevel so it cannot leave
    // a raised square pin between the two neighboring edge bevels.
    for (const [dx, dz, edges, corner] of CORNER_NEIGHBORS) {
        if (mask & edges) continue
        const diagonal = map[x + dx]?.[z + dz], sideX = map[x + dx]?.[z], sideZ = map[x]?.[z + dz]
        if (!diagonal || diagonal.type <= 0 || !sideX || !sideZ) continue
        if (Math.abs(renderedTop(sideX, x + dx, z, snowMask, map.length) - height) > 1e-6
            || Math.abs(renderedTop(sideZ, x, z + dz, snowMask, map.length) - height) > 1e-6) continue
        if (height > renderedTop(diagonal, x + dx, z + dz, snowMask, map.length) + 1e-6) mask |= corner
    }
    return mask
}

export const BeveledTerrain = {
    scene: null as Scene | null,
    parent: null as TransformNode | null,
    // Two render meshes total, irrespective of edge/corner masks or offsets.
    // Variant templates are CPU vertex data, never scene/shadow-list meshes.
    batches: new Map<boolean, BevelBatch>(),
    templates: new Map<string, VertexData>(),
    generation: 0,

    initialize(scene: Scene, parent: TransformNode | null) {
        this.batches.forEach(({ mesh, topOnly }) => {
            Lights.unregisterSharedLightMesh(mesh)
            Lights.removeShadowCaster(mesh, !topOnly)
            mesh.dispose()
        })
        this.batches.clear()
        this.templates.clear()
        this.scene = scene
        this.parent = parent
    },

    begin() {
        this.generation++
        this.batches.forEach(batch => { batch.commands.length = 0 })
    },

    add(mask: number, topOnly: boolean, x: number, z: number, height: number, heightOffset: number, uv: Vector2) {
        let batch = this.batches.get(topOnly)
        if (!batch) {
            const mesh = new Mesh(topOnly ? 'terrain_beveled_tops' : 'terrain_beveled_blocks', this.scene!)
            mesh.parent = this.parent
            mesh.material = topOnly ? Materials.planeMaterial : Materials.terrainMaterial
            mesh.receiveShadows = Settings.isShadowsEnabled()
            mesh.isPickable = true
            mesh.alwaysSelectAsActiveMesh = true
            mesh.setEnabled(false)
            Lights.registerSharedLightMesh(mesh)
            Lights.addShadowCaster(mesh, !topOnly)
            batch = {
                mesh, topOnly, commands: [], previous: null, slots: new Map(), free: [], capacity: 0,
                // Covers every selectable edge/diagonal/vertical combination,
                // including the roof-to-wall corner junctions of a solid block.
                stride: topOnly ? 54 : 144,
                positions: new Float32Array(0), normals: new Float32Array(0),
                uvs: new Float32Array(0), offsets: new Float32Array(0), indices: new Uint16Array(0), drawCount: 0,
            }
            this.batches.set(topOnly, batch)
        }
        const existing = batch.slots.get(tileKey(x, z, height))
        if (existing) existing.seen = this.generation
        batch.commands.push(mask, x, z, height, heightOffset, uv.x, uv.y)
    },

    finish() {
        this.batches.forEach(batch => {
            const { mesh, commands, previous, topOnly, stride } = batch
            if (!commands.length) { mesh.setEnabled(false); return }
            if (previous && commands.length === previous.length && commands.every((value, i) => value === previous[i])) {
                mesh.setEnabled(true)
                return
            }
            const required = commands.length / 7
            const grew = required > batch.capacity
            if (grew) {
                const capacity = Math.max(64, 2 ** Math.ceil(Math.log2(required * 1.25)))
                const grow = (old: Float32Array, components: number) => {
                    const next = new Float32Array(capacity * stride * components)
                    next.set(old)
                    return next
                }
                batch.positions = grow(batch.positions, 3)
                batch.normals = grow(batch.normals, 3)
                batch.uvs = grow(batch.uvs, 2)
                batch.offsets = grow(batch.offsets, 2)
                batch.indices = capacity * stride > 65535 ? new Uint32Array(capacity * stride) : new Uint16Array(capacity * stride)
                for (let slot = capacity - 1; slot >= batch.capacity; slot--) batch.free.push(slot)
                batch.capacity = capacity
            }
            let victims: Array<[number | string, BevelSlot]> | null = null
            let victim = 0, count = 0, indexDirty = grew
            const dirty: number[] = []
            const minimum = new Vector3(Infinity, Infinity, Infinity), maximum = new Vector3(-Infinity, -Infinity, -Infinity)
            for (let command = 0; command < commands.length; command += 7) {
                const mask = commands[command], x = commands[command + 1], z = commands[command + 2]
                const height = commands[command + 3], heightOffset = commands[command + 4]
                const atlasX = commands[command + 5], atlasY = commands[command + 6], key = tileKey(x, z, height)
                minimum.x = Math.min(minimum.x, x - 0.5); maximum.x = Math.max(maximum.x, x + 0.5)
                minimum.z = Math.min(minimum.z, z - 0.5); maximum.z = Math.max(maximum.z, z + 0.5)
                minimum.y = Math.min(minimum.y, topOnly ? height + heightOffset - TERRAIN_BEVEL_DROP : height - 1)
                maximum.y = Math.max(maximum.y, height + heightOffset)
                let slot = batch.slots.get(key)
                if (!slot || slot.mask !== mask || slot.height !== height || slot.heightOffset !== heightOffset
                    || slot.atlasX !== atlasX || slot.atlasY !== atlasY) {
                    const templateKey = `${mask};${topOnly ? 'top' : heightOffset}`
                    let template = this.templates.get(templateKey)
                    if (!template) {
                        template = createBeveledTerrainVertexData(mask, topOnly, heightOffset)
                        this.templates.set(templateKey, template)
                    }
                    if (template.positions!.length / 3 > stride || template.indices!.length > stride) {
                        throw new Error('Bevel geometry exceeds fixed slot capacity')
                    }
                    let id = slot?.id
                    if (id === undefined) {
                        id = batch.free.pop()
                        if (id === undefined) {
                            // Retain off-screen blocks for backtracking, bounded
                            // by GPU capacity. Evict only slots absent this pass.
                            victims ??= [...batch.slots.entries()].filter(([, entry]) => entry.seen !== this.generation)
                                .sort((a, b) => a[1].seen - b[1].seen)
                            const old = victims[victim++]
                            if (!old) throw new Error('No unused bevel slot available')
                            batch.slots.delete(old[0])
                            id = old[1].id
                        }
                    }
                    slot = { id, seen: this.generation, mask, height, heightOffset, atlasX, atlasY, template }
                    batch.slots.set(key, slot)
                    const base = id * stride, scaleY = topOnly ? 1 : 1 + heightOffset
                    const translateY = topOnly ? height + heightOffset : height + heightOffset * 0.5 - 0.5
                    const source = template.positions!, normals = template.normals!, uv = template.uvs!
                    for (let vertex = 0; vertex < source.length / 3; vertex++) {
                        const target = base + vertex
                        batch.positions[target * 3] = source[vertex * 3] + x
                        batch.positions[target * 3 + 1] = source[vertex * 3 + 1] * scaleY + translateY
                        batch.positions[target * 3 + 2] = source[vertex * 3 + 2] + z
                        const nx = normals[vertex * 3], ny = normals[vertex * 3 + 1] / scaleY, nz = normals[vertex * 3 + 2]
                        const length = Math.hypot(nx, ny, nz)
                        batch.normals[target * 3] = nx / length
                        batch.normals[target * 3 + 1] = ny / length
                        batch.normals[target * 3 + 2] = nz / length
                        batch.uvs[target * 2] = uv[vertex * 2]; batch.uvs[target * 2 + 1] = uv[vertex * 2 + 1]
                        batch.offsets[target * 2] = atlasX; batch.offsets[target * 2 + 1] = atlasY
                    }
                    dirty.push(id)
                }
                for (const index of slot.template.indices!) {
                    const value = slot.id * stride + index
                    if (batch.indices[count] !== value) indexDirty = true
                    batch.indices[count++] = value
                }
            }
            if (count !== batch.drawCount) indexDirty = true
            batch.indices.fill(0, count, batch.drawCount)
            if (grew) {
                const data = new VertexData()
                data.positions = batch.positions; data.normals = batch.normals; data.uvs = batch.uvs; data.indices = batch.indices
                data.applyToMesh(mesh, true)
                mesh.setVerticesData('uvc', batch.offsets, true, 2)
                ActiveMeshFreezer.invalidate()
            } else {
                // Upload only new/edited slots. Direct engine writes preserve the
                // retained CPU arrays used by picking (Buffer.updateDirectly drops them).
                const engine = this.scene!.getEngine()
                dirty.sort((a, b) => a - b)
                for (let i = 0; i < dirty.length; i++) {
                    const start = dirty[i] * stride
                    let end = (dirty[i] + 1) * stride
                    while (i + 1 < dirty.length && dirty[i + 1] * stride === end) { i++; end += stride }
                    for (const [kind, values, components] of [
                        ['position', batch.positions, 3], ['normal', batch.normals, 3],
                        ['uv', batch.uvs, 2], ['uvc', batch.offsets, 2],
                    ] as const) {
                        engine.updateDynamicVertexBuffer(mesh.getVertexBuffer(kind)!.getBuffer()!,
                            values.subarray(start * components, end * components), start * components * 4)
                    }
                }
                // Picking may already have expanded the retained positions to
                // Vector3 objects. Update just the edited slots instead of
                // discarding/reallocating that entire cache on the next hover.
                const points = mesh.geometry!._positions
                if (points) for (const id of dirty) {
                    const end = (id + 1) * stride
                    for (let vertex = id * stride; vertex < end; vertex++) {
                        points[vertex].set(batch.positions[vertex * 3], batch.positions[vertex * 3 + 1], batch.positions[vertex * 3 + 2])
                    }
                }
                // Constant index-buffer capacity prevents submesh recreation.
                // The draw count below selects only occupied visible triangles.
                if (indexDirty) mesh.updateIndices(batch.indices, 0, true)
            }
            batch.drawCount = count
            mesh.subMeshes[0].indexCount = count
            mesh.subMeshes[0].setBoundingInfo(mesh.buildBoundingInfo(minimum, maximum))
            mesh.computeWorldMatrix(true)
            mesh.setEnabled(true)
            batch.previous = commands.slice()
        })
    },
}
