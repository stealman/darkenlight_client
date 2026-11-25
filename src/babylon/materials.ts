import {
    Scene,
    Color3, Constants, DynamicTexture, ShaderMaterial,
    Texture, Vector2, PBRMaterial, StandardMaterial,
} from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'

// The shared block atlas has 16 columns. An extra atlas width flags an emissive top face.
export const BLOCK_TOP_GLOW_U_OFFSET = 16

export interface PBRBasicAtts {
    metallic: number
    roughness: number
    directIntensity: number
    environmentIntensity: number
}

export const Materials = {
    BASE_PATH: './images/materials/',


    blockMatAlpha1: null as PBRCustomMaterial | null,
    blockMat1: null as PBRCustomMaterial | null,
    blockMatTrans: null as PBRCustomMaterial | null,

    entrancePortalMaterial: null as PBRCustomMaterial | null,
    staticSurfaceMaterial: null as PBRCustomMaterial | null,
    weaponTrailMaterial: null as StandardMaterial | null,
    powerStrikeWeaponTrailMaterial: null as StandardMaterial | null,
    preciseShotArrowTrailMaterial: null as ShaderMaterial | null,

    initialize(scene: Scene) {

        this.blockMat1 = this.createBlockMat1(scene)
        this.blockMatAlpha1 = this.createBlockMatAlpha1(scene)
        this.blockMatTrans = this.createBlockMatTrans(scene)
        this.staticSurfaceMaterial = this.getPBRCustomMaterial(scene, "staticSurfaces", "/textures/statics/", "static-surfaces.svg", 1 / 16, 1 / 4, true)
        this.staticSurfaceMaterial.albedoTexture!.hasAlpha = true
        this.entrancePortalMaterial = this.createEntrancePortalMaterial(scene)
        this.weaponTrailMaterial = this.createWeaponTrailMaterial(scene)
        this.powerStrikeWeaponTrailMaterial = this.createPowerStrikeWeaponTrailMaterial(scene)
        this.preciseShotArrowTrailMaterial = this.createPreciseShotArrowTrailMaterial(scene)
    },

    createBlockMat1(scene: Scene): PBRCustomMaterial {
        const material = this.getPBRCustomMaterial(scene, "sym_block_mats1", this.BASE_PATH, 'block_materials1.png', 1 / 16, 1 / 16, false)
        // Tint only birch bark; keep the shared atlas and instance batches intact.
        const bark = MaterialEnum1.BIRCH_BARK.uv
        const varyings = 'varying float vBirchBarkTint; varying float vBlockTopGlow;'
        material.Vertex_Definitions(`${material.CustomParts.Vertex_Definitions}\n${varyings}`)
        material.Vertex_Before_PositionUpdated(`
            vBlockTopGlow = step(${BLOCK_TOP_GLOW_U_OFFSET}.0, uvc.x);
            vec2 blockAtlasOffset = vec2(uvc.x - vBlockTopGlow * ${BLOCK_TOP_GLOW_U_OFFSET}.0, uvc.y);
            uvUpdated += blockAtlasOffset;
        `)
        material.Vertex_MainEnd(`vBirchBarkTint = distance(blockAtlasOffset, vec2(${bark.x}, ${bark.y})) < 0.01 ? 0.6 : 1.0;`)
        material.Fragment_Definitions(varyings)
        material.Fragment_Custom_Albedo('result *= vBirchBarkTint;')
        material.Fragment_Before_FinalColorComposition(`
            float blockTopGlow = vBlockTopGlow * smoothstep(0.75, 0.95, geometricNormalW.y);
            finalEmissive += vec3(0.55, 0.18, 0.045) * (vec3(0.035) + surfaceAlbedo) * blockTopGlow;
        `)
        material.bumpTexture = new Texture(this.BASE_PATH + 'block_materials1_norm.png', scene)
        material.bumpTexture.level = 1.5
        material.bumpTexture.uScale = 1 / 16
        material.bumpTexture.vScale = 1 / 16

        material.emissiveTexture = new Texture(this.BASE_PATH + 'block_materials1_emissive.png', scene)
        material.emissiveTexture.uScale = 1 / 16
        material.emissiveTexture.vScale = 1 / 16
        material.emissiveColor = new Color3(1, 1, 1)

        return material
    },

    createBlockMatAlpha1(scene: Scene): PBRCustomMaterial {
        const material = this.getPBRCustomMaterial(scene, "sym_block_mats_alpha1", this.BASE_PATH, 'block_materials_alpha1.png', 1 / 8, 1 / 8, true)
        return material
    },

    createWeaponTrailMaterial(scene: Scene): StandardMaterial {
        const mat = new StandardMaterial('swordTrailMat', scene)
        mat.disableLighting = true
        mat.emissiveColor = new Color3(1, 1, 1)
        mat.alpha = 0.25
        return mat
    },

    createBlockMatTrans(scene: Scene): PBRCustomMaterial {
        const material = this.getPBRCustomMaterial(scene, "sym_block_mats_trans", this.BASE_PATH, 'block_materials_trans.png', 1 / 16, 1 / 16, false)
        const texture = material.albedoTexture as Texture
        texture.hasAlpha = true
        texture.getAlphaFromRGB = false
        texture.updateSamplingMode(Texture.NEAREST_NEAREST)
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
        material.useAlphaFromAlbedoTexture = true
        material.alpha = 1
        material.forceAlphaTest = false
        material.backFaceCulling = false
        material.needDepthPrePass = true
        return material
    },

    createPowerStrikeWeaponTrailMaterial(scene: Scene): StandardMaterial {
        const opacity = new DynamicTexture('powerStrikeTrailOpacity', {width: 2, height: 64}, scene, false)
        const context = opacity.getContext()
        const fade = context.createLinearGradient(0, 0, 0, 64)
        fade.addColorStop(0, 'rgba(255,255,255,1)')
        fade.addColorStop(0.12, 'rgba(255,255,255,0.54)')
        fade.addColorStop(0.28, 'rgba(255,255,255,0.12)')
        fade.addColorStop(0.55, 'rgba(255,255,255,0)')
        context.fillStyle = fade
        context.fillRect(0, 0, 2, 64)
        opacity.wrapU = Texture.CLAMP_ADDRESSMODE
        opacity.wrapV = Texture.CLAMP_ADDRESSMODE
        opacity.update()

        const mat = new StandardMaterial('powerStrikeWeaponTrailMat', scene)
        mat.disableLighting = true
        mat.diffuseColor = Color3.Black()
        mat.emissiveColor = new Color3(1, 0.61, 0.25)
        mat.specularColor = Color3.Black()
        mat.alpha = 0.57
        mat.alphaMode = Constants.ALPHA_ADD
        mat.disableDepthWrite = true
        mat.opacityTexture = opacity
        return mat
    },

    createPreciseShotArrowTrailMaterial(scene: Scene): ShaderMaterial {
        const mat = new ShaderMaterial('preciseShotArrowTrailMat', scene, {
            vertexSource: `
                precision highp float;
                attribute vec3 position;
                attribute vec2 uv;
                uniform mat4 worldViewProjection;
                varying float vAlongTrail;
                void main() {
                    vAlongTrail = uv.y;
                    gl_Position = worldViewProjection * vec4(position, 1.);
                }`,
            fragmentSource: `
                precision highp float;
                varying float vAlongTrail;
                void main() {
                    vec3 amber = vec3(1., .53, .20);
                    vec3 ivory = vec3(1., .97, .80);
                    vec3 tint = mix(amber, ivory, smoothstep(.35, .98, vAlongTrail));
                    float opacity = smoothstep(.30, 1., vAlongTrail) * .88;
                    gl_FragColor = vec4(tint, opacity);
                }`,
        }, {attributes: ['position', 'uv'], uniforms: ['worldViewProjection'], needAlphaBlending: true})
        mat.alphaMode = Constants.ALPHA_ADD
        mat.disableDepthWrite = true
        return mat
    },

    getPBRMaterial(scene: Scene, name: string, pathToAlbedo: string, hasAlpha: boolean = false, invertY: boolean, options: PBRBasicAtts, pathToEmissive: string | null = null): PBRMaterial {
        const albedoTexture = new Texture(pathToAlbedo, scene, {invertY: invertY})
        albedoTexture.hasAlpha = hasAlpha
        albedoTexture.gammaSpace = true;

        const mat = new PBRMaterial(name, scene)
        mat.albedoTexture = albedoTexture
        if (pathToEmissive) {
            const emissiveTexture = new Texture(pathToEmissive, scene, {invertY: invertY})
            emissiveTexture.gammaSpace = true
            mat.emissiveTexture = emissiveTexture
            mat.emissiveColor = new Color3(1, 1, 1)
        }
        mat.metallic = options.metallic
        mat.roughness = options.roughness
        mat.directIntensity = options.directIntensity
        mat.environmentIntensity = options.environmentIntensity

        return mat
    },

    getPBRCustomMaterial(scene: Scene, name: string, basePath: string, texturePath: string, uScale: number, vScale: number, hasAlpha: boolean): PBRCustomMaterial {
        return this.getPBRCustomMaterialFrom(scene, name, basePath, texturePath, uScale, vScale, hasAlpha, {
            metallic: 0.0,
            roughness: 1.0,
            directIntensity: 0.75,
            environmentIntensity: 1,
            }
        )
    },

    getPBRCustomMaterialFrom(scene: Scene, name: string, basePath: string, texturePath: string, uScale: number, vScale: number, hasAlpha: boolean,
                             options: PBRBasicAtts, invertY: boolean = true): PBRCustomMaterial {
        const albedoTexture = new Texture(basePath + texturePath, scene, {invertY})
        if (uScale != 1) {
            albedoTexture.uScale = uScale
        }
        if (vScale != 1) {
            albedoTexture.vScale = vScale
        }
        albedoTexture.gammaSpace = true;

        const mat = new PBRCustomMaterial(name, scene)
        mat.albedoTexture = albedoTexture
        mat.metallic = options.metallic
        mat.roughness = options.roughness
        mat.backFaceCulling = true;
        mat.twoSidedLighting = true;
        mat.directIntensity = options.directIntensity
        mat.environmentIntensity = options.environmentIntensity
        mat.usePhysicalLightFalloff = false;
        if (hasAlpha) {
            albedoTexture.updateSamplingMode(Texture.NEAREST_NEAREST)
            mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST
            mat.useAlphaFromAlbedoTexture = true
            mat.alphaCutOff = 0.5;
            mat.forceAlphaTest = true
        }

        mat.AddAttribute("uvc");
        if (uScale != 1 || vScale != 1) {
            mat.Vertex_Definitions(`attribute vec2 uvc;`)
            mat.Vertex_Before_PositionUpdated(`uvUpdated = uvUpdated + uvc;`)
            mat.Vertex_After_WorldPosComputed(`vAlbedoUV = uvUpdated;`)
        }

        return mat
    },

    createEntrancePortalMaterial(scene: Scene): PBRCustomMaterial {
        const mat = this.getPBRCustomMaterialFrom(scene, 'staticPortals', '/textures/statics/', 'static-surfaces.svg', 1 / 16, 1 / 4, false,
            {metallic: 0.6, roughness: 0.4, directIntensity: 1, environmentIntensity: 0.5})
        mat.albedoTexture!.hasAlpha = true
        mat.backFaceCulling = false
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
        mat.useAlphaFromAlbedoTexture = true
        mat.name = 'stoneEntrancePortalMaterial'
        mat.alpha = 0.42
        mat.emissiveColor = new Color3(0.08, 0.02, 0.08)
        return mat
    },

    onFrame(time: number) {
        const mat = this.entrancePortalMaterial
        if (!mat) {
            return
        }

        const strength = 0.08 + ((Math.sin(time / 850) + 1) * 0.06)
        mat.emissiveColor.set(strength, strength * 0.25, strength)
    },

}


class MaterialEnum {
    index: number
    uv: Vector2
    uvScale: Vector2

    constructor(index: number, uv: Vector2, uvScale: Vector2 = new Vector2(1, 1)) {
        this.index = index
        this.uv = uv
        this.uvScale = uvScale
    }
}

export const MaterialAlphaEnum1 = {
    TREE_LEAF_LIGHT: new MaterialEnum(1, new Vector2(0.5, 6.5)),
    TREE_LEAF_DARK: new MaterialEnum(2, new Vector2(2.5, 6.5)),
    TREE_LEAF_AUTUMN: new MaterialEnum(3, new Vector2(4.5, 6.5)),
    TREE_LEAF_NORTH: new MaterialEnum(4, new Vector2(6.5, 6.5)),
    TREE_LEAF_5: new MaterialEnum(5, new Vector2(0.5, 4.5)),
    BIRCH_LEAVES: new MaterialEnum(7, new Vector2(4.5, 4.5)),
    WILLOW_LEAVES: new MaterialEnum(8, new Vector2(6.5, 4.5)),
    TREE_LEAF_6: new MaterialEnum(6, new Vector2(2.5, 4.5)),

    getMaterialByIndex(index: number): Vector2 {
        return Object.values(MaterialAlphaEnum1).find(item => item.index === index)?.uv;
    }
}

export const MaterialEnum1 = {
    BRICK_RED: new MaterialEnum(1, new Vector2(0.5, 14.5)),
    BRICK_GRAY: new MaterialEnum(2, new Vector2(2.5, 14.5)),
    BRICK_BLACK: new MaterialEnum(3, new Vector2(4.5, 14.5)),
    BRICK_DARK_GRAY: new MaterialEnum(7, new Vector2(6.5, 14.5)),
    ROCK1: new MaterialEnum(4, new Vector2(0.5, 4.5)),
    ROCK1_BEIGE: new MaterialEnum(6, new Vector2(2.5, 4.5)),
    SNOW: new MaterialEnum(8, new Vector2(4.5, 4.5)),
    SNOW_SMALL: new MaterialEnum(18, new Vector2(4.5, 4.5), new Vector2(0.5, 0.5)),
    WOOD_1: new MaterialEnum(9, new Vector2(0.5, 12.5)),
    WOOD_2: new MaterialEnum(10, new Vector2(2.5, 12.5)),
    WOOD_3: new MaterialEnum(11, new Vector2(4.5, 12.5)),
    WOOD_PLANKS: new MaterialEnum(12, new Vector2(6.5, 12.5)),
    WOOD_PLANKS_DARK: new MaterialEnum(13, new Vector2(8.5, 12.5)),
    WOOD_CUT: new MaterialEnum(14, new Vector2(10.5, 12.5)),
    BIRCH_BARK: new MaterialEnum(15, new Vector2(12.5, 12.5)),
    WILLOW_BARK: new MaterialEnum(16, new Vector2(14.5, 12.5)),
    EMBERS: new MaterialEnum(17, new Vector2(0.5, 10.5)),
    TERRAIN_ROCK: new MaterialEnum(19, new Vector2(6.5, 4.5)),
    TERRAIN_DIRT: new MaterialEnum(20, new Vector2(0.5, 2.5)),
    TERRAIN_MUD: new MaterialEnum(21, new Vector2(2.5, 2.5)),
    TERRAIN_GRASS: new MaterialEnum(22, new Vector2(4.5, 2.5)),
    TERRAIN_WINTER_GRASS: new MaterialEnum(23, new Vector2(6.5, 2.5)),
    STEEL_1: new MaterialEnum(25, new Vector2(0.5, 8.5)),
    HAY: new MaterialEnum(33, new Vector2(0.5, 6.5)),

    getMaterialByIndex(index: number): Vector2 {
        return Object.values(MaterialEnum1).find(item => item.index === index)?.uv;
    }
}

export const TerrainEnum1 = {
    TERRAIN_DIRT: {index: 1},
    TERRAIN_GRASS: {index: 2},
    TERRAIN_ROCK: {index: 3},
    TERRAIN_MUDDY_DIRT: {index: 4},
    TERRAIN_GRASS_WINTER: {index: 5},

    TERRAIN_SNOW_DIRT: {index: 101},
    TERRAIN_SNOW_GRASS: {index: 102},
    TERRAIN_SNOW_ROCK: {index: 103},
    TERRAIN_SNOW_MUDDY_DIRT: {index: 104},
    TERRAIN_SNOW_GRASS_WINTER: {index: 105},
}

export const MaterialEnumTrans = {
    GLASS: new MaterialEnum(1, new Vector2(0.5, 14.5)),
    WATER: new MaterialEnum(2, new Vector2(0.5, 12.5)),
}
