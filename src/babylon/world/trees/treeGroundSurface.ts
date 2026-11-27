import { RawTexture, Texture, Vector2, Vector4 } from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'
import type { CustomMaterial, PBRCustomMaterial } from '@babylonjs/materials'
import { muddyDirtPatterns, terrainCoverPatterns } from '../terrainAtlasPlacement'
import { terrainTextureUrls } from '../terrainTextureUrls'
import { isSnowRoof } from '../terrainRoofShape'
import type { RoofTile } from '../terrainRoofShape'
import type { TerrainStepField } from '../terrainStepField'
import { terrainSnowmeltShader } from '../terrainSnowmeltShader'
import { LOCAL_TRANSITION_NOISE_PERIOD, NOISE_QUARTER_PERIOD, terrainTransitionNoiseShader } from '../terrainTransitionNoiseShader'
import { terrainNoiseShader } from '../terrainNoiseShader'
import type { TreeSpecies } from './treeSpecies'

const ATLAS_CELL = 128
const ATLAS_COLUMNS = 4
const ATLAS_WIDTH = ATLAS_COLUMNS * ATLAS_CELL
const ATLAS_HEIGHT = 2 * ATLAS_CELL
const SAMPLES_PER_TILE = 12
const MAX_SAMPLES_PER_AXIS = 768
export const MAX_TREE_GROUND_TEXTURE_HEIGHT = ATLAS_HEIGHT + MAX_SAMPLES_PER_AXIS
const SNOW_ATLAS_SLOT = 6
const MUD_NORMAL_ATLAS_SLOT = 7
const TREE_SNOW_CLEARANCE_RADIUS_MULTIPLIER = 1.6
const TREE_SNOWMELT_REACH_MULTIPLIER = 1.2
const TREE_SNOW_OUTSIDE_DISTANCE = 1.8
const TREE_SNOW_DISTANCE_RANGE = 6

type GroundTile = RoofTile & {height: number}
export type TreeSnowFootprint = {
    x: number
    z: number
    height: number
    radius: number
    strength: number
    phase: number
    westDrift: number
    reach: number
    rootSnow: number
}

const snowProfiles = {
    fir: {radius: 4.8, minimum: 1.75, strength: .89, drift: .06, rootSnow: .73},
    spruce: {radius: 3.35, minimum: 1.08, strength: .68, drift: .31, rootSnow: .9},
    evergreen: {radius: 3.0, minimum: 1.02, strength: .65, drift: .36, rootSnow: .93},
    birch: {radius: 2.9, minimum: .82, strength: .57, drift: .4, rootSnow: .95},
    autumn: {radius: 0, minimum: 0, strength: 0, drift: 0, rootSnow: 1},
    twisted: {radius: 0, minimum: 0, strength: 0, drift: 0, rootSnow: 1},
} satisfies Record<TreeSpecies, {radius: number, minimum: number, strength: number, drift: number, rootSnow: number}>

export function createTreeSnowFootprint(species: TreeSpecies, x: number, z: number, height: number, rootRadius: number,
    sizeVariation: number, strengthVariation: number, phase: number): TreeSnowFootprint {
    const profile = snowProfiles[species]
    const baseRadius = Math.min(3.2, Math.max(profile.minimum, rootRadius * profile.radius) * (.88 + .34 * sizeVariation))
    const radius = baseRadius * TREE_SNOW_CLEARANCE_RADIUS_MULTIPLIER
    const westDrift = profile.drift
        + (profile.drift > .1 ? 1.05 * smoothDrift(sizeVariation) : 0)
    return {x, z, height, radius, strength: profile.strength * (.98 + .14 * strengthVariation), phase, westDrift,
        reach: Math.max(rootRadius * 3.8, radius ? radius * 1.18 + TREE_SNOW_OUTSIDE_DISTANCE : 0), rootSnow: profile.rootSnow}
}

function smoothDrift(variation: number) {
    const drift = Math.max(0, (variation - .55) / .45)
    return drift * drift
}

// The atlas slots follow the five outdoor land types, then snow. Paths have their own surface.
export function treeGroundType(tile: GroundTile) {
    return tile.type >= 1 && tile.type <= 5 && !tile.stonePath && !tile.beigeStonePath ? tile.type : 0
}

export function hasSnowNearTree(map: GroundTile[][], foot: TreeSnowFootprint, snowAtBase: boolean) {
    if (snowAtBase) return true
    if (!foot.strength) return false
    const reach = Math.floor(foot.reach + .5)
    for (let dx = -reach; dx <= reach; dx++) {
        const row = map[foot.x + dx]
        if (!row) continue
        for (let dz = -reach; dz <= reach; dz++) {
            if (dx === 0 && dz === 0) continue
            const distance = Math.max(0, Math.abs(dx) - .5) ** 2 + Math.max(0, Math.abs(dz) - .5) ** 2
            if (distance > (foot.radius * 1.18 + TREE_SNOW_OUTSIDE_DISTANCE) ** 2) continue
            const tile = row[foot.z + dz]
            if (tile && Math.abs(tile.height - foot.height) <= .05 && treeGroundType(tile) && isSnowRoof(tile)) return true
        }
    }
    return false
}

export function treeSnowDistance(dx: number, dz: number, foot: TreeSnowFootprint) {
    if (!foot.strength) return TREE_SNOW_OUTSIDE_DISTANCE
    // Compress the western edge towards the stem on trees with a more open crown.
    const x = dx < 0 ? dx * (1 + foot.westDrift * 1.9) : dx
    const angle = Math.atan2(dz, x) + foot.phase * Math.PI * 2
    const distance = Math.hypot(x, dz * 1.08)
    const radius = foot.radius * (.78 + .22 * foot.strength)
        * (1 + .12 * Math.cos(3 * angle) + .06 * Math.sin(5 * angle))
    return distance - radius
}

let sharedAtlas: Promise<Uint8ClampedArray> | undefined
function loadGroundAtlas() {
    return sharedAtlas ??= (async () => {
        const canvas = document.createElement('canvas')
        canvas.width = ATLAS_WIDTH
        canvas.height = ATLAS_HEIGHT
        const context = canvas.getContext('2d')!
        const soil = muddyDirtPatterns[2].origins[0]
        const cover = terrainCoverPatterns[2].origins[0]
        const urls = terrainTextureUrls
        await Promise.all([urls.dirt, urls.grass, urls.rock, urls.muddyDirt, urls.winterGrass, urls.snow, urls.muddyDirtNormal]
            .map(async (url, index) => {
                const image = new Image()
                image.src = url
                await image.decode()
                const [x, y] = index === 0 || index === 3 || index + 1 === MUD_NORMAL_ATLAS_SLOT ? soil : cover
                context.drawImage(image, x * ATLAS_CELL, y * ATLAS_CELL, ATLAS_CELL, ATLAS_CELL,
                    index % ATLAS_COLUMNS * ATLAS_CELL, Math.floor(index / ATLAS_COLUMNS) * ATLAS_CELL, ATLAS_CELL, ATLAS_CELL)
            }))
        return context.getImageData(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT).data
    })()
}

const groundShader = (packed: boolean) => `
    ${packed ? `
    vec3 treeGroundPackedPixel(ivec2 pixel) {
        highp uint rgb = uint(texelFetch(terrainStepData, pixel + ivec2(0, int(treeGroundStepRow)), 0).r);
        return vec3(float(rgb & 255u), float((rgb >> 8u) & 255u), float(rgb >> 16u)) / 255.0;
    }
    float treeGroundPackedDistance(ivec2 pixel) {
        highp uint packedPixel = uint(texelFetch(terrainStepData, pixel + ivec2(0, int(treeGroundStepRow) + ${ATLAS_HEIGHT}), 0).r);
        return float(packedPixel & 255u) / 255.0;
    }
    ` : ''}
    vec3 treeGroundPixel(vec2 pixel) {
        return ${packed ? 'treeGroundPackedPixel(ivec2(pixel))' : 'texture2D(treeGroundTexture, pixel * treeGroundTexel).rgb'};
    }
    vec3 treeGroundAtlasSample(vec2 p, float type) {
        float cell = type - 1.0;
        // Mirror the tile at its seams and keep linear filtering inside the crop.
        vec2 uv = 1.0 - abs(mod(p + 0.5, 2.0) - 1.0);
        vec2 px = vec2(mod(cell, ${ATLAS_COLUMNS}.0), floor(cell / ${ATLAS_COLUMNS}.0)) * ${ATLAS_CELL}.0
            + 0.5 + uv * ${ATLAS_CELL - 1}.0;
        return treeGroundPixel(px);
    }
    vec3 treeGroundAlbedo(vec2 p, float type) {
        return toLinearSpace(treeGroundAtlasSample(p, type));
    }
    vec2 treeGroundFieldPixel(vec2 p) {
        return (p - treeGroundBounds.xy) * treeGroundBounds.zw;
    }
    bool treeGroundInField(vec2 pixel) {
        return treeGroundBounds.z > 0.0 && all(greaterThanEqual(pixel, vec2(0.0))) && all(lessThan(pixel, vec2(1.0)));
    }
    float treeGroundDistance(vec2 pixel) {
        float mask;
        ${packed ? `
        vec2 maskPixel = clamp(pixel * treeGroundFieldExtent - .5, vec2(0.0), treeGroundFieldExtent - 1.0);
        ivec2 lo = ivec2(maskPixel);
        ivec2 hi = min(lo + 1, ivec2(treeGroundFieldExtent) - 1);
        vec2 f = fract(maskPixel);
        float a = mix(treeGroundPackedDistance(lo), treeGroundPackedDistance(ivec2(hi.x, lo.y)), f.x);
        float b = mix(treeGroundPackedDistance(ivec2(lo.x, hi.y)), treeGroundPackedDistance(hi), f.x);
        mask = mix(a, b, f.y);` : `
        vec2 uv = pixel * treeGroundFieldExtent + vec2(0.0, ${ATLAS_HEIGHT}.0);
        mask = treeGroundPixel(uv).r;`}
        return ${TREE_SNOW_OUTSIDE_DISTANCE} - mask * ${TREE_SNOW_DISTANCE_RANGE}.0;
    }
`

export function treeGroundContourShader(definitions: string, lowDetail: boolean) {
    return `
        ${lowDetail && !definitions.includes('#define TERRAIN_LOW_DETAIL_TRANSITIONS') ? '#define TERRAIN_LOW_DETAIL_TRANSITIONS' : ''}
        ${definitions.includes(terrainNoiseShader) ? '' : terrainNoiseShader}
        ${definitions.includes(terrainTransitionNoiseShader) ? '' : terrainTransitionNoiseShader}
        vec2 treeGroundSnowContour(vec2 pixel, vec2 worldXZ) {
            float distance = treeGroundDistance(pixel);
            if (abs(distance) >= 1.75) return vec2(distance, 0.68);
            vec2 phase = mod(worldXZ + ${NOISE_QUARTER_PERIOD}.0, ${LOCAL_TRANSITION_NOISE_PERIOD}.0);
            vec2 p = min(phase, ${LOCAL_TRANSITION_NOISE_PERIOD}.0 - phase) - ${NOISE_QUARTER_PERIOD}.0;
            TransitionNoise noise = sampleTransitionNoise(p, false);
            #ifdef TERRAIN_LOW_DETAIL_TRANSITIONS
            noise.grain = (terrainNoise(p * 4.8) - 0.5) * 0.90;
            #endif
            return vec2(localTerrainCoverDistance(distance, noise, true, false), noise.halfWidth);
        }
    `
}

export class TreeGroundSurface {
    private readonly bounds = new Vector4(0, 0, 0, 0)
    private readonly texel = new Vector2(0, 0)
    private readonly fieldExtent = new Vector2(0, 0)
    private texture: RawTexture
    private pixels = new Uint8Array(4)
    private atlas?: Uint8ClampedArray
    private packedField?: TerrainStepField
    private map?: GroundTile[][]
    private revision?: number
    private snowCoverMask?: ReadonlySet<number>
    private key = ''
    private disposed = false

    constructor(private readonly scene: Scene) {
        this.texture = this.createTexture(1, 1)
        scene.onDisposeObservable.addOnce(() => {
            this.disposed = true
            this.texture.dispose()
        })
        void loadGroundAtlas().then(atlas => {
            if (this.disposed) return
            this.atlas = atlas
            const {width, height} = this.texture.getSize()
            if (width < ATLAS_WIDTH) this.resize(ATLAS_WIDTH, ATLAS_HEIGHT)
            else {
                this.writeAtlas(width)
                this.upload(width, height)
                this.texel.set(1 / width, 1 / height)
            }
        }).catch(error => console.warn('Tree ground texture could not be loaded', error))
    }

    private createTexture(width: number, height: number) {
        if (this.atlas) this.texel.set(1 / width, 1 / height)
        const texture = RawTexture.CreateRGBATexture(this.pixels, width, height, this.scene, false, false,
            Texture.BILINEAR_SAMPLINGMODE)
        texture.name = 'treeGroundSurface'
        texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
        return texture
    }

    private writeAtlas(width: number) {
        if (!this.atlas) return
        for (let row = 0; row < ATLAS_HEIGHT; row++) {
            this.pixels.set(this.atlas.subarray(row * ATLAS_WIDTH * 4, (row + 1) * ATLAS_WIDTH * 4), row * width * 4)
        }
    }

    private resize(width: number, height: number) {
        this.texture.dispose()
        this.pixels = new Uint8Array(width * height * 4)
        this.writeAtlas(width)
        this.texture = this.createTexture(width, height)
    }

    private upload(width: number, height: number) {
        this.texture.update(this.pixels)
        if (this.atlas && this.bounds.z > 0) this.packedField?.updateTreeGround(this.pixels, width, height)
    }

    configure(material: CustomMaterial | PBRCustomMaterial, packedField?: TerrainStepField) {
        if (packedField) material.AddUniform('treeGroundStepRow', 'float', null)
        else material.AddUniform('treeGroundTexture', 'sampler2D', null)
        material.AddUniform('treeGroundBounds', 'vec4', this.bounds)
        material.AddUniform('treeGroundTexel', 'vec2', this.texel)
        material.AddUniform('treeGroundFieldExtent', 'vec2', this.fieldExtent)
        const attach = material.AttachAfterBind.bind(material)
        material.AttachAfterBind = (mesh, effect) => {
            attach(mesh, effect)
            if (packedField) effect.setFloat('treeGroundStepRow', packedField.treeGroundStartRow)
            else effect.setTexture('treeGroundTexture', this.texture)
        }
        material.Fragment_Definitions(`${groundShader(!!packedField)}${material.CustomParts.Fragment_Definitions ?? ''}`)
    }

    configureSnowTerrain(material: PBRCustomMaterial, wetMud: boolean, lowDetail: boolean, packedField?: TerrainStepField) {
        if (packedField) this.packedField = packedField
        this.configure(material, packedField)
        const contourDefinitions = material.CustomParts.Fragment_Definitions ?? ''
        material.Fragment_Definitions(contourDefinitions + treeGroundContourShader(contourDefinitions, lowDetail))
        if (wetMud) {
            const definitions = material.CustomParts.Fragment_Definitions ?? ''
            material.Fragment_Definitions(`${definitions}
                ${definitions.includes(terrainSnowmeltShader) ? '' : terrainSnowmeltShader}
                float treeMeltWetness;
                float treeMudExposure;
                vec3 treeMudNormal(vec2 p, vec3 roof) {
                    vec3 bump = treeGroundAtlasSample(p, ${MUD_NORMAL_ATLAS_SLOT}.0) * 2.0 - 1.0;
                    bump.xy *= 4.0 * (1.0 - 2.0 * step(vec2(1.0), mod(p + 0.5, 2.0)));
                    bump.y = -bump.y; // The crop is stored in image row order.
                    vec3 x = vec3(1.0, 0.0, 0.0) - roof * roof.x;
                    vec3 z = vec3(0.0, 0.0, 1.0) - roof * roof.z;
                    return normalize(roof * bump.z - (x * bump.x + z * bump.y)
                        * inversesqrt(max(dot(x, x), dot(z, z))));
                }
            `)
            material.Fragment_Custom_MetallicRoughness(`${material.CustomParts.Fragment_Custom_MetallicRoughness ?? ''}
                metallicRoughness.g = mix(metallicRoughness.g, 1.0, treeMudExposure);
                metallicRoughness.g = terrainSnowmeltRoughness(metallicRoughness.g, treeMeltWetness);
            `)
        }
        material.Fragment_Before_Lights(`
            ${material.CustomParts.Fragment_Before_Lights ?? ''}
            ${wetMud ? 'treeMeltWetness = 0.0; treeMudExposure = 0.0;' : ''}
            if (treeGroundTexel.x > 0.0 && treeGroundBounds.z > 0.0
                && snowGlintCoverage > 0.008 && geometricNormalW.y > 0.70) {
                vec2 fieldUV = treeGroundFieldPixel(vPositionW.xz);
                if (treeGroundInField(fieldUV)) {
                    vec2 pixel = floor(fieldUV * treeGroundFieldExtent) + vec2(0.5, ${ATLAS_HEIGHT}.5);
                    float groundType = floor(treeGroundPixel(pixel).g * 5.0 + 0.5);
                    if (groundType > 0.0) {
                        vec2 contour = treeGroundSnowContour(fieldUV, vPositionW.xz);
                        float clearance = 1.0 - smoothstep(-contour.y, contour.y, contour.x);
                        float exposed = clearance * smoothstep(0.70, 0.92, geometricNormalW.y);
                        surfaceAlbedo = mix(surfaceAlbedo, treeGroundAlbedo(vPositionW.xz, groundType), exposed);
                        ${wetMud ? `if (groundType == 4.0 && exposed > 0.0) {
                            normalW = normalize(mix(normalW, treeMudNormal(vPositionW.xz, geometricNormalW), exposed));
                            float pooling = terrainSnowmeltPooling(vPositionW);
                            float runoff = terrainSnowmeltRunoff(max(0.0, -contour.x) * (2.35 / ${TREE_SNOWMELT_REACH_MULTIPLIER}), pooling);
                            treeMudExposure = exposed;
                            treeMeltWetness = terrainSnowmeltWetness(runoff, pooling) * exposed;
                            applyTerrainSnowmelt(treeMeltWetness, geometricNormalW, surfaceAlbedo, normalW);
                        } else` : ''}
                        normalW = normalize(mix(normalW, geometricNormalW, exposed * 0.60));
                        snowGlintCoverage *= 1.0 - exposed;
                    }
                }
            }
        `)
    }

    update(map: GroundTile[][], footprints: readonly TreeSnowFootprint[], revision?: number, snowCoverMask?: ReadonlySet<number>) {
        const key = JSON.stringify(footprints)
        if (map === this.map && key === this.key && revision === this.revision && snowCoverMask === this.snowCoverMask) return
        this.map = map
        this.revision = revision
        this.snowCoverMask = snowCoverMask
        this.key = key
        if (!footprints.length) {
            this.bounds.set(0, 0, 0, 0)
            return
        }

        const reach = (foot: TreeSnowFootprint) => foot.reach
        // Tile boundaries align with texel boundaries. Leave a blank border for bilinear filtering.
        const left = Math.floor(Math.min(...footprints.map(foot => foot.x - reach(foot)))) - .5
        const top = Math.floor(Math.min(...footprints.map(foot => foot.z - reach(foot)))) - .5
        const spanX = Math.ceil(Math.max(...footprints.map(foot => foot.x + reach(foot)))) + .5 - left
        const spanZ = Math.ceil(Math.max(...footprints.map(foot => foot.z + reach(foot)))) + .5 - top
        const samples = Math.min(SAMPLES_PER_TILE, Math.max(1, Math.floor(MAX_SAMPLES_PER_AXIS / Math.max(spanX, spanZ))))
        const width = Math.round(spanX * samples)
        const depth = Math.round(spanZ * samples)
        const texWidth = Math.max(ATLAS_WIDTH, Math.ceil(width / 64) * 64)
        const texHeight = ATLAS_HEIGHT + Math.ceil(depth / 64) * 64
        const current = this.texture.getSize()
        if (current.width !== texWidth || current.height !== texHeight) this.resize(texWidth, texHeight)
        else this.pixels.fill(0, ATLAS_HEIGHT * texWidth * 4)
        for (const foot of footprints) {
            const radius = reach(foot)
            const minZ = Math.max(0, Math.floor((foot.z - radius - top) * samples))
            const maxZ = Math.min(depth, Math.ceil((foot.z + radius - top) * samples))
            const minX = Math.max(0, Math.floor((foot.x - radius - left) * samples))
            const maxX = Math.min(width, Math.ceil((foot.x + radius - left) * samples))
            for (let z = minZ; z < maxZ; z++) {
                const worldZ = top + (z + .5) / samples
                const tileZ = Math.floor(worldZ + .5)
                for (let x = minX; x < maxX; x++) {
                    const worldX = left + (x + .5) / samples
                    const tileX = Math.floor(worldX + .5)
                    const tile = map[tileX]?.[tileZ]
                    if (!tile || Math.abs(tile.height - foot.height) > .05) continue
                    const type = treeGroundType(tile)
                    if (!type) continue
                    const distance = treeSnowDistance(worldX - foot.x, worldZ - foot.z, foot)
                    const intensity = Math.min(255, Math.max(0, Math.round(
                        255 * (TREE_SNOW_OUTSIDE_DISTANCE - distance) / TREE_SNOW_DISTANCE_RANGE)))
                    const index = ((z + ATLAS_HEIGHT) * texWidth + x) * 4
                    if (isSnowRoof(tile) && !snowCoverMask?.has(tileX * map.length + tileZ)) this.pixels[index + 2] = 255
                    if (intensity > this.pixels[index]) {
                        this.pixels[index] = intensity
                        this.pixels[index + 1] = type * 51
                    }
                }
            }
        }
        this.fieldExtent.set(width, depth)
        this.bounds.set(left, top, 1 / spanX, 1 / spanZ)
        this.upload(texWidth, texHeight)
    }
}

const surfaces = new WeakMap<Scene, TreeGroundSurface>()
export function getTreeGroundSurface(scene: Scene) {
    let surface = surfaces.get(scene)
    if (!surface) surfaces.set(scene, surface = new TreeGroundSurface(scene))
    return surface
}

export const treeRootGroundShader = (snow: boolean) => `
    if (isBark && treeGroundTexel.x > 0.0 && vTreeWeather.x > 0.5 && y < 0.38) {
        // Interpolated integral values can land just below the integer.
        float groundType = floor(vTreeWeather.x + 0.125);
        float aboveGround = max(0.0, y);
        vec2 groundUV = p.xz + aboveGround * vec2(0.38, 0.57);
        float groundGrain = terrainProceduralNoise(groundUV * 11.0);
        float contact = 1.0 - smoothstep(0.01, 0.24 + .12 * groundGrain, y);
        vec3 ground = treeGroundAlbedo(groundUV, groundType);
        tint = mix(tint, ground, contact * mix(0.62, 0.94, groundGrain));
        ${snow ? `
        float baseSnow = max(0.0, 2.0 * (vTreeWeather.x - groundType));
        if (baseSnow > 0.1 && y < 0.23) {
            vec2 fieldUV = treeGroundFieldPixel(p.xz);
            if (treeGroundInField(fieldUV)) {
                vec2 pixel = floor(fieldUV * treeGroundFieldExtent) + vec2(0.5, ${ATLAS_HEIGHT}.5);
                if (treeGroundPixel(pixel).b > 0.5) {
                    float cleared = 0.0;
                    if (baseSnow < 0.99) {
                        vec2 contour = treeGroundSnowContour(fieldUV, p.xz);
                        cleared = 1.0 - smoothstep(-contour.y, contour.y, contour.x);
                    }
                    float lip = 1.0 - smoothstep(0.025, (0.095 + 0.12 * groundGrain) * baseSnow, y);
                    float upward = smoothstep(0.0, 0.8, geometricNormalW.y);
                    snowWeight = lip * (1.0 - cleared) * baseSnow * mix(0.65, 1.0, upward);
                    tint = mix(tint, treeGroundAlbedo(groundUV, ${SNOW_ATLAS_SLOT}.0), snowWeight);
                }
            }
        }
        ` : ''}
    }
`
