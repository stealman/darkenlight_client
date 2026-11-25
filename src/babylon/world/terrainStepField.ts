import { Constants, Engine, RawTexture, Scene, Texture } from '@babylonjs/core'
import type { Color3, Vector3 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'
import { Settings } from '@/settings/settings'
import { fightSplatShader, MAX_FIGHT_SPLATS } from './fightSplatShader'
import type { TerrainSplat } from './fightSplatShader'

export const MAX_STEP_MARKS = 250
export const MAX_SOIL_STEPS = 100
const HALF_LENGTH = 0.2533
const HALF_WIDTH = 0.10
const SOIL_HALF_LENGTH = 0.1933
const SOIL_HALF_WIDTH = 0.0725
const BUCKET_COUNT = 2048
const TEXTURE_WIDTH = 128
const ROW_SIZE = TEXTURE_WIDTH * 4
// Each oval touches at most four unit cells. Each entry uses two groups of four floats.
const STEP_ROWS = Math.ceil((BUCKET_COUNT + (MAX_STEP_MARKS * 2 + MAX_SOIL_STEPS) * 4 * 2) / TEXTURE_WIDTH)
const SPLAT_ROWS = Math.ceil((BUCKET_COUNT + MAX_FIGHT_SPLATS * 4 * 3) / TEXTURE_WIDTH)
const GLOW_CELL_SIZE = 8
const MAX_TERRAIN_GLOWS = 256
const GLOW_START_ROW = STEP_ROWS + SPLAT_ROWS
// A glow spans at most four cells and stores two texels per cell.
const GLOW_ROWS = Math.ceil((BUCKET_COUNT + MAX_TERRAIN_GLOWS * 4 * 2) / TEXTURE_WIDTH)
const MARK_ROWS = GLOW_START_ROW + GLOW_ROWS

export type TerrainStep = {pos: Vector3, rot: number, creationTime: number, deadTime: number, soil: boolean}
export type StepCoverage = {snow?: string, soil?: string}
type TerrainGlow = {x: number, y: number, z: number, radius: number, color: Color3, intensity: number}

function visitMarkBuckets({x, z}: Pick<Vector3, 'x' | 'z'>, reach: number, visit: (bucket: number) => void, cellSize = 1) {
    for (let cellZ = Math.floor((z - reach) / cellSize); cellZ <= Math.floor((z + reach) / cellSize); cellZ++) {
        for (let cellX = Math.floor((x - reach) / cellSize); cellX <= Math.floor((x + reach) / cellSize); cellX++) {
            visit((cellX * 73 + cellZ * 151) & (BUCKET_COUNT - 1))
        }
    }
}

export class TerrainStepField {
    private readonly data = new Float32Array(ROW_SIZE * STEP_ROWS)
    private readonly splatData = new Float32Array(ROW_SIZE * SPLAT_ROWS)
    private readonly glowData = new Float32Array(ROW_SIZE * GLOW_ROWS)
    private readonly glows = new Map<string, TerrainGlow>()
    private glowsDirty = false
    private glowLightFactor = 0
    private readonly counts = new Uint16Array(BUCKET_COUNT)
    private readonly cursor = new Uint16Array(BUCKET_COUNT)
    private texture: RawTexture
    private textureData = new Float32Array(ROW_SIZE * MARK_ROWS)
    private shadowWidth = 0
    private shadowHeight = 0
    // Upload seconds relative to scene startup to keep the fade precise in a float.
    private readonly timeOrigin = Date.now()
    private time = 0
    private wetSteps = false
    private snowActive = false
    private soilActive = false
    private splatsActive = false

    constructor(private readonly scene: Scene, private readonly engine: Engine) {
        this.texture = this.createTexture(ROW_SIZE, MARK_ROWS)
    }

    private createTexture(width: number, height: number) {
        const texture = RawTexture.CreateRTexture(this.textureData, width, height, this.scene,
            false, false, Texture.NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT)
        texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
        texture.gammaSpace = false
        return texture
    }

    get maxShadowHeight() {
        return this.engine.getCaps().maxTextureSize - MARK_ROWS
    }

    updateContactShadow(mask: Uint8Array, width: number, height: number) {
        // Use one fragment sampler for both effects on terrain with many light textures.
        const textureWidth = Math.max(ROW_SIZE, width)
        const size = this.texture.getSize()
        const resize = size.width !== textureWidth || size.height !== height + MARK_ROWS
        if (resize) {
            this.textureData = new Float32Array(textureWidth * (height + MARK_ROWS))
            this.copyMarkRows(this.data, 0, STEP_ROWS, textureWidth)
            this.copyMarkRows(this.splatData, STEP_ROWS, SPLAT_ROWS, textureWidth)
            this.copyMarkRows(this.glowData, GLOW_START_ROW, GLOW_ROWS, textureWidth)
        }
        this.shadowWidth = width
        this.shadowHeight = height
        for (let z = 0; z < height; z++) {
            const row = (MARK_ROWS + z) * textureWidth
            for (let x = 0; x < width; x++) this.textureData[row + x] = mask[z * width + x] / 255
        }
        if (resize) {
            this.texture.dispose()
            this.texture = this.createTexture(textureWidth, height + MARK_ROWS)
        } else {
            this.upload(this.textureData.subarray(MARK_ROWS * textureWidth), MARK_ROWS, textureWidth, height)
        }
    }

    private copyMarkRows(data: Float32Array, start: number, rows: number, textureWidth: number) {
        for (let z = 0; z < rows; z++) {
            this.textureData.set(data.subarray(z * ROW_SIZE, (z + 1) * ROW_SIZE), (z + start) * textureWidth)
        }
    }

    private uploadMarkRows(data: Float32Array, start: number, end: number) {
        const rows = Math.ceil(end / TEXTURE_WIDTH)
        this.copyMarkRows(data, start, rows, this.texture.getSize().width)
        this.upload(data.subarray(0, rows * ROW_SIZE), start, ROW_SIZE, rows)
    }

    private upload(data: Float32Array, z: number, width: number, height: number) {
        this.engine.updateTextureData(this.texture.getInternalTexture()!, data, 0, z, width, height)
    }

    onFrame(time: number, glowLightFactor: number) {
        this.time = (time - this.timeOrigin) / 1000
        this.wetSteps = Settings.isDetalLevelHigh()
        this.glowLightFactor = glowLightFactor
        if (this.glowsDirty) {
            this.glowsDirty = false
            this.uploadGlows()
        }
    }

    setGlow(id: string, x: number, y: number, z: number, radius: number, color: Color3, intensity: number) {
        radius = Math.min(radius, GLOW_CELL_SIZE / 2)
        const current = this.glows.get(id)
        if (current?.x === x && current.y === y && current.z === z && current.radius === radius
            && current.color === color && current.intensity === intensity) return
        this.glows.set(id, {x, y, z, radius, color, intensity})
        this.glowsDirty = true
    }

    removeGlow(id: string) {
        if (this.glows.delete(id)) this.glowsDirty = true
    }

    private uploadGlows() {
        if (this.glows.size === 0) return
        const visibleGlows = Array.from(this.glows.values()).slice(0, MAX_TERRAIN_GLOWS)
        this.counts.fill(0)
        for (const glow of visibleGlows) {
            visitMarkBuckets(glow, glow.radius, bucket => this.counts[bucket]++, GLOW_CELL_SIZE)
        }
        const end = this.writeBucketRanges(this.glowData, 2)
        for (const glow of visibleGlows) {
            visitMarkBuckets(glow, glow.radius, bucket => {
                const offset = this.cursor[bucket] * 4
                this.cursor[bucket] += 2
                this.glowData[offset] = glow.x
                this.glowData[offset + 1] = glow.y
                this.glowData[offset + 2] = glow.z
                this.glowData[offset + 3] = glow.radius
                this.glowData[offset + 4] = glow.color.r * glow.intensity
                this.glowData[offset + 5] = glow.color.g * glow.intensity
                this.glowData[offset + 6] = glow.color.b * glow.intensity
                this.glowData[offset + 7] = (glow.x * 0.73 + glow.z * 1.51) % (2 * Math.PI)
            }, GLOW_CELL_SIZE)
        }
        this.uploadMarkRows(this.glowData, GLOW_START_ROW, end)
    }

    configureGlow(material: PBRCustomMaterial) {
        material.AddUniform('terrainGlowLightFactor', 'float', null)
        const attach = material.AttachAfterBind.bind(material)
        material.AttachAfterBind = (mesh, effect) => {
            attach(mesh, effect)
            effect.setFloat('terrainGlowLightFactor', this.glows.size > 0 ? this.glowLightFactor : 0)
        }
        material.Fragment_Definitions(`
            ${material.CustomParts.Fragment_Definitions ?? ''}
            vec3 terrainGlowAt(vec3 positionW, vec3 surfaceNormal) {
                int bucket = terrainMarkBucket(positionW.xz / ${GLOW_CELL_SIZE}.0);
                vec2 range = terrainMarkTexel(bucket, ${GLOW_START_ROW}).xy;
                vec3 glow = vec3(0.0);
                float upwardWeight = smoothstep(0.45, 0.9, surfaceNormal.y);
                for (int i = int(range.x); i < int(range.y); i += 2) {
                    vec4 stamp = terrainMarkTexel(i, ${GLOW_START_ROW});
                    vec3 delta = stamp.xyz - positionW;
                    float distanceToGlow = length(delta.xz);
                    float verticalReach = delta.y > 0.0 ? 2.8 : 1.7;
                    if (distanceToGlow >= stamp.w || abs(delta.y) >= verticalReach) continue;
                    float falloff = 1.0 - smoothstep(0.0, stamp.w, distanceToGlow);
                    falloff *= mix(0.75, 1.0, falloff);
                    falloff *= 1.0 - smoothstep(0.65, verticalReach, abs(delta.y));
                    vec3 towardGlow = delta * inversesqrt(max(dot(delta, delta), 0.0001));
                    float facingWeight = max(0.0, dot(surfaceNormal, towardGlow));
                    float surfaceWeight = max(upwardWeight, facingWeight);
                    vec4 colorPhase = terrainMarkTexel(i + 1, ${GLOW_START_ROW});
                    float flicker = 0.94 + 0.06 * sin(terrainStepTime * 5.0 + colorPhase.w);
                    glow += colorPhase.rgb * (falloff * surfaceWeight * flicker);
                }
                return min(glow, vec3(0.7));
            }
        `)
        material.Fragment_Before_FinalColorComposition(`
            ${material.CustomParts.Fragment_Before_FinalColorComposition ?? ''}
            if (terrainGlowLightFactor > 0.0) {
                finalEmissive += surfaceAlbedo * terrainGlowAt(vPositionW, geometricNormalW) * terrainGlowLightFactor;
            }
        `)
    }

    update(ownSteps: TerrainStep[], otherSteps: TerrainStep[], soilSteps: TerrainStep[]) {
        this.snowActive = ownSteps.length + otherSteps.length > 0
        this.soilActive = soilSteps.length > 0
        if (!this.snowActive && !this.soilActive) return
        const stepGroups = [ownSteps, otherSteps, soilSteps]
        this.counts.fill(0)
        for (const steps of stepGroups) {
            for (const step of steps) visitMarkBuckets(step.pos, step.soil ? SOIL_HALF_LENGTH : HALF_LENGTH, bucket => this.counts[bucket]++)
        }
        const end = this.writeBucketRanges(this.data, 2)
        for (const steps of stepGroups) {
            for (const step of steps) {
                const cos = Math.cos(step.rot)
                const sin = Math.sin(step.rot)
                visitMarkBuckets(step.pos, step.soil ? SOIL_HALF_LENGTH : HALF_LENGTH, bucket => {
                    const offset = this.cursor[bucket] * 4
                    this.cursor[bucket] += 2
                    this.data[offset] = step.pos.x
                    this.data[offset + 1] = step.pos.y
                    this.data[offset + 2] = step.pos.z
                    this.data[offset + 3] = cos
                    this.data[offset + 4] = sin
                    this.data[offset + 5] = (step.creationTime - this.timeOrigin) / 1000
                    this.data[offset + 6] = (step.deadTime - this.timeOrigin) / 1000
                    this.data[offset + 7] = Number(step.soil)
                })
            }
        }
        this.uploadMarkRows(this.data, 0, end)
    }

    updateSplats(splats: readonly TerrainSplat[]) {
        this.splatsActive = splats.length > 0
        if (!this.splatsActive) return
        this.counts.fill(0)
        for (const splat of splats) {
            visitMarkBuckets(splat.pos, Math.max(splat.scaleX, splat.scaleZ) * 0.5, bucket => this.counts[bucket]++)
        }
        const end = this.writeBucketRanges(this.splatData, 3)
        for (const splat of splats) {
            const cos = Math.cos(splat.rot)
            const sin = Math.sin(splat.rot)
            visitMarkBuckets(splat.pos, Math.max(splat.scaleX, splat.scaleZ) * 0.5, bucket => {
                const offset = this.cursor[bucket] * 4
                this.cursor[bucket] += 3
                this.splatData[offset] = splat.pos.x
                this.splatData[offset + 1] = splat.pos.y
                this.splatData[offset + 2] = splat.pos.z
                this.splatData[offset + 3] = cos
                this.splatData[offset + 4] = sin
                this.splatData[offset + 5] = splat.scaleX * 0.5
                this.splatData[offset + 6] = splat.scaleZ * 0.5
                this.splatData[offset + 7] = (splat.creationTime - this.timeOrigin) / 1000
                this.splatData[offset + 8] = splat.type
                this.splatData[offset + 9] = splat.seed
            })
        }
        this.uploadMarkRows(this.splatData, STEP_ROWS, end)
    }

    private writeBucketRanges(data: Float32Array, recordSize: number) {
        let next = BUCKET_COUNT
        // The first texels map hashed cells to ranges of candidate stamps.
        for (let bucket = 0; bucket < BUCKET_COUNT; bucket++) {
            this.cursor[bucket] = next
            data[bucket * 4] = next
            next += this.counts[bucket] * recordSize
            data[bucket * 4 + 1] = next
        }
        return next
    }

    configure(material: PBRCustomMaterial, {snow = '0.0', soil = '0.0'}: StepCoverage = {}) {
        material.AddUniform('terrainStepData', 'sampler2D', null)
        material.AddUniform('terrainStepTime', 'float', null)
        material.AddUniform('terrainStepsActive', 'vec2', null)
        material.AddUniform('terrainStepShadowSize', 'vec2', null)
        material.AddUniform('terrainStepWetnessEnabled', 'float', null)
        material.AddUniform('terrainSplatsActive', 'float', null)
        const attach = material.AttachAfterBind.bind(material)
        material.AttachAfterBind = (mesh, effect) => {
            attach(mesh, effect)
            const marksEnabled = !Settings.isDetalLevelLow()
            effect.setTexture('terrainStepData', this.texture)
            effect.setFloat('terrainStepTime', this.time)
            effect.setFloat2('terrainStepsActive', Number(marksEnabled && this.snowActive), Number(marksEnabled && this.soilActive))
            effect.setFloat2('terrainStepShadowSize', this.shadowWidth, this.shadowHeight)
            effect.setFloat('terrainStepWetnessEnabled', Number(this.wetSteps))
            effect.setFloat('terrainSplatsActive', Number(marksEnabled && this.splatsActive))
        }
        material.Fragment_Definitions(`
            ${material.CustomParts.Fragment_Definitions ?? ''}
            vec4 terrainMarkTexel(int index, int row) {
                ivec2 p = ivec2((index % ${TEXTURE_WIDTH}) * 4, row + index / ${TEXTURE_WIDTH});
                return vec4(texelFetch(terrainStepData, p, 0).r,
                    texelFetch(terrainStepData, p + ivec2(1, 0), 0).r,
                    texelFetch(terrainStepData, p + ivec2(2, 0), 0).r,
                    texelFetch(terrainStepData, p + ivec2(3, 0), 0).r);
            }

            int terrainMarkBucket(vec2 position) {
                ivec2 cell = ivec2(floor(position));
                return (cell.x * 73 + cell.y * 151) & ${BUCKET_COUNT - 1};
            }

            vec4 terrainSplatTexel(int index) {
                return terrainMarkTexel(index, ${STEP_ROWS});
            }
            ${fightSplatShader}

            float stepContactShadowTexel(ivec2 p) {
                p = clamp(p, ivec2(0), ivec2(terrainStepShadowSize) - 1);
                return texelFetch(terrainStepData, p + ivec2(0, ${MARK_ROWS}), 0).r;
            }

            float stepContactShadow(vec2 uv) {
                // The atlas uses nearest sampling for step records. Filter the mask separately.
                vec2 pixel = uv * terrainStepShadowSize - 0.5;
                ivec2 p = ivec2(floor(pixel));
                vec2 f = fract(pixel);
                return mix(mix(stepContactShadowTexel(p), stepContactShadowTexel(p + ivec2(1, 0)), f.x),
                    mix(stepContactShadowTexel(p + ivec2(0, 1)), stepContactShadowTexel(p + ivec2(1, 1)), f.x), f.y);
            }

            vec4 terrainStepImpression(vec3 positionW, vec2 coverage) {
                vec2 range = terrainMarkTexel(terrainMarkBucket(positionW.xz), 0).xy;
                vec4 impression = vec4(0.0);
                for (int i = int(range.x); i < int(range.y); i += 2) {
                    vec4 stamp = terrainMarkTexel(i, 0);
                    vec3 delta = positionW - stamp.xyz;
                    if (any(greaterThan(abs(delta.xz), vec2(${Math.max(HALF_LENGTH, SOIL_HALF_LENGTH)}))) || abs(delta.y) >= 0.22) continue;
                    vec4 directionLife = terrainMarkTexel(i + 1, 0);
                    bool soil = directionLife.w > 0.5;
                    float stepCoverage = soil ? coverage.y : coverage.x;
                    if (stepCoverage <= 0.0) continue;
                    // Keep the old print's long axis along the rotated local Z.
                    vec2 forward = vec2(directionLife.x, stamp.w);
                    vec2 across = vec2(stamp.w, -directionLife.x);
                    vec2 radii = soil ? vec2(${SOIL_HALF_LENGTH}, ${SOIL_HALF_WIDTH}) : vec2(${HALF_LENGTH}, ${HALF_WIDTH});
                    vec2 oval = vec2(dot(delta.xz, forward), dot(delta.xz, across)) / radii;
                    float radius2 = dot(oval, oval);
                    if (radius2 >= 1.0) continue;
                    float age = (terrainStepTime - directionLife.y) / max(0.001, directionLife.z - directionLife.y);
                    float strength = (1.0 - smoothstep(soil ? 0.20 : 0.35, 1.0, age))
                        * (1.0 - smoothstep(0.12, 0.22, abs(delta.y)));
                    float edge = 1.0 - radius2;
                    // The derivative of the bowl tilts the lighting normal toward its center.
                    vec2 gradient = (forward * (oval.x / radii.x) + across * (oval.y / radii.y))
                        * ((soil ? 0.0157 : 0.064) * edge * strength);
                    impression.xy += gradient * stepCoverage;
                    if (soil) impression.w = max(impression.w, smoothstep(0.0, 0.72, edge) * strength);
                    else impression.z = max(impression.z, edge * edge * strength);
                }
                return impression;
            }
        `)
        material.Fragment_Before_Lights(`
            ${material.CustomParts.Fragment_Before_Lights ?? ''}
            if (terrainSplatsActive > 0.0 && geometricNormalW.y > 0.46) {
                surfaceAlbedo = blendTerrainSplats(surfaceAlbedo, vPositionW, smoothstep(0.46, 0.90, geometricNormalW.y));
            }
            vec2 stepWetness = vec2(0.0);
            if (any(greaterThan(terrainStepsActive * vec2(${snow === '0.0' ? '0.0' : '1.0'}, ${soil === '0.0' ? '0.0' : '1.0'}), vec2(0.0)))
                && geometricNormalW.y > 0.65) {
                vec2 stepCoverage = vec2(${snow}, smoothstep(0.08, 0.70, ${soil}))
                    * terrainStepsActive * smoothstep(0.65, 0.92, geometricNormalW.y);
                if (any(greaterThan(stepCoverage, vec2(0.0)))) {
                    vec4 stepImpression = terrainStepImpression(vPositionW, stepCoverage);
                    vec2 stepStrength = stepImpression.zw * stepCoverage;
                    stepWetness = stepStrength * terrainStepWetnessEnabled * vec2(0.5625, 0.375);
                    surfaceAlbedo *= mix(vec3(1.0), vec3(0.73, 0.79, 0.85), stepStrength.x);
                    surfaceAlbedo *= mix(vec3(1.0), vec3(0.70, 0.66, 0.63), stepStrength.y);
                    vec3 stepSlope = vec3(stepImpression.x, 0.0, stepImpression.y);
                    stepSlope -= geometricNormalW * dot(geometricNormalW, stepSlope);
                    normalW = normalize(normalW - stepSlope / max(1.0, length(stepSlope)));
                }
            }
        `)
        material.Fragment_Custom_MetallicRoughness(`
            ${material.CustomParts.Fragment_Custom_MetallicRoughness ?? ''}
            metallicRoughness.g *= 1.0 - max(stepWetness.x * 0.4533, stepWetness.y * 0.46);
            metallicReflectanceFactors.rgb *= 1.0 + max(stepWetness.x * 0.40, stepWetness.y * 0.30);
        `)
    }
}
