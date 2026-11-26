import { Matrix, Mesh, PBRMaterial, RawTexture, Texture, Vector2, VertexBuffer, VertexData } from '@babylonjs/core'
import type { Scene, TransformNode } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { TerrainEnum1 } from '@/babylon/materials'
import { configureTerrainNoiseTexture, terrainNoiseShader } from '@/babylon/world/terrainSurfaceShader'
import { visitPavingStones } from './stonePathLayout'
import { stoneAtlasRow, stoneAtlasShader } from './stoneAtlas'
import { buildPavingSurfaceField } from './pavingSurfaceField'
import type { PavingStone, StonePathBounds } from './stonePathLayout'
import type { MapBlock } from '@/data/worldDataManager'
import { Settings } from '@/settings/settings'
import { terrainTextureUrls } from '@/babylon/world/terrainTextureUrls'

const HOUSE_FLOOR_STONE_BASE = -3.6

function createPavingMesh(scene: Scene, floor: boolean) {
    const mesh = new Mesh(floor ? 'houseFloorPavingStones' : 'terrainPavingStones', scene)
    const outline = [[-0.5, -0.38], [-0.39, -0.5], [0.37, -0.5], [0.5, -0.4],
        [0.5, 0.36], [0.37, 0.5], [-0.40, 0.5], [-0.5, 0.38]]
    const positions = [0, 1, 0], indices: number[] = [], normals: number[] = []
    // One sloped face joins the top to the buried rim on each side.
    const rings = [[floor ? 0.977 : 0.89, 1], [1, floor ? HOUSE_FLOOR_STONE_BASE : -0.48]]
    for (const [size, height] of rings) {
        for (const [x, z] of outline) {
            // Smaller clipped corners keep the joints tight where four stones meet indoors.
            const rimX = floor ? x + (Math.sign(x) * 0.5 - x) * 0.64 : x
            const rimZ = floor ? z + (Math.sign(z) * 0.5 - z) * 0.64 : z
            positions.push(rimX * size, height, rimZ * size)
        }
    }
    const sides = outline.length
    for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides
        const top = 1 + i, topNext = 1 + next
        const base = top + sides, baseNext = topNext + sides
        indices.push(0, top, topNext, top, base, topNext, topNext, base, baseNext)
    }
    VertexData.ComputeNormals(positions, indices, normals)
    const data = new VertexData()
    data.positions = positions
    data.indices = indices
    data.normals = normals
    data.applyToMesh(mesh)
    mesh.isPickable = false
    mesh.setEnabled(false)
    return mesh
}

function createPavingMaterial(scene: Scene, surfaceSize: Vector2, surfaceOrigin: Vector2, floor: boolean,
    simplifiedEffects: boolean) {
    const material = new PBRCustomMaterial(floor ? 'houseFloorPaving' : 'terrainPaving', scene)
    material.metallic = 0
    material.roughness = 1
    material.metallicF0Factor = 0
    material.specularIntensity = 0
    material.usePhysicalLightFalloff = false
    const load = (url: string, noMipMaps = false) => {
        const texture = new Texture(url, scene, noMipMaps, false, noMipMaps ? Texture.BILINEAR_SAMPLINGMODE : Texture.TRILINEAR_SAMPLINGMODE)
        texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
        material.onDisposeObservable.add(() => texture.dispose())
        return texture
    }
    material.AddUniform('pavingColor', 'sampler2D', load(terrainTextureUrls.stonePath, true))
    material.AddUniform('pavingRelief', 'sampler2D', load(terrainTextureUrls.stonePathRelief, true))
    material.AddUniform('pavingCover', 'sampler2D', load(terrainTextureUrls.stonePathCover))
    if (!floor) {
        material.AddUniform('pavingSurfaces', 'sampler2D', null)
        material.AddUniform('pavingSurfaceSize', 'vec2', surfaceSize)
        material.AddUniform('pavingSurfaceOrigin', 'vec2', surfaceOrigin)
    }
    material.AddAttribute(PAVING_INSTANCE_ATTRIBUTE)

    const varyings = `
        varying vec4 vPaving;
        varying vec3 vStone;
        varying vec2 vPavingGround;
        varying vec3 vPavingX;
        varying vec3 vPavingZ;
    `
    material.Vertex_Definitions(`
        attribute vec4 pavingInstance;
        ${varyings}
    `)
    material.Vertex_Before_PositionUpdated(`
        vPaving = pavingInstance;
        vStone = position;
        // Inward chips keep the original footprint clear of the adjacent stones.
        float worn = sin(position.x * 17.0 + position.z * 22.0 + pavingInstance.z * 21.0);
        float chipped = sin(position.x * 29.0 - position.z * 17.0 + pavingInstance.z * 33.0);
        positionUpdated.xz *= 1.0 - vec2(0.5 + 0.5 * worn, 0.5 + 0.5 * chipped)
            * (${floor ? '0.003' : '0.012'} + ${floor ? '0.017' : '0.090'} * smoothstep(0.52, 1.0, position.y));
        positionUpdated.y -= max(position.y, 0.0) * (0.08 * (1.0 - worn) + 0.035 * (1.0 + chipped));
    `)
    material.Vertex_MainEnd(`
        vPavingX = normalize(finalWorld[0].xyz);
        vPavingZ = normalize(finalWorld[2].xyz);
        #ifdef THIN_INSTANCES
            vPavingGround = (mat4(world0, world1, world2, world3) * vec4(positionUpdated, 1.0)).xz;
        #else
            vPavingGround = positionUpdated.xz;
        #endif
    `)
    material.Fragment_Definitions(`
        ${varyings}
        ${stoneAtlasShader}
        ${terrainNoiseShader}
        vec2 pavingProjection(vec2 p, vec2 cell) {
            vec2 mirrored = 3.0 - abs(mod(p, 6.0) - 3.0);
            // Each 384-pixel terrain patch has a 64-pixel extruded border for filtering.
            return (cell * 512.0 + 64.0 + clamp(mirrored, 0.012, 2.988) * 128.0) / vec2(2048.0, 1024.0);
        }
    `)
    // Three paving maps, the outdoor terrain field, and the marks/shadow mask.
    configureTerrainNoiseTexture(material, floor ? 4 : 5)
    material.Fragment_Before_Lights(`
        vec2 localUV = vStone.xz + 0.5;
        // The half-texel inset and no atlas mips keep independent cells isolated.
        vec2 cell = floor(vPaving.xy + 0.5);
        ${floor ? 'float floorTerrain = floor(cell.x / 8.0); cell.x = mod(cell.x, 8.0);' : ''}
        vec2 stoneUV = stoneAtlasUV(cell, localUV);
        vec3 rock = toLinearSpace(texture2D(pavingColor, stoneUV).rgb);
        // Fade microdetail when a stone projects to a few screen pixels.
        float detail = 1.0 - smoothstep(0.095, 0.34, max(length(dFdx(localUV)), length(dFdy(localUV))));
        // All three shades of each palette share the same relief cells in rows 0 and 1.
        vec2 reliefUV = stoneReliefUV(stoneUV, cell.y);
        vec2 gritNormal = (texture2D(pavingRelief, reliefUV).rg * 2.0 - 1.0) * (${floor ? '0.86' : '1.02'} * detail);
        float joint = smoothstep(0.27, 0.49, max(abs(vStone.x), abs(vStone.z)));
        float shoulder = 1.0 - smoothstep(0.29, 0.92, vStone.y);
        float rim = max(joint, shoulder);
        vec2 groundUV = vPavingGround + 0.5;
        ${floor ? `vec4 terrain = vec4(0.0, 1.0 - step(0.5, abs(floorTerrain - ${TerrainEnum1.TERRAIN_GRASS.index}.0)),
            1.0 - step(0.5, abs(floorTerrain - ${TerrainEnum1.TERRAIN_GRASS_WINTER.index}.0)),
            1.0 - step(0.5, abs(floorTerrain - ${TerrainEnum1.TERRAIN_MUDDY_DIRT.index}.0)));`
            : 'vec4 terrain = texture2D(pavingSurfaces, (groundUV - pavingSurfaceOrigin) / pavingSurfaceSize);'}
        float breakup = terrainNoise(vPavingGround * ${simplifiedEffects ? '3.1' : '5.3'} + 14.2);
        float scatter = terrainNoise(vPavingGround * 19.7 - 8.1);
        float flecks = terrainNoise(vPavingGround * 67.0 + 3.2);
        float outside = 1.0 - vPaving.w;
        float soilFilm = smoothstep(0.36, 0.78, breakup * 0.66 + scatter * 0.25 + rim * 0.22 + outside * 0.12);
        float vergeDeposits = smoothstep(0.42, 1.0, outside) * smoothstep(0.24, 0.66,
            breakup * 0.50 + scatter * 0.32 + flecks * 0.18 + rim * 0.20);
        // Let wet ground lap over several stones in patches anchored to the terrain.
        float mudPools = ${simplifiedEffects ? 'mix(breakup, scatter, 0.25)' : 'terrainNoise(vPavingGround * 3.1 + vec2(8.3, 5.2))'};
        float mud = terrain.a * smoothstep(0.34, 0.72, mudPools * 0.55 + breakup * 0.26
            + scatter * 0.19 + outside * 0.18 + rim * 0.19 + shoulder * 0.13);
        float dust = mix(0.18, 0.51, terrain.a);
        float dirtCover = clamp(soilFilm * dust + shoulder * (0.31 + outside * 0.24)
            + vergeDeposits * mix(0.45, 0.61, terrain.a), 0.0, 0.91);
        float mossHabitat = max(max(terrain.g, terrain.b * 0.93), mix(0.32, 0.27, terrain.a));
        float mossClusters = ${simplifiedEffects ? '1.0 - breakup' : 'terrainNoise(vPavingGround * 3.8 - 21.0)'};
        float moss = mossHabitat * (1.0 - smoothstep(0.14, 0.80, terrain.r))
            * smoothstep(0.34, 0.72, mossClusters * 0.46 + scatter * 0.32 + flecks * 0.10
                + rim * 0.21 + outside * 0.15) * (0.28 + rim * 0.48 + vergeDeposits * 0.24);
        ${floor ? `
            float stain = smoothstep(0.62, 0.83, breakup * 0.80 + scatter * 0.20);
            dirtCover = clamp(dirtCover * outside * 0.61 + stain * 0.19, 0.0, 0.60);
            mud *= outside * 0.38 + stain * 0.12;
            moss *= outside * 0.32;
        ` : ''}
        float drift = ${simplifiedEffects ? 'mix(breakup, 1.0 - scatter, 0.25)' : 'terrainNoise(vPavingGround * 2.4 + 23.0)'};
        float snow = terrain.r * smoothstep(0.41, 0.75, drift * 0.45 + breakup * 0.27
            + scatter * 0.16 + flecks * 0.12 + outside * 0.20 + rim * (0.08 + drift * 0.15) + vergeDeposits * 0.12)
            * smoothstep(0.02, 0.47, vStone.y);
        vec2 projection = groundUV + vStone.y * vec2(0.018, 0.024);
        vec3 wetSoil = toLinearSpace(texture2D(pavingCover, pavingProjection(groundUV, vec2(1.0, 0.0))).rgb);
        vec3 soil = mix(toLinearSpace(texture2D(pavingCover, pavingProjection(projection, vec2(0.0, 0.0))).rgb), wetSoil, terrain.a);
        float grassCover = min(1.0, terrain.g + terrain.b);
        vec3 grass = mix(toLinearSpace(texture2D(pavingCover, pavingProjection(projection, vec2(2.0, 0.0))).rgb),
            toLinearSpace(texture2D(pavingCover, pavingProjection(projection, vec2(3.0, 0.0))).rgb), terrain.b / max(grassCover, 0.001));
        soil = mix(soil, grass, grassCover * vergeDeposits * ${floor ? '0.43' : '0.72'});
        vec3 mossColor = grass * vec3(0.65, 0.98, 0.47) + vec3(0.015, 0.030, 0.006);
        vec3 snowTexel = texture2D(pavingCover, pavingProjection(projection, vec2(0.0, 1.0))).rgb;
        float snowGray = dot(snowTexel, vec3(0.2126, 0.7152, 0.0722));
        float snowShade = mix(0.74, 0.87, drift * 0.45 + scatter * 0.40 + flecks * 0.15);
        vec3 snowColor = toLinearSpace(mix(vec3(snowGray), snowTexel, 0.28) * snowShade * vec3(0.97, 0.985, 1.0));
        surfaceAlbedo = mix(rock, soil * mix(0.80, 1.10, flecks), dirtCover);
        surfaceAlbedo = mix(surfaceAlbedo, mossColor, moss * (1.0 - snow));
        surfaceAlbedo = mix(surfaceAlbedo * (1.0 - shoulder * 0.28), wetSoil * mix(0.84, 1.04, flecks), mud * 0.89);
        surfaceAlbedo = mix(surfaceAlbedo, snowColor, snow);
        // The sculpted bevel carries the broad highlight, the atlas adds mineral grain and pits.
        vec2 wornRim = (vStone.xz + vec2(scatter - 0.5, flecks - 0.5) * 0.15) * rim * 0.30;
        vec2 bump = gritNormal * (1.0 - snow * 0.88) * (0.92 - dirtCover * 0.41) * (1.0 - mud * 0.58)
            + wornRim * (1.0 - snow * 0.68);
        ${!simplifiedEffects ? `
            // The snow atlas is projected along the terrain axes, even on rotated stones.
            vec2 snowBump = (texture2D(pavingCover, pavingProjection(projection, vec2(1.0, 1.0))).rg * 2.0 - 1.0) * (snow * 0.60);
        ` : ''}
        normalW = normalize(normalW + vPavingX * bump.x + vPavingZ * bump.y${!simplifiedEffects ? ' - vec3(snowBump.x, 0.0, snowBump.y)' : ''});
    `)
    return material
}

export const PAVING_INSTANCE_ATTRIBUTE = 'pavingInstance'

export function pavingStoneMatrix(stone: PavingStone, floor = false) {
    const width = stone.right - stone.left, depth = stone.back - stone.front
    const verge = Math.max(0, 1 - stone.edge / 0.64)
    const maxTurn = Math.min(floor ? 0.020 + verge * 0.018 : 0.075 + verge * 0.060,
        0.36 * Math.min(width, depth) / Math.max(width, depth))
    const heading = width < depth ? Math.PI / 2 : 0
    const turn = heading + Math.sin(stone.seed * 46) * maxTurn
    const tilt = floor ? 0.010 + verge * 0.009 : 0.027 + verge * 0.021
    const pitch = Math.sin(stone.seed * 119 + 0.4) * tilt
    const roll = Math.sin(stone.seed * 193 + 1.8) * tilt
    const rotation = Matrix.RotationYawPitchRoll(turn, pitch, roll)
    // Fit the horizontal projections of all three axes inside the stone's footprint.
    const xWidth = Math.abs(rotation.m[0]), xDepth = Math.abs(rotation.m[2])
    const zWidth = Math.abs(rotation.m[8]), zDepth = Math.abs(rotation.m[10])
    const verticalExtent = 2 * stone.rise * (floor ? -HOUSE_FLOOR_STONE_BASE : 1)
    const availableWidth = width - verticalExtent * Math.abs(rotation.m[4])
    const availableDepth = depth - verticalExtent * Math.abs(rotation.m[6])
    const fit = xWidth * zDepth - xDepth * zWidth
    const stoneWidth = (availableWidth * zDepth - availableDepth * zWidth) / fit
    const stoneDepth = (availableDepth * xWidth - availableWidth * xDepth) / fit
    const matrix = Matrix.Scaling(stoneWidth, stone.rise, stoneDepth).multiply(rotation)
    const embeddedHeight = stone.height - stone.rise * 0.26
    matrix.setTranslationFromFloats((stone.left + stone.right) / 2, embeddedHeight, (stone.front + stone.back) / 2)
    return matrix
}

export function pavingColorRow(stone: PavingStone) {
    // Float32 export can round seeds at the upper limit to 1.
    return stoneAtlasRow(stone.beige, stone.seed)
}

export function appendPavingAttributes(values: number[], stone: PavingStone, floorTerrain = 0) {
    values.push(stone.variant + floorTerrain * 8, pavingColorRow(stone), stone.seed, stone.edge)
}

export function createSimpleStonePathMesh(scene: Scene, parent: TransformNode, floor = false) {
    const mesh = createPavingMesh(scene, floor)
    mesh.parent = parent

    // Keep UVs inside a cell's texel centers; the path batch supplies its atlas offset.
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!
    const uvs: number[] = []
    for (let i = 0; i < positions.length; i += 3) {
        const u = (0.5 + (positions[i] + 0.5) * 127) / 1024
        const v = (0.5 + (positions[i + 2] + 0.5) * 127) / 1024
        uvs.push(u, v)
    }
    mesh.setVerticesData(VertexBuffer.UVKind, uvs)

    const material = floor ? new PBRMaterial('houseFloorPavingSimple', scene) : new PBRCustomMaterial('terrainPavingSimple', scene)
    if (material instanceof PBRCustomMaterial) {
        material.AddAttribute('uvc')
        material.Vertex_Definitions('attribute vec2 uvc;')
        material.Vertex_Before_PositionUpdated('uvUpdated += uvc * 0.125;')
    }
    material.metallic = 0
    material.roughness = 1
    material.metallicF0Factor = 0
    material.specularIntensity = 0
    material.usePhysicalLightFalloff = false
    const atlas = new Texture(terrainTextureUrls.stonePath, scene, true, false, Texture.BILINEAR_SAMPLINGMODE)
    atlas.wrapU = atlas.wrapV = Texture.CLAMP_ADDRESSMODE
    material.albedoTexture = atlas
    mesh.material = material
    mesh.onDisposeObservable.addOnce(() => material.dispose(false, true))
    return mesh
}

export function createStonePathRenderer(scene: Scene, parent: TransformNode, floor = false, simplifiedEffects = false) {
    const mesh = createPavingMesh(scene, floor)
    mesh.parent = parent
    mesh.receiveShadows = Settings.isShadowsEnabled()
    const surfaceSize = Vector2.One()
    const surfaceOrigin = Vector2.Zero()
    const material = createPavingMaterial(scene, surfaceSize, surfaceOrigin, floor, simplifiedEffects)
    mesh.material = material
    let surfaceField: RawTexture | undefined
    if (!floor) material.onBindObservable.add(() => {
        if (surfaceField) material.getEffect()?.setTexture('pavingSurfaces', surfaceField)
    })
    mesh.onDisposeObservable.add(() => {
        surfaceField?.dispose()
        material.dispose()
    })
    const updateSurfaceField = (map: MapBlock[][], bounds: StonePathBounds,
        snowHidden: (x: number, z: number) => boolean = () => false) => {
        const {pixels, width, depth} = buildPavingSurfaceField(map, bounds, snowHidden)
        if (surfaceField && surfaceField.getSize().width === width && surfaceField.getSize().height === depth) {
            surfaceField.update(pixels)
        } else {
            surfaceField?.dispose()
            surfaceField = RawTexture.CreateRGBATexture(pixels, width, depth, scene, false, false, Texture.BILINEAR_SAMPLINGMODE)
            surfaceField.wrapU = surfaceField.wrapV = Texture.CLAMP_ADDRESSMODE
        }
        surfaceSize.set(bounds.maxX - bounds.minX + 1, bounds.maxZ - bounds.minZ + 1)
        surfaceOrigin.set(bounds.minX, bounds.minZ)
    }
    return {
        mesh, material, updateSurfaceField,
        render(map: MapBlock[][], heightAt: (x: number, z: number) => number | undefined) {
            const width = map.length, depth = map[0]?.length ?? 0
            const matrices: number[] = [], attributes: number[] = []
            const bounds = {minX: 0, minZ: 0, maxX: width - 1, maxZ: depth - 1}
            visitPavingStones((x, z) => map[x]?.[z], heightAt, stone => {
                const matrix = pavingStoneMatrix(stone)
                matrices.push(...matrix.m)
                appendPavingAttributes(attributes, stone)
            }, bounds)
            mesh.setEnabled(matrices.length > 0)
            if (!matrices.length) {
                mesh.thinInstanceCount = 0
                return
            }

            updateSurfaceField(map, bounds)
            mesh.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16)
            mesh.thinInstanceSetBuffer(PAVING_INSTANCE_ATTRIBUTE, new Float32Array(attributes), 4)
        },
    }
}
