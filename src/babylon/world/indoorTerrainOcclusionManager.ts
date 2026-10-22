import { Matrix, Mesh, PBRMaterial, Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { Builder } from '@/babylon/builder'
import { Materials } from '@/babylon/materials'
import { MapBlock } from '@/data/worldDataManager'
import { MyPlayer } from '@/data/myPlayer'
import { TargetingManager } from '@/gui/targettingManager'
import { Lights } from '@/babylon/scene/lights'
import { segmentIntersectsAabb } from '@/babylon/geometryUtils'
import { CharacterManager } from '@/babylon/character/characterManager'
import { NpcManager } from '@/babylon/npc/npcManager'

const FADED_VISIBILITY = 0.42
const FADE_DURATION_SECONDS = 0.24
const FADE_MATERIAL_STEPS = 12
const OCCLUSION_RADIUS_TILES = 1
const HEIGHT_EPSILON = 0.01
const TARGET_REFRESH_INTERVAL_SECONDS = 0.1

interface FadingTerrainBlock {
    visibility: number
    targetVisibility: number
    matrix: Matrix | null
    uv: Vector2 | null
    mesh: Mesh | null
    material: PBRMaterial | null
    rendered: boolean
}

interface TerrainOcclusionTarget {
    position: Vector3
    modelHeight: number
}

/**
 * Moves only the upper parts of nearby indoor terrain walls out of the opaque
 * terrain batch. Fully faded blocks share one thin-instance mesh; blocks that
 * are actively fading temporarily own a mesh so their visibility can animate
 * independently.
 */
export const IndoorTerrainOcclusionManager = {
    fadedMesh: null as Mesh | null,
    fadedMaterial: null as PBRMaterial | null,
    blocks: new Map<string, FadingTerrainBlock>(),
    fadedMatrices: [] as Matrix[],
    fadedUvData: [] as Vector2[],
    transitionMaterials: new Map<number, PBRMaterial>(),
    enabled: false,
    targetSignature: '',
    targetRefreshElapsed: 0,

    initialize(scene: Scene, parent: TransformNode) {
        this.blocks = new Map()
        this.fadedMatrices = []
        this.fadedUvData = []
        this.transitionMaterials = new Map()
        this.enabled = false
        this.targetSignature = ''
        this.targetRefreshElapsed = 0
        Lights.enableTransparentShadowCasters()
        this.fadedMaterial = Materials.createTerrainMaterial1(scene)
        this.fadedMaterial.name = 'indoor_terrain_faded_material'
        // Keep mesh.visibility at 1 so Babylon's transparent-shadow shader
        // produces a full-strength shadow. Visual fading is material-only.
        this.fadedMaterial.alpha = FADED_VISIBILITY
        this.fadedMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
        this.fadedMaterial.forceAlphaTest = false

        this.fadedMesh = Builder.createBlockWithFaces(scene, parent)
        this.fadedMesh.name = 'indoor_terrain_faded_blocks'
        this.fadedMesh.material = this.fadedMaterial
        this.fadedMesh.visibility = 1
        this.fadedMesh.isPickable = false
        this.fadedMesh.receiveShadows = true
        this.fadedMesh.doNotSyncBoundingInfo = true
        this.fadedMesh.setEnabled(false)
        Lights.registerSharedLightMesh(this.fadedMesh)
        // Match ordinary block terrain: sun and personal-light shadows, but
        // do not add every terrain block to cached static-light shadow maps.
        Lights.addShadowCaster(this.fadedMesh, true)
    },

    async warmUpFadeShader() {
        if (!this.fadedMesh || !this.fadedMaterial) return
        await this.fadedMaterial.forceCompilationAsync(this.fadedMesh)
        await this.fadedMaterial.forceCompilationAsync(this.fadedMesh, {useInstances: true})
    },

    beginTerrainRender(blockMap: MapBlock[][], indoor: boolean) {
        this.enabled = indoor
        const targets = this.getOcclusionTargets()
        this.targetSignature = indoor ? this.getTargetSignature(targets) : ''
        const cameraPosition = this.fadedMesh?.getScene().activeCamera?.globalPosition ?? null
        const desiredBlocks = indoor && cameraPosition
            ? this.collectDesiredBlocks(blockMap, targets, cameraPosition)
            : new Set<string>()

        for (const [key, block] of this.blocks) {
            block.rendered = false
            block.targetVisibility = desiredBlocks.has(key) ? FADED_VISIBILITY : 1
        }
        for (const key of desiredBlocks) {
            if (!this.blocks.has(key)) {
                this.blocks.set(key, {
                    visibility: 1,
                    targetVisibility: FADED_VISIBILITY,
                    matrix: null,
                    uv: null,
                    mesh: null,
                    material: null,
                    rendered: false,
                })
            }
        }

        this.fadedMatrices = []
        this.fadedUvData = []
    },

    routeTerrainBlock(
        x: number,
        z: number,
        topY: number,
        matrix: Matrix,
        uv: Vector2,
        opaqueMatrices: Matrix[],
        opaqueUvData: Vector2[],
    ) {
        const block = this.blocks.get(this.getBlockKey(x, z, topY))
        if (!block) {
            opaqueMatrices.push(matrix)
            opaqueUvData.push(uv)
            return
        }

        block.rendered = true
        block.matrix = matrix
        block.uv = uv
        if (block.visibility === FADED_VISIBILITY && block.targetVisibility === FADED_VISIBILITY) {
            this.disposeTransitionMesh(block)
            this.fadedMatrices.push(matrix)
            this.fadedUvData.push(uv)
            return
        }

        this.syncTransitionMesh(block)
    },

    finishTerrainRender() {
        for (const [key, block] of this.blocks) {
            if (!block.rendered) {
                this.disposeTransitionMesh(block)
                this.blocks.delete(key)
            }
        }

        const mesh = this.fadedMesh
        if (!mesh) return
        mesh.thinInstanceSetBuffer('matrix', BabylonUtils.createPositionBuffer(this.fadedMatrices), 16, false)
        mesh.thinInstanceSetBuffer('uvc', BabylonUtils.createUvBuffer(this.fadedUvData), 2)
        mesh.setEnabled(this.fadedMatrices.length > 0)
        if (this.fadedMatrices.length > 0) {
            mesh.thinInstanceRefreshBoundingInfo(false)
        }
    },

    /** Returns true when the opaque and faded batches need to be rebuilt. */
    onFrame(timeRate: number): boolean {
        this.targetRefreshElapsed += timeRate
        let rebuildTerrain = false
        if (this.enabled && this.targetRefreshElapsed >= TARGET_REFRESH_INTERVAL_SECONDS) {
            this.targetRefreshElapsed %= TARGET_REFRESH_INTERVAL_SECONDS
            rebuildTerrain = this.getTargetSignature(this.getOcclusionTargets()) !== this.targetSignature
        }
        const step = ((1 - FADED_VISIBILITY) / FADE_DURATION_SECONDS) * timeRate

        for (const [key, block] of this.blocks) {
            if (block.visibility === block.targetVisibility) continue

            block.visibility = block.visibility < block.targetVisibility
                ? Math.min(block.visibility + step, block.targetVisibility)
                : Math.max(block.visibility - step, block.targetVisibility)
            this.applyTransitionMaterial(block)

            if (block.visibility === block.targetVisibility) {
                this.disposeTransitionMesh(block)
                if (block.targetVisibility === 1) this.blocks.delete(key)
                rebuildTerrain = true
            }
        }
        return rebuildTerrain
    },

    clear() {
        this.blocks.forEach(block => this.disposeTransitionMesh(block))
        this.blocks.clear()
        this.fadedMatrices = []
        this.fadedUvData = []
        this.targetSignature = ''
        this.targetRefreshElapsed = 0
        this.fadedMesh?.thinInstanceSetBuffer('matrix', new Float32Array(0), 16, false)
        this.fadedMesh?.thinInstanceSetBuffer('uvc', new Float32Array(0), 2)
        this.fadedMesh?.setEnabled(false)
    },

    getOcclusionTargets(): TerrainOcclusionTarget[] {
        const targets: TerrainOcclusionTarget[] = []
        const included = new Set<object>()
        const addTarget = (target: {pos: Vector3, getModelHeight(): number} | null | undefined) => {
            if (!target || included.has(target)) return
            included.add(target)
            targets.push({position: target.pos, modelHeight: target.getModelHeight()})
        }

        addTarget(MyPlayer.myChar)
        CharacterManager.visibleCharacters.forEach(id => addTarget(CharacterManager.characters.get(id)))
        NpcManager.visibleNpcs.forEach(id => addTarget(NpcManager.npcs.get(id)))
        NpcManager.visibleGuards.forEach(id => addTarget(NpcManager.guards.get(id)))

        // The selected target is always protected, including a monster. Other
        // monsters are deliberately absent from the regular target lists.
        const selectedTarget = TargetingManager.selectedTarget
        addTarget(selectedTarget)
        return targets
    },

    collectDesiredBlocks(blockMap: MapBlock[][], targets: TerrainOcclusionTarget[], cameraPosition: Vector3): Set<string> {
        const desired = new Set<string>()
        for (const target of targets) {
            const targetX = Math.round(target.position.x)
            const targetZ = Math.round(target.position.z)
            const floor = blockMap[targetX]?.[targetZ]
            if (!floor || floor.type <= 0) continue
            const cameraOffsetX = cameraPosition.x - target.position.x
            const cameraOffsetZ = cameraPosition.z - target.position.z

            for (let x = targetX - OCCLUSION_RADIUS_TILES; x <= targetX + OCCLUSION_RADIUS_TILES; x++) {
                for (let z = targetZ - OCCLUSION_RADIUS_TILES; z <= targetZ + OCCLUSION_RADIUS_TILES; z++) {
                    if (x === targetX && z === targetZ) continue

                    // Dungeon cameras look diagonally across the tile grid.
                    // Keep only the half of the neighborhood that lies toward
                    // the camera; walls behind or beside the actor cannot
                    // cover it and must remain opaque.
                    const cameraSideDot = (x - target.position.x) * cameraOffsetX
                        + (z - target.position.z) * cameraOffsetZ
                    if (cameraSideDot <= 0) continue

                    const wall = blockMap[x]?.[z]
                    if (!wall || wall.type <= 0) continue
                    if (this.isIsolatedColumn(blockMap, x, z, floor.walkHeight)
                        && !this.doesColumnOccludeTarget(cameraPosition, target, floor.walkHeight, wall.height, x, z)) {
                        continue
                    }

                    // The first block above the floor remains opaque. It does
                    // not cover an actor; only wall levels above it are faded.
                    for (let topY = Math.floor(floor.walkHeight) + 2; topY <= wall.height; topY++) {
                        if (topY > floor.walkHeight + 1 + HEIGHT_EPSILON) {
                            desired.add(this.getBlockKey(x, z, topY))
                        }
                    }
                }
            }
        }
        return desired
    },

    isIsolatedColumn(blockMap: MapBlock[][], x: number, z: number, floorHeight: number): boolean {
        return ![[-1, 0], [1, 0], [0, -1], [0, 1]].some(([offsetX, offsetZ]) => {
            const neighbor = blockMap[x + offsetX]?.[z + offsetZ]
            return neighbor != null && neighbor.type > 0
                && neighbor.height > floorHeight + 1 + HEIGHT_EPSILON
        })
    },

    doesColumnOccludeTarget(
        cameraPosition: Vector3,
        target: TerrainOcclusionTarget,
        floorHeight: number,
        wallHeight: number,
        x: number,
        z: number,
    ): boolean {
        const targetCenter = new Vector3(
            target.position.x,
            target.position.y + target.modelHeight / 2,
            target.position.z,
        )
        const direction = targetCenter.subtract(cameraPosition)
        const distance = direction.length()
        if (distance <= 0) return false
        direction.scaleInPlace(1 / distance)

        return segmentIntersectsAabb(
            cameraPosition,
            direction,
            distance,
            new Vector3(x - 0.5, floorHeight + 1, z - 0.5),
            new Vector3(x + 0.5, wallHeight, z + 0.5),
        )
    },

    getBlockKey(x: number, z: number, topY: number): string {
        return `${x};${z};${topY}`
    },

    getTargetSignature(targets: TerrainOcclusionTarget[]): string {
        return targets.map(target => `${Math.round(target.position.x)};${Math.round(target.position.z)}`).join('|')
    },

    syncTransitionMesh(block: FadingTerrainBlock) {
        if (!block.matrix || !block.uv || !this.fadedMaterial || !this.fadedMesh) return
        if (!block.mesh) {
            const mesh = Builder.createBlockWithFaces(this.fadedMesh.getScene(), this.fadedMesh.parent as TransformNode)
            mesh.name = 'indoor_terrain_fading_block'
            const material = this.getTransitionMaterial(block.visibility)
            mesh.material = material
            mesh.isPickable = false
            mesh.receiveShadows = true
            mesh.visibility = 1
            const uvData = new Float32Array(mesh.getTotalVertices() * 2)
            for (let i = 0; i < uvData.length; i += 2) {
                uvData[i] = block.uv.x
                uvData[i + 1] = block.uv.y
            }
            mesh.setVerticesData('uvc', uvData, false, 2)
            block.mesh = mesh
            block.material = material
            Lights.registerSharedLightMesh(mesh)
            Lights.addShadowCaster(mesh, true)
        }

        const matrix = block.matrix.m
        block.mesh.scaling.set(matrix[0], matrix[5], matrix[10])
        block.mesh.position.set(matrix[12], matrix[13] - 0.5, matrix[14])
        this.applyTransitionMaterial(block)
    },

    applyTransitionMaterial(block: FadingTerrainBlock) {
        if (!block.mesh) return
        const material = this.getTransitionMaterial(block.visibility)
        if (block.material !== material) {
            block.material = material
            block.mesh.material = material
        }
    },

    getTransitionMaterial(visibility: number): PBRMaterial {
        const ratio = (visibility - FADED_VISIBILITY) / (1 - FADED_VISIBILITY)
        const step = Math.max(0, Math.min(FADE_MATERIAL_STEPS, Math.round(ratio * FADE_MATERIAL_STEPS)))
        const existing = this.transitionMaterials.get(step)
        if (existing) return existing

        // PBRCustomMaterial.clone() does not reliably preserve the custom uvc
        // atlas shader. Build a small shared material palette through the same
        // terrain factory instead of allocating a broken clone per block.
        const material = Materials.createTerrainMaterial1(this.fadedMesh!.getScene())
        material.name = `indoor_terrain_fading_material_${step}`
        material.alpha = FADED_VISIBILITY + ((1 - FADED_VISIBILITY) * step / FADE_MATERIAL_STEPS)
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
        material.forceAlphaTest = false
        this.transitionMaterials.set(step, material)
        return material
    },

    disposeTransitionMesh(block: FadingTerrainBlock) {
        if (!block.mesh) return
        Lights.unregisterSharedLightMesh(block.mesh)
        Lights.removeShadowCaster(block.mesh, true)
        block.mesh.dispose(false, false)
        block.mesh = null
        block.material = null
    },
}
