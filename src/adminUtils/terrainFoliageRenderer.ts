import type { Matrix, Mesh, Scene, TransformNode, Vector2 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { TerrainEnum1 } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { FoliageManager } from '@/babylon/world/foliageManager'
import { MapBlock } from '@/data/worldDataManager'
import { createMuddyDirtFoliageProfiles, createMuddyDirtFootFoliage, LOW_GRASS, MUDDY_DRY_GRASS } from './muddyDirtFoliage'
import { createWinterGrassFoliage, createGrassFootTufts, DRY_GRASS, GRASS_ROW, rockPebbleOffset, snowFoliageOffset, styleGroundFoliage } from './winterGrassFoliage'
import type { GrassTuft } from '@/babylon/world/grassRenderer'
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
const grassRows = new Set([GRASS_ROW, LOW_GRASS, DRY_GRASS, MUDDY_DRY_GRASS])

export function createTerrainFoliageRenderer(scene: Scene, parent: TransformNode, wallDecals = true, density = 1, ground = true) {
    const renderer = {...FoliageManager}
    if (ground) {
        renderer.initialize(scene, parent, {atlasUrl: foliageAtlasUrl, normalAtlasUrl: foliageNormalAtlasUrl})
        const groundMesh = renderer.groundMesh!
        groundMesh.receiveShadows = true
        styleGroundFoliage(groundMesh.material as PBRCustomMaterial)
        const lichen = renderer.blendedGroundMesh
        if (lichen) {
            lichen.receiveShadows = true
            const material = lichen.material as PBRCustomMaterial
            material.albedoColor.set(0.82, 0.84, 0.81)
            styleRockLichen(material)
        }
    }

    const render = (map: MapBlock[][], {
        atPondBank = () => false, transitionWeight = () => 0, canDecorate = () => true,
        visible = () => true, originX = 0, originZ = 0, submit, placeGrass,
    }: {
        atPondBank?: (x: number, z: number) => boolean
        transitionWeight?: (x: number, z: number) => number
        canDecorate?: (x: number, z: number) => boolean
        visible?: (x: number, z: number) => boolean
        originX?: number
        originZ?: number
        submit?: (mesh: Mesh, matrices: Matrix[], uv: Vector2[]) => void
        placeGrass: (tuft: GrassTuft) => void
    }) => {
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
        const profiles = createMuddyDirtFoliageProfiles(foliageMap, Lights.sunLight.direction, originX, originZ, ground)
        if (ground) profiles.set(ROCK, createRockFoliage(originX, originZ))
        const muddyFoot = createMuddyDirtFootFoliage(foliageMap, Lights.sunLight.direction, originX, originZ, ground)
        const blendedDecals = ground && wallDecals ? createRockWallLichen(map, originX, originZ) : []
        const footTufts = [...GRASS_TYPES.flatMap(type => createGrassFootTufts(foliageMap, type, originX, originZ)), ...muddyFoot.tufts]
        const grassFoliage = createWinterGrassFoliage(transitionWeight, originX, originZ)
        for (const type of GRASS_TYPES) profiles.set(type, grassFoliage)
        const shoreTufts = createWaterEdgeTufts(foliageMap, profiles, originX, originZ)
        renderer.renderFoliageArea(foliageMap, supportsFoliage, {
            profiles,
            originX,
            originZ,
            visibleTile: visible,
            submit,
            extraTufts: [...footTufts, ...shoreTufts],
            grassRows,
            placeTuft(matrix, row) {
                const dry = row === DRY_GRASS || row === MUDDY_DRY_GRASS
                insetTuftFromLedges(foliageMap, matrix)
                const x = Math.round(matrix.m[12]), z = Math.round(matrix.m[14])
                const block = map[x]?.[z]
                if (!block || !supportsFoliage(foliageMap[x][z], x, z) || !visible(x, z)) return
                matrix.setTranslationFromFloats(matrix.m[12] + originX, block.totalHeight - 0.015, matrix.m[14] + originZ)
                placeGrass({matrix, tone: block.snowed ? 3 : dry ? 2 : block.type === GRASS ? 0 : 1})
            },
            groundDecals: muddyFoot.pebbles,
            blendedDecals,
            mapAtlasOffset: (uv, matrix, layer) => {
                const x = Math.round(matrix.m[12]), z = Math.round(matrix.m[14])
                const block = map[x]?.[z]
                if (!block || !supportsFoliage(foliageMap[x][z], x, z) || !visible(x, z)) return undefined
                // Keep the same spatial subset whenever a region is rebuilt.
                if (density < 1 && FoliageManager.roll(
                    Math.round((originX + matrix.m[12]) * 1024),
                    Math.round((originZ + matrix.m[14]) * 1024), 6120,
                ) >= density) return undefined
                if (block.snowed) return snowFoliageOffset(uv, layer)
                return block.type === ROCK ? rockPebbleOffset(uv, matrix, layer, originX, originZ) : uv
            },
        })
    }
    return {render, meshes: [renderer.groundMesh, renderer.blendedGroundMesh].filter((mesh): mesh is Mesh => mesh !== null)}
}
