import { Camera, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { MaterialEnum1, MaterialEnumTrans, Materials } from '@/babylon/materials'
import { WorldDataManager } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { Lights } from '@/babylon/scene/lights'
import { MyPlayer } from '@/data/myPlayer'
import { segmentIntersectsAabb } from '@/babylon/geometryUtils'
import { AudioManager } from '@/babylon/audio/audioManager'
import { BabylonUtils } from '@/babylon/utils'
import { TargetingManager } from '@/gui/targettingManager'

export interface BuildingData {
    id: number
    tp: number
    x: number
    z: number
    facing?: BuildingFacing
    width?: number
    depth?: number
    shedHighSide?: BuildingFacing
    shedSideFills?: Partial<Record<BuildingFacing, 'CAMP_FENCE'>>
    doorOpen?: boolean
}

type BuildingFacing = '+X' | '-X' | '+Z' | '-Z'
type OpaquePartGroup = 'base' | 'wallMinX' | 'wallMaxX' | 'wallMinZ' | 'wallMaxZ' | 'roof' | 'door'

interface BuildingBlockPart {
    matrix: Matrix
    material: Vector2
}

const HOUSE_WIDTH = 5
const HOUSE_DEPTH = 3
const HUMAN_HOUSE_TYPE = 1
const SHED_TYPE = 2
const FLOOR_HEIGHT = 0.12
const FLOOR_OVERHANG = 0.4
const WALL_HEIGHT = 1
const WALL_THICKNESS = 0.2
const PILLAR_SIZE = 0.4
const DOOR_CENTER_X = 2
const DOOR_OPENING_WIDTH = 1
const DOOR_WIDTH = DOOR_OPENING_WIDTH - 0.1
const DOOR_HINGE_X = DOOR_CENTER_X - DOOR_WIDTH / 2
const DOOR_COLLISION_WIDTH = 1.3
const DOOR_HEIGHT = 1.8
const DOOR_THICKNESS = 0.12
const DOOR_BRACE_HEIGHT = 0.1
const DOOR_BRACE_DEPTH = 0.08
const WINDOW_WIDTH = 0.8
const WINDOW_HEIGHT = 0.5
const WINDOW_BOTTOM = FLOOR_HEIGHT + 1.1
const ROOF_STEP_DEPTH = 0.5
const ROOF_STEP_HEIGHT = 0.3
const ROOF_ANGLE = Math.PI / 6
const ROOF_EAVE_OVERHANG = 0.3
const ROOF_THICKNESS = 0.2
const ROOF_END_OVERHANG = 0.5
const ROOF_RUN = HOUSE_DEPTH / 2 + ROOF_EAVE_OVERHANG
const ROOF_RISE = Math.tan(ROOF_ANGLE) * ROOF_RUN
const ROOF_SLOPE_LENGTH = ROOF_RUN / Math.cos(ROOF_ANGLE)
const FADED_ALPHA = 0.35
const FADE_DURATION = 0.3
const DOOR_ANIMATION_DURATION = 0.4 / 1.25
const DOOR_OPEN_ANGLE = -Math.PI / 2
// Babylon skips meshes with exactly zero visibility before rendering shadow
// maps. A tiny non-zero value keeps the roof visually absent while the shared
// full-strength transparent-shadow mode continues to cast an opaque shadow.
const HIDDEN_ROOF_VISIBILITY = 0.0001
const SHED_MIN_SIZE = 2
const SHED_POST_SIZE = 0.18
const SHED_FENCE_THICKNESS = 0.1
const SHED_POST_HEIGHT = 1.65
const SHED_ROOF_RISE_PER_TILE = 0.15
const SHED_ROOF_THICKNESS = 0.12
const SHED_ROOF_OVERHANG = 0.1
const SHED_PLANK_SIZE = 0.5
const SHED_ROOF_STRIP_SIDE_OFFSET = 0.08
const SHED_ROOF_STRIP_HEIGHT_OFFSET = 0.02
const SHED_ROOF_BATTEN_WIDTH = 0.08
const SHED_ROOF_BATTEN_HEIGHT = 0.03
const SHED_ROOF_BATTEN_END_INSET = 0.2
const SHED_ROOF_STEEL_FRAME_WIDTH = 0.08
const SHED_ROOF_STEEL_FRAME_HEIGHT = 0.05

interface BuildingPrefabs {
    variants: Record<BuildingFacing, {
        shell: Mesh
        frontWalls: Mesh
    }>
    roof: Mesh
    door: Mesh
    glass: Mesh
    blocks: Record<OpaquePartGroup, BuildingBlockPart[]>
    glassPanes: Matrix[]
}

class BuildingView {
    readonly mesh: Mesh
    readonly frontWallsMesh: Mesh
    readonly roofMesh: Mesh
    readonly doorMesh: Mesh
    readonly glassMesh: Mesh
    readonly doorRoot: TransformNode
    readonly doorHinge: TransformNode
    readonly facing: BuildingFacing
    readonly doorFadesInside: boolean
    roofVisibility = 1
    wallVisibility = 1
    doorVisibility = 1
    doorProgress: number
    playCloseSoundWhenClosed = false
    shouldOcclusionFade = false
    visible = false
    roofInBatch = true
    frontWallsInBatch = true
    doorInBatch = true
    private previewYOffset = 0

    constructor(readonly data: BuildingData, prefabs: BuildingPrefabs, parent: TransformNode, fadeMaterial: PBRMaterial) {
        this.facing = data.facing === '+X' || data.facing === '-X' || data.facing === '-Z' ? data.facing : '+Z'
        const variant = prefabs.variants[this.facing]
        this.mesh = variant.shell.clone(`building_${data.id}`, parent)!
        this.frontWallsMesh = variant.frontWalls.clone(`building_${data.id}_front_walls`, parent)!
        this.roofMesh = prefabs.roof.clone(`building_${data.id}_roof`, parent)!
        this.glassMesh = prefabs.glass.clone(`building_${data.id}_glass`, parent)!
        this.doorRoot = new TransformNode(`building_${data.id}_door_root`, parent.getScene())
        this.doorRoot.parent = parent
        this.doorHinge = new TransformNode(`building_${data.id}_door_hinge`, parent.getScene())
        this.doorHinge.parent = this.doorRoot
        this.doorHinge.position.set(DOOR_HINGE_X, 0, HOUSE_DEPTH - 0.5)
        this.doorMesh = prefabs.door.clone(`building_${data.id}_door`, this.doorHinge)!
        this.doorMesh.position.set(-DOOR_HINGE_X, 0, -(HOUSE_DEPTH - 0.5))
        this.doorProgress = data.doorOpen === true ? 1 : 0
        this.doorHinge.rotation.y = this.doorProgress * DOOR_OPEN_ANGLE
        this.doorFadesInside = this.facing === '-Z' || this.facing === '-X'
        this.mesh.isPickable = false
        this.frontWallsMesh.isPickable = false
        this.roofMesh.isPickable = false
        this.doorMesh.isPickable = false
        this.glassMesh.isPickable = false
        this.frontWallsMesh.material = fadeMaterial
        this.doorMesh.material = fadeMaterial
        this.mesh.setEnabled(false)
        this.frontWallsMesh.setEnabled(false)
        this.roofMesh.setEnabled(false)
        this.doorMesh.setEnabled(false)
        this.glassMesh.setEnabled(false)
        this.applyXZTransform()
        this.recountYPosition()
        Lights.registerSharedLightMesh(this.frontWallsMesh)
        Lights.registerSharedLightMesh(this.roofMesh)
        Lights.registerSharedLightMesh(this.doorMesh)
        Lights.addShadowCaster(this.frontWallsMesh, true, true)
        Lights.addShadowCaster(this.roofMesh, true, true)
        Lights.addShadowCaster(this.doorMesh, true, true)
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
        for (const mesh of [this.mesh, this.frontWallsMesh, this.roofMesh, this.glassMesh]) {
            mesh.position.x = x
            mesh.position.z = z
            mesh.rotation.y = rotation
        }
        this.doorRoot.position.x = x
        this.doorRoot.position.z = z
        this.doorRoot.rotation.y = rotation
    }

    recountYPosition() {
        const block = WorldDataManager.getBlockMap()[this.data.x]?.[this.data.z]
        this.mesh.position.y = (block?.totalHeight ?? 0) + this.previewYOffset
        this.frontWallsMesh.position.y = this.mesh.position.y
        this.roofMesh.position.y = this.mesh.position.y
        this.glassMesh.position.y = this.mesh.position.y
        this.doorRoot.position.y = this.mesh.position.y
    }

    setPreviewYOffset(offset: number) {
        if (this.previewYOffset === offset) return false
        this.previewYOffset = offset
        this.recountYPosition()
        return true
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

    getFloorTiles() {
        return [
            ...this.getOccupiedTiles(),
            ...[DOOR_CENTER_X - 1, DOOR_CENTER_X, DOOR_CENTER_X + 1]
                .map((localX) => this.localTileToWorld(localX, HOUSE_DEPTH)),
        ]
    }

    hasFloor() {
        return true
    }

    affectsInteriorLighting() {
        return true
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
            || (!this.data.doorOpen && intersects(minX + halfPillar, maxX - halfPillar, maxZ - WALL_THICKNESS / 2, maxZ + WALL_THICKNESS / 2))
            || (this.data.doorOpen && intersects(minX + halfPillar, doorMinX, maxZ - WALL_THICKNESS / 2, maxZ + WALL_THICKNESS / 2))
            || (this.data.doorOpen && intersects(doorMaxX, maxX - halfPillar, maxZ - WALL_THICKNESS / 2, maxZ + WALL_THICKNESS / 2))
            || intersects(minX - WALL_THICKNESS / 2, minX + WALL_THICKNESS / 2, minZ + halfPillar, maxZ - halfPillar)
            || intersects(maxX - WALL_THICKNESS / 2, maxX + WALL_THICKNESS / 2, minZ + halfPillar, maxZ - halfPillar)
    }

    containsInteriorPoint(x: number, z: number) {
        const local = this.worldPointToLocal(x, z)
        return local.x > -0.4 && local.x < HOUSE_WIDTH - 0.6
            && local.z > -0.4 && local.z < HOUSE_DEPTH - 0.6
    }

    getDoorPosition() {
        return this.localTileToWorld(DOOR_CENTER_X, HOUSE_DEPTH - 0.5)
    }

    getCollisionCenter() {
        return this.localTileToWorld(DOOR_CENTER_X, 1)
    }

    setDoorOpen(open: boolean) {
        if (this.data.doorOpen === open) return
        this.data.doorOpen = open
        if (open) {
            this.playCloseSoundWhenClosed = false
            AudioManager.playDoorOpenSound(this.getDoorSoundPosition())
        } else {
            this.playCloseSoundWhenClosed = true
        }
    }

    getDoorSoundPosition() {
        const door = this.getDoorPosition()
        return new Vector3(door.x, this.mesh.position.y + FLOOR_HEIGHT + DOOR_HEIGHT / 2, door.z)
    }

    updateDoorAnimation(timeRate: number) {
        const target = this.data.doorOpen ? 1 : 0
        if (this.doorProgress === target) {
            this.finishDoorCloseSound(target)
            return this.doorInBatch !== this.isDoorBatched()
        }
        const step = timeRate / DOOR_ANIMATION_DURATION
        this.doorProgress = this.doorProgress < target
            ? Math.min(this.doorProgress + step, target)
            : Math.max(this.doorProgress - step, target)
        this.doorHinge.rotation.y = this.doorProgress * DOOR_OPEN_ANGLE
        this.finishDoorCloseSound(target)
        this.setVisible(this.visible)
        return this.doorInBatch !== this.isDoorBatched()
    }

    finishDoorCloseSound(target: number) {
        if (target === 0 && this.doorProgress === 0 && this.playCloseSoundWhenClosed) {
            this.playCloseSoundWhenClosed = false
            AudioManager.playDoorCloseSound(this.getDoorSoundPosition())
        }
    }

    intersectsOcclusionSegment(origin: Vector3, direction: Vector3, maxDistance: number) {
        const longAxisAlongX = this.facing === '+Z' || this.facing === '-Z'
        const xOverhang = longAxisAlongX ? ROOF_END_OVERHANG : ROOF_EAVE_OVERHANG
        const zOverhang = longAxisAlongX ? ROOF_EAVE_OVERHANG : ROOF_END_OVERHANG
        const groundY = this.mesh.position.y
        return segmentIntersectsAabb(
            origin,
            direction,
            maxDistance,
            new Vector3(
                this.data.x - 0.5 - xOverhang,
                groundY,
                this.data.z - 0.5 - zOverhang,
            ),
            new Vector3(
                this.data.x + this.getWidth() - 0.5 + xOverhang,
                groundY + FLOOR_HEIGHT + WALL_HEIGHT * 2 + ROOF_RISE + ROOF_THICKNESS,
                this.data.z + this.getDepth() - 0.5 + zOverhang,
            ),
        )
    }

    setVisible(visible: boolean) {
        this.visible = visible
        this.mesh.setEnabled(false)
        this.frontWallsMesh.setEnabled(visible && !this.isFrontWallsBatched())
        this.roofMesh.setEnabled(visible && !this.isRoofBatched())
        this.doorMesh.setEnabled(visible && !this.isDoorBatched())
        this.glassMesh.setEnabled(false)
    }

    isRoofBatched() {
        return this.roofVisibility === 1 && !this.shouldOcclusionFade
    }

    isFrontWallsBatched() {
        return this.wallVisibility === 1
    }

    isDoorBatched() {
        return this.doorVisibility === 1 && this.doorProgress === 0 && this.data.doorOpen !== true
    }

    appendBatchedBlocks(matrices: Matrix[], uvData: Vector2[], prefabs: BuildingPrefabs) {
        if (!this.visible) return
        const frontWallGroups: Record<BuildingFacing, OpaquePartGroup[]> = {
            '+Z': ['wallMinX', 'wallMinZ'],
            '-Z': ['wallMaxX', 'wallMaxZ'],
            '+X': ['wallMaxX', 'wallMinZ'],
            '-X': ['wallMinX', 'wallMaxZ'],
        }
        const front = frontWallGroups[this.facing]
        const groups: OpaquePartGroup[] = [
            'base',
            ...(['wallMinX', 'wallMaxX', 'wallMinZ', 'wallMaxZ'] as OpaquePartGroup[])
                .filter((group) => !front.includes(group)),
        ]
        this.frontWallsInBatch = this.isFrontWallsBatched()
        this.roofInBatch = this.isRoofBatched()
        this.doorInBatch = this.isDoorBatched()
        if (this.frontWallsInBatch) groups.push(...front)
        if (this.roofInBatch) groups.push('roof')
        if (this.doorInBatch) groups.push('door')

        const world = Matrix.RotationY(this.mesh.rotation.y)
            .multiply(Matrix.Translation(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z))
        for (const group of groups) {
            for (const part of prefabs.blocks[group]) {
                matrices.push(part.matrix.multiply(world))
                uvData.push(part.material)
            }
        }
    }

    appendBatchedGlass(matrices: Matrix[], uvData: Vector2[], prefabs: BuildingPrefabs) {
        if (!this.visible) return
        const world = Matrix.RotationY(this.mesh.rotation.y)
            .multiply(Matrix.Translation(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z))
        for (const pane of prefabs.glassPanes) {
            matrices.push(pane.multiply(world))
            uvData.push(MaterialEnumTrans.GLASS.uv)
        }
    }

    updateFade(timeRate: number, playerInside: boolean, selectedTargetInside: boolean) {
        const hideRoof = playerInside || selectedTargetInside
        const occluded = this.shouldOcclusionFade && !hideRoof
        this.roofVisibility = this.updateMeshFade(
            this.roofMesh,
            this.roofVisibility,
            hideRoof ? HIDDEN_ROOF_VISIBILITY : occluded ? FADED_ALPHA : 1,
            HIDDEN_ROOF_VISIBILITY,
            timeRate,
        )
        this.wallVisibility = this.updateMeshFade(
            this.frontWallsMesh,
            this.wallVisibility,
            playerInside ? FADED_ALPHA : 1,
            FADED_ALPHA,
            timeRate,
        )
        this.doorVisibility = this.updateMeshFade(
            this.doorMesh,
            this.doorVisibility,
            playerInside && this.doorFadesInside ? FADED_ALPHA : 1,
            FADED_ALPHA,
            timeRate,
        )
        this.setVisible(this.visible)
        return this.roofInBatch !== this.isRoofBatched()
            || this.frontWallsInBatch !== this.isFrontWallsBatched()
            || this.doorInBatch !== this.isDoorBatched()
    }

    updateMeshFade(mesh: Mesh, visibility: number, target: number, fadedTarget: number, timeRate: number) {
        if (visibility === target) return visibility
        const step = ((1 - fadedTarget) / FADE_DURATION) * timeRate
        const result = visibility < target
            ? Math.min(visibility + step, target)
            : Math.max(visibility - step, target)
        mesh.visibility = result
        return result
    }

    dispose() {
        Lights.unregisterSharedLightMesh(this.frontWallsMesh)
        Lights.unregisterSharedLightMesh(this.roofMesh)
        Lights.unregisterSharedLightMesh(this.doorMesh)
        Lights.removeShadowCaster(this.frontWallsMesh, true, true)
        Lights.removeShadowCaster(this.roofMesh, true, true)
        Lights.removeShadowCaster(this.doorMesh, true, true)
        this.mesh.dispose()
        this.frontWallsMesh.dispose()
        this.roofMesh.dispose()
        this.doorMesh.dispose()
        this.glassMesh.dispose()
        this.doorHinge.dispose()
        this.doorRoot.dispose()
    }
}

class ShedView {
    readonly roofMesh: Mesh
    readonly blockParts: BuildingBlockPart[] = []
    roofVisibility = 1
    shouldOcclusionFade = false
    visible = false
    roofInBatch = true
    private roofPartStart = 0
    private previewYOffset = 0

    constructor(readonly data: BuildingData, parent: TransformNode, fadeMaterial: PBRMaterial) {
        const scene = parent.getScene()
        const roofParts: Mesh[] = []
        const roofUvData: number[] = []
        const addBlock = (
            width: number,
            height: number,
            depth: number,
            x: number,
            y: number,
            z: number,
            material: Vector2,
            roof = false,
            pitch = 0,
            roll = 0,
            yaw = 0,
        ) => {
            const rotation = Matrix.RotationY(yaw).multiply(Matrix.RotationYawPitchRoll(0, pitch, roll))
            this.blockParts.push({
                matrix: Matrix.Scaling(width, height, depth)
                    .multiply(rotation)
                    .multiply(Matrix.Translation(x, y + 0.5, z)),
                material,
            })
            if (!roof) return
            const block = MeshBuilder.CreateBox('shedRoofPlank', {width, height, depth, wrap: true}, scene)
            block.position.set(x, y, z)
            block.rotationQuaternion = Quaternion.FromRotationMatrix(rotation)
            block.convertToUnIndexedMesh()
            for (let i = 0; i < block.getTotalVertices(); i++) {
                roofUvData.push(material.x, material.y)
            }
            roofParts.push(block)
        }

        for (const x of [-0.5, this.getWidth() - 0.5]) {
            for (const z of [-0.5, this.getDepth() - 0.5]) {
                const height = SHED_POST_HEIGHT + (this.isHighSide(x, z) ? this.getRoofRise() : 0)
                addBlock(SHED_POST_SIZE, height, SHED_POST_SIZE, x, height / 2, z, MaterialEnum1.WOOD_3.uv)
            }
        }

        for (const side of ['-X', '+X', '-Z', '+Z'] as BuildingFacing[]) {
            if (this.data.shedSideFills?.[side] !== 'CAMP_FENCE') continue
            const alongX = side === '-Z' || side === '+Z'
            const length = alongX ? this.getWidth() : this.getDepth()
            const fixed = side === '-X' ? -0.5
                : side === '+X' ? this.getWidth() - 0.5
                    : side === '-Z' ? -0.5 : this.getDepth() - 0.5
            for (let offset = 0; offset < length; offset++) {
                for (const postOffset of [-0.42, 0, 0.42]) {
                    addBlock(
                        0.1,
                        0.95,
                        0.1,
                        alongX ? offset + postOffset : fixed,
                        0.475,
                        alongX ? fixed : offset + postOffset,
                        MaterialEnum1.WOOD_3.uv,
                    )
                }
                for (const y of [0.475, 0.85]) {
                    addBlock(
                        alongX ? 0.94 : 0.09,
                        0.1,
                        alongX ? 0.09 : 0.94,
                        alongX ? offset : fixed,
                        y,
                        alongX ? fixed : offset,
                        MaterialEnum1.WOOD_1.uv,
                    )
                }
            }
        }

        this.roofPartStart = this.blockParts.length
        const roofMinX = -0.5 - SHED_ROOF_OVERHANG
        const roofMinZ = -0.5 - SHED_ROOF_OVERHANG
        const roofWidth = this.getWidth() + SHED_ROOF_OVERHANG * 2
        const roofDepth = this.getDepth() + SHED_ROOF_OVERHANG * 2
        const roofPitch = this.getRoofPitch()
        const roofRoll = this.getRoofRoll()
        const slopesAlongX = this.getHighSide() === '-X' || this.getHighSide() === '+X'
        const slopeLength = slopesAlongX ? roofWidth : roofDepth
        const perpendicularLength = slopesAlongX ? roofDepth : roofWidth
        const roofYaw = slopesAlongX ? Math.PI / 2 : 0
        for (let stripOffset = 0, stripIndex = 0; stripOffset < perpendicularLength - 0.001; stripOffset += SHED_PLANK_SIZE, stripIndex++) {
            const stripSize = Math.min(SHED_PLANK_SIZE, perpendicularLength - stripOffset)
            const random = Math.sin((this.data.id + 1) * 13.37 + (stripIndex + 1) * 91.71) * 43758.5453
            const sideOffset = (random - Math.floor(random) - 0.5) * SHED_ROOF_STRIP_SIDE_OFFSET
            const heightRandom = Math.sin((this.data.id + 1) * 47.29 + (stripIndex + 1) * 17.13) * 43758.5453
            const heightOffset = (heightRandom - Math.floor(heightRandom) - 0.5) * SHED_ROOF_STRIP_HEIGHT_OFFSET
            for (let slopeOffset = 0; slopeOffset < slopeLength - 0.001; slopeOffset += SHED_PLANK_SIZE) {
                const slopeSize = Math.min(SHED_PLANK_SIZE, slopeLength - slopeOffset)
                const x = slopesAlongX
                    ? roofMinX + slopeOffset + slopeSize / 2 + sideOffset
                    : roofMinX + stripOffset + stripSize / 2
                const z = slopesAlongX
                    ? roofMinZ + stripOffset + stripSize / 2
                    : roofMinZ + slopeOffset + slopeSize / 2 + sideOffset
                addBlock(
                    stripSize,
                    SHED_ROOF_THICKNESS,
                    slopeSize,
                    x,
                    this.getRoofY(x, z) + heightOffset,
                    z,
                    MaterialEnum1.WOOD_PLANKS_DARK.uv,
                    true,
                    roofPitch,
                    roofRoll,
                    roofYaw,
                )
            }
        }

        const battenLength = slopeLength - SHED_ROOF_BATTEN_END_INSET * 2
        const battenCenter = (slopesAlongX ? roofMinX : roofMinZ)
            + SHED_ROOF_BATTEN_END_INSET + battenLength / 2
        const battenCount = (slopesAlongX ? this.getDepth() : this.getWidth()) + 1
        for (let index = 0; index < battenCount; index++) {
            const x = slopesAlongX ? battenCenter : index - 0.5
            const z = slopesAlongX ? index - 0.5 : battenCenter
            addBlock(
                slopesAlongX ? battenLength : SHED_ROOF_BATTEN_WIDTH,
                SHED_ROOF_BATTEN_HEIGHT,
                slopesAlongX ? SHED_ROOF_BATTEN_WIDTH : battenLength,
                x,
                this.getRoofY(x, z) + SHED_ROOF_THICKNESS / 2 + SHED_ROOF_BATTEN_HEIGHT / 2,
                z,
                MaterialEnum1.WOOD_PLANKS_DARK.uv,
                true,
                roofPitch,
                roofRoll,
            )
        }

        const addSteelFrameBar = (width: number, depth: number, x: number, z: number) => {
            addBlock(
                width,
                SHED_ROOF_STEEL_FRAME_HEIGHT,
                depth,
                x,
                this.getRoofY(x, z) - SHED_ROOF_THICKNESS / 2 - SHED_ROOF_STEEL_FRAME_HEIGHT / 2,
                z,
                MaterialEnum1.STEEL_1.uv,
                true,
                roofPitch,
                roofRoll,
            )
        }
        addSteelFrameBar(
            roofWidth,
            SHED_ROOF_STEEL_FRAME_WIDTH,
            roofMinX + roofWidth / 2,
            roofMinZ + SHED_ROOF_STEEL_FRAME_WIDTH / 2,
        )
        addSteelFrameBar(
            roofWidth,
            SHED_ROOF_STEEL_FRAME_WIDTH,
            roofMinX + roofWidth / 2,
            roofMinZ + roofDepth - SHED_ROOF_STEEL_FRAME_WIDTH / 2,
        )
        addSteelFrameBar(
            SHED_ROOF_STEEL_FRAME_WIDTH,
            roofDepth,
            roofMinX + SHED_ROOF_STEEL_FRAME_WIDTH / 2,
            roofMinZ + roofDepth / 2,
        )
        addSteelFrameBar(
            SHED_ROOF_STEEL_FRAME_WIDTH,
            roofDepth,
            roofMinX + roofWidth - SHED_ROOF_STEEL_FRAME_WIDTH / 2,
            roofMinZ + roofDepth / 2,
        )

        this.roofMesh = Mesh.MergeMeshes(roofParts, true, true)!
        this.roofMesh.name = `shed_${data.id}_roof`
        this.roofMesh.parent = parent
        this.roofMesh.material = fadeMaterial
        this.roofMesh.setVerticesData('uvc', roofUvData, false, 2)
        this.roofMesh.isPickable = false
        this.roofMesh.setEnabled(false)
        this.recountYPosition()
        Lights.registerSharedLightMesh(this.roofMesh)
        Lights.addShadowCaster(this.roofMesh, true, true)
    }

    getWidth() {
        return Number.isInteger(this.data.width) ? Math.max(SHED_MIN_SIZE, this.data.width!) : SHED_MIN_SIZE
    }

    getDepth() {
        return Number.isInteger(this.data.depth) ? Math.max(SHED_MIN_SIZE, this.data.depth!) : SHED_MIN_SIZE
    }

    getOccupiedTiles() {
        const tiles: {x: number, z: number}[] = []
        for (let x = 0; x < this.getWidth(); x++) {
            for (let z = 0; z < this.getDepth(); z++) {
                tiles.push({x: this.data.x + x, z: this.data.z + z})
            }
        }
        return tiles
    }

    getFloorTiles() {
        return []
    }

    getCollisionIndexTiles() {
        const tiles = new Map<string, {x: number, z: number}>()
        const addNearby = (x: number, z: number) => {
            for (let tileX = x - 1; tileX <= x + 1; tileX++) {
                for (let tileZ = z - 1; tileZ <= z + 1; tileZ++) {
                    tiles.set(`${tileX};${tileZ}`, {x: tileX, z: tileZ})
                }
            }
        }
        for (const x of [this.data.x, this.data.x + this.getWidth() - 1]) {
            for (const z of [this.data.z, this.data.z + this.getDepth() - 1]) addNearby(x, z)
        }
        for (const side of ['-X', '+X', '-Z', '+Z'] as BuildingFacing[]) {
            if (!this.hasShedSideFill(side)) continue
            const length = side === '-Z' || side === '+Z' ? this.getWidth() : this.getDepth()
            for (let offset = 0; offset < length; offset++) {
                addNearby(
                    this.data.x + (side === '-X' ? 0 : side === '+X' ? this.getWidth() - 1 : offset),
                    this.data.z + (side === '-Z' ? 0 : side === '+Z' ? this.getDepth() - 1 : offset),
                )
            }
        }
        return Array.from(tiles.values())
    }

    hasFloor() {
        return false
    }

    affectsInteriorLighting() {
        return false
    }

    isVisible() {
        return this.getOccupiedTiles().some((tile) => ViewportManager.isPointInVisibleMatrix(tile.x, tile.z, 1))
    }

    recountYPosition() {
        const block = WorldDataManager.getBlockMap()[this.data.x]?.[this.data.z]
        this.roofMesh.position.set(this.data.x, (block?.totalHeight ?? 0) + this.previewYOffset, this.data.z)
    }

    setPreviewYOffset(offset: number) {
        if (this.previewYOffset === offset) return false
        this.previewYOffset = offset
        this.recountYPosition()
        return true
    }

    isPointInCollision(x: number, z: number, size: number) {
        const halfMover = size / 2
        const halfPost = SHED_POST_SIZE / 2
        const hitsPost = [this.data.x - 0.5, this.data.x + this.getWidth() - 0.5].some((postX) => {
            return [this.data.z - 0.5, this.data.z + this.getDepth() - 0.5].some((postZ) => {
                return x - halfMover < postX + halfPost && x + halfMover > postX - halfPost
                    && z - halfMover < postZ + halfPost && z + halfMover > postZ - halfPost
            })
        })
        if (hitsPost) return true
        const minX = this.data.x - 0.5
        const maxX = this.data.x + this.getWidth() - 0.5
        const minZ = this.data.z - 0.5
        const maxZ = this.data.z + this.getDepth() - 0.5
        const halfFence = SHED_FENCE_THICKNESS / 2
        const intersects = (wallMinX: number, wallMaxX: number, wallMinZ: number, wallMaxZ: number) => {
            return x - halfMover < wallMaxX && x + halfMover > wallMinX
                && z - halfMover < wallMaxZ && z + halfMover > wallMinZ
        }
        return (this.hasShedSideFill('-X') && intersects(minX - halfFence, minX + halfFence, minZ, maxZ))
            || (this.hasShedSideFill('+X') && intersects(maxX - halfFence, maxX + halfFence, minZ, maxZ))
            || (this.hasShedSideFill('-Z') && intersects(minX, maxX, minZ - halfFence, minZ + halfFence))
            || (this.hasShedSideFill('+Z') && intersects(minX, maxX, maxZ - halfFence, maxZ + halfFence))
    }

    containsInteriorPoint(x: number, z: number) {
        return x > this.data.x - 0.4 && x < this.data.x + this.getWidth() - 0.6
            && z > this.data.z - 0.4 && z < this.data.z + this.getDepth() - 0.6
    }

    getDoorPosition() {
        return null
    }

    getCollisionCenter() {
        return {
            x: this.data.x + (this.getWidth() - 1) / 2,
            z: this.data.z + (this.getDepth() - 1) / 2,
        }
    }

    setDoorOpen(_open: boolean) {}

    updateDoorAnimation(_timeRate: number) {
        return false
    }

    intersectsOcclusionSegment(origin: Vector3, direction: Vector3, maxDistance: number) {
        const groundY = this.roofMesh.position.y
        return segmentIntersectsAabb(
            origin,
            direction,
            maxDistance,
            new Vector3(this.data.x - 0.5 - SHED_ROOF_OVERHANG, groundY, this.data.z - 0.5 - SHED_ROOF_OVERHANG),
            new Vector3(
                this.data.x + this.getWidth() - 0.5 + SHED_ROOF_OVERHANG,
                groundY + SHED_POST_HEIGHT + this.getRoofRise() + SHED_ROOF_THICKNESS,
                this.data.z + this.getDepth() - 0.5 + SHED_ROOF_OVERHANG,
            ),
        )
    }

    setVisible(visible: boolean) {
        this.visible = visible
        this.roofMesh.setEnabled(visible && !this.isRoofBatched())
    }

    isRoofBatched() {
        return this.roofVisibility === 1 && !this.shouldOcclusionFade
    }

    appendBatchedBlocks(matrices: Matrix[], uvData: Vector2[]) {
        if (!this.visible) return
        this.roofInBatch = this.isRoofBatched()
        const world = Matrix.Translation(this.roofMesh.position.x, this.roofMesh.position.y, this.roofMesh.position.z)
        this.blockParts.forEach((part, index) => {
            if (!this.roofInBatch && index >= this.roofPartStart) return
            matrices.push(part.matrix.multiply(world))
            uvData.push(part.material)
        })
    }

    appendBatchedGlass(_matrices: Matrix[], _uvData: Vector2[], _prefabs: BuildingPrefabs) {}

    updateFade(timeRate: number, playerInside: boolean, selectedTargetInside: boolean) {
        const hideRoof = playerInside || selectedTargetInside
        const target = hideRoof ? HIDDEN_ROOF_VISIBILITY : this.shouldOcclusionFade ? FADED_ALPHA : 1
        if (this.roofVisibility !== target) {
            const step = ((1 - HIDDEN_ROOF_VISIBILITY) / FADE_DURATION) * timeRate
            this.roofVisibility = this.roofVisibility < target
                ? Math.min(this.roofVisibility + step, target)
                : Math.max(this.roofVisibility - step, target)
            this.roofMesh.visibility = this.roofVisibility
        }
        this.setVisible(this.visible)
        return this.roofInBatch !== this.isRoofBatched()
    }

    dispose() {
        Lights.unregisterSharedLightMesh(this.roofMesh)
        Lights.removeShadowCaster(this.roofMesh, true, true)
        this.roofMesh.dispose()
    }

    private getHighSide() {
        const side = this.data.shedHighSide
        return side === '-X' || side === '+X' || side === '-Z' ? side : '+Z'
    }

    private hasShedSideFill(side: BuildingFacing) {
        return this.data.shedSideFills?.[side] === 'CAMP_FENCE'
    }

    private isHighSide(x: number, z: number) {
        const side = this.getHighSide()
        return (side === '-X' && x < 0) || (side === '+X' && x > this.getWidth() - 1)
            || (side === '-Z' && z < 0) || (side === '+Z' && z > this.getDepth() - 1)
    }

    private getRoofPitch() {
        const angle = Math.atan(this.getRoofRise() / this.getDepth())
        return this.getHighSide() === '+Z' ? -angle : this.getHighSide() === '-Z' ? angle : 0
    }

    private getRoofRoll() {
        const angle = Math.atan(this.getRoofRise() / this.getWidth())
        return this.getHighSide() === '+X' ? angle : this.getHighSide() === '-X' ? -angle : 0
    }

    private getRoofY(x: number, z: number) {
        const side = this.getHighSide()
        const progress = side === '+X' ? (x + 0.5) / this.getWidth()
            : side === '-X' ? (this.getWidth() - 0.5 - x) / this.getWidth()
                : side === '+Z' ? (z + 0.5) / this.getDepth()
                    : (this.getDepth() - 0.5 - z) / this.getDepth()
        return SHED_POST_HEIGHT + progress * this.getRoofRise() + SHED_ROOF_THICKNESS / 2
    }

    private getRoofRise() {
        const side = this.getHighSide()
        return SHED_ROOF_RISE_PER_TILE * (side === '-X' || side === '+X' ? this.getWidth() : this.getDepth())
    }
}

type RenderedBuilding = BuildingView | ShedView

export const BuildingManager = {
    buildings: new Map<number, RenderedBuilding>(),
    floorTiles: new Map<string, RenderedBuilding>(),
    collisionTiles: new Map<string, Set<RenderedBuilding>>(),
    housePrefabs: null as BuildingPrefabs | null,
    opaqueBatchMesh: null as Mesh | null,
    glassBatchMesh: null as Mesh | null,
    fadeMaterial: null as PBRMaterial | null,
    parent: null as TransformNode | null,
    occlusionCheckIntervalFrames: 10,
    occlusionCheckFrame: 0,
    selectionPreviewBuilding: null as RenderedBuilding | null,
    selectionPreviewStartTime: 0,

    initialize(scene: Scene, parent: TransformNode) {
        this.parent = parent
        this.occlusionCheckFrame = 0
        Lights.enableTransparentShadowCasters()
        this.fadeMaterial = Materials.createBlockMat1(scene)
        this.fadeMaterial.name = 'building_faded_material'
        this.fadeMaterial.alpha = 1
        this.fadeMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
        this.housePrefabs = this.createHousePrefab(scene)
        this.opaqueBatchMesh = MeshBuilder.CreateBox('buildingOpaqueBlockBatch', {width: 1, height: 1, depth: 1, wrap: true}, scene)
        this.opaqueBatchMesh.parent = parent
        this.opaqueBatchMesh.position.y = -0.5
        this.opaqueBatchMesh.convertToUnIndexedMesh()
        this.opaqueBatchMesh.material = Materials.blockMat1!
        this.opaqueBatchMesh.isPickable = false
        this.opaqueBatchMesh.alwaysSelectAsActiveMesh = true
        this.opaqueBatchMesh.doNotSyncBoundingInfo = true
        this.opaqueBatchMesh.receiveShadows = true
        Lights.registerSharedLightMesh(this.opaqueBatchMesh)
        Lights.addShadowCaster(this.opaqueBatchMesh, true, true)
        this.glassBatchMesh = MeshBuilder.CreatePlane('buildingGlassBatch', {width: 1, height: 1}, scene)
        this.glassBatchMesh.parent = parent
        this.glassBatchMesh.convertToUnIndexedMesh()
        this.glassBatchMesh.material = Materials.blockMatTrans!
        this.glassBatchMesh.isPickable = false
        this.glassBatchMesh.alwaysSelectAsActiveMesh = true
        this.glassBatchMesh.doNotSyncBoundingInfo = true
        Lights.registerSharedLightMesh(this.glassBatchMesh)
    },

    consumeBuildings(data: BuildingData[]) {
        data.forEach((building) => this.addBuilding(building))
    },

    addBuilding(data: BuildingData) {
        if ((data.tp !== HUMAN_HOUSE_TYPE && data.tp !== SHED_TYPE)
            || this.buildings.has(data.id) || !this.housePrefabs || !this.parent || !this.fadeMaterial) {
            return
        }
        const building = data.tp === SHED_TYPE
            ? new ShedView(data, this.parent, this.fadeMaterial)
            : new BuildingView(data, this.housePrefabs, this.parent, this.fadeMaterial)
        this.buildings.set(data.id, building)
        building.getFloorTiles().forEach((tile) => this.floorTiles.set(`${tile.x};${tile.z}`, building))
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
        if (this.selectionPreviewBuilding === building) this.selectionPreviewBuilding = null
        building.getFloorTiles().forEach((tile) => {
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

    getBuildingOnTile(x: number, z: number): BuildingData | null {
        const building = Array.from(this.buildings.values()).find((candidate) => {
            return x >= candidate.data.x && x < candidate.data.x + candidate.getWidth()
                && z >= candidate.data.z && z < candidate.data.z + candidate.getDepth()
        })
        return building?.data ?? null
    },

    updateSelectionPreview(active: boolean, x: number, z: number, time: number) {
        const target = active
            ? Array.from(this.buildings.values()).find((candidate) => {
                return x >= candidate.data.x && x < candidate.data.x + candidate.getWidth()
                    && z >= candidate.data.z && z < candidate.data.z + candidate.getDepth()
            }) ?? null
            : null
        let changed = false
        if (target !== this.selectionPreviewBuilding) {
            changed = this.selectionPreviewBuilding?.setPreviewYOffset(0) === true || changed
            this.selectionPreviewBuilding = target
            this.selectionPreviewStartTime = time
        }
        if (target) {
            const elapsed = time - this.selectionPreviewStartTime
            const offset = ((Math.sin((elapsed * 0.008) - (Math.PI / 2)) + 1) * 0.5) * 0.175
            changed = target.setPreviewYOffset(offset) || changed
        }
        if (changed) this.rebuildOpaqueBatch()
    },

    getFloorHeightAtTile(x: number, z: number) {
        return this.floorTiles.has(`${x};${z}`) ? FLOOR_HEIGHT : 0
    },

    hasFloorAtTile(x: number, z: number) {
        return this.floorTiles.has(`${x};${z}`)
    },

    getClosestDoorIdInDistance(position: Vector3, maxDistance: number) {
        let closestId: number | null = null
        let closestDistanceSquared = maxDistance * maxDistance
        this.buildings.forEach((building) => {
            const door = building.getDoorPosition()
            if (!door) return
            const dx = position.x - door.x
            const dz = position.z - door.z
            const distanceSquared = dx * dx + dz * dz
            if (distanceSquared <= closestDistanceSquared) {
                closestDistanceSquared = distanceSquared
                closestId = building.data.id
            }
        })
        return closestId
    },

    setDoorOpen(id: number, open: boolean) {
        this.buildings.get(id)?.setDoorOpen(open)
    },

    getPointInBuilding(x: number, z: number, size: number, coveredBlocks: {x: number, z: number}[]) {
        const candidates = new Set<RenderedBuilding>()
        coveredBlocks.forEach((tile) => {
            this.collisionTiles.get(`${tile.x};${tile.z}`)?.forEach((building) => candidates.add(building))
        })
        for (const building of candidates) {
            if (building.isPointInCollision(x, z, size)) {
                return building.getCollisionCenter()
            }
        }
        return null
    },

    recountYPositions() {
        this.buildings.forEach((building) => building.recountYPosition())
        this.rebuildOpaqueBatch()
    },

    onFrame(timeRate: number, camera: Camera | null) {
        const playerX = MyPlayer.myChar?.pos.x ?? null
        const playerZ = MyPlayer.myChar?.pos.z ?? null
        const selectedTarget = TargetingManager.selectedTarget
        const selectedTargetX = selectedTarget != null && selectedTarget !== MyPlayer.myChar
            ? selectedTarget.pos.x
            : null
        const selectedTargetZ = selectedTarget != null && selectedTarget !== MyPlayer.myChar
            ? selectedTarget.pos.z
            : null
        this.occlusionCheckFrame++
        if (this.occlusionCheckFrame >= this.occlusionCheckIntervalFrames) {
            this.occlusionCheckFrame = 0
            this.updateOcclusion(camera)
        }
        let playerInsideBuilding = false
        let rebuildOpaqueBatch = false
        this.buildings.forEach((building) => {
            rebuildOpaqueBatch = building.updateDoorAnimation(timeRate) || rebuildOpaqueBatch
            const playerInside = playerX != null
                && playerZ != null
                && building.containsInteriorPoint(playerX, playerZ)
            const selectedTargetInside = selectedTargetX != null
                && selectedTargetZ != null
                && building.containsInteriorPoint(selectedTargetX, selectedTargetZ)
            playerInsideBuilding ||= playerInside && building.affectsInteriorLighting()
            rebuildOpaqueBatch = building.updateFade(timeRate, playerInside, selectedTargetInside) || rebuildOpaqueBatch
        })
        if (rebuildOpaqueBatch) this.rebuildOpaqueBatch()
        Lights.setInsideBuilding(playerInsideBuilding)
    },

    updateOcclusion(camera: Camera | null) {
        if (camera == null || MyPlayer.myModel == null) {
            this.buildings.forEach((building) => building.shouldOcclusionFade = false)
            return
        }

        const cameraPosition = camera.globalPosition
        const playerCenter = MyPlayer.myModel.node.getAbsolutePosition().clone()
        playerCenter.y += MyPlayer.myChar.getModelHeight() / 2
        const occlusionTargets = [playerCenter]
        const selectedTarget = TargetingManager.selectedTarget
        if (selectedTarget != null && selectedTarget !== MyPlayer.myChar) {
            occlusionTargets.push(new Vector3(
                selectedTarget.pos.x,
                selectedTarget.pos.y + (selectedTarget.getModelHeight() / 2),
                selectedTarget.pos.z,
            ))
        }
        const segments = occlusionTargets.map(target => {
            const direction = target.subtract(cameraPosition)
            const distance = direction.length()
            if (distance > 0) direction.scaleInPlace(1 / distance)
            return { direction, distance }
        }).filter(segment => segment.distance > 0)

        this.buildings.forEach((building) => {
            building.shouldOcclusionFade = building.isVisible()
                && segments.some(segment => building.intersectsOcclusionSegment(
                    cameraPosition,
                    segment.direction,
                    segment.distance,
                ))
        })
    },

    renderBuildings() {
        this.buildings.forEach((building) => building.setVisible(building.isVisible()))
        this.rebuildOpaqueBatch()
    },

    rebuildOpaqueBatch() {
        if (!this.opaqueBatchMesh || !this.glassBatchMesh || !this.housePrefabs) return
        const matrices: Matrix[] = []
        const uvData: Vector2[] = []
        const glassMatrices: Matrix[] = []
        const glassUvData: Vector2[] = []
        this.buildings.forEach((building) => building.appendBatchedBlocks(matrices, uvData, this.housePrefabs!))
        this.buildings.forEach((building) => building.appendBatchedGlass(glassMatrices, glassUvData, this.housePrefabs!))
        this.opaqueBatchMesh.thinInstanceSetBuffer('matrix', BabylonUtils.createPositionBuffer(matrices), 16)
        this.opaqueBatchMesh.thinInstanceSetBuffer('uvc', BabylonUtils.createUvBuffer(uvData), 2)
        this.opaqueBatchMesh.thinInstanceRefreshBoundingInfo(false)
        this.glassBatchMesh.thinInstanceSetBuffer('matrix', BabylonUtils.createPositionBuffer(glassMatrices), 16)
        this.glassBatchMesh.thinInstanceSetBuffer('uvc', BabylonUtils.createUvBuffer(glassUvData), 2)
        this.glassBatchMesh.thinInstanceRefreshBoundingInfo(false)
    },

    clearWorld() {
        Lights.setInsideBuilding(false)
        this.selectionPreviewBuilding = null
        this.buildings.forEach((building) => building.dispose())
        this.buildings.clear()
        this.floorTiles.clear()
        this.collisionTiles.clear()
        this.rebuildOpaqueBatch()
    },

    createHousePrefab(scene: Scene) {
        type PartGroup = 'base' | 'wallMinX' | 'wallMaxX' | 'wallMinZ' | 'wallMaxZ' | 'roof' | 'door' | 'glass'
        const groups = {} as Record<PartGroup, {parts: Mesh[], uvData: number[]}>
        const blockParts = {} as Record<OpaquePartGroup, BuildingBlockPart[]>
        const glassPanes: Matrix[] = []
        for (const group of ['base', 'wallMinX', 'wallMaxX', 'wallMinZ', 'wallMaxZ', 'roof', 'door', 'glass'] as PartGroup[]) {
            groups[group] = {parts: [], uvData: []}
        }
        for (const group of ['base', 'wallMinX', 'wallMaxX', 'wallMinZ', 'wallMaxZ', 'roof', 'door'] as OpaquePartGroup[]) {
            blockParts[group] = []
        }
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
            group: PartGroup = 'base',
        ) => {
            const box = MeshBuilder.CreateBox(name, {width, height, depth, wrap: true}, scene)
            box.position.set(x, y, z)
            box.rotation.x = rotationX
            box.convertToUnIndexedMesh()
            const uvData = groups[group].uvData
            for (let i = 0; i < box.getTotalVertices(); i++) {
                uvData.push(material.x, material.y)
            }
            groups[group].parts.push(box)
            if (group !== 'glass') {
                blockParts[group].push({
                    matrix: Matrix.Scaling(width, height, depth)
                        .multiply(Matrix.RotationX(rotationX))
                        .multiply(Matrix.Translation(x, y + 0.5, z)),
                    material,
                })
            }
        }
        const addWallGrid = (
            name: string,
            length: number,
            height: number,
            x: number,
            y: number,
            z: number,
            runsAlongX: boolean,
            group: PartGroup,
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
                        0,
                        group,
                    )
                    heightOffset += pieceHeight
                }
                lengthOffset += pieceLength
            }
        }
        const addWindowPane = (x: number, z: number) => {
            const pane = MeshBuilder.CreatePlane('buildingWindowGlass', {
                width: WINDOW_WIDTH,
                height: WINDOW_HEIGHT,
            }, scene)
            pane.position.set(x, WINDOW_BOTTOM + WINDOW_HEIGHT / 2, z)
            pane.convertToUnIndexedMesh()
            for (let i = 0; i < pane.getTotalVertices(); i++) {
                groups.glass.uvData.push(MaterialEnumTrans.GLASS.uv.x, MaterialEnumTrans.GLASS.uv.y)
            }
            groups.glass.parts.push(pane)
            glassPanes.push(
                Matrix.Scaling(WINDOW_WIDTH, WINDOW_HEIGHT, 1)
                    .multiply(Matrix.Translation(x, WINDOW_BOTTOM + WINDOW_HEIGHT / 2, z)),
            )
        }

        for (let x = 0; x < HOUSE_WIDTH; x++) {
            for (let z = 0; z < HOUSE_DEPTH; z++) {
                const minXEdge = x === 0
                const maxXEdge = x === HOUSE_WIDTH - 1
                const minZEdge = z === 0
                const hasFrontFloor = x >= DOOR_CENTER_X - 1 && x <= DOOR_CENTER_X + 1
                const maxZEdge = z === HOUSE_DEPTH - 1 && !hasFrontFloor
                addBox(
                    'buildingFloor',
                    1 + (minXEdge ? FLOOR_OVERHANG : 0) + (maxXEdge ? FLOOR_OVERHANG : 0),
                    FLOOR_HEIGHT,
                    1 + (minZEdge ? FLOOR_OVERHANG : 0) + (maxZEdge ? FLOOR_OVERHANG : 0),
                    x + (maxXEdge ? FLOOR_OVERHANG / 2 : 0) - (minXEdge ? FLOOR_OVERHANG / 2 : 0),
                    FLOOR_HEIGHT / 2,
                    z + (maxZEdge ? FLOOR_OVERHANG / 2 : 0) - (minZEdge ? FLOOR_OVERHANG / 2 : 0),
                    MaterialEnum1.ROCK1.uv,
                )
            }
        }
        for (const x of [DOOR_CENTER_X - 1, DOOR_CENTER_X, DOOR_CENTER_X + 1]) {
            addBox(
                'buildingFrontFloor',
                1,
                FLOOR_HEIGHT,
                1,
                x,
                FLOOR_HEIGHT / 2,
                HOUSE_DEPTH,
                MaterialEnum1.ROCK1.uv,
            )
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
                        FLOOR_HEIGHT + PILLAR_SIZE / 2 + level * PILLAR_SIZE,
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
        const addWindowSection = (
            sectionStart: number,
            sectionEnd: number,
            windowCenter: number,
            z: number,
            group: PartGroup,
        ) => {
            addWindowPane(windowCenter, z)
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
                group,
            )
            addWallGrid(
                'buildingWindowTop',
                sectionLength,
                topHeight,
                sectionCenter,
                WINDOW_BOTTOM + WINDOW_HEIGHT + topHeight / 2,
                z,
                true,
                group,
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
                    group,
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
                    group,
                )
            }
        }
        for (const segment of longWallSegments) {
            for (const z of [-0.5, HOUSE_DEPTH - 0.5]) {
                const wallGroup: PartGroup = z === -0.5 ? 'wallMinZ' : 'wallMaxZ'
                if (z === HOUSE_DEPTH - 0.5 && segment.center === DOOR_CENTER_X) continue
                if (z === HOUSE_DEPTH - 0.5 && (segment.center === 3 || segment.center === 3.9)) continue
                const hasWindow = z === -0.5 && (segment.center === 1 || segment.center === 3)
                if (hasWindow) {
                    addWindowSection(
                        segment.center - segment.length / 2,
                        segment.center + segment.length / 2,
                        segment.center,
                        z,
                        wallGroup,
                    )
                    continue
                }
                for (let level = 0; level < 2; level++) {
                    addWallGrid(
                        'buildingWall',
                        segment.length,
                        WALL_HEIGHT,
                        segment.center,
                        FLOOR_HEIGHT + WALL_HEIGHT / 2 + level * WALL_HEIGHT,
                        z,
                        true,
                        wallGroup,
                    )
                }
            }
        }
        addWindowSection(2.5, 4.3, 3.5, HOUSE_DEPTH - 0.5, 'wallMaxZ')
        addWallGrid(
            'buildingDoorLintel',
            DOOR_OPENING_WIDTH,
            0.2,
            DOOR_CENTER_X,
            FLOOR_HEIGHT + DOOR_HEIGHT + 0.1,
            HOUSE_DEPTH - 0.5,
            true,
            'wallMaxZ',
        )
        for (let xStep = 0; xStep < 2; xStep++) {
            for (let yStep = 0; yStep < 4; yStep++) {
                addBox(
                    'buildingDoor',
                    DOOR_WIDTH / 2,
                    DOOR_HEIGHT / 4,
                    DOOR_THICKNESS,
                    DOOR_CENTER_X - DOOR_WIDTH / 4 + xStep * DOOR_WIDTH / 2,
                    FLOOR_HEIGHT + DOOR_HEIGHT / 8 + yStep * DOOR_HEIGHT / 4,
                    HOUSE_DEPTH - 0.5,
                    MaterialEnum1.WOOD_PLANKS_DARK.uv,
                    0,
                    'door',
                )
            }
        }
        for (const heightRatio of [0.25, 0.75]) {
            addBox(
                'buildingDoorBrace',
                DOOR_WIDTH,
                DOOR_BRACE_HEIGHT,
                DOOR_BRACE_DEPTH,
                DOOR_CENTER_X,
                FLOOR_HEIGHT + DOOR_HEIGHT * heightRatio,
                HOUSE_DEPTH - 0.5 + DOOR_THICKNESS / 2 + DOOR_BRACE_DEPTH / 2,
                MaterialEnum1.WOOD_1.uv,
                0,
                'door',
            )
        }
        const shortWallSegments = [
            {center: 0.1, length: 0.8},
            {center: 1, length: 1},
            {center: 1.9, length: 0.8},
        ]
        for (const segment of shortWallSegments) {
            for (const x of [-0.5, HOUSE_WIDTH - 0.5]) {
                const wallGroup: PartGroup = x === -0.5 ? 'wallMinX' : 'wallMaxX'
                for (let level = 0; level < 2; level++) {
                    addWallGrid(
                        'buildingWall',
                        segment.length,
                        WALL_HEIGHT,
                        x,
                        FLOOR_HEIGHT + WALL_HEIGHT / 2 + level * WALL_HEIGHT,
                        segment.center,
                        false,
                        wallGroup,
                    )
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
                    MaterialEnum1.HAY.uv,
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
        const source = {
            base: mergeParts(groups.base.parts, groups.base.uvData, 'humanHouseBaseSource', Materials.blockMat1!),
            wallMinX: mergeParts(groups.wallMinX.parts, groups.wallMinX.uvData, 'humanHouseWallMinXSource', Materials.blockMat1!),
            wallMaxX: mergeParts(groups.wallMaxX.parts, groups.wallMaxX.uvData, 'humanHouseWallMaxXSource', Materials.blockMat1!),
            wallMinZ: mergeParts(groups.wallMinZ.parts, groups.wallMinZ.uvData, 'humanHouseWallMinZSource', Materials.blockMat1!),
            wallMaxZ: mergeParts(groups.wallMaxZ.parts, groups.wallMaxZ.uvData, 'humanHouseWallMaxZSource', Materials.blockMat1!),
        }
        type WallKey = 'wallMinX' | 'wallMaxX' | 'wallMinZ' | 'wallMaxZ'
        const wallKeys: WallKey[] = ['wallMinX', 'wallMaxX', 'wallMinZ', 'wallMaxZ']
        const frontWallKeys: Record<BuildingFacing, WallKey[]> = {
            '+Z': ['wallMinX', 'wallMinZ'],
            '-Z': ['wallMaxX', 'wallMaxZ'],
            '+X': ['wallMaxX', 'wallMinZ'],
            '-X': ['wallMinX', 'wallMaxZ'],
        }
        const mergePrefabs = (meshes: Mesh[], name: string) => {
            const clones = meshes.map((mesh, index) => {
                const clone = mesh.clone(`${name}_${index}`)!
                clone.setEnabled(true)
                return clone
            })
            const uvData = meshes.flatMap((mesh) => Array.from(mesh.getVerticesData('uvc') ?? []))
            return mergeParts(clones, uvData, name, Materials.blockMat1!)
        }
        const variants = {} as BuildingPrefabs['variants']
        for (const facing of ['+X', '-X', '+Z', '-Z'] as BuildingFacing[]) {
            const front = frontWallKeys[facing]
            variants[facing] = {
                shell: mergePrefabs(
                    [source.base, ...wallKeys.filter((key) => !front.includes(key)).map((key) => source[key])],
                    `humanHouseShell5x3_${facing}`,
                ),
                frontWalls: mergePrefabs(
                    front.map((key) => source[key]),
                    `humanHouseFrontWalls5x3_${facing}`,
                ),
            }
        }
        Object.values(source).forEach((mesh) => mesh.dispose())
        return {
            variants,
            roof: mergeParts(groups.roof.parts, groups.roof.uvData, 'humanHouseRoof5x3Prefab', this.fadeMaterial!),
            door: mergeParts(groups.door.parts, groups.door.uvData, 'humanHouseDoor5x3Prefab', this.fadeMaterial!),
            glass: mergeParts(groups.glass.parts, groups.glass.uvData, 'humanHouseGlass5x3Prefab', Materials.blockMatTrans!),
            blocks: blockParts,
            glassPanes,
        }
    },
}
