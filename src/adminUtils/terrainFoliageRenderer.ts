import type { Matrix, Mesh, Scene, TransformNode, Vector2 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { FoliageManager } from '@/babylon/world/foliageManager'
import { MapBlock } from '@/data/worldDataManager'
import { createMuddyDirtFoliageProfiles, createMuddyDirtFootFoliage, createPavingMoss, LOW_GRASS, MUDDY_DRY_GRASS } from './muddyDirtFoliage'
import { createWinterGrassFoliage, createGrassFootTufts, DRY_GRASS, GRASS_ATLAS_Y, greenGrassFoliageOffset, rockPebbleOffset, snowFoliageOffset, styleTerrainFoliage } from './winterGrassFoliage'
import type { PreviewGrassTuft } from './terrainPreviewGrass'
import { createWaterEdgeTufts, insetTuftFromLedges } from './terrainFoliagePatches'
import { createRockWallLichen, createRockFoliage, styleRockLichen } from './rockFoliage'
import foliageAtlasUrl from './assets/muddy-dirt-foliage.png'
import foliageNormalAtlasUrl from './assets/muddy-dirt-foliage-normal.png'

const MUDDY_DIRT = TerrainEnum1.TERRAIN_MUDDY_DIRT.index
const DIRT = TerrainEnum1.TERRAIN_DIRT.index
const GRASS = TerrainEnum1.TERRAIN_GRASS.index
const WINTER_GRASS = TerrainEnum1.TERRAIN_GRASS_WINTER.index
const GRASS_TYPES = [WINTER_GRASS, GRASS] as const
const isGrass = (type: number) => type === WINTER_GRASS || type === GRASS
const ROCK = TerrainEnum1.TERRAIN_ROCK.index
const emptyMask = new Set<number>()
const lowGrassY = FoliageManager.getAtlasOffset(0, 0, LOW_GRASS).y
const dryGrassYs = [DRY_GRASS, MUDDY_DRY_GRASS].map(row => FoliageManager.getAtlasOffset(0, 0, row).y)

export function createTerrainFoliageRenderer(scene: Scene, parent: TransformNode, wallDecals = true, density = 1) {
    const renderer = {...FoliageManager}
    renderer.initialize(scene, parent, {
        atlasUrl: foliageAtlasUrl,
        atlasCellPixels: 64,
        blendedGround: true,
        groundNormals: {atlasUrl: foliageNormalAtlasUrl, opaqueStrength: 1.8, blendedStrength: 0.8},
    })
    const moss = renderer.blendedGroundMesh!
    moss.receiveShadows = true
    const mossMaterial = moss.material as PBRCustomMaterial
    mossMaterial.albedoColor.set(0.82, 0.84, 0.81)
    styleRockLichen(mossMaterial)
    const groundFoliage = renderer.groundMesh!
    groundFoliage.receiveShadows = true
    const foliageMaterial = renderer.foliageMaterial!
    styleTerrainFoliage(foliageMaterial, groundFoliage.material as typeof foliageMaterial)

    const render = (map: MapBlock[][], {
        atPondBank = () => false, transitionWeight = () => 0, canDecorate = () => true,
        visible = () => true, originX = 0, originZ = 0, pavingMoss = false, submit, replaceGrass,
    }: {
        atPondBank?: (x: number, z: number) => boolean
        transitionWeight?: (x: number, z: number) => number
        canDecorate?: (x: number, z: number) => boolean
        visible?: (x: number, z: number) => boolean
        originX?: number
        originZ?: number
        pavingMoss?: boolean
        submit?: (mesh: Mesh, matrices: Matrix[], uv: Vector2[]) => void
        replaceGrass?: (tuft: PreviewGrassTuft) => void
    } = {}) => {
        const supportsFoliage = (block: MapBlock, x: number, z: number) => !block.snowed && !atPondBank(x, z)
            && !block.stonePath && !block.beigeStonePath
            && canDecorate(x, z)
            && (block.type === MUDDY_DIRT || isGrass(block.type) || block.type === ROCK)
        // Plain dirt and snowy winter grass share the muddy-dirt foliage profile.
        const foliageMap = map.map((row, x) => row.map((block, z) => {
            if (atPondBank(x, z)) return block
            const type = block.type === DIRT || (block.snowed && isGrass(block.type)) ? MUDDY_DIRT : block.type
            if (!block.snowed && type === block.type) return block
            return Object.assign(new MapBlock(block.height, type), block, {type, snowed: false})
        }))
        const profiles = createMuddyDirtFoliageProfiles(foliageMap, Lights.sunLight.direction, originX, originZ)
        profiles.set(ROCK, createRockFoliage(originX, originZ))
        const muddyFoot = createMuddyDirtFootFoliage(foliageMap, Lights.sunLight.direction, originX, originZ, wallDecals)
        const pavingDecals = pavingMoss ? createPavingMoss(map, visible, canDecorate, originX, originZ) : []
        const pavingMatrices = pavingMoss ? new Set(pavingDecals.map(({matrix}) => matrix)) : undefined
        const blendedDecals = wallDecals
            ? [...muddyFoot.moss, ...createRockWallLichen(map, originX, originZ), ...pavingDecals] : pavingDecals
        const footTufts = [...GRASS_TYPES.flatMap(type => createGrassFootTufts(foliageMap, type, originX, originZ)), ...muddyFoot.tufts]
        const grassFoliage = createWinterGrassFoliage(transitionWeight, originX, originZ)
        for (const type of GRASS_TYPES) profiles.set(type, grassFoliage)
        const shoreTufts = createWaterEdgeTufts(foliageMap, profiles, originX, originZ)
        renderer.renderFoliageArea(foliageMap, emptyMask, emptyMask, supportsFoliage, {
            profiles,
            originX,
            originZ,
            visibleTile: visible,
            submit,
            extraTuftPasses: 2,
            extraTufts: [...footTufts, ...shoreTufts],
            adjustTuftPlacement: matrix => insetTuftFromLedges(foliageMap, matrix),
            groundDecals: muddyFoot.pebbles,
            blendedDecals,
            mapAtlasOffset: (uv, matrix, layer) => {
                if (layer === 'blended' && pavingMatrices?.has(matrix)) return uv
                const x = Math.round(matrix.m[12]), z = Math.round(matrix.m[14])
                const block = map[x]?.[z]
                if (!block || !supportsFoliage(foliageMap[x][z], x, z) || !visible(x, z)) return undefined
                // Keep the same spatial subset whenever a region is rebuilt.
                if (density < 1 && FoliageManager.roll(
                    Math.round((originX + matrix.m[12]) * 1024),
                    Math.round((originZ + matrix.m[14]) * 1024), 6120,
                ) >= density) return undefined
                if (replaceGrass && layer === 'tufts') {
                    const dry = dryGrassYs.includes(uv.y)
                    if (dry || uv.y === GRASS_ATLAS_Y || uv.y === lowGrassY) {
                        const placement = matrix.clone()
                        placement.setTranslationFromFloats(matrix.m[12], block.totalHeight - 0.015, matrix.m[14])
                        replaceGrass({matrix: placement, tone: block.snowed ? 3 : dry ? 2 : block.type === GRASS ? 0 : 1})
                        return undefined
                    }
                }
                if (block.snowed) return snowFoliageOffset(uv, layer)
                if (block.type === GRASS) return greenGrassFoliageOffset(uv, layer)
                return block.type === ROCK ? rockPebbleOffset(uv, matrix, layer, originX, originZ) : uv
            },
        })
    }
    return {render, meshes: [renderer.foliageMesh!, groundFoliage, moss]}
}
