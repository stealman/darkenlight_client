import { Color3, Matrix, Mesh, PBRMaterial, Quaternion, Scene, Texture, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { updateWorldInstanceBuffers } from '@/babylon/world/worldInstanceBuffers'
import type { MapBlock } from '@/data/worldDataManager'
import { MyPlayer } from '@/data/myPlayer'
import { Builder } from '@/babylon/builder'

const ATLAS_SIZE = 8
const ATLAS_CELL_PIXELS = 64
const SCATTER_CELL_SIZE = 4
const CANDIDATES_PER_TILE = 2
export const GRASS_ROOT_INSET = 0.015
const UNUSED_GROUND_ROW = 6

export type TerrainFoliage = {
    rows: readonly number[]
    tuftsPerTile: number
    groundPerTile: number
    groundRows?: readonly number[]
    groundDensityMultipliers?: Readonly<Record<number, number>>
    blendedGroundRows?: readonly number[]
    tuftHeights?: Readonly<Record<number, number>>
    groundSizes?: Readonly<Record<number, readonly [number, number]>>
    scatter?: (x: number, z: number, variety: number) => {
        tuftDensity: number
        groundDensity: number
        extraTuftChance?: number
        extraTuftRow?: number
        tuftRow?: number
        groundRow?: number
        extraGround?: {row: number, chance: number, size: readonly [number, number]}
    }
}

type GroundLayer = 'ground' | 'blended'

export const FoliageManager = {
    groundMesh: null as Mesh | null,
    blendedGroundMesh: null as Mesh | null,
    instancePosition: Vector3.Zero(),
    instanceRotation: Quaternion.Identity(),
    instanceScale: Vector3.One(),

    initialize(scene: Scene, parent: TransformNode | null, options: {atlasUrl: string, normalAtlasUrl: string}) {
        const foliageTexture = new Texture(options.atlasUrl, scene)
        foliageTexture.hasAlpha = true
        foliageTexture.getAlphaFromRGB = false
        foliageTexture.wrapU = Texture.CLAMP_ADDRESSMODE
        foliageTexture.wrapV = Texture.CLAMP_ADDRESSMODE
        foliageTexture.updateSamplingMode(Texture.NEAREST_NEAREST)
        foliageTexture.uScale = 1 / ATLAS_SIZE
        foliageTexture.vScale = 1 / ATLAS_SIZE

        const groundMaterial = this.createMaterial(scene, 'groundFoliageMaterial', foliageTexture, ATLAS_CELL_PIXELS)
        const normalAtlas = new Texture(options.normalAtlasUrl, scene, {samplingMode: Texture.TRILINEAR_SAMPLINGMODE})
        normalAtlas.gammaSpace = false
        normalAtlas.wrapU = normalAtlas.wrapV = Texture.CLAMP_ADDRESSMODE
        normalAtlas.uScale = normalAtlas.vScale = 1 / ATLAS_SIZE
        normalAtlas.level = 1.8
        groundMaterial.bumpTexture = normalAtlas
        this.groundMesh = this.createGroundMesh(scene, parent, 'groundFoliage', groundMaterial)
        const material = this.createMaterial(scene, 'blendedFoliageMaterial', foliageTexture, ATLAS_CELL_PIXELS, true)
        const blendedNormals = normalAtlas.clone()
        blendedNormals.level = 0.8
        material.bumpTexture = blendedNormals
        this.blendedGroundMesh = this.createGroundMesh(scene, parent, 'blendedGroundFoliage', material)
    },

    createMaterial(scene: Scene, name: string, texture: Texture, cellPixels: number, blend = false) {
        const material = new PBRCustomMaterial(name, scene)
        material.albedoTexture = texture
        material.useAlphaFromAlbedoTexture = true
        material.albedoColor = Color3.White()
        material.emissiveColor = Color3.Black()
        material.alphaCutOff = 0.75
        material.transparencyMode = blend ? PBRMaterial.PBRMATERIAL_ALPHABLEND : PBRMaterial.PBRMATERIAL_ALPHATEST
        material.useSpecularOverAlpha = !blend
        material.useRadianceOverAlpha = !blend
        material.backFaceCulling = false
        material.twoSidedLighting = true
        material.forceAlphaTest = !blend
        material.metallic = 0
        material.roughness = 1
        material.directIntensity = 0.5
        material.environmentIntensity = 1.5
        material.usePhysicalLightFalloff = false
        material.AddAttribute('uvc')
        material.Vertex_Definitions('attribute vec2 uvc;')
        material.Vertex_MainBegin('vec2 foliageAtlasOffset = uvc;')
        material.Vertex_Before_PositionUpdated(
            `uvUpdated = (uvUpdated * ${cellPixels - 1}.0 + 0.5) / ${cellPixels}.0 + foliageAtlasOffset;`,
        )
        return material
    },

    createGroundMesh(scene: Scene, parent: TransformNode | null, name: string, material: PBRCustomMaterial) {
        const mesh = Builder.createHorizontalPlane(scene, parent, 1, 0)
        mesh.name = name
        mesh.doNotSyncBoundingInfo = true
        mesh.isPickable = false
        mesh.material = material
        mesh.setEnabled(false)
        return mesh
    },

    renderFoliageArea(
        blockMap: MapBlock[][],
        canDecorate: (block: MapBlock, x: number, z: number) => boolean,
        options: {
            originX: number
            originZ: number
            visibleTile: (x: number, z: number) => boolean
            profiles: ReadonlyMap<number, TerrainFoliage>
            extraTufts: readonly {matrix: Matrix, row: number}[]
            grassRows: ReadonlySet<number>
            placeTuft: (matrix: Matrix, row: number) => void
            groundDecals: readonly {matrix: Matrix, uv: Vector2}[]
            blendedDecals: readonly {matrix: Matrix, uv: Vector2}[]
            mapAtlasOffset: (uv: Vector2, matrix: Matrix, layer: GroundLayer) => Vector2 | undefined
            submit?: (mesh: Mesh, matrices: Matrix[], uv: Vector2[]) => void
        },
    ) {
        const groundMesh = this.groundMesh
        const groundMatrices: Matrix[] = []
        const groundUvs: Vector2[] = []
        const blended = this.blendedGroundMesh && {
            mesh: this.blendedGroundMesh,
            matrices: [] as Matrix[],
            uvs: [] as Vector2[],
        }
        const {originX, originZ} = options
        const getProfile = (block: MapBlock) => options.profiles.get(this.getTerrainIndex(block))
        const supportsGround = (block: MapBlock, x: number, z: number) =>
            !!getProfile(block)?.groundPerTile && canDecorate(block, x, z)
        const maxX = blockMap.length - 1
        const maxZ = (blockMap[0]?.length ?? 0) - 1
        if (maxX < 0 || maxZ < 0) return
        for (let cellX = Math.floor(originX / SCATTER_CELL_SIZE); cellX <= Math.floor((maxX + originX) / SCATTER_CELL_SIZE); cellX++) {
            for (let cellZ = Math.floor(originZ / SCATTER_CELL_SIZE); cellZ <= Math.floor((maxZ + originZ) / SCATTER_CELL_SIZE); cellZ++) {
                // Absolute world cells seed the scatter. A tile can receive any number of candidates.
                const candidateCount = 24 + this.hashTile(cellX, cellZ, 70) % 17
                const totalCandidates = candidateCount * 3
                for (let index = 0; index < totalCandidates; index++) {
                    const extraTuft = index >= candidateCount
                    const salt = extraTuft ? 3000 + (index - candidateCount) * 16 : 100 + index * 16
                    // Use the same precision as the instance buffer for tile boundary checks.
                    const worldX = Math.fround((cellX + this.roll(cellX, cellZ, salt)) * SCATTER_CELL_SIZE - 0.5) - originX
                    const worldZ = Math.fround((cellZ + this.roll(cellX, cellZ, salt + 1)) * SCATTER_CELL_SIZE - 0.5) - originZ
                    const x = Math.round(worldX)
                    const z = Math.round(worldZ)
                    if (x < 0 || x > maxX || z < 0 || z > maxZ) continue
                    if (!options.visibleTile(x, z)) continue

                    const block = blockMap[x][z]
                    const config = getProfile(block)
                    if (!config) continue

                    const scatter = config.scatter?.(worldX, worldZ, this.roll(cellX, cellZ, salt + 2))
                    const tuftDensity = scatter?.tuftDensity ?? 0
                    const tuftLimit = config.tuftsPerTile * tuftDensity
                    const roll = this.roll(cellX, cellZ, salt + 9) * CANDIDATES_PER_TILE
                    const isTuft = extraTuft ? roll < (scatter?.extraTuftChance ?? 0) * CANDIDATES_PER_TILE : roll < tuftLimit
                    let groundRow = UNUSED_GROUND_ROW
                    let groundSize: readonly [number, number] | undefined
                    if (!isTuft) {
                        if (!groundMesh || extraTuft || block.snowed) continue
                        const rows = config.groundRows
                        groundRow = scatter?.groundRow ?? (rows ? rows[this.hashTile(cellX, cellZ, salt + 2) % rows.length] : UNUSED_GROUND_ROW)
                        const density = scatter?.groundDensity ?? tuftDensity
                        const multiplier = config.groundDensityMultipliers?.[groundRow] ?? 1
                        const groundLimit = tuftLimit + config.groundPerTile * density * multiplier
                        if (roll >= groundLimit) {
                            const extra = scatter?.extraGround
                            if (!extra || roll >= groundLimit + extra.chance * CANDIDATES_PER_TILE) continue
                            groundRow = extra.row
                            groundSize = extra.size
                        }
                    }
                    if (!canDecorate(block, x, z)) continue
                    const top = block.totalHeight
                    if (isTuft) {
                        const extraRow = extraTuft ? scatter?.extraTuftRow : undefined
                        const row = extraRow ?? scatter?.tuftRow ?? config.rows[this.hashTile(cellX, cellZ, salt + 2) % config.rows.length]
                        if (options.grassRows.has(row)) {
                            options.placeTuft(this.tuftMatrix(cellX, cellZ, worldX, top, worldZ, salt, config.tuftHeights?.[row]), row)
                        }
                        continue
                    }

                    if (groundRow === UNUSED_GROUND_ROW) continue
                    const sizeRange = groundSize ?? config.groundSizes?.[groundRow]
                    const sizeRoll = this.roll(cellX, cellZ, salt + 10)
                    let size = sizeRange ? sizeRange[0] + sizeRoll * (sizeRange[1] - sizeRange[0]) : 0.38 + sizeRoll * 0.18
                    const yaw = this.roll(cellX, cellZ, salt + 11) * 2 * Math.PI
                    // The rotated quad may cross tile borders on continuous ground.
                    const radiusPerUnit = 0.5 * (Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw)))
                    if (!this.canPlaceGroundCover(blockMap, worldX, worldZ, top, size * radiusPerUnit, supportsGround)) {
                        if (!sizeRange) continue
                        size = sizeRange[0]
                        if (!this.canPlaceGroundCover(blockMap, worldX, worldZ, top, size * radiusPerUnit, supportsGround)) continue
                    }

                    this.instanceScale.set(size, 1, size)
                    // Overlapping decals stay stable inside the denser preview patches.
                    const lift = scatter ? 0.002 * this.roll(cellX, cellZ, salt + 12) : 0
                    this.instancePosition.set(worldX, top + 0.006 + lift, worldZ)
                    Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, this.instanceRotation)
                    const matrix = Matrix.Compose(this.instanceScale, this.instanceRotation, this.instancePosition)
                    const uv = this.getAtlasOffset(cellX, cellZ, groundRow, salt)
                    if (blended && config.blendedGroundRows?.includes(groundRow)) {
                        blended.matrices.push(matrix)
                        blended.uvs.push(uv)
                    } else {
                        groundMatrices.push(matrix)
                        groundUvs.push(uv)
                    }
                }
            }
        }

        for (const {matrix, row} of options.extraTufts) {
            if (options.grassRows.has(row)) options.placeTuft(matrix, row)
        }
        const updateBatch = (target: Mesh, placements: Matrix[], offsets: Vector2[], layer: GroundLayer) => {
            let count = 0
            for (let i = 0; i < placements.length; i++) {
                const offset = options.mapAtlasOffset(offsets[i], placements[i], layer)
                if (!offset) continue
                placements[count] = placements[i]
                offsets[count] = offset
                count++
            }
            placements.length = offsets.length = count
            if (options.submit) options.submit(target, placements, offsets)
            else {
                updateWorldInstanceBuffers(target, placements, offsets)
                target.setEnabled(placements.length > 0)
            }
        }
        if (groundMesh) {
            for (const {matrix, uv} of options.groundDecals) {
                groundMatrices.push(matrix)
                groundUvs.push(uv)
            }
            updateBatch(groundMesh, groundMatrices, groundUvs, 'ground')
        }
        if (blended) {
            for (const {matrix, uv} of options.blendedDecals) {
                blended.matrices.push(matrix)
                blended.uvs.push(uv)
            }
            updateBatch(blended.mesh, blended.matrices, blended.uvs, 'blended')
        }
    },

    canPlaceGroundCover(blockMap: MapBlock[][], worldX: number, worldZ: number, top: number, radius: number,
                        supportsGround: (block: MapBlock, x: number, z: number) => boolean): boolean {
        for (let x = Math.round(worldX - radius); x <= Math.round(worldX + radius); x++) {
            for (let z = Math.round(worldZ - radius); z <= Math.round(worldZ + radius); z++) {
                const block = blockMap[x]?.[z]
                if (!block || block.snowed || Math.abs(block.totalHeight - top) > 1e-6
                    || !supportsGround(block, x, z)) return false
            }
        }
        return true
    },

    patchDensity(x: number, z: number): number {
        const patchSize = 5
        const cellX = Math.floor(x / patchSize), cellZ = Math.floor(z / patchSize)
        const u = x / patchSize - cellX, v = z / patchSize - cellZ
        const near = this.roll(cellX, cellZ, 60) * (1 - u) + this.roll(cellX + 1, cellZ, 60) * u
        const far = this.roll(cellX, cellZ + 1, 60) * (1 - u) + this.roll(cellX + 1, cellZ + 1, 60) * u
        return 0.25 + (near * (1 - v) + far * v) * 1.6
    },

    getTerrainIndex(block: MapBlock): number {
        let type = block.type
        if (block.minableCoal) {
            type += 2000
        } else if (block.minableOreAvailable) {
            type += 1000
        }
        if (block.snowed) {
            type += 100
        }
        return type
    },

    getAtlasOffset(x: number, z: number, row: number, salt = 0): Vector2 {
        const columns = row < 3 ? ATLAS_SIZE : 4
        return new Vector2(this.hashTile(x, z, salt + 3) % columns, ATLAS_SIZE - 1 - row)
    },

    tuftMatrix(x: number, z: number, centerX: number, top: number, centerZ: number, salt: number, height = 0.65): Matrix {
        const width = 0.42 + this.roll(x, z, salt + 4) * 0.31
        const tuftHeight = height * (0.73 + this.roll(x, z, salt + 5) * 0.55)
        this.instanceScale.set(width, tuftHeight, width)
        this.instancePosition.set(centerX, top - GRASS_ROOT_INSET, centerZ)
        Quaternion.RotationYawPitchRollToRef(this.roll(x, z, salt + 8) * 2 * Math.PI, 0, 0, this.instanceRotation)
        return Matrix.Compose(this.instanceScale, this.instanceRotation, this.instancePosition)
    },

    roll(x: number, z: number, salt: number): number {
        return this.hashTile(x, z, salt) / 0x100000000
    },

    hashTile(x: number, z: number, salt: number): number {
        let hash = (MyPlayer.worldId * 73856093) ^ (x * 19349663) ^ (z * 83492791) ^ (salt * 2654435761)
        hash = Math.imul(hash ^ (hash >>> 16), 2246822519)
        hash = Math.imul(hash ^ (hash >>> 13), 3266489917)
        hash ^= hash >>> 16
        return hash >>> 0
    },

}
