import { Matrix, Mesh, Texture, Vector2 } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials } from '@/babylon/materials'
import { addTerrainPreviewRoof, configureTerrainEdgeLighting, configureMuddyDirtWetness, configureRockDeposits, configureTerrainPreviewBatch, TerrainPreviewBatch } from './terrainPreviewBatch'
import type { SubmitTerrainBatch, TerrainPreviewTriangle } from './terrainPreviewBatch'
import type { TerrainPreviewSurfaces } from './terrainPreviewGeometry'
import { muddyDirtLayout, muddyDirtPatterns, terrainCoverLayout, TERRAIN_ATLAS_TILES,
    visitTerrainAtlasPlacements } from '@/babylon/world/terrainAtlasPlacement'
export { muddyDirtPatterns, terrainCoverPatterns, TERRAIN_ATLAS_TILES } from '@/babylon/world/terrainAtlasPlacement'


type TerrainAtlas = {
    type: number
    colorUrl: string
    normal: {url: string, strength: number}
    roundDirtEdges?: boolean
    wetDirt?: boolean
    roundRockTop?: boolean
    showRockDeposits?: boolean
    varyAdjacentPatches?: boolean
    patterns: ReadonlyArray<{size: number, origins: readonly (readonly number[])[]}>
}


export type TerrainAtlasTileFilter = (
    matrix: Matrix, uv: Vector2, x: number, z: number, roof: readonly TerrainPreviewTriangle[] | undefined, wetCorners: number,
    floor?: readonly TerrainPreviewTriangle[],
) => boolean

export function createTerrainPreviewPlane(plane: Mesh, name: string) {
    const mesh = Builder.createHorizontalPlane(plane.getScene(), null, 1, 0)
    mesh.parent = plane.parent
    mesh.name = name
    mesh.receiveShadows = plane.receiveShadows
    mesh.setEnabled(false)
    return mesh
}

export function createTerrainAtlasPreview(plane: Mesh, name: string, atlas: TerrainAtlas) {
    const mesh = createTerrainPreviewPlane(plane, name)
    const material = createAtlasMaterial(plane, name, atlas)
    configureTerrainPreviewBatch(mesh, material)
    const {roundDirtEdges = false, roundRockTop = false, wetDirt = false, showRockDeposits = false} = atlas
    const roundEdges = roundDirtEdges || roundRockTop
    const layout = atlas.patterns === muddyDirtPatterns ? muddyDirtLayout : terrainCoverLayout
    if (roundEdges) configureTerrainEdgeLighting(material, undefined, roundRockTop)
    if (wetDirt) configureMuddyDirtWetness(material, 'solid')
    if (showRockDeposits) configureRockDeposits(material)

    const render = ({atlasTops, stride, width, originX, originZ, includeTile, roofs, wetCorners,
                        rockDeposits, cornerFloors, compiled}: TerrainPreviewSurfaces, takeTile?: TerrainAtlasTileFilter,
                    batch = new TerrainPreviewBatch(), submit?: SubmitTerrainBatch) => {
        const remaining = atlasTops.get(atlas.type)!
        const submitTile = (tileKey: number, tileX: number, tileZ: number, y: number, code: number) => {
            if (includeTile && !includeTile(tileX, tileZ)) return
            const turn = code & 3
            const matrix = Matrix.RotationY(turn * Math.PI / 2)
            matrix.setTranslationFromFloats(tileX, y, tileZ)
            const [u, v] = layout.cells[code >> 2]
            const uv = new Vector2(u, v)
            const floor = cornerFloors.get(tileKey)
            const roof = roofs.get(tileKey)
            const footMask = wetCorners.get(tileKey) ?? 0
            const wetMask = wetDirt ? footMask : 0
            const depositKind = showRockDeposits ? rockDeposits.get(tileKey) ?? 0 : 0
            const options = {roundDirtEdges: roundEdges, wetCorners: wetMask, depositKind}
            // The corner extension and its roof must use the same material blend.
            if (!depositKind && takeTile?.(matrix, uv, tileX, tileZ, roof, footMask, floor)) return
            batch.tile = tileKey
            if (floor) addTerrainPreviewRoof(batch, matrix, uv, floor, {...options, mirrorAtTileEdge: true})
            addTerrainPreviewRoof(batch, matrix, uv, roof, options)
        }
        if (compiled) {
            for (const [key, height] of remaining) {
                const x = Math.floor(key / stride), z = key % stride
                if (!includeTile?.(x, z)) continue
                submitTile(key, x, z, height, compiled.atlas[(x + originX) * compiled.depth + z + originZ])
            }
        } else {
            visitTerrainAtlasPlacements(remaining, stride, width, originX, originZ, layout, !!atlas.varyAdjacentPatches,
                !!includeTile, submitTile)
        }

        if (submit) submit(mesh, batch, batch.attributes(roundEdges, wetDirt, showRockDeposits))
        else batch.apply(mesh, roundEdges, wetDirt, showRockDeposits)
    }
    return {mesh, material, render}
}

function createAtlasMaterial(plane: Mesh, name: string, atlas: TerrainAtlas) {
    const scene = plane.getScene()
    // Equal UV scales keep the normal strength consistent across quarter turns.
    const scale = 1 / TERRAIN_ATLAS_TILES
    const material = Materials.getPBRCustomMaterial(scene, name, '', atlas.colorUrl, scale, scale, false)
    const color = material.albedoTexture!
    color.wrapU = color.wrapV = Texture.CLAMP_ADDRESSMODE
    const normal = new Texture(atlas.normal.url, scene)
    normal.gammaSpace = false
    normal.level = atlas.normal.strength
    normal.wrapU = normal.wrapV = Texture.CLAMP_ADDRESSMODE
    normal.uScale = normal.vScale = scale
    material.bumpTexture = normal
    return material
}
