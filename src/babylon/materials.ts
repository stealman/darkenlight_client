import {
    Scene,
    Color3,
    Texture, Vector2, PBRMaterial, StandardMaterial,
} from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { MapBlock } from '@/data/worldDataManager'

export interface PBRBasicAtts {
    metallic: number
    roughness: number
    directIntensity: number
    environmentIntensity: number
}

export const Materials = {
    BASE_PATH: './images/materials/',

    terrainMaterial: null as PBRCustomMaterial | null,
    planeMaterial: null as PBRCustomMaterial | null,
    stepMarksMaterial: null as PBRCustomMaterial | null,
    fightSplatsMaterial: null as PBRCustomMaterial | null,

    blockMatAlpha1: null as PBRCustomMaterial | null,
    blockMat1: null as PBRCustomMaterial | null,

    waterMaterial: null as PBRMaterial | null,
    weaponTrailMaterial: null as StandardMaterial | null,

    initialize(scene: Scene) {
        this.terrainMaterial = this.createTerrainMaterial1(scene)
        this.planeMaterial = this.createPlaneMaterial(scene)
        this.blockMat1 = this.createBlockMat1(scene)
        this.blockMatAlpha1 = this.createBlockMatAlpha1(scene)
        this.waterMaterial = this.createWaterMaterial(scene)
        this.stepMarksMaterial = this.createStepMarksMaterial(scene)
        this.fightSplatsMaterial = this.createFightSplatsMaterial(scene)
        this.weaponTrailMaterial = this.createWeaponTrailMaterial(scene)
    },

    createTerrainMaterial1(scene: Scene): PBRCustomMaterial {
        const material = this.getPBRCustomMaterial(scene, "terrain_mats1", this.BASE_PATH, 'terrain_materials1.png', 1 / 8, 1 / 8, false)
        return material
    },

    createPlaneMaterial(scene: Scene): PBRCustomMaterial {
        const material = this.getPBRCustomMaterial(scene, "plane_mats", this.BASE_PATH, 'plane_materials1.png', 1 / 8, 1 / 8, false)
        return material
    },

    createStepMarksMaterial(scene: Scene): PBRCustomMaterial {
        const mat = this.getPBRCustomMaterial(scene, "step_marks_mats", this.BASE_PATH, 'stepmarks.png', 1 / 2, 1 / 2, false)
        const texture = mat.albedoTexture as Texture
        texture.hasAlpha = true
        texture.getAlphaFromRGB = false
        texture.updateSamplingMode(Texture.NEAREST_NEAREST)
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
        mat.useAlphaFromAlbedoTexture = true
        mat.alpha = 0.4
        mat.forceAlphaTest = false
        return mat
    },

    createFightSplatsMaterial(scene: Scene): PBRCustomMaterial {
        const mat = this.getPBRCustomMaterial(scene, "fight_splats_mats", this.BASE_PATH, 'fight-splats.png', 1 / 16, 1 / 16, false)
        const texture = mat.albedoTexture as Texture
        texture.hasAlpha = true
        texture.getAlphaFromRGB = false
        texture.updateSamplingMode(Texture.NEAREST_NEAREST)
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
        mat.useAlphaFromAlbedoTexture = true
        mat.alpha = 0.75
        mat.forceAlphaTest = false
        return mat
    },

    createBlockMat1(scene: Scene): PBRCustomMaterial {
        const material = this.getPBRCustomMaterial(scene, "sym_block_mats1", this.BASE_PATH, 'block_materials1.png', 1 / 16, 1 / 16, false)
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
        //mat.freeze()
        return mat
    },

    getPBRMaterial(scene: Scene, name: string, pathToAlbedo: string, hasAlpha: boolean = false, invertY: boolean, options: PBRBasicAtts): PBRMaterial {
        const albedoTexture = new Texture(pathToAlbedo, scene, {invertY: invertY})
        albedoTexture.hasAlpha = hasAlpha
        albedoTexture.gammaSpace = true;

        const mat = new PBRMaterial(name, scene)
        mat.albedoTexture = albedoTexture
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

    getPBRCustomMaterialFrom(scene: Scene, name: string, basePath: string, texturePath: string, uScale: number, vScale: number, hasAlpha: boolean, options: PBRBasicAtts): PBRCustomMaterial {
        const albedoTexture = new Texture(basePath + texturePath, scene)
        if (uScale < 1) {
            albedoTexture.uScale = uScale
        }
        if (vScale < 1) {
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
        if (uScale < 1 || vScale < 1) {
            mat.Vertex_Definitions(`attribute vec2 uvc;`)
            mat.Vertex_Before_PositionUpdated(`uvUpdated = uvUpdated + uvc;`)
            mat.Vertex_After_WorldPosComputed(`vAlbedoUV = uvUpdated;`)
        }

        mat.freeze()
        return mat
    },

    createWaterMaterial(scene: Scene): PBRMaterial {
        const albedoTexture = new Texture(this.BASE_PATH + 'water.png', scene)
        albedoTexture.uScale = 64
        albedoTexture.vScale = 64
        albedoTexture.gammaSpace = true;

        const mat = new PBRMaterial("waterMaterial", scene)
        mat.albedoTexture = albedoTexture
        mat.metallic = 0.6
        mat.roughness = 0.4
        mat.backFaceCulling = false;
        mat.directIntensity = 1
        mat.environmentIntensity = 0.5
        mat.usePhysicalLightFalloff = false
        mat.alpha = 0.25

        mat.freeze()
        return mat
    },

    onFrame(frame: number) {
    },

    unFreezeAll() {
        this.terrainMaterial?.unfreeze()
        this.planeMaterial?.unfreeze()
        this.blockMat1?.unfreeze()
        this.blockMatAlpha1?.unfreeze()
        this.waterMaterial?.unfreeze()
        this.stepMarksMaterial?.unfreeze()
        this.fightSplatsMaterial?.unfreeze()
        this.weaponTrailMaterial?.unfreeze()
    },

    freezeAll() {
        this.terrainMaterial?.freeze()
        this.planeMaterial?.freeze()
        this.blockMat1?.freeze()
        this.blockMatAlpha1?.freeze()
        this.waterMaterial?.freeze()
        this.stepMarksMaterial?.freeze()
        this.fightSplatsMaterial?.freeze()
        this.weaponTrailMaterial?.freeze()
    }
}


class MaterialEnum {
    index: number
    uv: Vector2

    constructor(index: number, uv: Vector2) {
        this.index = index
        this.uv = uv
    }
}

export const MaterialAlphaEnum1 = {
    TREE_LEAF_LIGHT: new MaterialEnum(1, new Vector2(0.5, 6.5)),
    TREE_LEAF_DARK: new MaterialEnum(2, new Vector2(2.5, 6.5)),
    TREE_LEAF_AUTUMN: new MaterialEnum(3, new Vector2(4.5, 6.5)),
    TREE_LEAF_NORTH: new MaterialEnum(4, new Vector2(6.5, 6.5)),
    TREE_LEAF_5: new MaterialEnum(5, new Vector2(0.5, 4.5)),
    TREE_LEAF_6: new MaterialEnum(6, new Vector2(2.5, 4.5)),

    getMaterialByIndex(index: number): Vector2 {
        return Object.values(MaterialAlphaEnum1).find(item => item.index === index)?.uv;
    }
}

export const MaterialEnum1 = {
    BRICK_RED: new MaterialEnum(1, new Vector2(0.5, 14.5)),
    BRICK_GRAY: new MaterialEnum(2, new Vector2(2.5, 14.5)),
    WOOD_1: new MaterialEnum(9, new Vector2(0.5, 12.5)),
    WOOD_2: new MaterialEnum(10, new Vector2(2.5, 12.5)),

    getMaterialByIndex(index: number): Vector2 {
        return Object.values(MaterialEnum1).find(item => item.index === index)?.uv;
    }
}

export const TerrainEnum1 = {
    TERRAIN_DIRT: new MaterialEnum(1, new Vector2(2.5, 6.5)),
    TERRAIN_GRASS: new MaterialEnum(2, new Vector2(0.5, 6.5)),
    TERRAIN_ROCK: new MaterialEnum(3, new Vector2(6.5, 6.5)),
    TERRAIN_MUDDY_DIRT: new MaterialEnum(4, new Vector2(0.5, 4.5)),

    TERRAIN_SNOW_DIRT: new MaterialEnum(101, new Vector2(4.5, 6.5)),
    TERRAIN_SNOW_GRASS: new MaterialEnum(102, new Vector2(4.5, 6.5)),
    TERRAIN_SNOW_ROCK: new MaterialEnum(103, new Vector2(6.5, 4.5)),
    TERRAIN_SNOW_MUDDY_DIRT: new MaterialEnum(104, new Vector2(4.5, 6.5)),

    getTerrainForBlock(block: MapBlock, ignoreSnow: boolean = false): Vector2 {
        let type = block.type;
        if (block.snowed && !ignoreSnow) {
            type += 100;
        }
        return Object.values(TerrainEnum1).find(item => item.index === type)?.uv;
    }
}

export const PlaneEnum1 = {
    PLANE_DIRT: new MaterialEnum(1, new Vector2(2.5, 6.5)),
    PLANE_GRASS: new MaterialEnum(2, new Vector2(0.5, 6.5)),
    PLANE_ROCK: new MaterialEnum(3, new Vector2(6.5, 6.5)),
    PLANE_MUDDY_DIRT: new MaterialEnum(4, new Vector2(0.5, 4.5)),

    PLANE_SNOW_DIRT: new MaterialEnum(101, new Vector2(4.5, 6.5)),
    PLANE_SNOW_GRASS: new MaterialEnum(102, new Vector2(4.5, 6.5)),
    PLANE_SNOW_ROCK: new MaterialEnum(103, new Vector2(4.5, 6.5)),
    PLANE_SNOW_MUDDY_DIRT: new MaterialEnum(104, new Vector2(4.5, 6.5)),

    getPlaneForBlock(block: MapBlock): Vector2 {
        let type = block.type;
        if (block.snowed) {
            type += 100;
        }
        return Object.values(PlaneEnum1).find(item => item.index === type)?.uv;
    }
}
