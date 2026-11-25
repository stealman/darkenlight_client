import { RawTexture, Texture, Vector2, Vector4 } from '@babylonjs/core'
import type { Mesh } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { getTerrainHeightOffset, WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import type { MapBlock } from '@/data/worldDataManager'
import { createTerrainPreviewPlane } from './terrainAtlasPreview'
import { TERRAIN_CARDINAL_EDGES } from '@/babylon/world/terrainRoofShape'
import { configureTerrainWater, POND_DISTANCE_RANGE, pondSpillShader } from '@/babylon/world/terrainWaterMaterial'

const FIELD_SIZE = 128
export function createTerrainPreviewWater(plane: Mesh, map: MapBlock[][], isBank: (x: number, z: number) => boolean, center: number) {
    const tiles: [number, number][] = []
    const bankTiles: [number, number][] = []
    const isWater = (x: number, z: number) => map[x]?.[z]?.type === WATER_BLOCK_TYPE
    const isInsideBank = (x: number, z: number) => isWater(x, z) || isBank(x, z)
    map.forEach((row, x) => row.forEach((block, z) => {
        if (block.type === WATER_BLOCK_TYPE) tiles.push([x, z])
        if (isInsideBank(x, z)) bankTiles.push([x, z])
    }))

    const minX = Math.min(...bankTiles.map(([x]) => x)) - 1.5
    const minZ = Math.min(...bankTiles.map(([, z]) => z)) - 1.5
    const width = Math.max(...bankTiles.map(([x]) => x)) + 1.5 - minX
    const length = Math.max(...bankTiles.map(([, z]) => z)) + 1.5 - minZ
    const outline = (cells: [number, number][], inside: (x: number, z: number) => boolean) =>
        cells.flatMap(([x, z]) => TERRAIN_CARDINAL_EDGES.filter(([dx, dz]) => !inside(x + dx, z + dz))
        .map(([dx, dz]) => ({x: x + dx * 0.5, z: z + dz * 0.5, dx, dz, bankX: x + dx, bankZ: z + dz, height: map[x][z].height})))
    const shore = outline(tiles, isWater)
    const bankOutline = outline(bankTiles, isInsideBank)
    const encodeDistance = (x: number, z: number, edges: typeof shore, inside: boolean) => {
        let distance = POND_DISTANCE_RANGE
        for (const edge of edges) {
            const dx = Math.max(0, Math.abs(x - edge.x) - Math.abs(edge.dz) * 0.5)
            const dz = Math.max(0, Math.abs(z - edge.z) - Math.abs(edge.dx) * 0.5)
            distance = Math.min(distance, Math.hypot(dx, dz))
        }
        return Math.round((0.5 + (inside ? distance : -distance) / (2 * POND_DISTANCE_RANGE)) * 255)
    }

    const pixels = new Uint8Array(FIELD_SIZE * FIELD_SIZE * 4)
    for (let row = 0; row < FIELD_SIZE; row++) {
        const z = minZ + (row + 0.5) * length / FIELD_SIZE
        for (let col = 0; col < FIELD_SIZE; col++) {
            const x = minX + (col + 0.5) * width / FIELD_SIZE
            const pixel = (row * FIELD_SIZE + col) * 4
            pixels[pixel] = encodeDistance(x, z, shore, isWater(Math.round(x), Math.round(z)))
            pixels[pixel + 1] = encodeDistance(x, z, bankOutline, isInsideBank(Math.round(x), Math.round(z)))
            pixels[pixel + 3] = 255
        }
    }

    const scene = plane.getScene()
    const field = RawTexture.CreateRGBATexture(pixels, FIELD_SIZE, FIELD_SIZE, scene, false, false, Texture.BILINEAR_SAMPLINGMODE)
    field.wrapU = field.wrapV = Texture.CLAMP_ADDRESSMODE
    const bounds = new Vector4(minX, minZ, width, length)
    const shoreFrame = new Vector2(center, 0)
    const water = createTerrainPreviewPlane(plane, 'adminUtilsTerrainWater')
    water.setEnabled(true)
    water.isPickable = false
    water.scaling.set(width, 1, length)
    water.position.set(minX + width / 2, 0, minZ + length / 2)

    configureTerrainWater(water, 'adminUtilsPondWater', {field, size: new Vector2(width, length)})

    const setLevel = (surfaceMap: MapBlock[][]) => {
        // Match an adjacent level bank, including raised grass or snow on the preview.
        const edge = shore.find(({bankX, bankZ, height}) => surfaceMap[bankX]?.[bankZ]?.height === height)
        if (edge) {
            const bank = surfaceMap[edge.bankX][edge.bankZ]
            water.position.y = bank.snowed ? bank.totalHeight : bank.height + getTerrainHeightOffset(bank, false)
        } else {
            water.position.y = surfaceMap[tiles[0][0]][tiles[0][1]].height
        }
        shoreFrame.y = water.position.y
    }

    const applyShoreWetness = (soil: PBRCustomMaterial, transitionDirtCoverage?: string) => {
        if (!transitionDirtCoverage) {
            soil.AddUniform('pondBankDistance', 'sampler2D', field)
            soil.AddUniform('pondBankBounds', 'vec4', bounds)
        }
        soil.AddUniform('pondShoreFrame', 'vec2', shoreFrame)
        soil.Fragment_Definitions(`${soil.CustomParts.Fragment_Definitions ?? ''}
            ${pondSpillShader}
            float pondShoreWetness;
        `)
        soil.Fragment_Before_Lights(`${soil.CustomParts.Fragment_Before_Lights ?? ''}
            pondShoreWetness = 0.0;
            float shoreHeight = abs(vPositionW.y - pondShoreFrame.y);
            ${transitionDirtCoverage ? 'if (vPlacedSurface.z > 1.5) {' : ''}
            if (shoreHeight < 0.075 && geometricNormalW.y > 0.1) {
                vec2 shoreUV = (vPositionW.xz + pondShoreFrame.xx - pondBankBounds.xy) / pondBankBounds.zw;
                if (all(greaterThanEqual(shoreUV, vec2(0.0))) && all(lessThanEqual(shoreUV, vec2(1.0)))) {
                    float fromWater = (texture2D(pondBankDistance, shoreUV).r - 0.5) * ${POND_DISTANCE_RANGE * 2}.0;
                    vec2 spill = pondSpill(shoreUV * pondBankBounds.zw);
                    float fromSpill = -fromWater - spill.x;
                    float dampBand = (1.0 - smoothstep(0.025, mix(0.28, 0.47, spill.y), fromSpill))
                        * smoothstep(-0.68, -0.20, fromSpill);
                    pondShoreWetness = dampBand * mix(0.67, 0.95, spill.y) * (1.0 - smoothstep(0.015, 0.075, shoreHeight))
                        * ${transitionDirtCoverage ?? '1.0'};
                    surfaceAlbedo *= 1.0 - pondShoreWetness * 0.20;
                    normalW = normalize(mix(normalW, geometricNormalW, pondShoreWetness * 0.24));
                }
            }
            ${transitionDirtCoverage ? '}' : ''}
        `)
        soil.Fragment_Custom_MetallicRoughness(`${soil.CustomParts.Fragment_Custom_MetallicRoughness ?? ''}
            metallicRoughness.g = mix(metallicRoughness.g, 0.52, pondShoreWetness);
        `)
    }

    return {mesh: water, setLevel, field, bounds, applyShoreWetness}
}
