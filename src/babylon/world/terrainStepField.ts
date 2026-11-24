import { Constants, Engine, RawTexture, Scene, Texture } from '@babylonjs/core'
import type { Vector2, Vector3 } from '@babylonjs/core'
import type { PBRCustomMaterial } from '@babylonjs/materials'

export const MAX_STEP_MARKS = 500
export const MAX_SOIL_STEPS = 50
const HALF_LENGTH = 0.2533
const HALF_WIDTH = 0.10
const SOIL_HALF_LENGTH = 0.1933
const SOIL_HALF_WIDTH = 0.0725
const BUCKET_COUNT = 2048
const TEXTURE_WIDTH = 128
// Each oval touches at most four unit cells. Each entry uses two groups of four floats.
const TEXTURE_HEIGHT = Math.ceil((BUCKET_COUNT + (MAX_STEP_MARKS * 2 + MAX_SOIL_STEPS) * 4 * 2) / TEXTURE_WIDTH)

export type TerrainStep = {pos: Vector3, rot: number, creationTime: number, deadTime: number, soil: boolean}
export type StepCoverage = {snow?: string, soil?: string}

function visitStepBuckets(step: TerrainStep, visit: (bucket: number) => void) {
    const {x, z} = step.pos
    const reach = step.soil ? SOIL_HALF_LENGTH : HALF_LENGTH
    for (let cellZ = Math.floor(z - reach); cellZ <= Math.floor(z + reach); cellZ++) {
        for (let cellX = Math.floor(x - reach); cellX <= Math.floor(x + reach); cellX++) {
            visit((cellX * 73 + cellZ * 151) & (BUCKET_COUNT - 1))
        }
    }
}

export class TerrainStepField {
    private readonly data = new Float32Array(TEXTURE_WIDTH * TEXTURE_HEIGHT * 4)
    private readonly counts = new Uint16Array(BUCKET_COUNT)
    private readonly cursor = new Uint16Array(BUCKET_COUNT)
    private texture: RawTexture
    private textureData = this.data
    private shadowWidth = 0
    private shadowHeight = 0
    // Upload seconds relative to scene startup to keep the fade precise in a float.
    private readonly timeOrigin = Date.now()
    private time = 0
    private wetSteps = false
    private snowActive = false
    private soilActive = false

    constructor(private readonly scene: Scene, private readonly engine: Engine) {
        this.texture = this.createTexture(TEXTURE_WIDTH * 4, TEXTURE_HEIGHT)
    }

    private createTexture(width: number, height: number) {
        const texture = RawTexture.CreateRTexture(this.textureData, width, height, this.scene,
            false, false, Texture.NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT)
        texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE
        texture.gammaSpace = false
        return texture
    }

    get maxShadowHeight() {
        return this.engine.getCaps().maxTextureSize - TEXTURE_HEIGHT
    }

    updateContactShadow(mask: Uint8Array, width: number, height: number) {
        // Use one fragment sampler for both effects on terrain with many light textures.
        const rowSize = TEXTURE_WIDTH * 4
        const textureWidth = Math.max(rowSize, width)
        const size = this.texture.getSize()
        const resize = size.width !== textureWidth || size.height !== height + TEXTURE_HEIGHT
        if (resize) {
            this.textureData = new Float32Array(textureWidth * (height + TEXTURE_HEIGHT))
            this.copyStepsToTexture(textureWidth)
        }
        this.shadowWidth = width
        this.shadowHeight = height
        for (let z = 0; z < height; z++) {
            const row = (TEXTURE_HEIGHT + z) * textureWidth
            for (let x = 0; x < width; x++) this.textureData[row + x] = mask[z * width + x] / 255
        }
        if (resize) {
            this.texture.dispose()
            this.texture = this.createTexture(textureWidth, height + TEXTURE_HEIGHT)
        } else {
            this.upload(this.textureData.subarray(TEXTURE_HEIGHT * textureWidth), TEXTURE_HEIGHT, textureWidth, height)
        }
    }

    private copyStepsToTexture(textureWidth: number, rows = TEXTURE_HEIGHT) {
        const rowSize = TEXTURE_WIDTH * 4
        for (let z = 0; z < rows; z++) {
            this.textureData.set(this.data.subarray(z * rowSize, (z + 1) * rowSize), z * textureWidth)
        }
    }

    private upload(data: Float32Array, z: number, width: number, height: number) {
        this.engine.updateTextureData(this.texture.getInternalTexture()!, data, 0, z, width, height)
    }

    setTime(time: number, wetSteps: boolean) {
        this.time = (time - this.timeOrigin) / 1000
        this.wetSteps = wetSteps
    }

    configureAtlas(material: PBRCustomMaterial, snowOffsets: Vector2[], soilOffsets: Vector2[]) {
        const atlasCoverage = (offsets: Vector2[]) => offsets.map(uv => `distance(uvc, vec2(${uv.x}, ${uv.y})) < 0.01`).join(' || ')
        material.Vertex_Definitions(`${material.CustomParts.Vertex_Definitions ?? ''}
            varying vec2 vStepAtlas;
        `)
        material.Vertex_MainEnd(`${material.CustomParts.Vertex_MainEnd ?? ''}
            vStepAtlas = vec2(${atlasCoverage(snowOffsets)} ? 1.0 : 0.0, ${atlasCoverage(soilOffsets)} ? 1.0 : 0.0);
        `)
        material.Fragment_Definitions(`${material.CustomParts.Fragment_Definitions ?? ''}
            varying vec2 vStepAtlas;
        `)
        this.configure(material, {snow: 'vStepAtlas.x', soil: 'vStepAtlas.y'})
    }

    update(ownSteps: TerrainStep[], otherSteps: TerrainStep[], soilSteps: TerrainStep[]) {
        this.snowActive = ownSteps.length + otherSteps.length > 0
        this.soilActive = soilSteps.length > 0
        if (!this.snowActive && !this.soilActive) return
        const stepGroups = [ownSteps, otherSteps, soilSteps]
        this.counts.fill(0)
        for (const steps of stepGroups) {
            for (const step of steps) visitStepBuckets(step, bucket => this.counts[bucket]++)
        }
        let next = BUCKET_COUNT
        // The first texels map hashed cells to ranges of candidate stamps.
        for (let bucket = 0; bucket < BUCKET_COUNT; bucket++) {
            this.cursor[bucket] = next
            this.data[bucket * 4] = next
            next += this.counts[bucket] * 2
            this.data[bucket * 4 + 1] = next
        }
        for (const steps of stepGroups) {
            for (const step of steps) {
                const cos = Math.cos(step.rot)
                const sin = Math.sin(step.rot)
                visitStepBuckets(step, bucket => {
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
        const rows = Math.ceil(next / TEXTURE_WIDTH)
        const rowSize = TEXTURE_WIDTH * 4
        if (this.textureData !== this.data) this.copyStepsToTexture(this.texture.getSize().width, rows)
        this.upload(this.data.subarray(0, rows * rowSize), 0, rowSize, rows)
    }

    configure(material: PBRCustomMaterial, {snow = '0.0', soil = '0.0'}: StepCoverage) {
        material.AddUniform('terrainStepData', 'sampler2D', null)
        material.AddUniform('terrainStepTime', 'float', null)
        material.AddUniform('terrainStepsActive', 'vec2', null)
        material.AddUniform('terrainStepShadowSize', 'vec2', null)
        material.AddUniform('terrainStepWetnessEnabled', 'float', null)
        const attach = material.AttachAfterBind.bind(material)
        material.AttachAfterBind = (mesh, effect) => {
            attach(mesh, effect)
            effect.setTexture('terrainStepData', this.texture)
            effect.setFloat('terrainStepTime', this.time)
            effect.setFloat2('terrainStepsActive', Number(this.snowActive), Number(this.soilActive))
            effect.setFloat2('terrainStepShadowSize', this.shadowWidth, this.shadowHeight)
            effect.setFloat('terrainStepWetnessEnabled', Number(this.wetSteps))
        }
        material.Fragment_Definitions(`
            ${material.CustomParts.Fragment_Definitions ?? ''}
            vec4 terrainStepTexel(int index) {
                ivec2 p = ivec2((index % ${TEXTURE_WIDTH}) * 4, index / ${TEXTURE_WIDTH});
                return vec4(texelFetch(terrainStepData, p, 0).r,
                    texelFetch(terrainStepData, p + ivec2(1, 0), 0).r,
                    texelFetch(terrainStepData, p + ivec2(2, 0), 0).r,
                    texelFetch(terrainStepData, p + ivec2(3, 0), 0).r);
            }

            float stepContactShadowTexel(ivec2 p) {
                p = clamp(p, ivec2(0), ivec2(terrainStepShadowSize) - 1);
                return texelFetch(terrainStepData, p + ivec2(0, ${TEXTURE_HEIGHT}), 0).r;
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
                ivec2 cell = ivec2(floor(positionW.xz));
                int bucket = (cell.x * 73 + cell.y * 151) & ${BUCKET_COUNT - 1};
                vec2 range = terrainStepTexel(bucket).xy;
                vec4 impression = vec4(0.0);
                for (int i = int(range.x); i < int(range.y); i += 2) {
                    vec4 stamp = terrainStepTexel(i);
                    vec3 delta = positionW - stamp.xyz;
                    if (any(greaterThan(abs(delta.xz), vec2(${Math.max(HALF_LENGTH, SOIL_HALF_LENGTH)}))) || abs(delta.y) >= 0.22) continue;
                    vec4 directionLife = terrainStepTexel(i + 1);
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
            vec2 stepWetness = vec2(0.0);
            if (any(greaterThan(terrainStepsActive * vec2(${snow === '0.0' ? '0.0' : '1.0'}, ${soil === '0.0' ? '0.0' : '1.0'}), vec2(0.0)))
                && geometricNormalW.y > 0.65) {
                vec2 stepCoverage = vec2(${snow}, smoothstep(0.08, 0.70, ${soil}))
                    * terrainStepsActive * smoothstep(0.65, 0.92, geometricNormalW.y);
                if (any(greaterThan(stepCoverage, vec2(0.0)))) {
                    vec4 stepImpression = terrainStepImpression(vPositionW, stepCoverage);
                    vec2 stepStrength = stepImpression.zw * stepCoverage;
                    stepWetness = stepStrength * terrainStepWetnessEnabled * 0.75;
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
