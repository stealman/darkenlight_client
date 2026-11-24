import { Matrix, Mesh, RawTexture, Texture, Vector2, VertexData } from '@babylonjs/core'
import type { Scene, TransformNode } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { TerrainEnum1 } from '@/babylon/materials'
import { terrainNoiseShader } from '@/babylon/world/terrainSurfaceShader'
import { visitPavingStones } from './stonePathLayout'
import type { PavingStone, StonePathBounds } from './stonePathLayout'
import type { MapBlock } from '@/data/worldDataManager'
import { Settings } from '@/settings/settings'
import colorUrl from '@/adminUtils/assets/stone-path-atlas.png'
import reliefUrl from '@/adminUtils/assets/stone-path-relief.png'
import coverUrl from '@/adminUtils/assets/stone-path-cover-atlas.png'

function createPavingMesh(scene: Scene) {
    const mesh = new Mesh('terrainPavingStones', scene)
    const outline = [[-0.5, -0.38], [-0.39, -0.5], [0.37, -0.5], [0.5, -0.4],
        [0.5, 0.36], [0.37, 0.5], [-0.40, 0.5], [-0.5, 0.38]]
    const positions = [0, 1, 0], indices: number[] = [], normals: number[] = []
    // One sloped face joins the top to the buried rim on each side.
    const rings = [[0.89, 1], [1, -0.48]]
    for (const [size, height] of rings) {
        for (const [x, z] of outline) positions.push(x * size, height, z * size)
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

function createPavingMaterial(scene: Scene, surfaceSize: Vector2, surfaceOrigin: Vector2) {
    const material = new PBRCustomMaterial('terrainPaving', scene)
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
    material.AddUniform('pavingColor', 'sampler2D', load(colorUrl, true))
    material.AddUniform('pavingRelief', 'sampler2D', load(reliefUrl, true))
    material.AddUniform('pavingCover', 'sampler2D', load(coverUrl))
    material.AddUniform('pavingSurfaces', 'sampler2D', null)
    material.AddUniform('pavingSurfaceSize', 'vec2', surfaceSize)
    material.AddUniform('pavingSurfaceOrigin', 'vec2', surfaceOrigin)
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
            * (0.012 + 0.090 * smoothstep(0.52, 1.0, position.y));
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
        ${terrainNoiseShader}
        vec2 pavingProjection(vec2 p, vec2 cell) {
            vec2 mirrored = 3.0 - abs(mod(p, 6.0) - 3.0);
            // Each 384-pixel terrain patch has a 64-pixel extruded border for filtering.
            return (cell * 512.0 + 64.0 + clamp(mirrored, 0.012, 2.988) * 128.0) / vec2(2048.0, 1024.0);
        }
    `)
    material.Fragment_Before_Lights(`
        vec2 localUV = vStone.xz + 0.5;
        // The half-texel inset and no atlas mips keep independent cells isolated.
        vec2 stoneUV = (floor(vPaving.xy + 0.5) * 128.0 + 0.5 + localUV * 127.0) / 1024.0;
        vec3 rock = toLinearSpace(texture2D(pavingColor, stoneUV).rgb);
        // Fade microdetail when a stone projects to a few screen pixels.
        float detail = 1.0 - smoothstep(0.095, 0.34, max(length(dFdx(localUV)), length(dFdy(localUV))));
        vec2 gritNormal = (texture2D(pavingRelief, stoneUV).rg * 2.0 - 1.0) * (0.86 * detail);
        float joint = smoothstep(0.27, 0.49, max(abs(vStone.x), abs(vStone.z)));
        float shoulder = 1.0 - smoothstep(0.29, 0.92, vStone.y);
        float rim = max(joint, shoulder);
        vec2 groundUV = vPavingGround + 0.5;
        vec4 terrain = texture2D(pavingSurfaces, (groundUV - pavingSurfaceOrigin) / pavingSurfaceSize);
        float breakup = terrainNoise(vPavingGround * 5.3 + 14.2);
        float scatter = terrainNoise(vPavingGround * 19.7 - 8.1);
        float flecks = terrainNoise(vPavingGround * 67.0 + 3.2);
        float outside = 1.0 - vPaving.w;
        float soilFilm = smoothstep(0.36, 0.78, breakup * 0.66 + scatter * 0.25 + rim * 0.22 + outside * 0.12);
        float vergeDeposits = smoothstep(0.42, 1.0, outside) * smoothstep(0.24, 0.66,
            breakup * 0.50 + scatter * 0.32 + flecks * 0.18 + rim * 0.20);
        // Let wet ground lap over several stones in patches anchored to the terrain.
        float mudPools = terrainNoise(vPavingGround * 3.1 + vec2(8.3, 5.2));
        float mud = terrain.a * smoothstep(0.34, 0.72, mudPools * 0.55 + breakup * 0.26
            + scatter * 0.19 + outside * 0.18 + rim * 0.19 + shoulder * 0.13);
        float dust = mix(0.18, 0.51, terrain.a);
        float dirtCover = clamp(soilFilm * dust + shoulder * (0.31 + outside * 0.24)
            + vergeDeposits * mix(0.45, 0.61, terrain.a), 0.0, 0.91);
        float mossHabitat = max(max(terrain.g, terrain.b * 0.93), mix(0.32, 0.27, terrain.a));
        float mossClusters = terrainNoise(vPavingGround * 3.8 - 21.0);
        float moss = mossHabitat * (1.0 - smoothstep(0.14, 0.80, terrain.r))
            * smoothstep(0.34, 0.72, mossClusters * 0.46 + scatter * 0.32 + flecks * 0.10
                + rim * 0.21 + outside * 0.15) * (0.28 + rim * 0.48 + vergeDeposits * 0.24);
        float drift = terrainNoise(vPavingGround * 2.4 + 23.0);
        float snow = terrain.r * smoothstep(0.41, 0.75, drift * 0.45 + breakup * 0.27
            + scatter * 0.16 + flecks * 0.12 + outside * 0.20 + rim * (0.08 + drift * 0.15) + vergeDeposits * 0.12)
            * smoothstep(0.02, 0.47, vStone.y);
        vec2 projection = groundUV + vStone.y * vec2(0.018, 0.024);
        vec3 wetSoil = toLinearSpace(texture2D(pavingCover, pavingProjection(groundUV, vec2(1.0, 0.0))).rgb);
        vec3 soil = mix(toLinearSpace(texture2D(pavingCover, pavingProjection(projection, vec2(0.0, 0.0))).rgb), wetSoil, terrain.a);
        vec3 grass = mix(toLinearSpace(texture2D(pavingCover, pavingProjection(projection, vec2(2.0, 0.0))).rgb),
            toLinearSpace(texture2D(pavingCover, pavingProjection(projection, vec2(3.0, 0.0))).rgb), terrain.b);
        soil = mix(soil, grass, max(terrain.g, terrain.b) * vergeDeposits * 0.43);
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
        // The snow atlas is projected along the terrain axes, even on rotated stones.
        vec2 snowBump = (texture2D(pavingCover, pavingProjection(projection, vec2(1.0, 1.0))).rg * 2.0 - 1.0) * (snow * 0.60);
        normalW = normalize(normalW + vPavingX * bump.x + vPavingZ * bump.y - vec3(snowBump.x, 0.0, snowBump.y));
    `)
    return material
}

export const PAVING_INSTANCE_ATTRIBUTE = 'pavingInstance'

export function pavingStoneMatrix(stone: PavingStone) {
    const width = stone.right - stone.left, depth = stone.back - stone.front
    const verge = Math.max(0, 1 - stone.edge / 0.64)
    const maxTurn = Math.min(0.075 + verge * 0.060, 0.36 * Math.min(width, depth) / Math.max(width, depth))
    const heading = width < depth ? Math.PI / 2 : 0
    const turn = heading + Math.sin(stone.seed * 46) * maxTurn
    const tilt = 0.027 + verge * 0.021
    const pitch = Math.sin(stone.seed * 119 + 0.4) * tilt
    const roll = Math.sin(stone.seed * 193 + 1.8) * tilt
    const rotation = Matrix.RotationYawPitchRoll(turn, pitch, roll)
    // Fit the horizontal projections of all three axes inside the stone's footprint.
    const xWidth = Math.abs(rotation.m[0]), xDepth = Math.abs(rotation.m[2])
    const zWidth = Math.abs(rotation.m[8]), zDepth = Math.abs(rotation.m[10])
    const availableWidth = width - 2 * stone.rise * Math.abs(rotation.m[4])
    const availableDepth = depth - 2 * stone.rise * Math.abs(rotation.m[6])
    const fit = xWidth * zDepth - xDepth * zWidth
    const stoneWidth = (availableWidth * zDepth - availableDepth * zWidth) / fit
    const stoneDepth = (availableDepth * xWidth - availableWidth * xDepth) / fit
    const matrix = Matrix.Scaling(stoneWidth, stone.rise, stoneDepth).multiply(rotation)
    const embeddedHeight = stone.height - stone.rise * 0.26
    matrix.setTranslationFromFloats((stone.left + stone.right) / 2, embeddedHeight, (stone.front + stone.back) / 2)
    return matrix
}

export function appendPavingAttributes(values: number[], stone: PavingStone) {
    values.push(stone.variant, Number(stone.beige), stone.seed, stone.edge)
}

export function createStonePathRenderer(scene: Scene, parent: TransformNode) {
    const mesh = createPavingMesh(scene)
    mesh.parent = parent
    mesh.receiveShadows = Settings.isShadowsEnabled()
    const surfaceSize = Vector2.One()
    const surfaceOrigin = Vector2.Zero()
    const material = createPavingMaterial(scene, surfaceSize, surfaceOrigin)
    mesh.material = material
    let surfaceField: RawTexture | undefined
    material.onBindObservable.add(() => {
        if (surfaceField) material.getEffect()?.setTexture('pavingSurfaces', surfaceField)
    })
    mesh.onDisposeObservable.add(() => {
        surfaceField?.dispose()
        material.dispose()
    })
    const updateSurfaceField = (map: MapBlock[][], bounds: StonePathBounds,
        snowHidden: (x: number, z: number) => boolean = () => false) => {
        const width = bounds.maxX - bounds.minX + 1, depth = bounds.maxZ - bounds.minZ + 1
        const surfaces = new Uint8Array(width * depth * 4)
        for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) {
            const tile = map[x + bounds.minX][z + bounds.minZ]
            const i = (z * width + x) * 4
            surfaces[i] = tile.snowed && !snowHidden(x + bounds.minX, z + bounds.minZ) ? 255 : 0
            surfaces[i + 1] = tile.type === TerrainEnum1.TERRAIN_GRASS.index ? 255 : 0
            surfaces[i + 2] = tile.type === TerrainEnum1.TERRAIN_GRASS_WINTER.index ? 255 : 0
            surfaces[i + 3] = tile.type === TerrainEnum1.TERRAIN_MUDDY_DIRT.index ? 255 : 0
        }
        if (surfaceField && surfaceSize.x === width && surfaceSize.y === depth) {
            surfaceField.update(surfaces)
        } else {
            surfaceField?.dispose()
            surfaceField = RawTexture.CreateRGBATexture(surfaces, width, depth, scene, false, false, Texture.BILINEAR_SAMPLINGMODE)
            surfaceField.wrapU = surfaceField.wrapV = Texture.CLAMP_ADDRESSMODE
        }
        surfaceSize.set(width, depth)
        surfaceOrigin.set(bounds.minX, bounds.minZ)
    }
    return {
        mesh, updateSurfaceField,
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
