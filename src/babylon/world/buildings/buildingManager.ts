import { Mesh, MeshBuilder, PBRMaterial, Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { MaterialEnum1, Materials } from '@/babylon/materials'
import { WorldDataManager } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { Lights } from '@/babylon/scene/lights'

export interface BuildingData {
    id: number
    tp: number
    x: number
    z: number
    facing?: BuildingFacing
}

type BuildingFacing = '+X' | '-X' | '+Z' | '-Z'

const HOUSE_WIDTH = 5
const HOUSE_DEPTH = 3
const FLOOR_HEIGHT = 0.1
const WALL_HEIGHT = 1
const WALL_THICKNESS = 0.2
const PILLAR_SIZE = 0.4
const DOOR_CENTER_X = 2
const DOOR_WIDTH = 1
const DOOR_COLLISION_WIDTH = 1.3
const WINDOW_WIDTH = 0.8
const WINDOW_HEIGHT = 0.4
const WINDOW_BOTTOM = 1.2
const ROOF_STEP_DEPTH = 0.5
const ROOF_STEP_HEIGHT = 0.3
const ROOF_ANGLE = Math.PI / 6
const ROOF_EAVE_OVERHANG = 0.3
const ROOF_THICKNESS = 0.2
const ROOF_END_OVERHANG = 0.5
const ROOF_RUN = HOUSE_DEPTH / 2 + ROOF_EAVE_OVERHANG
const ROOF_RISE = Math.tan(ROOF_ANGLE) * ROOF_RUN
const ROOF_SLOPE_LENGTH = ROOF_RUN / Math.cos(ROOF_ANGLE)
const FADED_ALPHA = 0
const FADE_DURATION = 0.3

interface BuildingPrefabs {
    shell: Mesh
    roof: Mesh
}

class BuildingView {
    readonly mesh: Mesh
    readonly roofMesh: Mesh
    readonly facing: BuildingFacing
    fadeVisibility = 1
    fadeTarget = 1

    constructor(readonly data: BuildingData, prefabs: BuildingPrefabs, parent: TransformNode) {
        this.facing = data.facing === '+X' || data.facing === '-X' || data.facing === '-Z' ? data.facing : '+Z'
        this.mesh = prefabs.shell.clone(`building_${data.id}`, parent)!
        this.roofMesh = prefabs.roof.clone(`building_${data.id}_roof`, parent)!
        this.mesh.isPickable = false
        this.roofMesh.isPickable = false
        this.mesh.setEnabled(false)
        this.roofMesh.setEnabled(false)
        this.applyXZTransform()
        this.recountYPosition()
        Lights.registerSharedLightMesh(this.mesh)
        Lights.registerSharedLightMesh(this.roofMesh)
        Lights.addShadowCaster(this.mesh, true, true)
        Lights.addShadowCaster(this.roofMesh, true, true)
    }

    applyXZTransform() {
        let x: number
        let z: number
        let rotation: number
        if (this.facing === '+X') {
            x = this.data.x
            z = this.data.z + HOUSE_WIDTH - 1
            rotation = Math.PI / 2
        } else if (this.facing === '-Z') {
            x = this.data.x + HOUSE_WIDTH - 1
            z = this.data.z + HOUSE_DEPTH - 1
            rotation = Math.PI
        } else if (this.facing === '-X') {
            x = this.data.x + HOUSE_DEPTH - 1
            z = this.data.z
            rotation = -Math.PI / 2
        } else {
            x = this.data.x
            z = this.data.z
            rotation = 0
        }
        for (const mesh of [this.mesh, this.roofMesh]) {
            mesh.position.x = x
            mesh.position.z = z
            mesh.rotation.y = rotation
        }
    }

    recountYPosition() {
        const block = WorldDataManager.getBlockMap()[this.data.x]?.[this.data.z]
        this.mesh.position.y = block?.totalHeight ?? 0
        this.roofMesh.position.y = this.mesh.position.y
    }

    isVisible() {
        return this.getOccupiedTiles().some((tile) => ViewportManager.isPointInVisibleMatrix(tile.x, tile.z, 1))
    }

    getWidth() {
        return this.facing === '+X' || this.facing === '-X' ? HOUSE_DEPTH : HOUSE_WIDTH
    }

    getDepth() {
        return this.facing === '+X' || this.facing === '-X' ? HOUSE_WIDTH : HOUSE_DEPTH
    }

    localTileToWorld(localX: number, localZ: number) {
        if (this.facing === '+X') return {x: this.data.x + localZ, z: this.data.z + HOUSE_WIDTH - 1 - localX}
        if (this.facing === '-Z') return {x: this.data.x + HOUSE_WIDTH - 1 - localX, z: this.data.z + HOUSE_DEPTH - 1 - localZ}
        if (this.facing === '-X') return {x: this.data.x + HOUSE_DEPTH - 1 - localZ, z: this.data.z + localX}
        return {x: this.data.x + localX, z: this.data.z + localZ}
    }

    worldPointToLocal(worldX: number, worldZ: number) {
        const dx = worldX - this.data.x
        const dz = worldZ - this.data.z
        if (this.facing === '+X') return {x: HOUSE_WIDTH - 1 - dz, z: dx}
        if (this.facing === '-Z') return {x: HOUSE_WIDTH - 1 - dx, z: HOUSE_DEPTH - 1 - dz}
        if (this.facing === '-X') return {x: dz, z: HOUSE_DEPTH - 1 - dx}
        return {x: dx, z: dz}
    }

    getOccupiedTiles() {
        const tiles: {x: number, z: number}[] = []
        for (let dx = 0; dx < HOUSE_WIDTH; dx++) {
            for (let dz = 0; dz < HOUSE_DEPTH; dz++) {
                tiles.push(this.localTileToWorld(dx, dz))
            }
        }
        return tiles
    }

    getCollisionIndexTiles() {
        const tiles = this.getOccupiedTiles().filter((tile) => {
            const local = this.worldPointToLocal(tile.x, tile.z)
            const dx = local.x
            const dz = local.z
            return dx === 0 || dx === HOUSE_WIDTH - 1 || dz === 0 || dz === HOUSE_DEPTH - 1
        })
        for (let dx = -1; dx <= this.getWidth(); dx++) {
            tiles.push({x: this.data.x + dx, z: this.data.z - 1})
            tiles.push({x: this.data.x + dx, z: this.data.z + this.getDepth()})
        }
        for (let dz = 0; dz < this.getDepth(); dz++) {
            tiles.push({x: this.data.x - 1, z: this.data.z + dz})
            tiles.push({x: this.data.x + this.getWidth(), z: this.data.z + dz})
        }
        return tiles
    }

    isPointInCollision(x: number, z: number, size: number) {
        const local = this.worldPointToLocal(x, z)
        const half = size / 2
        const moverMinX = local.x - half
        const moverMaxX = local.x + half
        const moverMinZ = local.z - half
        const moverMaxZ = local.z + half
        const minX = -0.5
        const maxX = HOUSE_WIDTH - 0.5
        const minZ = -0.5
        const maxZ = HOUSE_DEPTH - 0.5
        const intersects = (wallMinX: number, wallMaxX: number, wallMinZ: number, wallMaxZ: number) => {
            return moverMinX < wallMaxX && moverMaxX > wallMinX
                && moverMinZ < wallMaxZ && moverMaxZ > wallMinZ
        }
        const halfPillar = PILLAR_SIZE / 2
        const doorMinX = DOOR_CENTER_X - DOOR_COLLISION_WIDTH / 2
        const doorMaxX = doorMinX + DOOR_COLLISION_WIDTH
        const hitsPillar = [minX, maxX].some((pillarX) => [minZ, maxZ].some((pillarZ) => {
            return intersects(
                pillarX - halfPillar,
                pillarX + halfPillar,
                pillarZ - halfPillar,
                pillarZ + halfPillar,
            )
        }))

        return hitsPillar
            || intersects(minX + halfPillar, maxX - halfPillar, minZ - WALL_THICKNESS / 2, minZ + WALL_THICKNESS / 2)
            || intersects(minX + halfPillar, doorMinX, maxZ - WALL_THICKNESS / 2, maxZ + WALL_THICKNESS / 2)
            || intersects(doorMaxX, maxX - halfPillar, maxZ - WALL_THICKNESS / 2, maxZ + WALL_THICKNESS / 2)
            || intersects(minX - WALL_THICKNESS / 2, minX + WALL_THICKNESS / 2, minZ + halfPillar, maxZ - halfPillar)
            || intersects(maxX - WALL_THICKNESS / 2, maxX + WALL_THICKNESS / 2, minZ + halfPillar, maxZ - halfPillar)
    }

    containsInteriorPoint(x: number, z: number) {
        const local = this.worldPointToLocal(x, z)
        return local.x > -0.4 && local.x < HOUSE_WIDTH - 0.6
            && local.z > -0.4 && local.z < HOUSE_DEPTH - 0.6
    }

    setVisible(visible: boolean) {
        this.mesh.setEnabled(visible)
        this.roofMesh.setEnabled(visible)
    }

    updateFade(timeRate: number, shouldFade: boolean) {
        this.fadeTarget = shouldFade ? FADED_ALPHA : 1
        if (this.fadeVisibility === this.fadeTarget) return
        const step = ((1 - FADED_ALPHA) / FADE_DURATION) * timeRate
        this.fadeVisibility = this.fadeVisibility < this.fadeTarget
            ? Math.min(this.fadeVisibility + step, this.fadeTarget)
            : Math.max(this.fadeVisibility - step, this.fadeTarget)
        this.roofMesh.visibility = this.fadeVisibility
    }

    dispose() {
        Lights.unregisterSharedLightMesh(this.mesh)
        Lights.unregisterSharedLightMesh(this.roofMesh)
        Lights.removeShadowCaster(this.mesh, true, true)
        Lights.removeShadowCaster(this.roofMesh, true, true)
        this.mesh.dispose()
        this.roofMesh.dispose()
    }
}

export const BuildingManager = {
    buildings: new Map<number, BuildingView>(),
    floorTiles: new Map<string, BuildingView>(),
    collisionTiles: new Map<string, Set<BuildingView>>(),
    housePrefabs: null as BuildingPrefabs | null,
    roofMaterial: null as PBRMaterial | null,
    parent: null as TransformNode | null,

    initialize(scene: Scene, parent: TransformNode) {
        this.parent = parent
        Lights.enableTransparentShadowCasters()
        this.roofMaterial = Materials.createBlockMat1(scene)
        this.roofMaterial.name = 'building_roof_faded_material'
        this.roofMaterial.alpha = 1
        this.roofMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
        this.housePrefabs = this.createHousePrefab(scene)
    },

    consumeBuildings(data: BuildingData[]) {
        data.forEach((building) => this.addBuilding(building))
    },

    addBuilding(data: BuildingData) {
        if (data.tp !== 1 || this.buildings.has(data.id) || !this.housePrefabs || !this.parent) {
            return
        }
        const building = new BuildingView(data, this.housePrefabs, this.parent)
        this.buildings.set(data.id, building)
        building.getOccupiedTiles().forEach((tile) => this.floorTiles.set(`${tile.x};${tile.z}`, building))
        building.getCollisionIndexTiles().forEach((tile) => {
            const key = `${tile.x};${tile.z}`
            if (!this.collisionTiles.has(key)) this.collisionTiles.set(key, new Set())
            this.collisionTiles.get(key)!.add(building)
        })
    },

    removeBuildings(data: BuildingData[]) {
        data.forEach((building) => this.removeBuilding(building.id))
    },

    removeBuilding(id: number) {
        const building = this.buildings.get(id)
        if (!building) return
        building.getOccupiedTiles().forEach((tile) => {
            const key = `${tile.x};${tile.z}`
            if (this.floorTiles.get(key) === building) this.floorTiles.delete(key)
        })
        building.getCollisionIndexTiles().forEach((tile) => {
            const key = `${tile.x};${tile.z}`
            this.collisionTiles.get(key)?.delete(building)
            if (this.collisionTiles.get(key)?.size === 0) this.collisionTiles.delete(key)
        })
        building.dispose()
        this.buildings.delete(id)
    },

    getFloorHeightAtTile(x: number, z: number) {
        return this.floorTiles.has(`${x};${z}`) ? FLOOR_HEIGHT : 0
    },

    getPointInBuilding(x: number, z: number, size: number, coveredBlocks: {x: number, z: number}[]) {
        const candidates = new Set<BuildingView>()
        coveredBlocks.forEach((tile) => {
            this.collisionTiles.get(`${tile.x};${tile.z}`)?.forEach((building) => candidates.add(building))
        })
        for (const building of candidates) {
            if (building.isPointInCollision(x, z, size)) {
                return building.localTileToWorld(2, 1)
            }
        }
        return null
    },

    recountYPositions() {
        this.buildings.forEach((building) => building.recountYPosition())
    },

    onFrame(timeRate: number, playerX: number | null, playerZ: number | null) {
        this.buildings.forEach((building) => {
            building.updateFade(
                timeRate,
                playerX != null && playerZ != null && building.containsInteriorPoint(playerX, playerZ),
            )
        })
    },

    renderBuildings() {
        this.buildings.forEach((building) => building.setVisible(building.isVisible()))
    },

    clearWorld() {
        this.buildings.forEach((building) => building.dispose())
        this.buildings.clear()
        this.floorTiles.clear()
        this.collisionTiles.clear()
    },

    createHousePrefab(scene: Scene) {
        const shellParts: Mesh[] = []
        const shellUvData: number[] = []
        const roofParts: Mesh[] = []
        const roofUvData: number[] = []
        const addBox = (
            name: string,
            width: number,
            height: number,
            depth: number,
            x: number,
            y: number,
            z: number,
            material: Vector2,
            rotationX = 0,
            group: 'shell' | 'roof' = 'shell',
        ) => {
            const box = MeshBuilder.CreateBox(name, {width, height, depth, wrap: true}, scene)
            box.position.set(x, y, z)
            box.rotation.x = rotationX
            box.convertToUnIndexedMesh()
            const uvData = group === 'roof' ? roofUvData : shellUvData
            for (let i = 0; i < box.getTotalVertices(); i++) {
                uvData.push(material.x, material.y)
            }
            if (group === 'roof') roofParts.push(box)
            else shellParts.push(box)
        }
        const addWallGrid = (
            name: string,
            length: number,
            height: number,
            x: number,
            y: number,
            z: number,
            runsAlongX: boolean,
        ) => {
            for (let lengthOffset = 0; lengthOffset < length - 0.001;) {
                const pieceLength = Math.min(0.5, length - lengthOffset)
                for (let heightOffset = 0; heightOffset < height - 0.001;) {
                    const pieceHeight = Math.min(0.5, height - heightOffset)
                    const horizontalOffset = -length / 2 + lengthOffset + pieceLength / 2
                    addBox(
                        name,
                        runsAlongX ? pieceLength : WALL_THICKNESS,
                        pieceHeight,
                        runsAlongX ? WALL_THICKNESS : pieceLength,
                        x + (runsAlongX ? horizontalOffset : 0),
                        y - height / 2 + heightOffset + pieceHeight / 2,
                        z + (runsAlongX ? 0 : horizontalOffset),
                        MaterialEnum1.WOOD_PLANKS.uv,
                    )
                    heightOffset += pieceHeight
                }
                lengthOffset += pieceLength
            }
        }

        for (let x = 0; x < HOUSE_WIDTH; x++) {
            for (let z = 0; z < HOUSE_DEPTH; z++) {
                addBox('buildingFloor', 1, FLOOR_HEIGHT, 1, x, FLOOR_HEIGHT / 2, z, MaterialEnum1.ROCK1.uv)
            }
        }

        for (const x of [-0.5, HOUSE_WIDTH - 0.5]) {
            for (const z of [-0.5, HOUSE_DEPTH - 0.5]) {
                for (let level = 0; level < 5; level++) {
                    addBox(
                        'buildingPillar',
                        PILLAR_SIZE,
                        PILLAR_SIZE,
                        PILLAR_SIZE,
                        x,
                        0.1 + PILLAR_SIZE / 2 + level * PILLAR_SIZE,
                        z,
                        MaterialEnum1.BRICK_GRAY.uv,
                    )
                }
            }
        }

        const longWallSegments = [
            {center: 0.1, length: 0.8},
            {center: 1, length: 1},
            {center: 2, length: 1},
            {center: 3, length: 1},
            {center: 3.9, length: 0.8},
        ]
        const addWindowSection = (sectionStart: number, sectionEnd: number, windowCenter: number, z: number) => {
            const sectionLength = sectionEnd - sectionStart
            const sectionCenter = (sectionStart + sectionEnd) / 2
            const windowStart = windowCenter - WINDOW_WIDTH / 2
            const windowEnd = windowCenter + WINDOW_WIDTH / 2
            const bottomHeight = WINDOW_BOTTOM - FLOOR_HEIGHT
            const topHeight = FLOOR_HEIGHT + WALL_HEIGHT * 2 - WINDOW_BOTTOM - WINDOW_HEIGHT
            addWallGrid(
                'buildingWindowBottom',
                sectionLength,
                bottomHeight,
                sectionCenter,
                FLOOR_HEIGHT + bottomHeight / 2,
                z,
                true,
            )
            addWallGrid(
                'buildingWindowTop',
                sectionLength,
                topHeight,
                sectionCenter,
                WINDOW_BOTTOM + WINDOW_HEIGHT + topHeight / 2,
                z,
                true,
            )
            const leftJambWidth = windowStart - sectionStart
            const rightJambWidth = sectionEnd - windowEnd
            if (leftJambWidth > 0) {
                addWallGrid(
                    'buildingWindowJamb',
                    leftJambWidth,
                    WINDOW_HEIGHT,
                    sectionStart + leftJambWidth / 2,
                    WINDOW_BOTTOM + WINDOW_HEIGHT / 2,
                    z,
                    true,
                )
            }
            if (rightJambWidth > 0) {
                addWallGrid(
                    'buildingWindowJamb',
                    rightJambWidth,
                    WINDOW_HEIGHT,
                    windowEnd + rightJambWidth / 2,
                    WINDOW_BOTTOM + WINDOW_HEIGHT / 2,
                    z,
                    true,
                )
            }
        }
        for (const segment of longWallSegments) {
            for (const z of [-0.5, HOUSE_DEPTH - 0.5]) {
                if (z === HOUSE_DEPTH - 0.5 && segment.center === DOOR_CENTER_X) continue
                if (z === HOUSE_DEPTH - 0.5 && (segment.center === 3 || segment.center === 3.9)) continue
                const hasWindow = z === -0.5 && (segment.center === 1 || segment.center === 3)
                if (hasWindow) {
                    addWindowSection(
                        segment.center - segment.length / 2,
                        segment.center + segment.length / 2,
                        segment.center,
                        z,
                    )
                    continue
                }
                for (let level = 0; level < 2; level++) {
                    addWallGrid('buildingWall', segment.length, WALL_HEIGHT, segment.center, 0.6 + level, z, true)
                }
            }
        }
        addWindowSection(2.5, 4.3, 3.5, HOUSE_DEPTH - 0.5)
        addWallGrid(
            'buildingDoorLintel',
            DOOR_WIDTH,
            0.2,
            DOOR_CENTER_X,
            2,
            HOUSE_DEPTH - 0.5,
            true,
        )
        const shortWallSegments = [
            {center: 0.1, length: 0.8},
            {center: 1, length: 1},
            {center: 1.9, length: 0.8},
        ]
        for (const segment of shortWallSegments) {
            for (const x of [-0.5, HOUSE_WIDTH - 0.5]) {
                for (let level = 0; level < 2; level++) {
                    addWallGrid('buildingWall', segment.length, WALL_HEIGHT, x, 0.6 + level, segment.center, false)
                }
            }
        }

        const wallTop = FLOOR_HEIGHT + WALL_HEIGHT * 2
        for (const x of [-0.5, HOUSE_WIDTH - 0.5]) {
            const gableSteps = [1, 2, 3, 2, 1]
            for (let zStep = 0; zStep < gableSteps.length; zStep++) {
                for (let yStep = 0; yStep < gableSteps[zStep]; yStep++) {
                    addBox(
                        'buildingGableStep',
                        WALL_THICKNESS,
                        ROOF_STEP_HEIGHT,
                        ROOF_STEP_DEPTH,
                        x,
                        wallTop + ROOF_STEP_HEIGHT / 2 + yStep * ROOF_STEP_HEIGHT,
                        zStep * ROOF_STEP_DEPTH,
                        MaterialEnum1.WOOD_PLANKS.uv,
                        0,
                        'roof',
                    )
                }
            }
        }

        const roofCenterY = wallTop + ROOF_RISE / 2
        const roofCenterZ = (HOUSE_DEPTH - 1) / 2
        for (const side of [-1, 1]) {
            for (let x = 0; x < HOUSE_WIDTH; x++) {
                const endDirection = x === 0 ? -1 : x === HOUSE_WIDTH - 1 ? 1 : 0
                addBox(
                    'buildingRoofSlope',
                    1 + (endDirection === 0 ? 0 : ROOF_END_OVERHANG),
                    ROOF_THICKNESS,
                    ROOF_SLOPE_LENGTH,
                    x + endDirection * ROOF_END_OVERHANG / 2,
                    roofCenterY,
                    roofCenterZ + side * ROOF_RUN / 2,
                    MaterialEnum1.BRICK_RED.uv,
                    side * ROOF_ANGLE,
                    'roof',
                )
            }
        }

        const mergeParts = (parts: Mesh[], uvData: number[], name: string, material: PBRMaterial) => {
            const merged = Mesh.MergeMeshes(parts, true, true)!
            merged.name = name
            merged.material = material
            merged.setVerticesData('uvc', uvData, false, 2)
            merged.isPickable = false
            merged.setEnabled(false)
            return merged
        }
        return {
            shell: mergeParts(shellParts, shellUvData, 'humanHouseShell5x3Prefab', Materials.blockMat1!),
            roof: mergeParts(roofParts, roofUvData, 'humanHouseRoof5x3Prefab', this.roofMaterial!),
        }
    },
}
